"""
database.py — Persistência SQLite para estudos, usuários e times.

A interface de estudos (salvar/carregar/excluir/listar) é intencionalmente
mínima. O sessions.py usa estas funções como camada de recuperação — a memória
continua sendo a fonte primária durante uma sessão ativa (leituras rápidas),
e o banco entra em cena a cada mutação (auto-save via middleware em main.py)
e na recuperação após restart (fallback em obter_estudo).

Estrutura do banco (Degrau 2 — Parte 1: additive, sem quebrar dados existentes):

    tabela times
        id         INTEGER PK AUTOINCREMENT
        nome       TEXT UNIQUE
        criado_em  TEXT ISO-8601 UTC

    tabela usuarios
        id          INTEGER PK AUTOINCREMENT
        email       TEXT UNIQUE
        senha_hash  TEXT  (bcrypt — nunca texto puro)
        time_id     INTEGER FK → times.id
        papel       TEXT  'admin' | 'membro'
        ativo       INTEGER  1=ativo, 0=desativado
        criado_em   TEXT ISO-8601 UTC

    tabela estudos
        session_id    TEXT PK
        criado_em     TEXT ISO-8601 UTC
        atualizado_em TEXT ISO-8601 UTC
        dados         TEXT JSON do Estudo completo
        time_id       INTEGER FK → times.id
                      (NULL em estudos legados → migrados automaticamente na startup)
"""

import json
import logging
import os
import sqlite3
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock

import bcrypt

logger = logging.getLogger(__name__)

# banco em backend/data/estudos.db — fora do pacote app para não conflitar com
# o código-fonte; a pasta é criada automaticamente na primeira escrita.
_DB_PATH = Path(__file__).parent.parent / "data" / "estudos.db"
_DB_LOCK = Lock()


# ---------------------------------------------------------------------------
# Utilitários de senha — usados aqui na inicialização e nas Partes 2+ da auth
# ---------------------------------------------------------------------------

def hashear_senha(senha: str) -> str:
    """Devolve o hash bcrypt de uma senha em texto puro (salt gerado automaticamente)."""
    return bcrypt.hashpw(senha.encode(), bcrypt.gensalt()).decode()


def verificar_senha(senha: str, hash_armazenado: str) -> bool:
    """Verifica se uma senha em texto puro corresponde ao hash guardado."""
    return bcrypt.checkpw(senha.encode(), hash_armazenado.encode())


# ---------------------------------------------------------------------------
# Conexão
# ---------------------------------------------------------------------------

