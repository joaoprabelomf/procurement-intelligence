"""
etapa5_para_ppt.py — Traduz o resultado da Etapa 5 (Comparação Técnica) para
o config.json esperado pelo engine `gerar_apresentacao.py` (skill dd-deck-builder,
template A&M).
 
NÃO refaz a análise. Lê exatamente os mesmos campos que `gerar_word_etapa5` e
`gerar_excel_etapa5` (etapa5.py) já consomem — `estudo.comparacao_tecnica` e
`estudo.propostas_tecnicas` — e monta slides no padrão A&M.
 
Uso (depois que a Etapa 5 já rodou e estudo.comparacao_tecnica está preenchido):
 
    from etapa5_para_ppt import gerar_config_ppt_etapa5
    config = gerar_config_ppt_etapa5(estudo, arquivo_saida="Comparacao_Tecnica.pptx")
    # depois: rodar gerar_apresentacao.py com esse config (ver gerar_pptx_etapa5)
"""
 
import json
import subprocess
import sys
import tempfile
import os
 
# Cor por status — mesmo mapeamento usado no Word (STATUS_COR) e no Excel
# (STATUS_FILL) da etapa5.py, só traduzido para os nomes de cor aceitos pelo
# engine A&M (ver references/components.md da skill dd-deck-builder).
COR_POR_STATUS = {
    "cumpre": "verde",
    "parcial": "laranja",
    "não cumpre": "vermelho",
    "desvio": "cinza_inter",
    "não menciona": "cinza_medio",
    "—": "cinza_claro",
}
 
SIMBOLO_POR_STATUS = {
    "cumpre": "✓",
    "parcial": "◐",
    "não cumpre": "✗",
    "desvio": "≈",
    "não menciona": "?",
    "—": "—",
}
 
# Largura útil do slide A&M (polegadas) — slide 13.33 x 7.5
SLIDE_W = 13.33
MARGEM_LATERAL = 0.5
AREA_UTIL = SLIDE_W - 2 * MARGEM_LATERAL
 
 
def _truncar(texto: str, max_chars: int) -> str:
    texto = texto or "—"
    if len(texto) <= max_chars:
        return texto
    cortado = texto[: max_chars - 1].rstrip()
    # Evita cortar no meio de uma palavra: recua até o último espaço.
    if " " in cortado:
        cortado = cortado.rsplit(" ", 1)[0]
    return cortado.rstrip(",.;:") + "…"
 
 
def _altura_tabela(n_linhas_dados: int, com_cabecalho: bool = True,
                    altura_linha: float = 0.55, altura_cabecalho: float = 0.5,
                    minimo: float = 1.2, maximo: float = 5.0) -> float:
    """Calcula uma altura de tabela proporcional ao número de linhas, em vez
    de usar uma altura fixa — evita o cabeçalho 'esticar' quando há poucas
    linhas de dados (bug observado no QA visual com tabelas de 1-2 linhas)."""
    altura = (altura_cabecalho if com_cabecalho else 0) + n_linhas_dados * altura_linha
    return max(minimo, min(maximo, altura))
 
 
def _slide_capa_secao(titulo: str) -> dict:
    return {"tipo": "divisoria_marinho", "titulo": titulo}
 
 
def _slide_matriz_requisitos(analise: dict, fornecedores: list[str]) -> list[dict]:
    """
    Gera 1+ slides com a matriz de conformidade (requisito x fornecedor).
    Quebra em múltiplos slides se a matriz tiver muitas linhas, para não
    estourar o slide (mesmo espírito do padrão da seção 7B: limitar volume
    por unidade de saída).
    """
    matriz = analise.get("matriz_requisitos", [])
    if not matriz:
        return []
 
    MAX_LINHAS_POR_SLIDE = 10
    slides = []
    blocos = [matriz[i : i + MAX_LINHAS_POR_SLIDE] for i in range(0, len(matriz), MAX_LINHAS_POR_SLIDE)]
 
    for idx, bloco in enumerate(blocos):
        sufixo_titulo = "" if len(blocos) == 1 else f" ({idx + 1}/{len(blocos)})"
 
        cabecalho = ["Req.", "Descrição", "Tipo"] + fornecedores
        linhas = []
        for item in bloco:
            status_map = {
                s.get("fornecedor"): s.get("status", "—")
                for s in item.get("status_por_fornecedor", [])
            }
            linha = [
                item.get("req_id", "—"),
                _truncar(item.get("descricao_curta", ""), 60),
                item.get("tipo", "—"),
            ]
            for forn in fornecedores:
                status = status_map.get(forn, "—")
                simbolo = SIMBOLO_POR_STATUS.get(status, status)
                linha.append(f"{simbolo} {status}")
            linhas.append(linha)
 
        slide = {
            "tipo": "padrao_2linhas_branco",
            "tag": "COMPARAÇÃO TÉCNICA",
            "titulo": f"Matriz de conformidade por fornecedor{sufixo_titulo}",
            "rodape": "Fonte: Avaliação técnica das propostas (Etapa 4/5 — pipeline IA Procurement)",
            "tabela": {
                "left": MARGEM_LATERAL,
                "top": 1.7,
                "width": AREA_UTIL,
                "height": _altura_tabela(len(bloco), minimo=1.5, maximo=5.0),
                "cabecalho": cabecalho,
                "linhas": linhas,
                "estilo": "claro",
            },
        }
        slides.append(slide)
 
    return slides
 
 
