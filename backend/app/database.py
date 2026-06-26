"""
database.py — Persistência SQLite para as sessões de estudo.

Cada sessão é serializada como JSON e salva numa tabela SQLite simples.
Isso garante que um restart do servidor não perde o trabalho em andamento.

A interface é intencionalmente mínima: salvar / carregar / excluir / listar.
O sessions.py usa estas funções como camada de recuperação — a memória
continua sendo a fonte primária durante uma sessão ativa (leituras rápidas),
e o banco entra em cena a cada mutação (auto-save via middleware em main.py)
e na recuperação após restart (fallback em obter_estudo).

Estrutura do banco:
    tabela estudos
        session_id    TEXT  PK
        criado_em     TEXT  ISO-8601 UTC
        atualizado_em TEXT  ISO-8601 UTC
        dados         TEXT  JSON do Estudo completo (incluindo documentos/textos)
"""

import json
import sqlite3
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock

# banco em backend/data/estudos.db — fora do pacote app para não conflitar com
# o código-fonte; a pasta é criada automaticamente na primeira escrita.
_DB_PATH = Path(__file__).parent.parent / "data" / "estudos.db"
_DB_LOCK = Lock()


def _conectar() -> sqlite3.Connection:
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(_DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    # WAL: leituras simultâneas não bloqueiam escritas
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def inicializar_banco() -> None:
    """Cria a tabela se não existir. Chamado uma vez na startup do servidor."""
    with _DB_LOCK, _conectar() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS estudos (
                session_id    TEXT PRIMARY KEY,
                criado_em     TEXT NOT NULL,
                atualizado_em TEXT NOT NULL,
                dados         TEXT NOT NULL
            )
        """)
        conn.commit()
    print(f"[DB] Banco inicializado em {_DB_PATH}")


def salvar_estudo(session_id: str, estudo) -> None:
    """Persiste (insert-or-replace) o Estudo serializado como JSON."""
    dados_json = json.dumps(asdict(estudo), ensure_ascii=False, default=str)
    agora = datetime.now(timezone.utc).isoformat()
    with _DB_LOCK, _conectar() as conn:
        conn.execute("""
            INSERT INTO estudos (session_id, criado_em, atualizado_em, dados)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(session_id) DO UPDATE SET
                atualizado_em = excluded.atualizado_em,
                dados         = excluded.dados
        """, (session_id, agora, agora, dados_json))
        conn.commit()


def carregar_estudo(session_id: str) -> dict | None:
    """Carrega o dict de um estudo do banco, ou None se não existir."""
    with _DB_LOCK, _conectar() as conn:
        row = conn.execute(
            "SELECT dados FROM estudos WHERE session_id = ?", (session_id,)
        ).fetchone()
    return json.loads(row["dados"]) if row else None


def excluir_estudo(session_id: str) -> None:
    """Remove um estudo do banco ao encerrar a sessão."""
    with _DB_LOCK, _conectar() as conn:
        conn.execute("DELETE FROM estudos WHERE session_id = ?", (session_id,))
        conn.commit()


def listar_sessoes_salvas() -> list[dict]:
    """Lista metadados de todas as sessões salvas — útil para diagnóstico."""
    with _DB_LOCK, _conectar() as conn:
        rows = conn.execute(
            "SELECT session_id, criado_em, atualizado_em FROM estudos ORDER BY atualizado_em DESC"
        ).fetchall()
    return [dict(r) for r in rows]
