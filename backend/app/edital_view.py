"""
edital_view.py — Consulta paginada/filtrada/ordenada dos requisitos do
edital (Etapa 3).

Mesmo princípio de propostas_view.py e equalizacao_view.py: não recalcula
nada, só consulta o que rodar_etapa3 (etapa3.py) já gravou em
estudo.edital["requisitos"]. A unidade paginável aqui é REQUISITO (não
fornecedor — nesta etapa ainda não há propostas, só o edital em si).
"""


def _agregado_requisito(req: dict) -> dict:
    return {
        "id": req.get("id", "?"),
        "categoria": req.get("categoria", "—"),
        "descricao": req.get("descricao", ""),
        "tipo": req.get("tipo", "—"),
        "peso": req.get("peso", "—"),
        "justificativa_peso": req.get("justificativa_peso", ""),
    }


_CAMPOS_ORDENAVEIS = {
    "id": "id",
    "categoria": "categoria",
    "tipo": "tipo",
    "peso": "peso",
}

_ORDEM_PESO = {"Alto": 0, "Médio": 1, "Baixo": 2}


def _bate_busca(agregado: dict, busca: str) -> bool:
    termo = busca.lower().strip()
    if not termo:
        return True
    campos = [agregado["id"], agregado["categoria"], agregado["descricao"]]
    return any(termo in (c or "").lower() for c in campos)


def _bate_filtro(agregado: dict, status: str | None) -> bool:
    if not status or status == "todos":
        return True
    if status == "mandatorio":
        return agregado["tipo"] == "mandatório"
    if status == "desejavel":
        return agregado["tipo"] == "desejável"
    if status == "peso_alto":
        return agregado["peso"] == "Alto"
    return True


def consultar_requisitos(
    estudo,
    pagina: int = 1,
    tamanho_pagina: int = 20,
    busca: str = "",
    status: str | None = None,
    ordenar_por: str = "id",
    direcao: str = "asc",
) -> dict:
    """Página de requisitos do edital, filtrada/ordenada — mesmo contrato de resposta das outras views."""
    requisitos = (estudo.edital or {}).get("requisitos", [])
    agregados = [_agregado_requisito(r) for r in requisitos]
    total_sem_filtro = len(agregados)

    filtrados = [a for a in agregados if _bate_busca(a, busca) and _bate_filtro(a, status)]
    total_filtrado = len(filtrados)

    chave_ordenacao = _CAMPOS_ORDENAVEIS.get(ordenar_por, "id")

    def _chave(item):
        valor = item.get(chave_ordenacao)
        if chave_ordenacao == "peso":
            return (0, _ORDEM_PESO.get(valor, 99))
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


def resumo_executivo_edital(estudo) -> dict:
    """KPIs: total de requisitos, mandatórios de peso Alto, e o tamanho do delta de escopo vs baseline."""
    edital = estudo.edital or {}
    requisitos = edital.get("requisitos", [])
    delta = edital.get("delta_escopo", {})

    mandatorios_alto = sum(1 for r in requisitos if r.get("tipo") == "mandatório" and r.get("peso") == "Alto")
    n_delta = (
        len(delta.get("adicionados", []))
        + len(delta.get("removidos", []))
        + len(delta.get("modificados", []))
    )

    return {
        "n_requisitos": len(requisitos),
        "n_mandatorios_peso_alto": mandatorios_alto,
        "tem_baseline_para_comparar": delta.get("tem_baseline", False),
        "n_itens_delta_escopo": n_delta,
        "resumo_edital": edital.get("resumo_edital"),
    }


def detalhe_delta_escopo(estudo) -> dict:
    """Conteúdo completo do delta de escopo (poucos itens, sem paginação) — exibido junto aos KPIs."""
    delta = (estudo.edital or {}).get("delta_escopo", {})
    return {
        "tem_baseline": delta.get("tem_baseline", False),
        "adicionados": delta.get("adicionados", []),
        "removidos": delta.get("removidos", []),
        "modificados": delta.get("modificados", []),
        "narrativa_delta": delta.get("narrativa_delta"),
    }
