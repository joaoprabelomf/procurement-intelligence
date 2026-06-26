"""
etapa4.py — Etapa 4: Análise das Propostas Técnicas.
 
O que faz:
1. Pega cada proposta classificada na Etapa 1 (tipo == proposta).
2. Avalia cada uma, UMA POR VEZ (uma chamada de IA por fornecedor — aguenta
   6+ propostas sem o JSON truncar), contra a referência disponível:
      - edital (Etapa 3), se houver;
      - senão, o baseline (Etapa 2);
      - senão, extrai o escopo de cada proposta e registra a ressalva.
3. Para cada fornecedor produz: status por requisito, distinção mandatório x
   desejável, inclusões/exclusões de escopo, desvios, e DOIS conceitos
   SEPARADOS e diferentes:
      - "não cumpre"  = o fornecedor endereçou o requisito e NÃO atende (falha).
      - "não menciona" = o fornecedor ficou EM SILÊNCIO (não confirma nem nega).
   Silêncio NÃO é reprovação — é candidato a confirmação com o fornecedor.
4. NÃO elimina o não-conforme — apenas marca.
5. Grava no Estudo (propostas_tecnicas).
 
Saída pra UI em DOIS níveis:
   - resumo  : EXECUTIVO e limpo — uma linha por fornecedor (matriz).
   - detalhe : COMPLETO — requisito a requisito (mostrado sob demanda na tela
     via expander, sem gastar API de novo).
"""
 
import json
import time
from concurrent.futures import ThreadPoolExecutor

from .config import MAX_CHARS_PER_DOC
from .ia import call_claude
 
MAX_TOKENS_ETAPA4 = 8000
 
 
# ---------------------------------------------------------------------------
# Prompt (avalia UMA proposta por vez)
# ---------------------------------------------------------------------------
 
SYSTEM_PROPOSTA = """
Você é um especialista sênior em procurement avaliando a ÓTICA TÉCNICA de UMA
proposta de fornecedor. Foco em escopo e aderência — NÃO faça análise de preço
aqui (isso é outra etapa).
 
Você recebe: o modo de referência, a referência em si (requisitos do edital, ou
o escopo do baseline, ou nada), e o texto da proposta.
 
DISTINÇÃO CRÍTICA (leia com atenção):
- "não cumpre"  = o fornecedor ABORDOU o requisito e o que ele oferece NÃO
  atende (há evidência de falha/contradição no texto da proposta).
- "não menciona" = o fornecedor ficou EM SILÊNCIO sobre o requisito. A proposta
  não diz nada a respeito — não confirma e não nega. ISSO NÃO É REPROVAÇÃO.
  É uma lacuna a confirmar com o fornecedor.
NUNCA marque "não cumpre" quando o caso real é silêncio. Se a proposta não fala
do item, o status é "não menciona".
 
Responda SOMENTE com um objeto JSON válido, sem texto antes ou depois:
 
{
  "fornecedor": "<nome do fornecedor, se identificável; senão o nome do arquivo>",
  "veredito_executivo": "<1 frase curta (máx ~15 palavras) com a leitura técnica geral desta proposta, para um executivo>",
  "resumo_tecnico": "<2-3 frases sobre a aderência geral desta proposta>",
  "conformidade": [
    {
      "req_id": "<id do requisito do edital (ex. R01); '—' se não houver edital>",
      "descricao_curta": "<requisito ou elemento de escopo avaliado>",
      "tipo": "mandatório|desejável|—",
      "status": "cumpre|não cumpre|não menciona|parcial|desvio",
      "observacao": "<evidência ou justificativa curta>"
    }
  ],
  "desvios": [
    {
      "descricao": "<o que o fornecedor ofereceu no lugar do que foi pedido>",
      "leitura": "gap|oportunidade",
      "observacao": "<por que é gap ou por que pode ser oportunidade>"
    }
  ],
  "inclusoes_escopo": [
    "<item/serviço que ESTE fornecedor inclui e que pode não estar nos outros>"
  ],
  "exclusoes_escopo": [
    "<item/serviço que ESTE fornecedor deixou de fora do escopo>"
  ],
  "nao_cumpre_mandatorio": <true|false>,
  "mandatorios_nao_cumpridos": [
    "<req_id: descrição curta do mandatório com status 'não cumpre'>"
  ],
  "mandatorios_nao_mencionados": [
    "<req_id: descrição curta do mandatório que a proposta NÃO menciona (silêncio)>"
  ],
  "premissas": ["<premissa assumida na avaliação desta proposta>"],
  "faltantes": ["<informação que faltou nesta proposta>"]
}
 
Regras:
- MODO "edital": avalie a proposta requisito a requisito, usando os req_id dados.
  status: cumpre / não cumpre / não menciona / parcial / desvio.
- MODO "baseline": não há requisitos formais — avalie a proposta contra o escopo
  atual descrito no baseline. Use req_id "—" e descreva o elemento de escopo.
- MODO "entre_si": não há referência — apenas EXTRAIA o escopo/specs que esta
  proposta oferece (conformidade pode ficar vazia), capriche em inclusoes_escopo
  e exclusoes_escopo, e registre em 'faltantes' que não havia referência.
- nao_cumpre_mandatorio = true APENAS quando há ao menos um mandatório com
  status "não cumpre". Silêncio (não menciona) NÃO seta essa flag — esses vão
  em mandatorios_nao_mencionados.
- NÃO elimine o fornecedor por não cumprir mandatório. Apenas marque.
- 'desvio' não é automaticamente ruim: se a alternativa do fornecedor pode ser
  mais barata/melhor, marque leitura="oportunidade".
- LIMITE DE TAMANHO: conformidade máximo 30 itens; desvios máximo 10;
  inclusoes_escopo e exclusoes_escopo máximo 8 cada; mandatorios_nao_cumpridos
  e mandatorios_nao_mencionados máximo 10 cada; premissas e faltantes máximo 5
  cada. O JSON completo deve caber em 6000 tokens.
"""
 
 
# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
 
