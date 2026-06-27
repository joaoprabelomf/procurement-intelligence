"""
sessions.py — Gerenciador de sessões (memória + SQLite).

Cada "sessão de estudo" tem um session_id (UUID). O objeto Estudo fica em
memória durante a sessão ativa (leitura rápida, sem I/O a cada request) e é
persistido automaticamente no SQLite a cada mutação (via middleware em main.py).

Recuperação após restart: se o session_id não está em memória mas existe no
banco, o Estudo é desserializado do JSON e recarregado em memória — o usuário
continua exatamente de onde parou, mesmo depois de reiniciar o servidor.

Interface pública inalterada:
    criar_sessao()          -> str
    obter_estudo(id)        -> Estudo   (levanta SessaoNaoEncontrada se ausente)
    sessao_existe(id)       -> bool
    encerrar_sessao(id)     -> None
    total_sessoes_ativas()  -> int
"""

import uuid
from threading import Lock

from .estudo import Estudo
from . import database

# Dicionário em memória: session_id -> Estudo (fonte primária durante sessão ativa)
_SESSOES: dict[str, Estudo] = {}
_LOCK = Lock()


class SessaoNaoEncontrada(KeyError):
    """Levantada quando um session_id não existe (expirou, nunca existiu, ou sessão encerrada)."""
    pass


def criar_sessao(time_id: int) -> str:
    """
    Cria uma nova sessão de estudo vazia, associa ao time e salva no banco.

    time_id é registrado no INSERT inicial do banco e não é sobrescrito pelo
    auto-save do middleware — a posse do estudo fica permanente.
    """
    session_id = str(uuid.uuid4())
    estudo = Estudo()
    with _LOCK:
        _SESSOES[session_id] = estudo
    database.salvar_estudo(session_id, estudo, time_id=time_id)
    return session_id


def obter_estudo(session_id: str) -> Estudo:
    """
    Devolve o objeto Estudo de uma sessão.

    Ordem de busca:
    1. Memória (rápido — caso normal durante uma sessão ativa).
    2. Banco SQLite (recuperação após restart do servidor).

    Se não encontrar em nenhum dos dois, levanta SessaoNaoEncontrada.
    """
    with _LOCK:
        estudo = _SESSOES.get(session_id)
    if estudo is not None:
        return estudo

    # Não está em memória — tenta recuperar do banco (restart do servidor)
    dados = database.carregar_estudo(session_id)
    if dados is None:
        raise SessaoNaoEncontrada(
            f"Sessão '{session_id}' não encontrada. Pode ter sido encerrada ou "
            f"nunca existiu — comece um novo estudo."
        )

    # Desserializa apenas os campos conhecidos (tolera campos adicionados no futuro)
    campos_validos = {k: v for k, v in dados.items() if k in Estudo.__dataclass_fields__}
    estudo = Estudo(**campos_validos)
    with _LOCK:
        _SESSOES[session_id] = estudo
    print(f"[DB] Sessão {session_id[:8]}… recuperada do banco após restart")
    return estudo


def sessao_existe(session_id: str) -> bool:
    """Verifica se a sessão existe em memória (não consulta o banco — uso rápido)."""
    with _LOCK:
        return session_id in _SESSOES


def encerrar_sessao(session_id: str) -> None:
    """Remove a sessão da memória e do banco."""
    with _LOCK:
        _SESSOES.pop(session_id, None)
    database.excluir_estudo(session_id)


def total_sessoes_ativas() -> int:
    """Número de sessões atualmente em memória — útil para health check."""
    with _LOCK:
        return len(_SESSOES)
