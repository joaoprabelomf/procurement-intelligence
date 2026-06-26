"""
etapa7_para_ppt.py — Traduz o resultado da Etapa 7 (Recomendações Finais)
para o config.json esperado pelo engine `gerar_apresentacao.py` (skill
dd-deck-builder, template A&M).

NÃO refaz a análise. Lê exatamente os mesmos campos que `gerar_word_etapa7`
(etapa7.py) já consome — `estudo.recomendacoes` e `estudo.equalizacao_comercial`
— e monta slides no padrão A&M.

Mesma regra de neutralidade da Etapa 7: o PPT nunca indica "escolha o
fornecedor X" — mostra savings, os três "melhores" sob óticas diferentes,
cenários com trade-offs e pontos de negociação, sem concluir.

Uso (depois que a Etapa 7 já rodou e estudo.recomendacoes está preenchido):

    from etapa7_para_ppt import gerar_pptx_etapa7
    caminho = gerar_pptx_etapa7(
        estudo,
        caminho_engine="ppt/scripts/gerar_apresentacao.py",
        caminho_saida_dir="ppt_saida",
        arquivo_saida="Recomendacoes_Finais.pptx",
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


def _formatar_numero(valor) -> str:
    """Formata um número como moeda simplificada (sem assumir símbolo —
    a moeda de referência vem da Etapa 6, não temos ela aqui de forma
    garantida em todos os casos, então mostramos só o número formatado)."""
    if valor is None:
        return "—"
    try:
        return f"{float(valor):,.0f}".replace(",", ".")
    except (TypeError, ValueError):
        return str(valor)


# ---------------------------------------------------------------------------
# Slides
# ---------------------------------------------------------------------------

def _slide_capa_secao(titulo: str) -> dict:
    return {"tipo": "divisoria_marinho", "titulo": titulo}


def _slide_savings_destaque(analise: dict, moeda: str = "") -> dict | None:
    savings = analise.get("savings_destaque", {})
    if not savings:
        return None

    valor = savings.get("maior_savings_absoluto")
    fornecedor = savings.get("fornecedor_maior_savings", "—")
    resumo = savings.get("resumo", "")

    prefixo_moeda = f"{moeda} " if moeda else ""
    callouts = [{
        "x": MARGEM_LATERAL,
        "y": 1.9,
        "largura": 4.0,
        "valor": f"{prefixo_moeda}{_formatar_numero(valor)}",
        "label": f"Maior savings — {fornecedor}",
        "cor_valor": "laranja",
        "tamanho_valor": 36,
    }]

    return {
        "tipo": "texto2_branco",
        "tag": "RECOMENDAÇÕES FINAIS",
        "titulo": "Savings em destaque entre as propostas avaliadas",
        "colunas": [
            {"titulo": "", "corpo": ""},
            {"titulo": "Leitura", "corpo": _truncar(resumo, 380)},
        ],
        "callouts": callouts,
        "rodape": "Fonte: Etapa 6/7 — Equalização Comercial e Recomendações Finais",
    }


def _slide_tres_melhores(analise: dict) -> dict | None:
    tres = analise.get("tres_melhores", {})
    if not tres:
        return None

    cabecalho = ["Ótica", "Fornecedor", "Justificativa"]
    linhas_def = [
        ("Melhor preço", "melhor_preco"),
        ("Melhor técnica", "melhor_tecnica"),
        ("Melhor custo-benefício", "melhor_custo_beneficio"),
    ]
    linhas = []
    for label, chave in linhas_def:
        item = tres.get(chave, {})
        linhas.append([
            label,
            item.get("fornecedor", "—"),
            _truncar(item.get("justificativa", ""), 140),
        ])

    return {
        "tipo": "padrao_2linhas_branco",
        "tag": "RECOMENDAÇÕES FINAIS",
        "titulo": "Os três \"melhores\" variam conforme a ótica de avaliação",
        "rodape": "Fonte: Etapa 7 — síntese neutra entre Etapa 5 e Etapa 6 (sem indicação de escolha)",
        "tabela": {
            "left": MARGEM_LATERAL,
            "top": 1.8,
            "width": AREA_UTIL,
            "height": _altura_tabela(len(linhas), altura_linha=0.85, minimo=2.0, maximo=4.0),
            "cabecalho": cabecalho,
            "linhas": linhas,
            "estilo": "claro",
        },
    }


def _slide_cenarios_decisao(analise: dict) -> list[dict]:
    """1 slide por cenário (são poucos — máx 4 — e cada um tem
    descrição + trade-off, que merece espaço próprio em vez de
    amontoar tudo numa tabela apertada)."""
    cenarios = analise.get("cenarios_decisao", [])
    if not cenarios:
        return []

    slides = []
    for c in cenarios[:4]:
        nome = c.get("nome", "Cenário")
        fornecedor = c.get("fornecedor_associado", "—")
        descricao = _truncar(c.get("descricao", ""), 350)
        trade_off = _truncar(c.get("trade_off", ""), 350)

        slides.append({
            "tipo": "texto2_branco",
            "tag": "RECOMENDAÇÕES FINAIS — CENÁRIOS",
            "titulo": f"{nome} — cenário associado a {fornecedor}",
            "colunas": [
                {"titulo": "O que este cenário prioriza", "corpo": descricao},
                {"titulo": "Trade-off (o que se ganha e o que se perde)", "corpo": trade_off},
            ],
            "rodape": "Fonte: Etapa 7 — cenários de decisão (neutros, sem recomendação direta)",
        })
    return slides


def _slide_pontos_negociacao(analise: dict) -> dict | None:
    pontos = analise.get("pontos_negociacao", [])
    if not pontos:
        return None

    cabecalho = ["Fornecedor", "Origem", "Ponto de negociação", "Argumento"]
    linhas = []
    for p in pontos:
        fornecedor = p.get("fornecedor", "?")
        for a in p.get("alavancas", [])[:5]:
            linhas.append([
                fornecedor,
                a.get("origem", "—"),
                _truncar(a.get("ponto", ""), 55),
                _truncar(a.get("argumento", ""), 95),
            ])

    if not linhas:
        return None

    # Tabela longa de negociação pode passar de 10 linhas com vários
    # fornecedores — quebra em múltiplos slides como na matriz da Etapa 5.
    MAX_LINHAS = 8
    blocos = [linhas[i:i + MAX_LINHAS] for i in range(0, len(linhas), MAX_LINHAS)]
    slides = []
    for idx, bloco in enumerate(blocos):
        sufixo = "" if len(blocos) == 1 else f" ({idx + 1}/{len(blocos)})"
        slides.append({
            "tipo": "padrao_2linhas_branco",
            "tag": "RECOMENDAÇÕES FINAIS",
            "titulo": f"Pontos de negociação por fornecedor{sufixo}",
            "rodape": "Fonte: Etapa 7 — alavancas de negociação (gaps, escopo, condições comerciais)",
            "tabela": {
                "left": MARGEM_LATERAL,
                "top": 1.7,
                "width": AREA_UTIL,
                "height": _altura_tabela(len(bloco), altura_linha=0.55, minimo=1.5, maximo=5.0),
                "cabecalho": cabecalho,
                "linhas": bloco,
                "estilo": "claro",
            },
        })
    return slides


def _slide_leitura_final(analise: dict) -> dict | None:
    leitura = analise.get("leitura_final")
    if not leitura:
        return None

    aviso = ""
    if not analise.get("eh_comparacao_real", True):
        aviso = (
            "\n\nApenas 1 fornecedor avaliado — esta leitura não representa "
            "comparação entre propostas."
        )

    return {
        "tipo": "texto1_branco",
        "tag": "RECOMENDAÇÕES FINAIS",
        "titulo": "Leitura final — síntese neutra, decisão em aberto",
        "col1_titulo": "Resumo equilibrado da situação",
        "col1_corpo": _truncar(leitura, 500) + aviso,
        "rodape": "Fonte: Etapa 7 — leitura final (não indica qual fornecedor escolher)",
    }


# ---------------------------------------------------------------------------
# Montagem
# ---------------------------------------------------------------------------

def montar_slides_etapa7(estudo) -> list[dict]:
    analise = estudo.recomendacoes or {}
    equal = estudo.equalizacao_comercial or {}
    moeda = equal.get("moeda_referencia", "") or ""

    slides = [_slide_capa_secao("Recomendações Finais")]

    savings_slide = _slide_savings_destaque(analise, moeda=moeda)
    if savings_slide:
        slides.append(savings_slide)

    tres_slide = _slide_tres_melhores(analise)
    if tres_slide:
        slides.append(tres_slide)

    slides.extend(_slide_cenarios_decisao(analise))

    pontos_slides = _slide_pontos_negociacao(analise)
    if pontos_slides:
        slides.extend(pontos_slides)

    leitura_slide = _slide_leitura_final(analise)
    if leitura_slide:
        slides.append(leitura_slide)

    return slides


def gerar_config_ppt_etapa7(estudo, arquivo_saida: str = "Recomendacoes_Finais.pptx") -> dict:
    categoria = estudo.micro_categoria or estudo.categoria or "Categoria não identificada"

    slides = []
    slides.append({
        "tipo": "capa_grafismo_marinho",
        "titulo": "Recomendações\nFinais",
        "subtitulo": categoria,
        "data": "",
    })
    slides.extend(montar_slides_etapa7(estudo))
    slides.append({"tipo": "despedida"})

    return {"arquivo_saida": arquivo_saida, "slides": slides}


def gerar_pptx_etapa7(estudo, caminho_engine: str, caminho_saida_dir: str,
                       arquivo_saida: str = "Recomendacoes_Finais.pptx") -> str:
    """
    Gera o config.json, roda o engine `gerar_apresentacao.py` e retorna o
    caminho do .pptx gerado. Mesma lógica de resolução de caminhos da
    Etapa 5 (gerar_pptx_etapa5), incluindo a cópia automática do
    Template_Base.pptx para scripts/ se ainda não estiver lá.
    """
    config = gerar_config_ppt_etapa7(estudo, arquivo_saida=arquivo_saida)

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