TIPOS_PROPOSTA = {"proposta_combinada", "proposta_tecnica", "proposta_comercial"}
 
 
def _propostas(estudo) -> list:
    return [d for d in estudo.documentos if d.get("tipo") in TIPOS_PROPOSTA]
 
 
def _resolver_referencia(estudo):
    requisitos = (estudo.edital or {}).get("requisitos", [])
    if requisitos:
        linhas = ["REQUISITOS DO EDITAL:"]
        for r in requisitos:
            linhas.append(
                f"- [{r.get('id','?')}] ({r.get('tipo','?')}, peso {r.get('peso','?')}) "
                f"{r.get('descricao','')}"
            )
        return "edital", "\n".join(linhas)
 
    if estudo.baseline:
        tec = estudo.baseline.get("tecnica", {})
        texto = (
            "ESCOPO ATUAL (BASELINE) — usar como referência, pois não há edital:\n"
            f"{tec.get('escopo_atual', '—')}"
        )
        return "baseline", texto
 
    return "entre_si", "Não há edital nem baseline. Extraia o escopo da proposta."
 
 
def _texto_proposta(doc) -> str:
    return doc.get("texto", "")[:MAX_CHARS_PER_DOC]
 
 
def _parse_resposta(resposta_bruta: str) -> dict:
    texto = resposta_bruta.strip()
    if texto.startswith("```"):
        linhas = texto.split("\n")
        texto = "\n".join(linhas[1:-1]).strip()
    try:
        return json.loads(texto)
    except json.JSONDecodeError:
        texto_cortado = texto.rstrip().rstrip(",")
        abertas = texto_cortado.count("{") - texto_cortado.count("}")
        colchetes = texto_cortado.count("[") - texto_cortado.count("]")
        fechamento = "]" * colchetes + "}" * abertas
        try:
            return json.loads(texto_cortado + fechamento)
        except json.JSONDecodeError:
            raise ValueError(
                "JSON inválido mesmo após tentativa de correção. "
                "Proposta muito extensa — verifique o arquivo."
            )
 
 
