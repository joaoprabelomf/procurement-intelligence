"""
sessions.py — Gerenciador de sessões em memória (substitui st.session_state).

No Streamlit, o objeto Estudo vivia automaticamente no session_state e
sobrevivia enquanto o usuário navegava pelas telas. Numa API, não existe
isso por padrão: cada chamada HTTP é independente. Este módulo recria esse
comportamento de forma simples:

- Cada "sessão de estudo" tem um session_id (string, gerado ao criar).
- Guardamos o objeto Estudo de cada sessão num dicionário em memória do
  processo do servidor.
- Funciona perfeitamente para uso individual ou de um time pequeno, local
  ou numa rede interna, com o servidor sempre rodando.

Limitações conhecidas (aceitas nesta fase, por decisão do projeto):
- Se o servidor reiniciar, todas as sessões em andamento se perdem (o
  Estudo não é salvo em disco nem em banco). Pra uso local isso raramente
  é um problema, mas é importante registrar.
- Não há limite de sessões nem expiração automática ainda — se isso virar
  um problema real de memória, adicionamos um limite de tempo de vida
  (TTL) por sessão.

Quando o projeto crescer para múltiplos usuários simultâneos por longos
períodos (produção real, multiusuário), este módulo é o primeiro candidato
a ser substituído por persistência em banco de dados — a interface pública
(criar_sessao, obter_estudo, etc.) pode continuar igual.
"""

import uuid
from threading import Lock

from .estudo import Estudo

# Dicionário em memória: session_id -> Estudo
_SESSOES: dict[str, Estudo] = {}
_LOCK = Lock()


class SessaoNaoEncontrada(KeyError):
    """Levantada quando um session_id não existe (expirou, nunca existiu, ou servidor reiniciou)."""
    pass


def criar_sessao() -> str:
    """Cria uma nova sessão de estudo vazia e devolve o session_id."""
    session_id = str(uuid.uuid4())
    with _LOCK:
        _SESSOES[session_id] = Estudo()
    return session_id


def obter_estudo(session_id: str) -> Estudo:
    """Devolve o objeto Estudo de uma sessão existente."""
    with _LOCK:
        estudo = _SESSOES.get(session_id)
    if estudo is None:
        raise SessaoNaoEncontrada(
            f"Sessão '{session_id}' não encontrada. Pode ter expirado ou o "
            f"servidor pode ter sido reiniciado — comece um novo estudo."
        )
    return estudo


def sessao_existe(session_id: str) -> bool:
    with _LOCK:
        return session_id in _SESSOES


def encerrar_sessao(session_id: str) -> None:
    """Remove uma sessão da memória (ex.: usuário terminou o estudo)."""
    with _LOCK:
        _SESSOES.pop(session_id, None)


def total_sessoes_ativas() -> int:
    """Útil para um endpoint de saúde/diagnóstico do servidor."""
    with _LOCK:
        return len(_SESSOES)