def _slide_resumo_executivo(analise: dict, n_fornecedores: int) -> dict | None:
    resumo = analise.get("resumo_executivo")
    if not resumo:
        return None
 
    coluna_esquerda_titulo = "Resumo executivo"
    coluna_esquerda_corpo = _truncar(resumo, 420)
    if not analise.get("eh_comparacao_real", True):
        coluna_esquerda_corpo += (
            "\n\nAtenção: apenas 1 fornecedor avaliado — leitura de conformidade "
            "individual, não comparação entre propostas."
        )
 
    leitura = analise.get("leitura_para_decisao")
    coluna_direita_corpo = _truncar(leitura, 420) if leitura else "—"
 
    return {
        "tipo": "texto2_branco",
        "tag": "COMPARAÇÃO TÉCNICA",
        "titulo": f"Comparação técnica consolidada — {n_fornecedores} fornecedor(es), ótica técnica sem preço",
        "colunas": [
            {"titulo": coluna_esquerda_titulo, "corpo": coluna_esquerda_corpo},
            {"titulo": "Leitura para decisão", "corpo": coluna_direita_corpo},
        ],
        "rodape": "Fonte: Etapa 5 — Comparação Técnica (one-pager)",
    }
 
 
def _slide_gaps_mandatorios(analise: dict) -> dict | None:
    gaps = analise.get("gaps_mandatorios", [])
    if not gaps:
        return None
 
    gaps_exibidos = gaps[:10]
    cabecalho = ["Fornecedor", "Requisitos não cumpridos", "Leitura técnica"]
    linhas = []
    for g in gaps_exibidos:
        reqs = ", ".join(g.get("requisitos_nao_cumpridos", [])) or "—"
        linhas.append([
            g.get("fornecedor", "?"),
            _truncar(reqs, 55),
            _truncar(g.get("leitura", ""), 90),
        ])
 
    return {
        "tipo": "padrao_2linhas_branco",
        "tag": "COMPARAÇÃO TÉCNICA",
        "titulo": "Gaps mandatórios concentram-se em fornecedores específicos",
        "rodape": "Fonte: Etapa 5 — Gaps mandatórios por fornecedor",
        "tabela": {
            "left": MARGEM_LATERAL,
            "top": 1.8,
            "width": AREA_UTIL,
            "height": _altura_tabela(len(gaps_exibidos), altura_linha=0.7, minimo=1.3, maximo=4.5),
            "cabecalho": cabecalho,
            "linhas": linhas,
            "estilo": "claro",
        },
    }
 
 
def _slide_escopo_cruzado(analise: dict) -> dict | None:
    escopo = analise.get("escopo_cruzado", {})
    inclusoes = escopo.get("inclusoes_exclusivas", [])
    exclusoes = escopo.get("exclusoes_relevantes", [])
    if not inclusoes and not exclusoes:
        return None
 
    col_inclusoes = "\n".join(
        f"• {i.get('fornecedor','?')}: {_truncar(i.get('item',''), 80)}" for i in inclusoes[:8]
    ) or "— nenhuma registrada —"
    col_exclusoes = "\n".join(
        f"• {e.get('fornecedor','?')}: {_truncar(e.get('item',''), 80)}" for e in exclusoes[:8]
    ) or "— nenhuma registrada —"
 
    return {
        "tipo": "texto2_branco",
        "tag": "COMPARAÇÃO TÉCNICA",
        "titulo": "Escopo varia entre fornecedores em pontos relevantes",
        "colunas": [
            {"titulo": "Inclusões exclusivas", "corpo": col_inclusoes},
            {"titulo": "Exclusões relevantes", "corpo": col_exclusoes},
        ],
        "rodape": "Fonte: Etapa 5 — Escopo cruzado entre propostas",
    }
 
 
