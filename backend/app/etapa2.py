"""
etapa2.py — Etapa 2: Análise do Cenário Atual (Baseline).

O que faz:
1. Verifica se há baseline no Estudo (classificado na Etapa 1).
   Se não houver, registra premissa e encerra com aviso — não trava o fluxo.
2. Identifica a micro-categoria (Limpeza, Segurança, MRO, EPI, etc.)
   e grava no Estudo — ela configura os fatores de TCO e should-cost.
3. Separa a ótica técnica da comercial dentro do baseline.
4. Comercial:
   a. Preço atual total anualizado (com assumption explicado).
      Se a anualização for impossível sem dado, pergunta ao usuário.
   b. Valores unitários + Pareto (item a item se der, senão agregado).
   c. Retrato do cenário (fornecedores, escopo, gasto anual, top itens).
   d. TCO rápido: checklist de fatores não considerados no preço, guiado
      pela micro-categoria.
   e. Should-cost de razoabilidade: não é bottom-up, é checagem do modelo
      de preço + drivers que mais pesam.
5. Os fatores de TCO/should-cost ficam gravados no Estudo para reuso na
   Etapa 6.
"""

import json
import logging

from .config import MAX_CHARS_PER_DOC
from .ia import call_claude
from .erros import ErroEtapa

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

SYSTEM_BASELINE = """
Você é um especialista sênior em procurement e análise de custos.
Vai receber o conteúdo de um ou mais documentos classificados como baseline
(contrato atual, proposta anterior, tabela de preços vigente, nota fiscal,
e-mail com preço atual, etc.) e informações de contexto (categoria e modelo
de precificação já identificados).

Sua tarefa é produzir uma análise estruturada do cenário atual. Responda
SOMENTE com um objeto JSON válido, sem texto antes ou depois, no formato:

{
  "micro_categoria": "<ex.: Limpeza Predial | Segurança Patrimonial | MRO | EPI | Frota Terceirizada | ...>",
  "tecnica": {
    "escopo_atual": "<descrição do que é fornecido hoje>",
    "fornecedores_atuais": ["<fornecedor 1>", "<fornecedor 2>"],
    "observacoes": "<qualquer detalhe técnico relevante do baseline>"
  },
  "comercial": {
    "preco_anual_total": <número em reais, ou null se impossível calcular>,
    "base_anualização": "<como chegou ao anual: vigência do contrato / datas de NF / assumption de 12 meses / etc.>",
    "precisa_confirmar_anualização": <true se for irregular/complexo e precisar perguntar ao usuário, senão false>,
    "sugestao_periodo": "<se precisa_confirmar_anualização=true: período que o Claude julga mais preciso>",
    "valores_unitarios": [
      {"item": "<descrição>", "valor": <número>, "unidade": "<unidade>", "share_percent": <0-100 ou null>}
    ],
    "pareto": "<narrativa: onde está o dinheiro — top itens/serviços que concentram o gasto>",
    "retrato": "<parágrafo: fornecedores, escopo fornecido, gasto anual na categoria, itens de maior valor>"
  },
  "tco": {
    "fatores_nao_considerados": [
      {"fator": "<ex.: turnover de mão de obra>", "relevancia": "alta|média|baixa", "comentario": "<por que importa>"}
    ],
    "ressalva_geral": "<texto curto resumindo o que o preço atual não captura>"
  },
  "should_cost": {
    "razoabilidade_modelo": "<o modelo de precificação faz sentido para esta categoria? por quê?>",
    "drivers_principais": [
      {"driver": "<ex.: custo de mão de obra>", "peso_estimado": "alto|médio|baixo", "comentario": "<detalhe>"}
    ],
    "sintese": "<checagem de razoabilidade: o preço está dentro do esperado para esta categoria/escopo?>"
  },
  "premissas_registradas": [
    "<premissa 1 que a análise assumiu>",
    "<premissa 2>..."
  ],
  "faltantes": [
    "<dado que faltou e impactou a análise>"
  ]
}

Regras:
- Seja preciso nos números quando o dado existir. Quando não existir, use null
  e explique em premissas_registradas.
- TCO: guie pelos fatores da micro-categoria (serviço → turnover, mobilização,
  overhead de gestão, passivos trabalhistas; material → frete, estoque,
  obsolescência, custo de qualidade/rejeição, custo financeiro do prazo).
- Should-cost: NÃO faça bottom-up. Avalie razoabilidade e identifique os
  drivers de custo que mais pesam — sem precisar de índices de mercado.
- Se a anualização for impossível (tabela de preços sem período, por exemplo),
  marque precisa_confirmar_anualização=true e sugira o período mais razoável.
- LIMITE DE TAMANHO (obrigatório para caber na resposta):
  * valores_unitarios: máximo 10 itens — agrupe os menos relevantes se necessário.
  * tco.fatores_nao_considerados: máximo 5 itens.
  * should_cost.drivers_principais: máximo 5 itens.
  * premissas_registradas: máximo 6 itens.
  * faltantes: máximo 6 itens — liste só os mais críticos.
  Seja conciso em todos os campos de texto. O JSON completo deve caber em 6000 tokens.
"""


