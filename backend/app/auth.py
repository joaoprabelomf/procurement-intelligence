"""
auth.py — Geração e validação de tokens JWT.

Responsabilidades deste módulo:
    - Ler a chave secreta (JWT_SECRET) do ambiente e avisar claramente se ausente.
    - Emitir tokens JWT assinados com HS256, contendo usuario_id, time_id e papel.
    - Validar/decodificar tokens (usado na Parte 3 para proteger rotas).

O que NÃO está aqui:
    - Lógica de banco (buscar usuário, verificar hash) → database.py
    - Rota HTTP → main.py
    - Schemas de request/response → schemas.py

Variável de ambiente obrigatória:
    JWT_SECRET   Chave secreta usada para assinar os tokens.
                 Deve ser uma string longa e aleatória.
                 Sugestão para gerar uma boa chave no terminal:
                     python -c "import secrets; print(secrets.token_hex(32))"
"""

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Annotated

import jwt  # PyJWT
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

logger = logging.getLogger(__name__)

# HTTPBearer instrui o Swagger a mostrar o campo "Authorize" com Bearer token,
# permitindo testar endpoints protegidos diretamente no /docs.
_bearer = HTTPBearer()

_ALGORITMO = "HS256"
_EXPIRACAO_HORAS = 8


def _obter_chave_secreta() -> str:
    """
    Lê JWT_SECRET do ambiente.
    Levanta RuntimeError com mensagem clara se a variável não estiver definida —
    assim o erro aparece no log do servidor (e no response da chamada que falhou)
    em vez de uma mensagem opaca de criptografia.
    """
    segredo = os.environ.get("JWT_SECRET", "").strip()
    if not segredo:
        raise RuntimeError(
            "JWT_SECRET não está definida. "
            "Defina a variável de ambiente antes de iniciar o servidor. "
            "Exemplo (cmd Windows): set JWT_SECRET=<string-aleatoria-longa>"
        )
    return segredo


def verificar_jwt_secret_na_startup() -> None:
    """
    Chama-se na startup do servidor (main.py) para emitir um aviso visível
    no log caso JWT_SECRET não esteja configurada.
    Não levanta exceção — o servidor sobe mesmo sem ela; só o login falhará.
    """
    if not os.environ.get("JWT_SECRET", "").strip():
        logger.warning(
            "[AUTH] JWT_SECRET não está definida. "
            "O endpoint POST /auth/login retornará erro 500 até que a variável "
            "seja configurada e o servidor reiniciado."
        )


def criar_token(usuario_id: int, time_id: int, papel: str) -> str:
    """
    Emite um JWT assinado com HS256.

    Campos do payload:
        sub      — ID do usuário (string, convenção JWT)
        time_id  — ID do time ao qual o usuário pertence
        papel    — 'admin' | 'membro'
        iat      — emitido em (issued at)
        exp      — expira em (now + 8 horas)
    """
    agora = datetime.now(timezone.utc)
    payload = {
        "sub": str(usuario_id),
        "time_id": time_id,
        "papel": papel,
        "iat": agora,
        "exp": agora + timedelta(hours=_EXPIRACAO_HORAS),
    }
    return jwt.encode(payload, _obter_chave_secreta(), algorithm=_ALGORITMO)


def decodificar_token(token: str) -> dict:
    """
    Decodifica e valida um JWT.

    Devolve o payload como dict se o token for válido e não expirado.
    Levanta jwt.InvalidTokenError (ou subclasse) se inválido/expirado —
    capturada pelas dependencies abaixo para retornar 401.
    """
    return jwt.decode(token, _obter_chave_secreta(), algorithms=[_ALGORITMO])


# ---------------------------------------------------------------------------
# FastAPI dependencies — usadas diretamente nas rotas (Parte 3+)
# ---------------------------------------------------------------------------

def get_usuario_atual(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> dict:
    """
    Dependency: valida o token JWT do header Authorization: Bearer <token>.

    Devolve dict com {id, time_id, papel} extraídos do payload.
    Levanta 401 se o token estiver ausente, inválido ou expirado.

    Rotas que precisam de auth mas não têm session_id usam esta dependency
    diretamente (ex.: POST /sessoes, GET /estudos).
    """
    try:
        payload = decodificar_token(credentials.credentials)
        return {
            "id": int(payload["sub"]),
            "time_id": payload["time_id"],
            "papel": payload["papel"],
        }
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=401,
            detail="Token expirado. Faça login novamente.",
        )
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido.")


def get_usuario_admin(
    usuario: Annotated[dict, Depends(get_usuario_atual)],
) -> dict:
    """
    Dependency: exige que o usuário autenticado tenha papel='admin'.
    Levanta 403 para qualquer outro papel.
    Usado nos endpoints /admin/*.
    """
    if usuario["papel"] != "admin":
        raise HTTPException(
            status_code=403,
            detail="Acesso restrito a administradores.",
        )
    return usuario


def get_usuario_com_acesso_a_sessao(
    session_id: str,
    usuario: Annotated[dict, Depends(get_usuario_atual)],
) -> dict:
    """
    Dependency: valida o token E verifica que o estudo pertence ao time do
    usuário autenticado.

    FastAPI injeta session_id diretamente do path parameter da rota — funciona
    mesmo quando a dependency é declarada sem prefixo de router.

    Retorna o mesmo dict do get_usuario_atual se tudo OK.
    Levanta 403 se o estudo existir no banco mas pertencer a outro time.
    Se o session_id não existir no banco, deixa passar — a rota levanta 404
    via _get_estudo / sessions.obter_estudo.
    """
    # Import local para evitar ciclo (auth ← database ← auth)
    from . import database
    time_id_estudo = database.obter_time_id_do_estudo(session_id)
    if time_id_estudo is not None and time_id_estudo != usuario["time_id"]:
        raise HTTPException(status_code=403, detail="Acesso negado a este estudo.")
    return usuario
