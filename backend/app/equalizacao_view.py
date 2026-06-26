"""
equalizacao_view.py — Consulta paginada/filtrada/ordenada da equalização
comercial (Etapa 6).

Mesmo princípio do propostas_view.py (Etapa 4): não refaz nenhum cálculo —
lê o que rodar_etapa6 (etapa6.py) já gravou em estudo.equalizacao_comercial
e expõe isso de forma consultável: paginação, busca, ordenação.

KPIs desta etapa são COMERCIAIS (preço, savings), diferente dos KPIs
técnicos da Etapa 4 (gaps, aderência) — decisão do usuário ao revisar a
tela: "ao invés de mostrar gaps, mostrar baseline, quantidade de proposta,
valor médio de proposta, melhor proposta".
"""


def _agregado_por_fornecedor(forn: dict) -> dict:
    """
    Agregados de UM fornecedor já equalizado, prontos para exibição em
    tabela — lê direto do que a IA já calculou em rodar_etapa6, sem
    recalcular nada.
    """
    preco_total = forn.get("preco_total_equalizado")
    savings = forn.get("savings_vs_baseline")
    savings_pct = forn.get("savings_percentual")

    n_on_tops_escopo = len(forn.get("on_tops_escopo", []))
    n_on_tops_desvio = len(forn.get("on_tops_desvio", []))
    n_ajustes = len(forn.get("ajustes_condicoes", []))

    return {
        "fornecedor": forn.get("fornecedor", "?"),
        "preco_base_equalizado": forn.get("preco_base_equalizado"),
        "preco_total_equalizado": preco_total,
        "savings_vs_baseline": savings,
        "savings_percentual": savings_pct,
        "metodo_equalizacao": forn.get("metodo_equalizacao", "—"),
        "n_on_tops_escopo": n_on_tops_escopo,
        "n_on_tops_desvio": n_on_tops_desvio,
        "n_ajustes_condicoes": n_ajustes,
        "n_faltantes": len(forn.get("faltantes", [])),
    }


_CAMPOS_ORDENAVEIS = {
    "fornecedor": "fornecedor",
    "preco": "preco_total_equalizado",
    "savings": "savings_percentual",
    "on_tops": "n_on_tops_desvio",
}


def _bate_busca(agregado: dict, forn: dict, busca: str) -> bool:
    termo = busca.lower().strip()
    if not termo:
        return True
    campos = [
        agregado["fornecedor"],
        agregado["metodo_equalizacao"],
        " ".join(o.get("item", "") for o in forn.get("on_tops_escopo", [])),
        " ".join(o.get("item", "") for o in forn.get("on_tops_desvio", [])),
    ]
    return any(termo in (c or "").lower() for c in campos)


def _bate_filtro_status(agregado: dict, status: str | None) -> bool:
    if not status or status == "todos":
        return True
    if status == "economia":
        return (agregado["savings_vs_baseline"] or 0) > 0
    if status == "aumento":
        return (agregado["savings_vs_baseline"] or 0) < 0
    if status == "com_on_tops":
        return agregado["n_on_tops_escopo"] > 0 or agregado["n_on_tops_desvio"] > 0
    return True


def consultar_equalizacao(
    estudo,
    pagina: int = 1,
    tamanho_pagina: int = 20,
    busca: str = "",
    status: str | None = None,
    ordenar_por: str = "preco",
    direcao: str = "asc",
) -> dict:
    """
    Devolve uma página de fornecedores já equalizados comercialmente,
    filtrada/ordenada — mesmo contrato de resposta do consultar_propostas
    (Etapa 4), para o frontend reaproveitar o mesmo componente de tabela.
    """
    equalizacao = estudo.equalizacao_comercial or {}
    fornecedores = equalizacao.get("por_fornecedor", [])

    agregados_e_origem = [(_agregado_por_fornecedor(f), f) for f in fornecedores]
    total_sem_filtro = len(agregados_e_origem)

    filtrados = [
        (agregado, forn)
        for agregado, forn in agregados_e_origem
        if _bate_busca(agregado, forn, busca) and _bate_filtro_status(agregado, status)
    ]
    total_filtrado = len(filtrados)

    chave_ordenacao = _CAMPOS_ORDENAVEIS.get(ordenar_por, "preco_total_equalizado")

    def _chave(item):
        valor = item[0].get(chave_ordenacao)
        if valor is None:
            return (1, "")
        return (0, valor)

    filtrados.sort(key=_chave, reverse=(direcao == "desc"))

    inicio = (pagina - 1) * tamanho_pagina
    fim = inicio + tamanho_pagina
    pagina_atual = filtrados[inicio:fim]
    total_paginas = max(1, (total_filtrado + tamanho_pagina - 1) // tamanho_pagina)

    return {
        "itens": [agregado for agregado, _ in pagina_atual],
        "total_sem_filtro": total_sem_filtro,
        "total_filtrado": total_filtrado,
        "pagina": pagina,
        "tamanho_pagina": tamanho_pagina,
        "total_paginas": total_paginas,
    }


def resumo_executivo_agregado(estudo) -> dict:
    """
    KPIs COMERCIAIS para os cards do topo — pedido explícito do usuário:
    baseline, quantidade de propostas, valor médio de proposta, melhor
    proposta (= menor preço total equalizado, conforme confirmado).

    Diferente dos KPIs técnicos da Etapa 4 (gaps/aderência), aqui o que
    importa é preço — esta etapa é a equalização COMERCIAL, não técnica.
    """
    equalizacao = estudo.equalizacao_comercial or {}
    fornecedores = equalizacao.get("por_fornecedor", [])

    baseline_anual = None
    if estudo.baseline:
        baseline_anual = (estudo.baseline.get("comercial") or {}).get("preco_anual_total")

    if not fornecedores:
        return {
            "baseline_anual": baseline_anual,
            "n_propostas": 0,
            "valor_medio_proposta": None,
            "melhor_proposta": None,
            "moeda_referencia": equalizacao.get("moeda_referencia"),
        }

    precos = [f.get("preco_total_equalizado") for f in fornecedores if f.get("preco_total_equalizado") is not None]
    valor_medio = round(sum(precos) / len(precos), 2) if precos else None

    melhor_proposta = None
    if precos:
        # "Melhor proposta" = menor preço total equalizado (decisão confirmada
        # com o usuário — não considera técnica aqui, só comercial).
        candidatos_com_preco = [f for f in fornecedores if f.get("preco_total_equalizado") is not None]
        melhor = min(candidatos_com_preco, key=lambda f: f["preco_total_equalizado"])
        melhor_proposta = {
            "fornecedor": melhor.get("fornecedor", "?"),
            "preco_total_equalizado": melhor.get("preco_total_equalizado"),
            "savings_percentual": melhor.get("savings_percentual"),
        }

    return {
        "baseline_anual": baseline_anual,
        "n_propostas": len(fornecedores),
        "valor_medio_proposta": valor_medio,
        "melhor_proposta": melhor_proposta,
        "moeda_referencia": equalizacao.get("moeda_referencia"),
    }


def detalhe_de_um_fornecedor(estudo, fornecedor: str) -> dict | None:
    """
    Devolve a equalização COMPLETA de um único fornecedor (on-tops de
    escopo, on-tops de desvio, ajustes de condições, premissas, faltantes)
    — usado quando uma linha da tabela é expandida.
    """
    equalizacao = estudo.equalizacao_comercial or {}
    for forn in equalizacao.get("por_fornecedor", []):
        if forn.get("fornecedor") == fornecedor:
            return forn
    return None