# ---------------------------------------------------------------------------
# Memória RAG — pré-extração de micro_categoria e injeção de referências
# ---------------------------------------------------------------------------

# System prompt mínimo para a chamada rápida de pré-extração.
_SYSTEM_MICRO_RAPIDA = (
    "Você é um classificador de procurement. Leia o texto de baseline recebido "
    "e identifique a micro-categoria da compra em 1 a 5 palavras.\n\n"
    "Exemplos de micro-categoria: Limpeza Predial, Segurança Patrimonial, MRO, "
    "EPI, Frota Terceirizada, Facilities, Desenvolvimento de Software, Energia Elétrica.\n\n"
    "Responda SOMENTE com a micro-categoria, sem explicação, sem pontuação extra."
)

# Instrução adicionada ao SYSTEM_BASELINE quando há referências históricas.
_INSTRUCAO_REFERENCIAS = (
    "\n\nA mensagem do usuário contém uma seção '--- REFERÊNCIAS HISTÓRICAS DO SEU TIME ---' "
    "com dados reais de estudos anteriores do mesmo time na mesma micro-categoria. "
    "Use essas referências para CALIBRAR sua análise — especialmente o should-cost, "
    "os fatores de TCO e os drivers de custo. "
    "Cada cliente e processo é único: não copie os valores históricos diretamente; "
    "use-os como benchmarks para avaliar se o cenário atual está dentro do esperado."
)


def _extrair_micro_categoria_rapida(texto_baseline: str) -> str | None:
    """
    Chamada rápida e barata ao Claude para identificar a micro_categoria
    antes da análise completa da Etapa 2, permitindo buscar casos históricos
    precisos antes de montar o contexto principal.

    Usa apenas as primeiras 2500 chars do baseline (suficiente para identificar
    o tipo de compra) e max_tokens=20 (a resposta é de 1-5 palavras).

    Retorna None se falhar por qualquer motivo — o chamador trata a ausência
    graciosamente (Etapa 2 roda sem memória, como se RAG não existisse).
    """
    try:
        trecho = texto_baseline[:2500]
        resposta = call_claude(
            messages=[{"role": "user", "content": trecho}],
            system=_SYSTEM_MICRO_RAPIDA,
            max_tokens=20,
        )
        micro = resposta.strip().strip('"').strip("'").strip()
        return micro if micro else None
    except Exception as exc:
        logger.debug("[RAG] Pré-extração de micro_categoria falhou: %s", exc)
        return None