def _avaliar_proposta(estudo, doc, modo, texto_ref) -> dict:
    contexto = (
        f"MODO DE REFERÊNCIA: {modo}\n"
        f"Categoria: {estudo.categoria} | Modelo: {estudo.modelo_precificacao} | "
        f"Micro-categoria: {estudo.micro_categoria or '—'}\n\n"
        f"{texto_ref}\n\n"
        f"=== PROPOSTA: {doc['nome']} ===\n{_texto_proposta(doc)}"
    )
    _t0 = time.time()
    resposta_bruta = call_claude(
        messages=[{"role": "user", "content": contexto}],
        system=SYSTEM_PROPOSTA,
        max_tokens=MAX_TOKENS_ETAPA4,
    )
    print(f"[PERF] etapa4 call_claude '{doc['nome']}': {time.time() - _t0:.1f}s")
    analise = _parse_resposta(resposta_bruta)
    if not analise.get("fornecedor"):
        analise["fornecedor"] = doc["nome"]
    analise["_arquivo"] = doc["nome"]
    return analise
 
 
# ---------------------------------------------------------------------------
# Função principal
# ---------------------------------------------------------------------------
 
def rodar_etapa4(estudo) -> dict:
    """
    Executa a Etapa 4 completa.
 
    Retorna dict com:
        - n_propostas : int
        - analises    : list (uma por fornecedor) — também em estudo.propostas_tecnicas
        - resumo      : texto EXECUTIVO (matriz, 1 linha por fornecedor)
        - detalhe     : texto COMPLETO (requisito a requisito) p/ expander
    """
    propostas = _propostas(estudo)
 
    if not propostas:
        msg = "Nenhuma proposta identificada — Etapa 4 não pôde rodar."
        estudo.add_faltante(msg)
        return {"n_propostas": 0, "analises": [], "resumo": f"⚠️ {msg}", "detalhe": ""}
 
    modo, texto_ref = _resolver_referencia(estudo)
    if modo == "entre_si":
        estudo.add_faltante(
            "Sem edital e sem baseline: propostas avaliadas apenas pelo escopo "
            "que cada uma declara, sem checagem formal de conformidade."
        )
 
    analises = []
    avisos = []
    _t_total = time.time()
    print(f"[PERF] etapa4 início — {len(propostas)} fornecedor(es) (paralelo, max 5)")

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [
            executor.submit(_avaliar_proposta, estudo, doc, modo, texto_ref)
            for doc in propostas
        ]

    for doc, future in zip(propostas, futures):
        try:
            analise = future.result()
        except (json.JSONDecodeError, ValueError) as e:
            avisos.append(f"Falha ao avaliar '{doc['nome']}': {e}. Proposta registrada como não analisada.")
            estudo.add_faltante(f"Proposta '{doc['nome']}' não pôde ser analisada (erro de parsing).")
            continue
        analises.append(analise)
        for p in analise.get("premissas", []):
            estudo.add_premissa(f"[{analise['fornecedor']}] {p}")
        for f in analise.get("faltantes", []):
            estudo.add_faltante(f"[{analise['fornecedor']}] {f}")
        # Não cumpre mandatório (falha explícita) → janela de flexibilização Etapa 6
        if analise.get("nao_cumpre_mandatorio"):
            estudo.add_premissa(
                f"[{analise['fornecedor']}] NÃO CUMPRE mandatório(s) "
                f"{', '.join(analise.get('mandatorios_nao_cumpridos', [])) or '(ver detalhe)'} "
                f"— candidato a janela de flexibilização (custear na Etapa 6)."
            )
        # Não menciona mandatório (silêncio) → coisa DIFERENTE: confirmar c/ fornecedor
        nao_menc = analise.get("mandatorios_nao_mencionados", [])
        if nao_menc:
            estudo.add_faltante(
                f"[{analise['fornecedor']}] NÃO MENCIONA mandatório(s) "
                f"{', '.join(nao_menc)} — silêncio, não reprovação. Confirmar com o fornecedor."
            )

    print(f"[PERF] etapa4 total: {time.time() - _t_total:.1f}s — {len(analises)} analisada(s) de {len(propostas)} proposta(s)")
    estudo.propostas_tecnicas = analises
    estudo.etapa_atual = 4

    return {
        "n_propostas": len(analises),
        "analises": analises,
        "resumo": _montar_resumo_executivo(modo, analises),
        "detalhe": _montar_detalhe(modo, analises),
        "avisos": avisos,
    }
 
 
