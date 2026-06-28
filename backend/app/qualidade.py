"""
qualidade.py — Pontuação de confiança estrutural das etapas de análise.

Princípios:
- Confiança NUNCA é avaliada pela IA — deriva apenas de sinais observáveis
  no estado do Estudo (presença de dados, contagem de faltantes/premissas,
  origem dos dados, etc.).
- A regra de ouro: o nível NUNCA pode ser mais alto que o pior sinal crítico.
  Sem baseline → sempre Baixa; preço null → nunca Alta.
- Quatro níveis:
    alta        — análise sólida, dados bem fundamentados
    media       — análise usável, mas com ressalvas identificadas
    baixa       — análise frágil, com dados críticos ausentes
    incompleta  — etapa não produziu output suficiente para avaliar
  "Incompleta" ≠ "Baixa": incompleta significa que a etapa não gerou dados
  (ex.: E2 sem documento de baseline); baixa significa que rodou com falhas.
- Nunca levanta exceção — retorna nível "incompleta" em caso de falha.
"""

# Ordem crescente de qualidade — 0 = pior, 3 = melhor
_ORDEM = {"incompleta": 0, "baixa": 1, "media": 2, "alta": 3}


def _pior(a: str, b: str) -> str:
    """Retorna o nível PIOR entre dois — garante que degradações nunca retrocedem."""
    return a if _ORDEM.get(a, 0) <= _ORDEM.get(b, 0) else b


def _resultado(nivel: str, sinais: list[str]) -> dict:
    return {"nivel": nivel, "sinais": sinais}


def _incompleta(sinais: list[str]) -> dict:
    return {"nivel": "incompleta", "sinais": sinais}


def calcular_confianca_etapa(estudo, numero_etapa: int) -> dict:
    """
    Calcula a pontuação de confiança estrutural para a etapa indicada.

    Parâmetros
    ----------
    estudo        : objeto Estudo — estado atual, após a etapa ter rodado.
    numero_etapa  : 2, 7 ou 8 (únicas etapas com badge de confiança).

    Retorna
    -------
    dict com:
        nivel  : "alta" | "media" | "baixa" | "incompleta"
        sinais : lista de frases curtas descrevendo o que levou ao nível
                 (positivos E negativos — para o tooltip ser auditável).

    Nunca levanta exceção.
    """
    try:
        if numero_etapa == 2:
            return _confianca_etapa2(estudo)
        if numero_etapa == 7:
            return _confianca_etapa7(estudo)
        if numero_etapa == 8:
            return _confianca_etapa8(estudo)
        return _incompleta(["Etapa não avaliada"])
    except Exception:  # noqa: BLE001
        return _incompleta([])


# ---------------------------------------------------------------------------
# Etapa 2 — Cenário Atual (Baseline)
# ---------------------------------------------------------------------------

def _confianca_etapa2(estudo) -> dict:
    # Sem baseline → Incompleta (etapa não produziu análise de cenário atual)
    if not estudo.baseline:
        return _incompleta(["Sem baseline — Etapa 2 não analisou cenário atual"])

    sinais: list[str] = ["Baseline presente"]
    nivel = "alta"

    # Preço anual calculado?
    com = estudo.baseline.get("comercial") or {}
    preco = com.get("preco_anual_total")
    if isinstance(preco, (int, float)) and preco > 0:
        sinais.append(f"Preço anual calculado: R$ {preco:,.0f}")
    else:
        sinais.append("Preço não calculado — dados insuficientes para anualização")
        nivel = _pior(nivel, "baixa")

    # Anualização ainda pendente de confirmação do consultor?
    if com.get("precisa_confirmar_anualização"):
        sinais.append("Anualização aguardando confirmação do consultor")
        nivel = _pior(nivel, "media")

    # Micro-categoria identificada?
    if estudo.micro_categoria:
        sinais.append(f"Micro-categoria: {estudo.micro_categoria}")
    else:
        sinais.append("Micro-categoria não identificada")
        nivel = _pior(nivel, "media")

    # Faltantes acumulados até E2
    n_faltantes = len(estudo.faltantes)
    if n_faltantes == 0:
        sinais.append("Nenhum dado faltante registrado")
    elif n_faltantes <= 2:
        sinais.append(f"{n_faltantes} dado(s) faltante(s) registrado(s)")
        nivel = _pior(nivel, "media")
    else:
        sinais.append(f"{n_faltantes} dados faltantes registrados")
        nivel = _pior(nivel, "baixa")

    # Premissas assumidas (informativo — não degrada, mas é visível no tooltip)
    n_premissas = len(estudo.premissas)
    if n_premissas > 0:
        sinais.append(f"{n_premissas} premissa(s) assumida(s)")

    return _resultado(nivel, sinais)