def _montar_secao_referencias(casos: list[dict]) -> str:
    """
    Formata a lista de casos similares como seção de texto para injeção
    no contexto da Etapa 2. Produz saída legível por humanos E pelo Claude.
    """
    n = len(casos)
    linhas = [
        f"\n--- REFERÊNCIAS HISTÓRICAS DO SEU TIME ({n} caso(s) similar(es)) ---",
        "Use como REFERÊNCIA para calibrar estimativas. Cada processo é único.",
        "",
    ]
    for i, caso in enumerate(casos, start=1):
        linhas.append(f"Caso {i}:")
        preco = caso.get("preco_anual_total")
        if preco:
            linhas.append(f"  Gasto anual (baseline): R$ {preco:,.0f}")
        if caso.get("pareto"):
            linhas.append(f"  Onde está o dinheiro: {caso['pareto']}")
        if caso.get("should_cost_sintese"):
            linhas.append(f"  Should-cost (razoabilidade): {caso['should_cost_sintese']}")
        drivers = caso.get("drivers_principais") or []
        if drivers:
            linhas.append(f"  Drivers principais: {', '.join(drivers)}")
        tco = caso.get("tco_fatores") or []
        if tco:
            linhas.append(f"  Fatores de TCO omitidos no preço: {', '.join(tco)}")
        if caso.get("savings_referencia"):
            linhas.append(f"  Savings realizados: {caso['savings_referencia']}")
        quadrante = caso.get("kraljic_quadrante")
        if quadrante:
            linhas.append(f"  Quadrante Kraljic: {quadrante}")
        linhas.append("")

    linhas.append("--- FIM DAS REFERÊNCIAS ---\n")
    return "\n".join(linhas)


def _textos_baseline(estudo) -> str:
    """Extrai e concatena o texto dos documentos classificados como baseline."""
    # Baseline usa limite menor que o padrão — resposta da Etapa 2 é rica e
    # precisa caber em 8000 tokens. 15000 chars é suficiente para qualquer
    # tabela de preços ou contrato real.
    LIMITE_BASELINE = 15000
    partes = []
    for doc in estudo.documentos:
        if doc.get("tipo") == "baseline":
            texto = doc.get("texto", "")[:LIMITE_BASELINE]
            partes.append(f"=== BASELINE: {doc['nome']} ===\n{texto}")
    return "\n\n".join(partes)


def _parse_resposta(resposta_bruta: str) -> dict:
    texto = resposta_bruta.strip()
    if texto.startswith("```"):
        linhas = texto.split("\n")
        texto = "\n".join(linhas[1:-1]).strip()
    try:
        return json.loads(texto)
    except json.JSONDecodeError:
        # JSON truncado (max_tokens atingido): tenta fechar o objeto e parsear o que veio
        import re
        # Remove trailing incompleto e tenta fechar o JSON
        texto_cortado = texto.rstrip().rstrip(",")
        # Conta chaves/colchetes abertos para fechar
        abertas = texto_cortado.count("{") - texto_cortado.count("}")
        colchetes = texto_cortado.count("[") - texto_cortado.count("]")
        fechamento = "]" * colchetes + "}" * abertas
        try:
            return json.loads(texto_cortado + fechamento)
        except json.JSONDecodeError:
            raise ValueError(
                "JSON inválido mesmo após tentativa de correção. "
                "Provável causa: baseline muito extenso — reduza o arquivo ou aumente MAX_CHARS_PER_DOC."
            )


# ---------------------------------------------------------------------------
# Função principal
# ---------------------------------------------------------------------------