def _conectar() -> sqlite3.Connection:
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(_DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    # WAL: leituras simultâneas não bloqueiam escritas
    conn.execute("PRAGMA journal_mode=WAL")
    # Garantir integridade referencial (desligado por padrão no SQLite)
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


# ---------------------------------------------------------------------------
# Inicialização — cria tabelas, migra dados legados, cria time/admin padrão
# ---------------------------------------------------------------------------

def inicializar_banco() -> None:
    """
    Cria todas as tabelas necessárias e executa migrações seguras (additive).
    Chamado uma vez na startup do servidor (ver main.py).

    Ordem das operações:
    1. Criar tabela `times` (se não existir).
    2. Criar tabela `usuarios` (se não existir).
    3. Criar tabela `estudos` (se não existir) — incluindo a coluna time_id.
    4. Adicionar coluna time_id em `estudos` caso seja um banco legado (sem ela).
    5. Criar o time padrão "A&M" se ainda não existir.
    6. Criar o usuário admin inicial se ADMIN_EMAIL/ADMIN_SENHA_INICIAL estão
       definidos e o usuário ainda não existe no banco.
    7. Migrar estudos legados (time_id NULL) para o time padrão.
    """
    with _DB_LOCK, _conectar() as conn:

        # 1. Times
        conn.execute("""
            CREATE TABLE IF NOT EXISTS times (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                nome      TEXT    NOT NULL UNIQUE,
                criado_em TEXT    NOT NULL
            )
        """)

        # 2. Usuários
        conn.execute("""
            CREATE TABLE IF NOT EXISTS usuarios (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                email      TEXT    NOT NULL UNIQUE,
                senha_hash TEXT    NOT NULL,
                time_id    INTEGER NOT NULL REFERENCES times(id),
                papel      TEXT    NOT NULL DEFAULT 'membro',
                ativo      INTEGER NOT NULL DEFAULT 1,
                criado_em  TEXT    NOT NULL
            )
        """)

        # 3. Estudos — coluna time_id incluída para bancos novos
        conn.execute("""
            CREATE TABLE IF NOT EXISTS estudos (
                session_id    TEXT PRIMARY KEY,
                criado_em     TEXT NOT NULL,
                atualizado_em TEXT NOT NULL,
                dados         TEXT NOT NULL,
                time_id       INTEGER REFERENCES times(id)
            )
        """)

        # 4. Banco legado (sem coluna time_id) — adiciona sem perder dados
        colunas_estudos = {
            row["name"]
            for row in conn.execute("PRAGMA table_info(estudos)")
        }
        if "time_id" not in colunas_estudos:
            conn.execute(
                "ALTER TABLE estudos ADD COLUMN time_id INTEGER REFERENCES times(id)"
            )
            logger.info("[DB] Coluna time_id adicionada à tabela estudos (migração legada)")

        conn.commit()

        # 5. Time padrão "A&M"
        agora = datetime.now(timezone.utc).isoformat()
        conn.execute(
            "INSERT OR IGNORE INTO times (nome, criado_em) VALUES (?, ?)",
            ("A&M", agora),
        )
        conn.commit()

        time_am_id = conn.execute(
            "SELECT id FROM times WHERE nome = ?", ("A&M",)
        ).fetchone()["id"]

        # 6. Usuário admin inicial — credenciais via variáveis de ambiente
        admin_email = os.environ.get("ADMIN_EMAIL", "").strip()
        admin_senha = os.environ.get("ADMIN_SENHA_INICIAL", "").strip()

        if not admin_email or not admin_senha:
            logger.warning(
                "[DB] ADMIN_EMAIL ou ADMIN_SENHA_INICIAL não definidas — "
                "usuário admin NÃO foi criado. Defina as variáveis de ambiente "
                "e reinicie o servidor para criá-lo."
            )
        else:
            ja_existe = conn.execute(
                "SELECT id FROM usuarios WHERE email = ?", (admin_email,)
            ).fetchone()
            if not ja_existe:
                conn.execute(
                    """
                    INSERT INTO usuarios
                        (email, senha_hash, time_id, papel, ativo, criado_em)
                    VALUES (?, ?, ?, 'admin', 1, ?)
                    """,
                    (admin_email, hashear_senha(admin_senha), time_am_id, agora),
                )
                conn.commit()
                logger.info("[DB] Usuário admin criado: %s (time A&M)", admin_email)
            else:
                logger.info("[DB] Usuário admin já existe: %s", admin_email)

        # 7. Migrar estudos legados (time_id NULL) para o time padrão
        migrados = conn.execute(
            "UPDATE estudos SET time_id = ? WHERE time_id IS NULL",
            (time_am_id,),
        ).rowcount
        conn.commit()
        if migrados:
            logger.info(
                "[DB] %d estudo(s) legado(s) migrado(s) para o time A&M", migrados
            )

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


def listar_estudos_resumo() -> list[dict]:
    """
    Lista estudos com os campos úteis para a tela de histórico.

    Extrai cliente, categoria, micro_categoria e etapa_atual do JSON de cada
    estudo. Trata estudos incompletos ou antigos com segurança: campos ausentes
    recebem valores padrão legíveis em vez de erros.
    """
    with _DB_LOCK, _conectar() as conn:
        rows = conn.execute(
            "SELECT session_id, criado_em, atualizado_em, dados FROM estudos ORDER BY atualizado_em DESC"
        ).fetchall()

    resultado = []
    for row in rows:
        try:
            dados = json.loads(row["dados"])
        except (json.JSONDecodeError, TypeError):
            dados = {}

        resultado.append({
            "session_id": row["session_id"],
            "criado_em": row["criado_em"],
            "atualizado_em": row["atualizado_em"],
            "cliente": dados.get("cliente") or "Estudo sem nome",
            "categoria": dados.get("categoria"),
            "micro_categoria": dados.get("micro_categoria"),
            "etapa_atual": dados.get("etapa_atual") or 1,
        })

    return resultado


# ---------------------------------------------------------------------------
# Usuários — consultas usadas pela auth (Parte 2+)
# ---------------------------------------------------------------------------

def buscar_usuario_por_email(email: str) -> dict | None:
    """
    Devolve o dict do usuário (id, email, senha_hash, time_id, papel, ativo)
    ou None se o email não existir no banco.

    Usado pelo endpoint POST /auth/login para verificar credenciais.
    Retorna sempre todos os campos necessários para a autenticação,
    incluindo senha_hash (para verificação bcrypt) e ativo (para rejeitar
    contas desativadas antes de verificar a senha).
    """
    with _DB_LOCK, _conectar() as conn:
        row = conn.execute(
            """
            SELECT id, email, senha_hash, time_id, papel, ativo
            FROM usuarios
            WHERE email = ?
            """,
            (email,),
        ).fetchone()
    return dict(row) if row else None
