"""
recomendacoes_view.py — Leitura estruturada das recomendações finais
(Etapa 7) para a UI rica.

Sem paginação: os arrays aqui são poucos e qualitativos por design do
prompt (cenarios_decisao normalmente 2-4 itens; pontos_negociacao é por
fornecedor, cada um com poucas alavancas). Não há "N itens comparáveis"
o suficiente para justificar tabela com busca/filtro/ordenação — o
formato certo é cards.

IMPORTANTE: este módulo respeita a mesma regra de neutralidade da Etapa 7
(etapa7.py) — não cria nenhum agregado, ranking ou destaque visual que
sugira qual fornecedor escolher. Os "três melhores" e os "cenários" já
vêm como dados qualitativos paralelos da IA, sem hierarquia entre eles.
"""


def resumo_executivo_recomendacoes(estudo) -> dict:
    """KPIs: maior savings, fornecedor associado, nº de cenários, nº de pontos de negociação levantados."""
    analise = estudo.recomendacoes or {}
    savings = analise.get("savings_destaque", {})
    pontos = analise.get("pontos_negociacao", [])

    n_alavancas_total = sum(len(p.get("alavancas", [])) for p in pontos)

    return {
        "eh_comparacao_real": analise.get("eh_comparacao_real", False),
        "maior_savings_absoluto": savings.get("maior_savings_absoluto"),
        "fornecedor_maior_savings": savings.get("fornecedor_maior_savings"),
        "n_cenarios_decisao": len(analise.get("cenarios_decisao", [])),
        "n_pontos_negociacao": n_alavancas_total,
    }


def conteudo_completo_recomendacoes(estudo) -> dict:
    """
    Conteúdo completo para os cards/painéis — não pagina nada (poucos
    itens por natureza). Devolve tudo de uma vez, já que não escala a
    centenas de itens como as Etapas 4/5/6.
    """
    analise = estudo.recomendacoes or {}
    return {
        "savings_destaque": analise.get("savings_destaque", {}),
        "tres_melhores": analise.get("tres_melhores", {}),
        "cenarios_decisao": analise.get("cenarios_decisao", []),
        "pontos_negociacao": analise.get("pontos_negociacao", []),
        "leitura_final": analise.get("leitura_final"),
        "eh_comparacao_real": analise.get("eh_comparacao_real", False),
    }