def rodar_etapa2(estudo, session_id: str | None = None, time_id: int | None = None) -> dict:
    """
    Executa a Etapa 2 completa.

    Parâmetros
    ----------
    estudo      : objeto Estudo (de estudo.py) — já populado pela Etapa 1.
    session_id  : ID da sessão atual (para excluir da busca de histórico).
    time_id     : ID do time (para isolamento da memória RAG por time).
                  Quando ambos são None, a etapa roda sem memória — exatamente
                  como antes do Degrau 3 (compatibilidade retroativa).

    Retorna
    -------
    resultado : dict com as chaves:
        - analise                    : dict completo da análise (JSON do Claude)
        - tem_baseline               : bool
        - precisa_confirmar_anualização : bool
        - resumo                     : texto legível pra exibir na UI
        - casos_consultados          : int (0 se sem histórico)
        - micro_categoria_hint       : str | None (micro_categoria detectada no pré-passo)
    """

    # 1. Verificar se há baseline
    tipos = {d.get("tipo") for d in estudo.documentos}
    if "baseline" not in tipos:
        msg = (
            "Baseline não identificado — Etapa 2 pulada. "
            "Análise de savings será relativa entre propostas, sem âncora de custo atual."
        )
        estudo.add_faltante(msg)
        return {
            "tem_baseline": False,
            "analise": None,
            "precisa_confirmar_anualização": False,
            "resumo": f"⚠️ {msg}",
            "casos_consultados": 0,
            "micro_categoria_hint": None,
        }

    # 2. Montar texto do baseline
    texto_baseline = _textos_baseline(estudo)

    # ---------------------------------------------------------------------------
    # RAG — busca de casos similares (opcional; nunca trava a etapa)
    # ---------------------------------------------------------------------------
    casos_historicos = []
    micro_hint = None
    secao_referencias = ""
    system_etapa2 = SYSTEM_BASELINE  # padrão: sem instrução de referências

    if session_id and time_id:
        # 2a. Pré-extração rápida da micro_categoria para matching preciso
        micro_hint = _extrair_micro_categoria_rapida(texto_baseline)

        if micro_hint:
            from . import database  # import local para evitar ciclo
            casos_historicos = database.buscar_casos_similares(
                micro_categoria=micro_hint,
                time_id=time_id,
                excluir_session_id=session_id,
            )

        # 2b. Log detalhado para inspeção (comparação antes/depois)
        if casos_historicos:
            secao_referencias = _montar_secao_referencias(casos_historicos)
            system_etapa2 = SYSTEM_BASELINE + _INSTRUCAO_REFERENCIAS

            logger.info(
                "[RAG] Etapa 2 — micro_categoria detectada: '%s' | %d caso(s) encontrado(s): %s",
                micro_hint,
                len(casos_historicos),
                [c["session_id"] for c in casos_historicos],
            )
            # Print também no stdout para fácil inspeção no terminal do servidor
            print(f"\n{'='*60}")
            print(f"[RAG] Etapa 2 — referências históricas injetadas")
            print(f"  micro_categoria detectada : {micro_hint!r}")
            print(f"  casos encontrados         : {len(casos_historicos)}")
            for c in casos_historicos:
                print(f"    • {c['session_id']} — {c['micro_categoria']}")
            print(f"\n[RAG] SEÇÃO INJETADA NO CONTEXTO:")
            print(secao_referencias)
            print(f"{'='*60}\n")
        else:
            logger.info(
                "[RAG] Etapa 2 — micro_categoria: '%s' | nenhum caso histórico encontrado (rodando sem memória)",
                micro_hint,
            )
            print(f"[RAG] Etapa 2 — sem histórico para '{micro_hint}' (rodando sem memória)")
    # ---------------------------------------------------------------------------

    # 3. Montar contexto final (com ou sem referências)
    contexto = (
        f"Categoria: {estudo.categoria}\n"
        f"Modelo de precificação: {estudo.modelo_precificacao}\n\n"
        f"{texto_baseline}"
        f"{secao_referencias}"
    )

    # 4. Chamar Claude
    resposta_bruta = call_claude(
        messages=[{"role": "user", "content": contexto}],
        system=system_etapa2,
        max_tokens=8000,
    )

    # 5. Parsear
    try:
        analise = _parse_resposta(resposta_bruta)
    except (json.JSONDecodeError, ValueError) as e:
        raise ErroEtapa(f"Erro ao interpretar resposta da IA na Etapa 2: {e}", resposta_bruta=resposta_bruta)

    # 6. Gravar no Estudo
    estudo.micro_categoria = analise.get("micro_categoria")
    estudo.baseline = analise

    # Premissas e faltantes → Memória de Premissas
    for p in analise.get("premissas_registradas", []):
        estudo.add_premissa(p)
    for f in analise.get("faltantes", []):
        estudo.add_faltante(f)

    # 7. Montar resumo legível
    resumo = _montar_resumo(analise)

    estudo.etapa_atual = 2

    # ---------------------------------------------------------------------------
    # BENCHMARK — cálculo determinístico de preço histórico (nunca trava a etapa)
    # Roda após o parse para ter preco_anual_total do estudo atual disponível.
    # Usa micro_hint (pré-extração) com fallback para micro_categoria do Claude.
    # ---------------------------------------------------------------------------
    benchmark_preco = None
    if session_id and time_id:
        micro_para_benchmark = micro_hint or analise.get("micro_categoria")
        preco_atual_num = (analise.get("comercial") or {}).get("preco_anual_total")
        if micro_para_benchmark:
            try:
                from . import database as _db
                benchmark_preco = _db.calcular_benchmark_preco(
                    micro_categoria=micro_para_benchmark,
                    time_id=time_id,
                    excluir_session_id=session_id,
                    preco_atual=preco_atual_num if isinstance(preco_atual_num, (int, float)) else None,
                )
            except Exception as exc:
                logger.debug("[BENCHMARK] calcular_benchmark_preco falhou silenciosamente: %s", exc)
    # ---------------------------------------------------------------------------

    return {
        "tem_baseline": True,
        "analise": analise,
        "precisa_confirmar_anualização": analise.get("comercial", {}).get("precisa_confirmar_anualização", False),
        "resumo": resumo,
        "casos_consultados": len(casos_historicos),
        "micro_categoria_hint": micro_hint,
        "benchmark_preco": benchmark_preco,
    }