# ---------------------------------------------------------------------------
# Etapa 7 — Recomendações Finais
# ---------------------------------------------------------------------------

def _confianca_etapa7(estudo) -> dict:
    if not estudo.recomendacoes:
        return _incompleta(["Recomendações ainda não geradas"])

    sinais: list[str] = ["Recomendações geradas"]
    nivel = "alta"

    # Base quantitativa disponível?
    if estudo.equalizacao_comercial:
        sinais.append("Equalização comercial disponível (base quantitativa)")
    else:
        sinais.append("Sem equalização comercial — análise qualitativa apenas")
        nivel = _pior(nivel, "media")

    # Cenários de decisão gerados?
    n_cenarios = len(estudo.recomendacoes.get("cenarios_decisao") or [])
    if n_cenarios >= 2:
        sinais.append(f"{n_cenarios} cenários de decisão identificados")
    elif n_cenarios == 1:
        sinais.append("1 cenário de decisão (somente 1 fornecedor avaliado)")
        nivel = _pior(nivel, "media")
    else:
        sinais.append("Nenhum cenário de decisão identificado")
        nivel = _pior(nivel, "baixa")

    # Faltantes globais do estudo
    n_faltantes = len(estudo.faltantes)
    if n_faltantes == 0:
        sinais.append("Nenhum dado faltante registrado")
    elif n_faltantes <= 3:
        sinais.append(f"{n_faltantes} dado(s) faltante(s) no estudo")
        nivel = _pior(nivel, "media")
    else:
        sinais.append(f"{n_faltantes} dados faltantes no estudo")
        nivel = _pior(nivel, "baixa")

    # Premissas (informativo)
    n_premissas = len(estudo.premissas)
    if n_premissas > 0:
        sinais.append(f"{n_premissas} premissa(s) assumida(s) no estudo")

    return _resultado(nivel, sinais)


# ---------------------------------------------------------------------------
# Etapa 8 — Estratégia da Categoria (Kraljic)
# ---------------------------------------------------------------------------

def _confianca_etapa8(estudo) -> dict:
    if not estudo.estrategia_categoria:
        return _incompleta(["Estratégia da categoria ainda não gerada"])

    analise = estudo.estrategia_categoria
    quadrante = analise.get("quadrante", "—")
    sinais: list[str] = [f"Quadrante Kraljic: {quadrante}"]
    nivel = "alta"

    # Origem do risco de suprimento
    origem_risco = analise.get("_origem_risco", "")
    if "web search" in origem_risco:
        sinais.append("Risco de suprimento pesquisado via web search")
    elif "consultor" in origem_risco:
        sinais.append("Risco de suprimento confirmado pelo consultor")
    elif "sem busca" in origem_risco or "estimado" in origem_risco:
        sinais.append("Risco estimado pela IA sem busca web")
        nivel = _pior(nivel, "media")
    else:
        sinais.append("Origem do risco de suprimento não rastreada")
        nivel = _pior(nivel, "media")

    # Confiança da pesquisa de risco (campo gerado pela Etapa 8)
    analise_risco = analise.get("_analise_risco") or {}
    confianca_risco = analise_risco.get("confianca")
    if confianca_risco == "baixa":
        sinais.append("Pesquisa de risco com confiança baixa")
        nivel = _pior(nivel, "media")
    elif confianca_risco in ("alta", "média", "media"):
        sinais.append(f"Confiança da pesquisa de risco: {confianca_risco}")

    # Origem do impacto financeiro (informativo)
    origem_impacto = analise.get("_origem_impacto", "")
    if "inferido" in origem_impacto:
        sinais.append(f"Impacto: {origem_impacto}")
    elif "consultor" in origem_impacto:
        sinais.append("Impacto financeiro definido pelo consultor")

    # Faltantes globais do estudo
    n_faltantes = len(estudo.faltantes)
    if n_faltantes == 0:
        sinais.append("Nenhum dado faltante registrado")
    elif n_faltantes <= 3:
        sinais.append(f"{n_faltantes} dado(s) faltante(s) no estudo")
        nivel = _pior(nivel, "media")
    else:
        sinais.append(f"{n_faltantes} dados faltantes no estudo")
        nivel = _pior(nivel, "baixa")

    # Premissas (informativo)
    n_premissas = len(estudo.premissas)
    if n_premissas > 0:
        sinais.append(f"{n_premissas} premissa(s) assumida(s) no estudo")

    return _resultado(nivel, sinais)
