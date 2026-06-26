"""
comparacao_view.py — Consulta paginada/filtrada/ordenada da comparação
técnica (Etapa 5), com FORNECEDOR como linha principal.

O JSON que rodar_etapa5 grava em estudo.comparacao_tecnica organiza os
dados por REQUISITO (matriz_requisitos[i].status_por_fornecedor[]) — é a
estrutura natural para a IA escrever, mas não é a melhor unidade de linha
para uma tabela executiva. Decisão confirmada com o usuário: a tabela
principal tem FORNECEDOR como linha (mesmo padrão das Etapas 4 e 6), e a
matriz requisito × status aparece completa só quando a linha expande —
por isso este módulo TRANSPÕE os dados (de "por requisito" para "por
fornecedor") antes de paginar/filtrar.

Não recalcula nenhuma análise — só reorganiza o que já foi calculado.
"""


def _fornecedores_da_matriz(matriz_requisitos: list) -> list[str]:
    """Lista de nomes de fornecedor, na ordem em que aparecem no primeiro requisito (preserva a ordem original)."""
    if not matriz_requisitos:
        return []
    primeiro = matriz_requisitos[0]
    return [s.get("fornecedor", "?") for s in primeiro.get("status_por_fornecedor", [])]


def _agregado_por_fornecedor(fornecedor: str, matriz_requisitos: list, gaps_mandatorios: list) -> dict:
    """
    Agrega, para UM fornecedor, quantos requisitos ele cumpre/não
    cumpre/parcial/tem desvio — contando linha a linha da matriz original.
    """
    contagem = {"cumpre": 0, "não cumpre": 0, "parcial": 0, "desvio": 0, "—": 0}
    total = 0
    for req in matriz_requisitos:
        for s in req.get("status_por_fornecedor", []):
            if s.get("fornecedor") == fornecedor:
                status = s.get("status", "—")
                contagem[status] = contagem.get(status, 0) + 1
                total += 1

    gap_deste = next((g for g in gaps_mandatorios if g.get("fornecedor") == fornecedor), None)

    return {
        "fornecedor": fornecedor,
        "n_requisitos_avaliados": total,
        "n_cumpre": contagem["cumpre"],
        "n_nao_cumpre": contagem["não cumpre"],
        "n_parcial": contagem["parcial"],
        "n_desvio": contagem["desvio"],
        "percentual_conformidade": round(100 * contagem["cumpre"] / total, 1) if total else None,
        "tem_gap_mandatorio": gap_deste is not None,
        "leitura_gap": gap_deste.get("leitura") if gap_deste else None,
    }


_CAMPOS_ORDENAVEIS = {
    "fornecedor": "fornecedor",
    "conformidade": "percentual_conformidade",
    "nao_cumpre": "n_nao_cumpre",
    "parcial": "n_parcial",
}


def _bate_busca(agregado: dict, busca: str) -> bool:
    termo = busca.lower().strip()
    if not termo:
        return True
    return termo in agregado["fornecedor"].lower()


def _bate_filtro(agregado: dict, status: str | None) -> bool:
    if not status or status == "todos":
        return True
    if status == "com_gap":
        return agregado["tem_gap_mandatorio"]
    if status == "sem_gap":
        return not agregado["tem_gap_mandatorio"]
    if status == "com_desvio":
        return agregado["n_desvio"] > 0
    return True