def _montar_resumo(analise: dict) -> str:
    """Monta o texto de exibição da Etapa 2."""
    linhas = []

    # Micro-categoria
    linhas.append(f"**Micro-categoria identificada:** {analise.get('micro_categoria', '—')}")

    # Técnica
    tec = analise.get("tecnica", {})
    linhas.append(f"\n**Escopo atual:** {tec.get('escopo_atual', '—')}")
    fornecedores = tec.get("fornecedores_atuais", [])
    if fornecedores:
        linhas.append(f"**Fornecedores atuais:** {', '.join(fornecedores)}")

    # Comercial
    com = analise.get("comercial", {})
    preco = com.get("preco_anual_total")
    if preco:
        linhas.append(f"\n**Gasto anual atual:** R$ {preco:,.2f}")
        linhas.append(f"_Base de anualização: {com.get('base_anualização', '—')}_")
    else:
        linhas.append("\n**Gasto anual atual:** não foi possível calcular com os dados disponíveis.")

    if com.get("precisa_confirmar_anualização"):
        linhas.append(
            f"\n⚠️ **Anualização requer confirmação.** "
            f"Sugestão do Claude: {com.get('sugestao_periodo', '—')}. "
            f"Você confirma esse período ou prefere outro?"
        )

    pareto = com.get("pareto")
    if pareto:
        linhas.append(f"\n**Onde está o dinheiro:** {pareto}")

    retrato = com.get("retrato")
    if retrato:
        linhas.append(f"\n**Retrato do cenário:** {retrato}")

    # TCO
    tco = analise.get("tco", {})
    fatores = tco.get("fatores_nao_considerados", [])
    if fatores:
        linhas.append("\n**Fatores de TCO não capturados no preço atual:**")
        for f in fatores:
            linhas.append(f"- [{f.get('relevancia','?').upper()}] {f.get('fator','')}: {f.get('comentario','')}")
    ressalva = tco.get("ressalva_geral")
    if ressalva:
        linhas.append(f"_{ressalva}_")

    # Should-cost
    sc = analise.get("should_cost", {})
    sintese = sc.get("sintese")
    if sintese:
        linhas.append(f"\n**Should-cost (razoabilidade):** {sintese}")

    # Premissas
    premissas = analise.get("premissas_registradas", [])
    if premissas:
        linhas.append("\n**Premissas assumidas nesta etapa:**")
        for p in premissas:
            linhas.append(f"- {p}")

    return "\n".join(linhas)


def confirmar_periodo_anualização(estudo, periodo_informado: str) -> str:
    """
    Chamada quando o usuário informa o período de anualização via chatbox.
    Atualiza o baseline com a premissa registrada e devolve confirmação.
    """
    if estudo.baseline and "comercial" in estudo.baseline:
        estudo.baseline["comercial"]["base_anualização"] = periodo_informado
        estudo.baseline["comercial"]["precisa_confirmar_anualização"] = False

    premissa = f"Período de anualização do baseline definido pelo consultor: {periodo_informado}."
    estudo.add_premissa(premissa)

    return f"✅ Período registrado: **{periodo_informado}**. Premissa adicionada à Memória de Premissas."
