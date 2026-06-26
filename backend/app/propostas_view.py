"""
propostas_view.py — Consulta paginada/filtrada/ordenada de propostas técnicas.

Não refaz nenhuma análise — lê o que rodar_etapa4 (etapa4.py) já calculou e
gravou em estudo.propostas_tecnicas, e expõe isso de um jeito consultável:
paginação, busca por texto, filtro por status, ordenação por coluna.

Desenhado para que a fonte de dados (hoje: lista em memória no Estudo) possa
ser trocada por um banco de dados depois sem o contrato da API mudar — o
endpoint em main.py não sabe (nem precisa saber) que os dados vêm de uma
lista Python e não de uma consulta SQL.
"""

from .etapa4 import _contar_mandatorios


def _agregados_por_fornecedor(analise: dict) -> dict:
    """
    Calcula os agregados de uma proposta para exibição em tabela/cards —
    reaproveita _contar_mandatorios (já existente em etapa4.py) e adiciona
    contagens sobre TODOS os itens de conformidade (não só mandatórios),
    para a tabela poder mostrar uma visão completa, não só dos mandatórios.
    """
    conf = analise.get("conformidade", [])
    contagem_mandatorios = _contar_mandatorios(conf)

    return {
        "fornecedor": analise.get("fornecedor", "?"),
        "veredito_executivo": analise.get("veredito_executivo") or analise.get("resumo_tecnico", "—"),
        "nao_cumpre_mandatorio": bool(analise.get("nao_cumpre_mandatorio")),
        "n_mandatorios_total": contagem_mandatorios["total"],
        "n_mandatorios_cumpre": contagem_mandatorios["cumpre"],
        "n_mandatorios_parcial": contagem_mandatorios["parcial"],
        "n_mandatorios_nao_cumpre": contagem_mandatorios["nao_cumpre"],
        "n_mandatorios_nao_menciona": contagem_mandatorios["nao_menciona"],
        "n_gaps_mandatorios": len(analise.get("mandatorios_nao_cumpridos", [])),
        "n_silencios_mandatorios": len(analise.get("mandatorios_nao_mencionados", [])),
        "n_inclusoes_escopo": len(analise.get("inclusoes_escopo", [])),
        "n_exclusoes_escopo": len(analise.get("exclusoes_escopo", [])),
        "percentual_aderencia": (
            round(100 * contagem_mandatorios["cumpre"] / contagem_mandatorios["total"], 1)
            if contagem_mandatorios["total"] else None
        ),
    }


# Campos pelos quais a tabela pode ser ordenada — mapeia o nome usado pelo
# frontend para a chave correspondente no dict de agregados.
_CAMPOS_ORDENAVEIS = {
    "fornecedor": "fornecedor",
    "aderencia": "percentual_aderencia",
    "gaps": "n_gaps_mandatorios",
    "silencios": "n_silencios_mandatorios",
    "inclusoes": "n_inclusoes_escopo",
}


def _bate_busca(agregado: dict, analise: dict, busca: str) -> bool:
    """Busca textual simples: nome do fornecedor ou veredito executivo."""
    termo = busca.lower().strip()
    if not termo:
        return True
    campos_buscaveis = [
        agregado["fornecedor"],
        agregado["veredito_executivo"],
        " ".join(analise.get("inclusoes_escopo", [])),
        " ".join(analise.get("exclusoes_escopo", [])),
    ]
    return any(termo in (campo or "").lower() for campo in campos_buscaveis)


def _bate_filtro_status(agregado: dict, status: str | None) -> bool:
    if not status or status == "todos":
        return True
    if status == "gaps_mandatorios":
        return agregado["n_gaps_mandatorios"] > 0
    if status == "silencio_mandatorio":
        return agregado["n_silencios_mandatorios"] > 0
    if status == "sem_gaps":
        return agregado["n_gaps_mandatorios"] == 0 and agregado["n_silencios_mandatorios"] == 0
    return True


def consultar_propostas(
    estudo,
    pagina: int = 1,
    tamanho_pagina: int = 20,
    busca: str = "",
    status: str | None = None,
    ordenar_por: str = "fornecedor",
    direcao: str = "asc",
) -> dict:
    """
    Devolve uma página de propostas técnicas já analisadas, com agregados
    prontos para tabela, filtrada por busca/status e ordenada pela coluna
    pedida.

    Retorna:
        {
          "itens": [ {agregado de cada fornecedor, ordenado/filtrado/paginado} ],
          "total_sem_filtro": int,
          "total_filtrado": int,
          "pagina": int,
          "tamanho_pagina": int,
          "total_paginas": int,
        }
    """
    analises = estudo.propostas_tecnicas or []
    agregados_e_analise = [(_agregados_por_fornecedor(a), a) for a in analises]

    total_sem_filtro = len(agregados_e_analise)

    filtrados = [
        (agregado, analise)
        for agregado, analise in agregados_e_analise
        if _bate_busca(agregado, analise, busca) and _bate_filtro_status(agregado, status)
    ]
    total_filtrado = len(filtrados)

    chave_ordenacao = _CAMPOS_ORDENAVEIS.get(ordenar_por, "fornecedor")

    def _chave(item):
        valor = item[0].get(chave_ordenacao)
        # None deve sempre ir para o final, independente da direção.
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
    KPIs agregados sobre TODAS as propostas (não só a página atual) — para
    os cards de resumo no topo da tela, que precisam refletir o conjunto
    inteiro mesmo quando a tabela está filtrada/paginada.
    """
    analises = estudo.propostas_tecnicas or []
    if not analises:
        return {
            "n_propostas": 0, "n_com_gaps_mandatorios": 0, "n_com_silencio_mandatorio": 0,
            "n_sem_gaps": 0, "aderencia_media": None,
        }

    agregados = [_agregados_por_fornecedor(a) for a in analises]
    com_gaps = sum(1 for a in agregados if a["n_gaps_mandatorios"] > 0)
    com_silencio = sum(1 for a in agregados if a["n_silencios_mandatorios"] > 0)
    sem_gaps = sum(1 for a in agregados if a["n_gaps_mandatorios"] == 0 and a["n_silencios_mandatorios"] == 0)

    aderencias = [a["percentual_aderencia"] for a in agregados if a["percentual_aderencia"] is not None]
    aderencia_media = round(sum(aderencias) / len(aderencias), 1) if aderencias else None

    return {
        "n_propostas": len(analises),
        "n_com_gaps_mandatorios": com_gaps,
        "n_com_silencio_mandatorio": com_silencio,
        "n_sem_gaps": sem_gaps,
        "aderencia_media": aderencia_media,
    }


def detalhe_de_um_fornecedor(estudo, fornecedor: str) -> dict | None:
    """
    Devolve a análise COMPLETA (requisito a requisito) de um único
    fornecedor — usado quando o usuário expande uma linha da tabela, em vez
    de mandar o detalhe completo de todos de uma vez (que não escala para
    centenas de propostas).
    """
    for analise in (estudo.propostas_tecnicas or []):
        if analise.get("fornecedor") == fornecedor:
            return analise
    return None
