"""
etapa6_para_ppt.py — Traduz o resultado da Etapa 6 (Equalização Comercial) para
o config.json esperado pelo engine `gerar_apresentacao.py` (skill dd-deck-builder,
template A&M).

NÃO refaz a análise. Lê exatamente os mesmos campos que `gerar_word_etapa6` e
`gerar_excel_etapa6` (etapa6.py) já consomem — `estudo.equalizacao_comercial` —
e monta slides no padrão A&M.

Uso (depois que a Etapa 6 já rodou e estudo.equalizacao_comercial está preenchido):

    from etapa6_para_ppt import gerar_config_ppt_etapa6
    config = gerar_config_ppt_etapa6(estudo, arquivo_saida="Equalizacao_Comercial.pptx")
    # depois: rodar gerar_apresentacao.py com esse config (ver gerar_pptx_etapa6)
"""

import json
import subprocess
import sys
import tempfile
import os

# Largura útil do slide A&M (polegadas) — slide 13.33 x 7.5
SLIDE_W = 13.33
MARGEM_LATERAL = 0.5
AREA_UTIL = SLIDE_W - 2 * MARGEM_LATERAL


def _truncar(texto: str, max_chars: int) -> str:
    texto = texto or "—"
    if len(texto) <= max_chars:
        return texto
    cortado = texto[: max_chars - 1].rstrip()
    if " " in cortado:
        cortado = cortado.rsplit(" ", 1)[0]
    return cortado.rstrip(",.;:") + "…"


def _altura_tabela(n_linhas_dados: int, com_cabecalho: bool = True,
                    altura_linha: float = 0.55, altura_cabecalho: float = 0.5,
                    minimo: float = 1.2, maximo: float = 5.0) -> float:
    """Calcula altura proporcional ao número de linhas (mesmo padrão etapa5_para_ppt)."""
    altura = (altura_cabecalho if com_cabecalho else 0) + n_linhas_dados * altura_linha
    return max(minimo, min(maximo, altura))


def _slide_capa_secao(titulo: str) -> dict:
    return {"tipo": "divisoria_marinho", "titulo": titulo}


def _slide_sintese_savings(analise: dict) -> dict | None:
    """Tabela principal: fornecedor × preço equalizado × savings."""
    por_forn = analise.get("por_fornecedor", [])
    if not por_forn:
        return None

    moeda = analise.get("moeda_referencia", "—")
    taxa = analise.get("taxa_desconto_aplicada", "—")

    cabecalho = [
        "Fornecedor",
        f"Preço Total Equalizado ({moeda})",
        f"Savings ({moeda})",
        "Savings %",
        "Método de Equalização",
    ]
    linhas = []
    for forn in por_forn:
        total = forn.get("preco_total_equalizado")
        savings = forn.get("savings_vs_baseline")
        savings_pct = forn.get("savings_percentual")
        linhas.append([
            forn.get("fornecedor", "?"),
            f"{total:,.2f}" if total is not None else "—",
            f"{savings:,.2f}" if savings is not None else "—",
            f"{savings_pct:.1f}%" if savings_pct is not None else "—",
            _truncar(forn.get("metodo_equalizacao", "—"), 50),
        ])

    return {
        "tipo": "padrao_2linhas_branco",
        "tag": "EQUALIZAÇÃO COMERCIAL",
        "titulo": f"Savings por fornecedor — moeda {moeda} · taxa de desconto {taxa}%",
        "rodape": "Fonte: Etapa 6 — Equalização Comercial (pipeline IA Procurement)",
        "tabela": {
            "left": MARGEM_LATERAL,
            "top": 1.7,
            "width": AREA_UTIL,
            "height": _altura_tabela(len(linhas), minimo=1.5, maximo=4.5),
            "cabecalho": cabecalho,
            "linhas": linhas,
            "estilo": "claro",
        },
    }