def consultar_comparacao(
    estudo,
    pagina: int = 1,
    tamanho_pagina: int = 20,
    busca: str = "",
    status: str | None = None,
    ordenar_por: str = "fornecedor",
    direcao: str = "asc",
) -> dict:
    """Página de fornecedores (transpostos da matriz), filtrada/ordenada — mesmo contrato das outras views."""
    analise = estudo.comparacao_tecnica or {}
    matriz = analise.get("matriz_requisitos", [])
    gaps = analise.get("gaps_mandatorios", [])
    fornecedores = _fornecedores_da_matriz(matriz)

    agregados = [_agregado_por_fornecedor(f, matriz, gaps) for f in fornecedores]
    total_sem_filtro = len(agregados)

    filtrados = [a for a in agregados if _bate_busca(a, busca) and _bate_filtro(a, status)]
    total_filtrado = len(filtrados)

    chave_ordenacao = _CAMPOS_ORDENAVEIS.get(ordenar_por, "fornecedor")

    def _chave(item):
        valor = item.get(chave_ordenacao)
        if valor is None:
            return (1, "")
        return (0, valor)

    filtrados.sort(key=_chave, reverse=(direcao == "desc"))

    inicio = (pagina - 1) * tamanho_pagina
    fim = inicio + tamanho_pagina
    pagina_atual = filtrados[inicio:fim]
    total_paginas = max(1, (total_filtrado + tamanho_pagina - 1) // tamanho_pagina)

    return {
        "itens": pagina_atual,
        "total_sem_filtro": total_sem_filtro,
        "total_filtrado": total_filtrado,
        "pagina": pagina,
        "tamanho_pagina": tamanho_pagina,
        "total_paginas": total_paginas,
    }


def resumo_executivo_comparacao(estudo) -> dict:
    """KPIs: nº de fornecedores, é comparação real, total de gaps mandatórios, fornecedor com mais gaps."""
    analise = estudo.comparacao_tecnica or {}
    gaps = analise.get("gaps_mandatorios", [])

    fornecedor_mais_gaps = None
    if gaps:
        pior = max(gaps, key=lambda g: len(g.get("requisitos_nao_cumpridos", [])))
        fornecedor_mais_gaps = {
            "fornecedor": pior.get("fornecedor"),
            "n_gaps": len(pior.get("requisitos_nao_cumpridos", [])),
        }

    tem_mandatorios_formais = any(
        r.get("tipo") == "mandatório"
        for r in (estudo.edital or {}).get("requisitos", [])
    )

    return {
        "n_fornecedores": analise.get("n_fornecedores", 0),
        "eh_comparacao_real": analise.get("eh_comparacao_real", False),
        "n_fornecedores_com_gap": len(gaps),
        "fornecedor_mais_gaps": fornecedor_mais_gaps,
        "resumo_executivo": analise.get("resumo_executivo"),
        "tem_mandatorios_formais": tem_mandatorios_formais,
    }


def matriz_completa_de_um_fornecedor(estudo, fornecedor: str) -> dict | None:
    """
    Devolve, para UM fornecedor, a lista de requisitos com o status dele
    (filtra a matriz original, que tem todos os fornecedores em cada
    linha) — usado quando a linha da tabela é expandida.
    """
    analise = estudo.comparacao_tecnica or {}
    matriz = analise.get("matriz_requisitos", [])

    if not any(
        s.get("fornecedor") == fornecedor
        for req in matriz
        for s in req.get("status_por_fornecedor", [])
    ):
        return None

    requisitos_do_fornecedor = []
    for req in matriz:
        status_entry = next(
            (s for s in req.get("status_por_fornecedor", []) if s.get("fornecedor") == fornecedor),
            None,
        )
        if status_entry:
            requisitos_do_fornecedor.append({
                "req_id": req.get("req_id", "—"),
                "descricao_curta": req.get("descricao_curta", ""),
                "tipo": req.get("tipo", "—"),
                "peso": req.get("peso", "—"),
                "status": status_entry.get("status", "—"),
            })

    gap = next((g for g in analise.get("gaps_mandatorios", []) if g.get("fornecedor") == fornecedor), None)
    inclusoes = [i for i in analise.get("escopo_cruzado", {}).get("inclusoes_exclusivas", []) if i.get("fornecedor") == fornecedor]
    exclusoes = [e for e in analise.get("escopo_cruzado", {}).get("exclusoes_relevantes", []) if e.get("fornecedor") == fornecedor]

    return {
        "fornecedor": fornecedor,
        "requisitos": requisitos_do_fornecedor,
        "gap_mandatorio": gap,
        "inclusoes_exclusivas": inclusoes,
        "exclusoes_relevantes": exclusoes,
    }
