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


def salvar_estudo(session_id: str, estudo, time_id: int | None = None) -> None:
    """
    Persiste (upsert) o Estudo serializado como JSON.

    time_id só é usado na criação inicial (INSERT). No UPDATE apenas
    atualizado_em e dados mudam — time_id fica intocado, garantindo que
    o auto-save do middleware não sobrescreva a associação de time.
    """
    dados_json = json.dumps(asdict(estudo), ensure_ascii=False, default=str)
    agora = datetime.now(timezone.utc).isoformat()
    with _DB_LOCK, _conectar() as conn:
        conn.execute("""
            INSERT INTO estudos (session_id, criado_em, atualizado_em, dados, time_id)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(session_id) DO UPDATE SET
                atualizado_em = excluded.atualizado_em,
                dados         = excluded.dados
        """, (session_id, agora, agora, dados_json, time_id))
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


def obter_time_id_do_estudo(session_id: str) -> int | None:
    """
    Devolve o time_id do estudo ou None se o session_id não existir no banco.
    Usado pela dependency get_usuario_com_acesso_a_sessao para verificar posse.
    """
    with _DB_LOCK, _conectar() as conn:
        row = conn.execute(
            "SELECT time_id FROM estudos WHERE session_id = ?", (session_id,)
        ).fetchone()
    return row["time_id"] if row else None


