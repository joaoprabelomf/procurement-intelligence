"""
ia.py — Conversa com o Claude (versão API, sem Streamlit).

Mesmo comportamento do ia.py original: inicializa o cliente da API usando
a chave de ambiente, e oferece call_claude() / call_claude_com_busca(),
que todas as etapas usam pra pedir uma resposta ao modelo.

Única mudança real: a chave vem de variável de ambiente (não de
st.secrets), e em vez de st.error()/st.stop() quando a chave falta,
levanta uma exceção — a API decide o que fazer com isso (normalmente,
devolver um erro HTTP 500 com mensagem clara).
"""

import os
import time
import anthropic

from .config import MODEL

# Segundos de espera ao receber 429 (rate limit). O Tier 1 da Anthropic tem
# janelas de 1 minuto — 60s garante que a janela resetou antes de tentar de novo.
_RETRY_WAIT_SEGUNDOS = 60
_MAX_RETRIES = 3


class ChaveApiAusente(RuntimeError):
    """Levantada quando a chave da API do Claude não está configurada no servidor."""
    pass


def get_client() -> anthropic.Anthropic:
    """Inicializa o cliente Anthropic com a chave da API (variável de ambiente)."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise ChaveApiAusente(
            "Chave da API do Claude não configurada no servidor. "
            "Defina a variável de ambiente ANTHROPIC_API_KEY."
        )
    return anthropic.Anthropic(api_key=api_key)


def call_claude(messages, system, max_tokens=2000) -> str:
    """
    Chama a API do Claude e devolve o texto da resposta.
    Retenta automaticamente em caso de rate limit (429), aguardando
    _RETRY_WAIT_SEGUNDOS entre tentativas, até _MAX_RETRIES vezes.
    """
    client = get_client()
    for tentativa in range(_MAX_RETRIES):
        try:
            response = client.messages.create(
                model=MODEL,
                max_tokens=max_tokens,
                system=system,
                messages=messages,
            )
            return response.content[0].text
        except anthropic.RateLimitError:
            if tentativa == _MAX_RETRIES - 1:
                raise
            print(f"[RATE LIMIT] 429 recebido — aguardando {_RETRY_WAIT_SEGUNDOS}s "
                  f"(tentativa {tentativa + 1}/{_MAX_RETRIES})")
            time.sleep(_RETRY_WAIT_SEGUNDOS)


def call_claude_com_busca(messages, system, max_tokens=8000, max_buscas=3):
    """
    Chama o Claude COM a ferramenta de web search habilitada.

    Usada só pela Etapa 8 (pesquisa de risco de suprimento da Kraljic).
    Retorna uma tupla (texto, houve_busca). Retenta em rate limit (429)
    com o mesmo padrão de call_claude.
    """
    client = get_client()
    for tentativa in range(_MAX_RETRIES):
        try:
            response = client.messages.create(
                model=MODEL,
                max_tokens=max_tokens,
                system=system,
                messages=messages,
                tools=[{
                    "type": "web_search_20250305",
                    "name": "web_search",
                    "max_uses": max_buscas,
                }],
            )
            break
        except anthropic.RateLimitError:
            if tentativa == _MAX_RETRIES - 1:
                raise
            print(f"[RATE LIMIT] 429 recebido (web search) — aguardando {_RETRY_WAIT_SEGUNDOS}s "
                  f"(tentativa {tentativa + 1}/{_MAX_RETRIES})")
            time.sleep(_RETRY_WAIT_SEGUNDOS)

    partes_texto = []
    houve_busca = False
    for bloco in response.content:
        tipo = getattr(bloco, "type", None)
        if tipo == "text":
            partes_texto.append(bloco.text)
        elif tipo in ("server_tool_use", "web_search_tool_result"):
            houve_busca = True

    return "\n".join(partes_texto).strip(), houve_busca
