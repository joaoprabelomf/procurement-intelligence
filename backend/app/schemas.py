"""
schemas.py — Formatos de request/response da API (Pydantic).

Define o "contrato" entre o frontend e o backend: o que cada endpoint
espera receber no corpo da requisição, e que tipos de dado o frontend
pode confiar que vai receber de volta. Não tem lógica de negócio aqui —
isso continua nos módulos etapaN.py, intactos.
"""

from typing import Any, Optional
from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Sessão
# ---------------------------------------------------------------------------

class SessaoCriada(BaseModel):
    session_id: str


# ---------------------------------------------------------------------------
# Etapa 1 — classificação
# ---------------------------------------------------------------------------

class Etapa1CorrecaoRequest(BaseModel):
    correcao: str


class Etapa1ChatRequest(BaseModel):
    mensagem: str


# ---------------------------------------------------------------------------
# Etapa 2 — checkpoint condicional de anualização
# ---------------------------------------------------------------------------

class Etapa2AnualizacaoRequest(BaseModel):
    periodo: str


# ---------------------------------------------------------------------------
# Etapa 6 — checkpoint de taxa de desconto e moeda
# ---------------------------------------------------------------------------

class Etapa6CheckpointRequest(BaseModel):
    taxa_desconto: float
    regra_moeda: str


# ---------------------------------------------------------------------------
# Etapa 8 — categoria manual e/ou sobrescrita de impacto/risco
# ---------------------------------------------------------------------------

class Etapa8Request(BaseModel):
    categoria_manual: Optional[str] = None
    impacto_manual: Optional[str] = None  # "alto" | "baixo"
    risco_manual: Optional[str] = None    # "alto" | "baixo"


class Etapa8RiscoConfirmacaoRequest(BaseModel):
    risco: str  # "alto" | "baixo"


class CorrecaoGenericaRequest(BaseModel):
    correcao: str


# ---------------------------------------------------------------------------
# Auth — login e token (Parte 2)
# ---------------------------------------------------------------------------

class LoginRequest(BaseModel):
    email: str
    senha: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ---------------------------------------------------------------------------
# Resposta genérica de erro (corpo do HTTPException)
# ---------------------------------------------------------------------------

class ErroResponse(BaseModel):
    detail: str
    resposta_bruta: Optional[str] = None


# ---------------------------------------------------------------------------
# Estado completo do estudo (usado pela tela para "retomar" onde parou)
# ---------------------------------------------------------------------------

class EstudoCompleto(BaseModel):
    cliente: Optional[str] = None
    setor: Optional[str] = None
    documentos: list = []
    proponentes: list = []
    categoria: Optional[str] = None
    micro_categoria: Optional[str] = None
    modelo_precificacao: Optional[str] = None
    baseline: Optional[dict] = None
    edital: Optional[dict] = None
    propostas_tecnicas: list = []
    propostas_comerciais: list = []
    comparacao_tecnica: Optional[dict] = None
    equalizacao_comercial: Optional[dict] = None
    recomendacoes: Optional[dict] = None
    estrategia_categoria: Optional[dict] = None
    taxa_desconto: Optional[float] = None
    regra_moeda: Optional[str] = None
    premissas: list = []
    matches: list = []
    faltantes: list = []
    fraquezas: list = []
    etapa_atual: int = 1
