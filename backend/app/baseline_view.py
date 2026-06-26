"""
baseline_view.py — Leitura estruturada do baseline (Etapa 2) para a UI rica.

Diferente de propostas_view.py e equalizacao_view.py, NÃO há paginação aqui
— o resultado da Etapa 2 é um objeto único (um baseline), não uma lista de
N itens comparáveis entre si. O "view" aqui é mais simples: extrai os
campos certos do JSON já gravado em estudo.baseline para os cards
executivos e o painel de leitura (Pareto, fatores de TCO, drivers de
should-cost), sem recalcular nada.
"""


def resumo_executivo_baseline(estudo) -> dict:
    """
    KPIs executivos para os cards do topo da Etapa 2:
    gasto anual, micro-categoria, quantos fatores de TCO não capturados,
    e a leitura de razoabilidade do modelo (should-cost).
    """
    baseline = estudo.baseline or {}
    comercial = baseline.get("comercial", {})
    tco = baseline.get("tco", {})
    should_cost = baseline.get("should_cost", {})

    fatores = tco.get("fatores_nao_considerados", [])
    n_fatores_alta = sum(1 for f in fatores if f.get("relevancia") == "alta")

    return {
        "gasto_anual_total": comercial.get("preco_anual_total"),
        "micro_categoria": baseline.get("micro_categoria"),
        "n_fatores_tco": len(fatores),
        "n_fatores_tco_alta_relevancia": n_fatores_alta,
        "razoabilidade_modelo": should_cost.get("razoabilidade_modelo"),
    }


def detalhe_baseline(estudo) -> dict:
    """
    Conteúdo completo para o painel de leitura — não pagina nada, porque
    os arrays aqui são pequenos por design do prompt (máx. 10 valores
    unitários, máx. 5 fatores de TCO, máx. 5 drivers de should-cost,
    conforme limites definidos em etapa2.py).
    """
    baseline = estudo.baseline or {}
    tecnica = baseline.get("tecnica", {})
    comercial = baseline.get("comercial", {})
    tco = baseline.get("tco", {})
    should_cost = baseline.get("should_cost", {})

    return {
        "escopo_atual": tecnica.get("escopo_atual"),
        "fornecedores_atuais": tecnica.get("fornecedores_atuais", []),
        "observacoes": tecnica.get("observacoes"),
        "base_anualizacao": comercial.get("base_anualização"),
        "valores_unitarios": comercial.get("valores_unitarios", []),
        "pareto": comercial.get("pareto"),
        "retrato": comercial.get("retrato"),
        "fatores_tco": tco.get("fatores_nao_considerados", []),
        "ressalva_geral_tco": tco.get("ressalva_geral"),
        "drivers_should_cost": should_cost.get("drivers_principais", []),
        "sintese_should_cost": should_cost.get("sintese"),
        "premissas": baseline.get("premissas_registradas", []),
        "faltantes": baseline.get("faltantes", []),
    }
