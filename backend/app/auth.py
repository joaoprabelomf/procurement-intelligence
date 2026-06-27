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

import jwt  # PyJWT

logger = logging.getLogger(__name__)

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
    a Parte 3 capturará essa exceção para retornar 401.
    """
    return jwt.decode(token, _obter_chave_secreta(), algorithms=[_ALGORITMO])