def listar_estudos_resumo(time_id: int) -> list[dict]:
    """
    Lista estudos do time especificado com os campos úteis para o histórico.

    Filtra por time_id — cada usuário vê apenas os estudos do seu time.
    Extrai cliente, categoria, micro_categoria e etapa_atual do JSON de cada
    estudo com segurança (campos ausentes recebem valores padrão legíveis).
    """
    with _DB_LOCK, _conectar() as conn:
        rows = conn.execute(
            """
            SELECT session_id, criado_em, atualizado_em, dados
            FROM estudos
            WHERE time_id = ?
            ORDER BY atualizado_em DESC
            """,
            (time_id,),
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

def criar_usuario(email: str, senha_hash: str, time_id: int, papel: str = "membro") -> int:
    """
    Insere um novo usuário no banco e devolve o ID gerado.
    Levanta ValueError se o email já estiver cadastrado.
    """
    import sqlite3 as _sqlite3
    agora = datetime.now(timezone.utc).isoformat()
    try:
        with _DB_LOCK, _conectar() as conn:
            cursor = conn.execute(
                """
                INSERT INTO usuarios (email, senha_hash, time_id, papel, ativo, criado_em)
                VALUES (?, ?, ?, ?, 1, ?)
                """,
                (email, senha_hash, time_id, papel, agora),
            )
            conn.commit()
            return cursor.lastrowid
    except _sqlite3.IntegrityError:
        raise ValueError(f"Email '{email}' já está cadastrado.")


def listar_usuarios_do_time(time_id: int) -> list[dict]:
    """Lista usuários do time sem expor senha_hash."""
    with _DB_LOCK, _conectar() as conn:
        rows = conn.execute(
            """
            SELECT id, email, papel, ativo, criado_em
            FROM usuarios
            WHERE time_id = ?
            ORDER BY criado_em DESC
            """,
            (time_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def desativar_usuario(usuario_id: int, time_id: int) -> bool:
    """
    Define ativo=0 para o usuário especificado.
    Verifica que o usuário pertence ao time (evita admin de um time
    desativar usuários de outro). Devolve True se atualizou, False se
    não encontrou (ID errado ou time diferente).
    """
    with _DB_LOCK, _conectar() as conn:
        n = conn.execute(
            "UPDATE usuarios SET ativo = 0 WHERE id = ? AND time_id = ?",
            (usuario_id, time_id),
        ).rowcount
        conn.commit()
    return n > 0


# ---------------------------------------------------------------------------
# Memória RAG — recuperação de casos similares (Degrau 3, Parte 1)
# ---------------------------------------------------------------------------

def _normalizar_micro_categoria(valor: str) -> str:
    """Lowercase + strip para comparação case-insensitive de micro_categoria."""
    return (valor or "").strip().lower()


def _extrair_savings_texto(equalizacao: dict) -> str | None:
    """
    Tenta extrair uma frase curta de savings da equalização comercial.
    Retorna None se não houver dados suficientes — nunca levanta exceção.
    """
    try:
        resumo = equalizacao.get("resumo_savings") or equalizacao.get("resumo")
        if isinstance(resumo, str) and resumo.strip():
            return resumo.strip()[:250]
        # Fallback: calcula range de savings_percent dos fornecedores
        fornecedores = equalizacao.get("fornecedores") or []
        savings = [
            f.get("savings_percent") or f.get("saving_percent")
            for f in fornecedores
            if isinstance(f, dict)
        ]
        validos = [s for s in savings if isinstance(s, (int, float))]
        if validos:
            return f"Savings: {min(validos):.1f}% a {max(validos):.1f}% vs. baseline"
    except Exception:
        pass
    return None


def montar_resumo_de_caso(dados: dict) -> dict | None:
    """
    Extrai campos relevantes de um Estudo serializado para uso como referência
    histórica. Retorna None se os dados forem insuficientes ou malformados.

    Intencionalmente limitado a informações agregadas/narrativas — nunca
    inclui textos brutos de documentos.
    """
    try:
        micro_cat = (dados.get("micro_categoria") or "").strip()
        if not micro_cat:
            return None  # sem micro_categoria confirmada, o caso não serve de referência

        baseline = dados.get("baseline") or {}
        comercial = baseline.get("comercial") or {}
        should_cost = baseline.get("should_cost") or {}
        tco = baseline.get("tco") or {}
        equalizacao = dados.get("equalizacao_comercial") or {}
        estrategia = dados.get("estrategia_categoria") or {}

        drivers = [
            d.get("driver") for d in should_cost.get("drivers_principais", [])
            if isinstance(d, dict) and d.get("driver")
        ][:5]

        tco_fatores = [
            f.get("fator") for f in tco.get("fatores_nao_considerados", [])
            if isinstance(f, dict) and f.get("fator")
        ][:5]

        resumo = {
            "micro_categoria": micro_cat,
            "preco_anual_total": comercial.get("preco_anual_total"),
            "pareto": comercial.get("pareto"),
            "should_cost_sintese": should_cost.get("sintese"),
            "drivers_principais": drivers,
            "tco_fatores": tco_fatores,
            "savings_referencia": _extrair_savings_texto(equalizacao),
            "kraljic_quadrante": estrategia.get("quadrante"),
            "kraljic_resumo": estrategia.get("resumo_posicao"),
        }

        # Descarta casos sem dados úteis para a Etapa 2
        if not any([
            resumo["preco_anual_total"],
            resumo["pareto"],
            resumo["should_cost_sintese"],
            resumo["drivers_principais"],
        ]):
            return None

        return resumo
    except Exception as exc:
        logger.debug("[RAG] montar_resumo_de_caso falhou (estudo incompleto): %s", exc)
        return None


def montar_resumo_etapa7(dados: dict) -> dict | None:
    """
    Extrai campos relevantes para recomendações (Etapa 7): cenários de decisão
    históricos, padrões de negociação e savings realizados.
    Retorna None se o estudo não tiver dados de recomendações — nunca levanta.
    """
    try:
        micro_cat = (dados.get("micro_categoria") or "").strip()
        if not micro_cat:
            return None

        recomendacoes = dados.get("recomendacoes") or {}
        equalizacao = dados.get("equalizacao_comercial") or {}

        # Cenários de decisão: pega os 2 mais recentes (evita encher o prompt)
        cenarios_raw = recomendacoes.get("cenarios_decisao") or []
        cenarios = [
            {
                "nome": c.get("nome", "—"),
                "descricao": c.get("descricao", "—"),
                "trade_off": c.get("trade_off", "—"),
            }
            for c in cenarios_raw[:2]
            if isinstance(c, dict)
        ]

        # Alavancas de negociação: top 3 por fornecedor
        neg_raw = recomendacoes.get("pontos_negociacao") or []
        alavancas = []
        for forn_entry in neg_raw[:3]:
            if not isinstance(forn_entry, dict):
                continue
            for alav in (forn_entry.get("alavancas") or [])[:2]:
                if isinstance(alav, dict) and alav.get("ponto"):
                    alavancas.append(alav["ponto"])

        resumo = {
            "micro_categoria": micro_cat,
            "savings_referencia": _extrair_savings_texto(equalizacao),
            "cenarios_decisao": cenarios,
            "alavancas_negociacao": alavancas[:4],
            "leitura_final": (recomendacoes.get("leitura_final") or "")[:300],
        }

        if not any([resumo["savings_referencia"], resumo["cenarios_decisao"], resumo["alavancas_negociacao"]]):
            return None

        return resumo
    except Exception as exc:
        logger.debug("[RAG] montar_resumo_etapa7 falhou: %s", exc)
        return None


def montar_resumo_etapa8(dados: dict) -> dict | None:
    """
    Extrai campos relevantes para estratégia Kraljic (Etapa 8): quadrante
    histórico, risco de suprimento, estratégia e ações táticas.
    Retorna None se o estudo não tiver dados de estratégia — nunca levanta.
    """
    try:
        micro_cat = (dados.get("micro_categoria") or "").strip()
        if not micro_cat:
            return None

        estrategia = dados.get("estrategia_categoria") or {}
        quadrante = estrategia.get("quadrante")
        if not quadrante:
            return None  # sem estratégia Kraljic registrada, o caso não ajuda a E8

        acoes = [
            f"[{a.get('prazo','?')}] {a.get('acao','')}"
            for a in (estrategia.get("acoes_taticas") or [])[:3]
            if isinstance(a, dict) and a.get("acao")
        ]

        resumo = {
            "micro_categoria": micro_cat,
            "kraljic_quadrante": quadrante,
            "kraljic_impacto": estrategia.get("_impacto"),
            "kraljic_risco": estrategia.get("_risco"),
            "kraljic_resumo_posicao": (estrategia.get("resumo_posicao") or "")[:250],
            "estrategia_recomendada": (estrategia.get("estrategia_recomendada") or "")[:300],
            "acoes_taticas_top3": acoes,
            "alertas": (estrategia.get("alertas_estrategicos") or [])[:2],
        }

        return resumo
    except Exception as exc:
        logger.debug("[RAG] montar_resumo_etapa8 falhou: %s", exc)
        return None


def buscar_casos_similares(
    micro_categoria: str,
    time_id: int,
    excluir_session_id: str,
    limite: int = 5,
    extrator=None,
) -> list[dict]:
    """
    Recupera estudos do mesmo time com a mesma micro_categoria (normalizada).
    Retorna lista de dicts com campos-resumo — nunca levanta exceção.

    extrator: função opcional para extrair campos do estudo JSON. Por padrão
              usa montar_resumo_de_caso (adequado para Etapa 2). Passe
              montar_resumo_etapa7 ou montar_resumo_etapa8 para as demais.

    Sempre filtra por time_id (isolamento Degrau 2).
    Tolera estudos com JSON corrompido ou campos ausentes (pula silenciosamente).
    """
    _extrator = extrator if extrator is not None else montar_resumo_de_caso
    micro_normalizada = _normalizar_micro_categoria(micro_categoria)
    if not micro_normalizada:
        return []

    try:
        with _DB_LOCK, _conectar() as conn:
            rows = conn.execute(
                """
                SELECT session_id, dados
                FROM estudos
                WHERE time_id = ?
                  AND session_id != ?
                ORDER BY atualizado_em DESC
                LIMIT 50
                """,
                (time_id, excluir_session_id),
            ).fetchall()
    except Exception as exc:
        logger.warning("[RAG] Falha ao consultar banco para casos similares: %s", exc)
        return []

    casos = []
    for row in rows:
        try:
            dados = json.loads(row["dados"])
        except (json.JSONDecodeError, TypeError):
            continue  # JSON corrompido — pula sem levantar

        micro_do_caso = _normalizar_micro_categoria(dados.get("micro_categoria") or "")
        if micro_do_caso != micro_normalizada:
            continue

        resumo = _extrator(dados)
        if resumo:
            casos.append({"session_id": row["session_id"][:8] + "…", **resumo})

        if len(casos) >= limite:
            break

    return casos


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