# ---------------------------------------------------------------------------
# Contagem auxiliar
# ---------------------------------------------------------------------------
 
def _contar_mandatorios(conf: list) -> dict:
    mand = [c for c in conf if c.get("tipo") == "mandatório"]
    return {
        "total": len(mand),
        "cumpre": sum(1 for c in mand if c.get("status") == "cumpre"),
        "parcial": sum(1 for c in mand if c.get("status") == "parcial"),
        "nao_cumpre": sum(1 for c in mand if c.get("status") == "não cumpre"),
        "nao_menciona": sum(1 for c in mand if c.get("status") == "não menciona"),
        "desvio": sum(1 for c in mand if c.get("status") == "desvio"),
    }
 
 
def _esc(s) -> str:
    """Escapa pra não quebrar a tabela markdown."""
    return str(s).replace("|", "/").replace("\n", " ").strip()
 
 
# ---------------------------------------------------------------------------
# Resumo EXECUTIVO — matriz, 1 linha por fornecedor
# ---------------------------------------------------------------------------
 
def _montar_resumo_executivo(modo, analises) -> str:
    if not analises:
        return "Nenhuma proposta analisada."
 
    linhas = [f"**Análise Técnica — {len(analises)} proposta(s)** · referência: _{modo}_"]
 
    # Alertas transversais (separando os dois conceitos)
    nao_cumprem = [a for a in analises if a.get("nao_cumpre_mandatorio")]
    if nao_cumprem:
        linhas.append(
            "\n⚠️ **Não cumprem mandatório** (não eliminados — flexibilização na Etapa 6): "
            + ", ".join(_esc(a.get("fornecedor", "?")) for a in nao_cumprem)
        )
    nao_mencionam = [a for a in analises if a.get("mandatorios_nao_mencionados")]
    if nao_mencionam:
        linhas.append(
            "🔎 **Silêncio sobre mandatório** (NÃO é reprovação — confirmar com fornecedor): "
            + ", ".join(_esc(a.get("fornecedor", "?")) for a in nao_mencionam)
        )
 
    # Matriz executiva
    linhas.append("\n| Fornecedor | Veredito | Mandatórios | Gaps (não cumpre) | Silêncio | Escopo-chave |")
    linhas.append("|---|---|---|---|---|---|")
 
    for a in analises:
        forn = a.get("fornecedor", "?")
        veredito = a.get("veredito_executivo") or a.get("resumo_tecnico", "—")
        if len(veredito) > 90:
            veredito = veredito[:88] + "…"
 
        c = _contar_mandatorios(a.get("conformidade", []))
        if c["total"]:
            mand_str = f"{c['cumpre']}/{c['total']} cumpre"
            extras = []
            if c["parcial"]:
                extras.append(f"{c['parcial']} parcial")
            if c["nao_cumpre"]:
                extras.append(f"{c['nao_cumpre']} não cumpre")
            if c["nao_menciona"]:
                extras.append(f"{c['nao_menciona']} silêncio")
            if extras:
                mand_str += " · " + " · ".join(extras)
        else:
            mand_str = "—"
 
        gaps = ", ".join(a.get("mandatorios_nao_cumpridos", [])) or "—"
        silencio = ", ".join(a.get("mandatorios_nao_mencionados", [])) or "—"
 
        incl = a.get("inclusoes_escopo", [])
        excl = a.get("exclusoes_escopo", [])
        escopo = []
        if incl:
            escopo.append("inclui: " + incl[0])
        if excl:
            escopo.append("exclui: " + excl[0])
        escopo_str = " · ".join(escopo) or "—"
 
        linhas.append(
            f"| **{_esc(forn)}** | {_esc(veredito)} | {_esc(mand_str)} | "
            f"{_esc(gaps)} | {_esc(silencio)} | {_esc(escopo_str)} |"
        )
 
    linhas.append(
        "\n_Detalhe requisito a requisito em **🔎 Ver análise técnica completa (Etapa 4)** abaixo._"
    )
    return "\n".join(linhas)
 
 