def _slide_ontops(analise: dict) -> dict | None:
    """Tabela de on-tops de escopo e desvio por fornecedor."""
    linhas = []
    for forn in analise.get("por_fornecedor", []):
        nome = forn.get("fornecedor", "?")
        for o in forn.get("on_tops_escopo", []):
            sinal = "+" if o.get("direcao") == "soma" else "−"
            valor = o.get("valor_estimado")
            valor_str = f"{sinal}{valor:,.2f}" if valor is not None else f"{sinal}(não estimado)"
            linhas.append([nome, "escopo", _truncar(o.get("item", ""), 60), valor_str])
        for o in forn.get("on_tops_desvio", []):
            sinal = "+" if o.get("direcao") == "soma" else "−"
            valor = o.get("valor_estimado")
            valor_str = f"{sinal}{valor:,.2f}" if valor is not None else f"{sinal}(não estimado)"
            linhas.append([nome, "desvio", _truncar(o.get("item", ""), 60), valor_str])

    if not linhas:
        return None

    MAX_LINHAS = 12
    exibidos = linhas[:MAX_LINHAS]
    sufixo = f" (top {MAX_LINHAS} de {len(linhas)})" if len(linhas) > MAX_LINHAS else ""

    return {
        "tipo": "padrao_2linhas_branco",
        "tag": "EQUALIZAÇÃO COMERCIAL",
        "titulo": "On-tops de escopo e desvio por fornecedor",
        "rodape": f"Fonte: Etapa 6 — On-tops identificados na equalização{sufixo}",
        "tabela": {
            "left": MARGEM_LATERAL,
            "top": 1.7,
            "width": AREA_UTIL,
            "height": _altura_tabela(len(exibidos), altura_linha=0.6, minimo=1.3, maximo=5.0),
            "cabecalho": ["Fornecedor", "Tipo", "Item", "Valor Estimado"],
            "linhas": exibidos,
            "estilo": "claro",
        },
    }


def _slide_sintese_comparativa(analise: dict) -> dict | None:
    """Slide de texto duplo: síntese comparativa + premissas/limitações."""
    sintese = analise.get("sintese_comparativa")
    if not sintese:
        return None

    premissas = analise.get("premissas_gerais", [])
    faltantes = analise.get("faltantes_gerais", [])

    col_dir_partes = []
    if premissas:
        col_dir_partes.append("Premissas:\n" + "\n".join(f"• {p}" for p in premissas[:5]))
    if faltantes:
        col_dir_partes.append("Limitações:\n" + "\n".join(f"• {f}" for f in faltantes[:5]))
    col_dir = "\n\n".join(col_dir_partes) if col_dir_partes else "—"

    return {
        "tipo": "texto2_branco",
        "tag": "EQUALIZAÇÃO COMERCIAL",
        "titulo": "Síntese comparativa da equalização comercial",
        "colunas": [
            {"titulo": "Síntese comparativa", "corpo": _truncar(sintese, 420)},
            {"titulo": "Premissas e limitações", "corpo": _truncar(col_dir, 420)},
        ],
        "rodape": "Fonte: Etapa 6 — Equalização Comercial",
    }


def montar_slides_etapa6(estudo) -> list[dict]:
    """
    Monta a lista de slides (formato do engine A&M) a partir do resultado
    já existente da Etapa 6 — não recalcula nada, só lê.
    """
    analise = estudo.equalizacao_comercial or {}

    slides = [_slide_capa_secao("Equalização Comercial")]

    savings_slide = _slide_sintese_savings(analise)
    if savings_slide:
        slides.append(savings_slide)

    ontops_slide = _slide_ontops(analise)
    if ontops_slide:
        slides.append(ontops_slide)

    comparativa_slide = _slide_sintese_comparativa(analise)
    if comparativa_slide:
        slides.append(comparativa_slide)

    return slides


def gerar_config_ppt_etapa6(estudo, arquivo_saida: str = "Equalizacao_Comercial.pptx") -> dict:
    """Monta o config.json completo (capa + slides da Etapa 6 + despedida)."""
    categoria = estudo.micro_categoria or estudo.categoria or "Categoria não identificada"

    slides = []
    slides.append({
        "tipo": "capa_grafismo_marinho",
        "titulo": "Equalização Comercial\nde Propostas",
        "subtitulo": categoria,
        "data": "",
    })
    slides.extend(montar_slides_etapa6(estudo))
    slides.append({"tipo": "despedida"})

    return {"arquivo_saida": arquivo_saida, "slides": slides}


def gerar_pptx_etapa6(estudo, caminho_engine: str, caminho_saida_dir: str,
                       arquivo_saida: str = "Equalizacao_Comercial.pptx") -> str:
    """
    Gera o config.json, roda o engine `gerar_apresentacao.py` e retorna o
    caminho do .pptx gerado. Mesmo padrão de gerar_pptx_etapa5.
    """
    config = gerar_config_ppt_etapa6(estudo, arquivo_saida=arquivo_saida)

    caminho_engine_abs = os.path.abspath(caminho_engine)
    pasta_scripts = os.path.dirname(caminho_engine_abs)
    pasta_skill = os.path.dirname(pasta_scripts)
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
