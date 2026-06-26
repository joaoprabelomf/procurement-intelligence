"""
etapa8_para_ppt.py — Traduz o resultado da Etapa 8 (Estratégia da Categoria
— Matriz de Kraljic) para o config.json esperado pelo engine
`gerar_apresentacao.py` (skill dd-deck-builder, template A&M).

NÃO refaz a análise. Lê exatamente os mesmos campos que `gerar_word_etapa8`
(etapa8.py) já consome — `estudo.estrategia_categoria` — e monta slides no
padrão A&M, usando o componente nativo `quadrantes` do engine para
representar a Matriz de Kraljic (em vez da tabela 3x3 que o Word desenha).

Mapeamento dos eixos no componente `quadrantes` do engine:
  eixo_x = Risco de Suprimento (esquerda = baixo, direita = alto)
  eixo_y = Impacto Financeiro  (baixo = baixo, cima = alto)

  quadrantes (lista, ordem fixa do engine):
    [0] top-left     = risco baixo + impacto alto  -> Alavancagem
    [1] top-right    = risco alto  + impacto alto  -> Estratégico
    [2] bottom-left  = risco baixo + impacto baixo -> Não-crítico
    [3] bottom-right = risco alto  + impacto baixo -> Gargalo

Essa ordem replica a mesma lógica que `_matriz_kraljic_word` (etapa8.py) já
usa: linha de impacto alto = Alavancagem (esq) / Estratégico (dir); linha de
impacto baixo = Não-crítico (esq) / Gargalo (dir).

Uso (depois que a Etapa 8 já rodou e estudo.estrategia_categoria está
preenchido):

    from etapa8_para_ppt import gerar_pptx_etapa8
    caminho = gerar_pptx_etapa8(
        estudo,
        caminho_engine="ppt/scripts/gerar_apresentacao.py",
        caminho_saida_dir="ppt_saida",
        arquivo_saida="Estrategia_Categoria.pptx",
    )
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile

SLIDE_W = 13.33
MARGEM_LATERAL = 0.5
AREA_UTIL = SLIDE_W - 2 * MARGEM_LATERAL

NOME_QUADRANTE = {
    "estrategico": "Estratégico",
    "alavancagem": "Alavancagem",
    "gargalo": "Gargalo",
    "nao_critico": "Não-crítico",
}

# Mesmas cores que o Word usa (QUADRANTE_COR em etapa8.py), traduzidas para
# os nomes de cor aceitos pelo engine A&M.
COR_POR_QUADRANTE = {
    "estrategico": "vermelho",
    "alavancagem": "verde",
    "gargalo": "laranja",
    "nao_critico": "azul_claro",
}

# px,py (0..1) do ponto único no quadrante ativo — um pouco recuado da borda
# para não colar nas linhas divisórias, mesmo espírito do exemplo do
# components.md (px=0.78/py=0.80 para "Alvo").
POSICAO_POR_QUADRANTE = {
    "alavancagem": (0.22, 0.78),    # risco baixo, impacto alto
    "estrategico": (0.78, 0.78),    # risco alto, impacto alto
    "nao_critico": (0.22, 0.22),    # risco baixo, impacto baixo
    "gargalo": (0.78, 0.22),        # risco alto, impacto baixo
}


def _truncar(texto: str, max_chars: int) -> str:
    texto = texto or "—"
    if len(texto) <= max_chars:
        return texto
    cortado = texto[: max_chars - 1].rstrip()
    if " " in cortado:
        cortado = cortado.rsplit(" ", 1)[0]
    return cortado.rstrip(",.;:") + "…"


def _altura_tabela(n_linhas_dados: int, com_cabecalho: bool = True,
                    altura_linha: float = 0.6, altura_cabecalho: float = 0.5,
                    minimo: float = 1.2, maximo: float = 5.0) -> float:
    altura = (altura_cabecalho if com_cabecalho else 0) + n_linhas_dados * altura_linha
    return max(minimo, min(maximo, altura))


# ---------------------------------------------------------------------------
# Slides
# ---------------------------------------------------------------------------

def _slide_capa_secao(titulo: str) -> dict:
    return {"tipo": "divisoria_marinho", "titulo": titulo}


def _slide_quadrante_kraljic(analise: dict) -> dict | None:
    quadrante = analise.get("quadrante", "")
    if quadrante not in NOME_QUADRANTE:
        return None

    categoria = analise.get("_categoria", "Categoria")
    impacto = analise.get("_impacto", "—")
    risco = analise.get("_risco", "—")
    nome_q = NOME_QUADRANTE[quadrante]
    cor = COR_POR_QUADRANTE.get(quadrante, "laranja")
    px, py = POSICAO_POR_QUADRANTE.get(quadrante, (0.5, 0.5))

    quadrantes_labels = ["Alavancagem", "Estratégico", "Não-crítico", "Gargalo"]

    pontos = [{
        "nome": categoria,
        "px": px,
        "py": py,
        "cor": cor,
        "tamanho": 0.6,
    }]

    return {
        "tipo": "padrao_2linhas_branco",
        "tag": "ESTRATÉGIA DA CATEGORIA",
        "titulo": f"{categoria} posicionada como {nome_q} na Matriz de Kraljic",
        "rodape": (
            f"Fonte: Etapa 8 — impacto {impacto} ({analise.get('_origem_impacto','—')}), "
            f"risco {risco} ({analise.get('_origem_risco','—')})"
        ),
        "quadrantes": [{
            "x": 1.4, "y": 1.85, "largura": 7.4, "altura": 4.3,
            "eixo_x": "Risco de suprimento  →",
            "eixo_y": "Impacto financeiro  →",
            "quadrantes": quadrantes_labels,
            "pontos": pontos,
        }],
    }


def _slide_resumo_posicao(analise: dict) -> dict | None:
    resumo = analise.get("resumo_posicao")
    estrategia = analise.get("estrategia_recomendada")
    if not resumo and not estrategia:
        return None

    return {
        "tipo": "texto2_branco",
        "tag": "ESTRATÉGIA DA CATEGORIA",
        "titulo": "Por que este quadrante — e o que a estratégia recomenda",
        "colunas": [
            {"titulo": "Por que este quadrante", "corpo": _truncar(resumo, 420)},
            {"titulo": "Estratégia recomendada", "corpo": _truncar(estrategia, 420)},
        ],
        "rodape": "Fonte: Etapa 8 — Estratégia da Categoria (Kraljic)",
    }


def _slide_relacionamento(analise: dict) -> dict | None:
    n_forn = analise.get("numero_fornecedores_sugerido")
    tipo_rel = analise.get("tipo_relacionamento")
    if not n_forn and not tipo_rel:
        return None

    return {
        "tipo": "texto2_branco",
        "tag": "ESTRATÉGIA DA CATEGORIA",
        "titulo": "Modelo de relacionamento e base de fornecedores recomendada",
        "colunas": [
            {"titulo": "Número de fornecedores sugerido", "corpo": _truncar(n_forn, 420)},
            {"titulo": "Tipo de relacionamento", "corpo": _truncar(tipo_rel, 420)},
        ],
        "rodape": "Fonte: Etapa 8 — Estratégia da Categoria (Kraljic)",
    }


def _slide_acoes_taticas(analise: dict) -> dict | None:
    acoes = analise.get("acoes_taticas", [])
    if not acoes:
        return None

    cabecalho = ["Prazo", "Ação", "Racional"]
    linhas = []
    for a in acoes[:8]:
        linhas.append([
            (a.get("prazo", "—") or "—").capitalize(),
            _truncar(a.get("acao", ""), 85),
            _truncar(a.get("racional", ""), 95),
        ])

    return {
        "tipo": "padrao_2linhas_branco",
        "tag": "ESTRATÉGIA DA CATEGORIA",
        "titulo": "Ações táticas organizadas por horizonte de prazo",
        "rodape": "Fonte: Etapa 8 — ações táticas (curto/médio/longo prazo)",
        "tabela": {
            "left": MARGEM_LATERAL,
            "top": 1.8,
            "width": AREA_UTIL,
            "height": _altura_tabela(len(linhas), altura_linha=0.55, minimo=1.5, maximo=5.0),
            "cabecalho": cabecalho,
            "linhas": linhas,
            "estilo": "claro",
        },
    }


def _slide_arvore_categoria(analise: dict) -> dict | None:
    arvore = analise.get("arvore_categoria", {})
    if not arvore:
        return None

    macro = arvore.get("macro", "—")
    categoria = arvore.get("categoria", "—")
    subs = arvore.get("subcategorias", [])

    corpo_subs = "\n".join(f"• {s}" for s in subs[:10]) or "— nenhuma subcategoria registrada —"

    return {
        "tipo": "texto2_branco",
        "tag": "ESTRATÉGIA DA CATEGORIA",
        "titulo": f"Árvore de categoria: {macro} → {categoria}",
        "colunas": [
            {"titulo": "Posição na árvore", "corpo": f"Macro-categoria: {macro}\nCategoria: {categoria}"},
            {"titulo": "Subcategorias relevantes", "corpo": corpo_subs},
        ],
        "rodape": "Fonte: Etapa 8 — árvore de categoria",
    }


def _slide_alertas_estrategicos(analise: dict) -> dict | None:
    alertas = analise.get("alertas_estrategicos", [])
    if not alertas:
        return None

    corpo = "\n".join(f"• {_truncar(a, 140)}" for a in alertas[:6])

    return {
        "tipo": "texto1_branco",
        "tag": "ESTRATÉGIA DA CATEGORIA",
        "titulo": "Alertas estratégicos de monitoramento contínuo",
        "col1_titulo": "Pontos de atenção de longo prazo",
        "col1_corpo": corpo,
        "rodape": "Fonte: Etapa 8 — alertas estratégicos",
    }


# ---------------------------------------------------------------------------
# Montagem
# ---------------------------------------------------------------------------

def montar_slides_etapa8(estudo) -> list[dict]:
    analise = estudo.estrategia_categoria or {}

    slides = [_slide_capa_secao("Estratégia da Categoria")]

    quadrante_slide = _slide_quadrante_kraljic(analise)
    if quadrante_slide:
        slides.append(quadrante_slide)

    resumo_slide = _slide_resumo_posicao(analise)
    if resumo_slide:
        slides.append(resumo_slide)

    relacionamento_slide = _slide_relacionamento(analise)
    if relacionamento_slide:
        slides.append(relacionamento_slide)

    acoes_slide = _slide_acoes_taticas(analise)
    if acoes_slide:
        slides.append(acoes_slide)

    arvore_slide = _slide_arvore_categoria(analise)
    if arvore_slide:
        slides.append(arvore_slide)

    alertas_slide = _slide_alertas_estrategicos(analise)
    if alertas_slide:
        slides.append(alertas_slide)

    return slides


def gerar_config_ppt_etapa8(estudo, arquivo_saida: str = "Estrategia_Categoria.pptx") -> dict:
    analise = estudo.estrategia_categoria or {}
    categoria = analise.get("_categoria") or estudo.micro_categoria or estudo.categoria or "Categoria não identificada"

    slides = []
    slides.append({
        "tipo": "capa_grafismo_marinho",
        "titulo": "Estratégia\nda Categoria",
        "subtitulo": categoria,
        "data": "",
    })
    slides.extend(montar_slides_etapa8(estudo))
    slides.append({"tipo": "despedida"})

    return {"arquivo_saida": arquivo_saida, "slides": slides}


def gerar_pptx_etapa8(estudo, caminho_engine: str, caminho_saida_dir: str,
                       arquivo_saida: str = "Estrategia_Categoria.pptx") -> str:
    """
    Gera o config.json, roda o engine `gerar_apresentacao.py` e retorna o
    caminho do .pptx gerado. Mesma lógica de resolução de caminhos das
    Etapas 5 e 7.
    """
    config = gerar_config_ppt_etapa8(estudo, arquivo_saida=arquivo_saida)

    caminho_engine_abs = os.path.abspath(caminho_engine)
    pasta_scripts = os.path.dirname(caminho_engine_abs)
    pasta_skill = os.path.dirname(pasta_scripts)

    template_em_scripts = os.path.join(pasta_scripts, "Template_Base.pptx")
    template_em_assets = os.path.join(pasta_skill, "assets", "Template_Base.pptx")
    if not os.path.exists(template_em_scripts) and os.path.exists(template_em_assets):
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