# ---------------------------------------------------------------------------
# Detalhe COMPLETO — requisito a requisito (sob demanda)
# ---------------------------------------------------------------------------
 
def _montar_detalhe(modo, analises) -> str:
    if not analises:
        return "Nenhuma proposta analisada."
 
    linhas = [f"**Detalhe técnico completo** — {len(analises)} proposta(s), referência: {modo}"]
 
    for a in analises:
        linhas.append(f"\n---\n### {a.get('fornecedor','?')}")
        if a.get("resumo_tecnico"):
            linhas.append(a["resumo_tecnico"])
 
        conf = a.get("conformidade", [])
        if conf:
            c = _contar_mandatorios(conf)
            # contagem geral (todos os tipos, não só mandatório)
            n_cumpre = sum(1 for x in conf if x.get("status") == "cumpre")
            n_parcial = sum(1 for x in conf if x.get("status") == "parcial")
            n_nao = sum(1 for x in conf if x.get("status") == "não cumpre")
            n_silencio = sum(1 for x in conf if x.get("status") == "não menciona")
            n_desvio = sum(1 for x in conf if x.get("status") == "desvio")
            linhas.append(
                f"\n_Conformidade (todos os itens):_ {n_cumpre} cumpre · {n_parcial} parcial · "
                f"{n_nao} não cumpre · {n_silencio} não menciona · {n_desvio} desvio"
            )
 
            # Tabela detalhada requisito a requisito
            linhas.append("\n| Req. | Requisito | Tipo | Status | Observação |")
            linhas.append("|---|---|---|---|---|")
            for x in conf:
                linhas.append(
                    f"| {_esc(x.get('req_id','—'))} | {_esc(x.get('descricao_curta',''))} | "
                    f"{_esc(x.get('tipo','—'))} | {_esc(x.get('status','—'))} | "
                    f"{_esc(x.get('observacao',''))} |"
                )
 
        # Mandatórios não cumpridos vs não mencionados (separados, explícitos)
        mnc = a.get("mandatorios_nao_cumpridos", [])
        if mnc:
            linhas.append("\n**❌ Mandatórios NÃO CUMPRIDOS (falha):**")
            for m in mnc:
                linhas.append(f"- {m}")
        mnm = a.get("mandatorios_nao_mencionados", [])
        if mnm:
            linhas.append("\n**🔎 Mandatórios NÃO MENCIONADOS (silêncio — confirmar):**")
            for m in mnm:
                linhas.append(f"- {m}")
 
        incl = a.get("inclusoes_escopo", [])
        if incl:
            linhas.append("\n**Inclui no escopo (atenção p/ equalização):**")
            for i in incl:
                linhas.append(f"- {i}")
        excl = a.get("exclusoes_escopo", [])
        if excl:
            linhas.append("\n**Exclui do escopo:**")
            for e in excl:
                linhas.append(f"- {e}")
 
        oportunidades = [d for d in a.get("desvios", []) if d.get("leitura") == "oportunidade"]
        if oportunidades:
            linhas.append("\n**Desvios que podem ser oportunidade:**")
            for d in oportunidades:
                linhas.append(f"- {d.get('descricao','')} — {d.get('observacao','')}")
        gaps_desvio = [d for d in a.get("desvios", []) if d.get("leitura") == "gap"]
        if gaps_desvio:
            linhas.append("\n**Desvios que são gap:**")
            for d in gaps_desvio:
                linhas.append(f"- {d.get('descricao','')} — {d.get('observacao','')}")
 
    return "\n".join(linhas)