def montar_slides_etapa5(estudo) -> list[dict]:
    """
    Monta a lista de slides (formato do engine A&M) a partir do resultado
    já existente da Etapa 5 — não recalcula nada, só lê.
    """
    analise = estudo.comparacao_tecnica or {}
    fornecedores = [p.get("fornecedor", "?") for p in (estudo.propostas_tecnicas or [])]
    n_fornecedores = analise.get("n_fornecedores", len(fornecedores))
 
    slides = [_slide_capa_secao("Comparação Técnica")]
 
    resumo_slide = _slide_resumo_executivo(analise, n_fornecedores)
    if resumo_slide:
        slides.append(resumo_slide)
 
    slides.extend(_slide_matriz_requisitos(analise, fornecedores))
 
    gaps_slide = _slide_gaps_mandatorios(analise)
    if gaps_slide:
        slides.append(gaps_slide)
 
    escopo_slide = _slide_escopo_cruzado(analise)
    if escopo_slide:
        slides.append(escopo_slide)
 
    return slides
 
 
def gerar_config_ppt_etapa5(estudo, arquivo_saida: str = "Comparacao_Tecnica.pptx") -> dict:
    """Monta o config.json completo (capa + slides da Etapa 5 + despedida)."""
    categoria = estudo.micro_categoria or estudo.categoria or "Categoria não identificada"
 
    slides = []
    slides.append({
        "tipo": "capa_grafismo_marinho",
        "titulo": "Comparação Técnica\nde Propostas",
        "subtitulo": categoria,
        "data": "",
    })
    slides.extend(montar_slides_etapa5(estudo))
    slides.append({"tipo": "despedida"})
 
    return {"arquivo_saida": arquivo_saida, "slides": slides}
 
 
def gerar_pptx_etapa5(estudo, caminho_engine: str, caminho_saida_dir: str,
                       arquivo_saida: str = "Comparacao_Tecnica.pptx") -> str:
    """
    Gera o config.json, roda o engine `gerar_apresentacao.py` e retorna o
    caminho do .pptx gerado.
 
    caminho_engine: caminho para scripts/gerar_apresentacao.py (a skill espera
                    rodar com working dir = pasta da skill, pois ele lê
                    assets/Template_Base.pptx por caminho relativo).
    caminho_saida_dir: pasta onde o .pptx final deve ficar.
    """
    config = gerar_config_ppt_etapa5(estudo, arquivo_saida=arquivo_saida)
 
    caminho_engine_abs = os.path.abspath(caminho_engine)
    pasta_scripts = os.path.dirname(caminho_engine_abs)
    pasta_skill = os.path.dirname(pasta_scripts)
    # O engine (gerar_apresentacao.py) procura Template_Base.pptx na MESMA
    # pasta que ele mesmo está (scripts/), não em assets/. Garantimos a cópia
    # aqui em vez de assumir que já foi feita.
    template_em_scripts = os.path.join(pasta_scripts, "Template_Base.pptx")
    template_em_assets = os.path.join(pasta_skill, "assets", "Template_Base.pptx")
    if not os.path.exists(template_em_scripts) and os.path.exists(template_em_assets):
        import shutil
        shutil.copy2(template_em_assets, template_em_scripts)
 
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".json", delete=False, encoding="utf-8"
    ) as f:
        json.dump(config, f, ensure_ascii=False, indent=2)
        caminho_config = f.name
 
    try:
        resultado = subprocess.run(
            # Usamos o caminho ABSOLUTO do engine aqui — se passássemos o
            # caminho relativo original (ex.: "ppt/scripts/..."), ele seria
            # resolvido relativo ao novo cwd (pasta_skill) abaixo, duplicando
            # o prefixo "ppt" (bug real encontrado em teste: "ppt/ppt/scripts/...").
            [sys.executable, caminho_engine_abs, os.path.abspath(caminho_config)],
            cwd=pasta_skill,
            capture_output=True,
            text=True,
            timeout=120,
        )
        print(resultado.stdout)
        if resultado.returncode != 0:
            raise RuntimeError(
                f"Engine de PPT falhou (código {resultado.returncode}):\n{resultado.stderr}"
            )
    finally:
        os.unlink(caminho_config)
 
    caminho_gerado = os.path.join(pasta_scripts, arquivo_saida)
    if not os.path.exists(caminho_gerado):
        raise FileNotFoundError(
            f"Engine rodou sem erro mas não encontrei o arquivo gerado em {caminho_gerado}"
        )
 
    caminho_final = os.path.join(caminho_saida_dir, arquivo_saida)
    os.makedirs(caminho_saida_dir, exist_ok=True)
    if caminho_gerado != caminho_final:
        os.replace(caminho_gerado, caminho_final)
 
    return caminho_final