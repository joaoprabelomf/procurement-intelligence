"""
triagem_view.py — Leitura estruturada da classificação (Etapa 1) para a
UI rica.

Sem paginação: proponentes são poucos por natureza (raramente passam de
10-20 fornecedores num mesmo estudo), e o "as-is" (edital/baseline) é
sempre 0 ou 1 documento de cada tipo. Não há volume que justifique tabela
virtualizada aqui — a visão certa é cards de KPI + card por proponente +
lista de pontos de atenção, igual decidido com o usuário.

Não recalcula nada — só organiza o que rodar_etapa1/aplicar_correcao_etapa1/
processar_mensagem_etapa1 (etapa1.py) já gravaram em estudo.documentos,
estudo.proponentes, estudo.cliente, estudo.categoria, estudo.modelo_precificacao.
"""


def _documento_por_tipo(documentos: list, tipo: str) -> dict | None:
    """Primeiro documento com o tipo pedido (edital ou baseline — só existe 0 ou 1 de cada)."""
    for doc in documentos:
        if doc.get("tipo") == tipo:
            return doc
    return None


def resumo_executivo_triagem(estudo) -> dict:
    """
    KPIs para os cards do topo: cliente, categoria + modelo de
    precificação, nº de proponentes, nº de pontos de atenção.
    """
    return {
        "cliente": estudo.cliente,
        "categoria": estudo.categoria,
        "modelo_precificacao": estudo.modelo_precificacao,
        "n_proponentes": len(estudo.proponentes or []),
        "n_pontos_atencao": len(estudo.faltantes or []),
    }


def cenario_atual_triagem(estudo) -> dict:
    """
    Documentos do "Cenário Atual (As Is)" — edital e baseline, cada um
    podendo estar ausente (o frontend exibe um estado de alerta nesse caso,
    sem travar o fluxo, igual o comportamento original da Etapa 1).
    """
    documentos = estudo.documentos or []
    edital = _documento_por_tipo(documentos, "edital")
    baseline = _documento_por_tipo(documentos, "baseline")

    return {
        "edital": {"presente": edital is not None, "nome": edital.get("nome") if edital else None, "resumo": edital.get("resumo") if edital else None},
        "baseline": {"presente": baseline is not None, "nome": baseline.get("nome") if baseline else None, "resumo": baseline.get("resumo") if baseline else None},
    }


def proponentes_triagem(estudo) -> list[dict]:
    """
    Lista de proponentes com seus arquivos — um item por fornecedor, cada
    um sinalizando se falta algum arquivo (técnica/comercial/combinada),
    para o frontend desenhar o card com alerta visual quando incompleto.
    """
    proponentes = estudo.proponentes or []
    resultado = []
    for p in proponentes:
        arquivos = p.get("arquivos", {})
        tem_tecnica = bool(arquivos.get("tecnica"))
        tem_comercial = bool(arquivos.get("comercial"))
        tem_combinada = bool(arquivos.get("combinada"))
        # Completo = tem combinada (que cobre técnica+comercial em um só
        # arquivo) OU tem técnica E comercial separados.
        completo = tem_combinada or (tem_tecnica and tem_comercial)

        resultado.append({
            "id": p.get("id", "?"),
            "fornecedor": p.get("fornecedor", "?"),
            "arquivo_tecnica": arquivos.get("tecnica"),
            "arquivo_comercial": arquivos.get("comercial"),
            "arquivo_combinada": arquivos.get("combinada"),
            "completo": completo,
        })
    return resultado


def pontos_atencao_triagem(estudo) -> list[str]:
    """Lista de faltantes/alertas registrados pela Etapa 1 (e por correções via chat)."""
    return estudo.faltantes or []
