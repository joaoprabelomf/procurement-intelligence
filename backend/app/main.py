"""
main.py — API do Analisador de Procurement (FastAPI).

Expõe o pipeline de 8 etapas (etapa1.py ... etapa8.py + etapa4b.py) via
HTTP, para ser consumido pelo frontend React. A lógica de negócio de cada
etapa NÃO foi alterada — este arquivo é só a "casca" que substitui o
Streamlit: recebe requisições HTTP, chama a função certa de cada módulo
de etapa, e devolve o resultado como JSON (ou um arquivo, no caso dos
downloads de Word/Excel).

Como rodar localmente (resumo — o guia completo está em COMO_RODAR.md):
    uvicorn app.main:app --reload --port 8000
"""

import asyncio
from io import BytesIO
import os
import tempfile
from typing import Annotated

import anthropic
from fastapi import FastAPI, Request, UploadFile, HTTPException, File, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse

from . import sessions, database
from .erros import ErroEtapa
from .ia import ChaveApiAusente
from .leitura import read_uploaded_file
from .pipeline import ETAPAS, etapa_por_numero, total_etapas
from .schemas import (
    SessaoCriada,
    Etapa1CorrecaoRequest,
    Etapa1ChatRequest,
    Etapa2AnualizacaoRequest,
    Etapa6CheckpointRequest,
    Etapa8Request,
    Etapa8RiscoConfirmacaoRequest,
    CorrecaoGenericaRequest,
    LoginRequest,
    TokenResponse,
    CriarUsuarioRequest,
    CriarUsuarioResponse,
    ListaUsuariosResponse,
    UsuarioResumo,
)
from . import auth
from fastapi import Depends
import secrets

# ---------------------------------------------------------------------------
# Aliases de dependency — aplicados nas rotas que exigem autenticação.
#
# _Auth          → valida token; usado em rotas sem session_id (POST /sessoes,
#                  GET /estudos).
# _AuthSessao    → valida token E verifica que o estudo pertence ao time do
#                  usuário; usado em todas as rotas /sessoes/{session_id}/...
#
# O parâmetro é declarado nas funções de rota como `_: _AuthSessao` (underscore
# = "usado só pelo efeito colateral de enforçar auth"; FastAPI não o exige no
# corpo da função).  Para as raras rotas onde o time_id é necessário no corpo
# (POST /sessoes, GET /estudos), usa-se `usuario: _Auth`.
# ---------------------------------------------------------------------------
_Auth = Annotated[dict, Depends(auth.get_usuario_atual)]
_AuthSessao = Annotated[dict, Depends(auth.get_usuario_com_acesso_a_sessao)]
_Admin = Annotated[dict, Depends(auth.get_usuario_admin)]

from . import etapa5_para_ppt, etapa6_para_ppt, etapa7_para_ppt, etapa8_para_ppt
from . import correcao_generica
from . import propostas_view
from . import equalizacao_view
from . import baseline_view
from . import triagem_view
from . import edital_view
from . import comparacao_view
from . import recomendacoes_view

# Ordem real de execução do pipeline, usada pelo endpoint de recascateamento.
# Etapa 4B não é uma das 8 etapas "visíveis" do pipeline.py, mas roda entre a
# Etapa 4 e a Etapa 5 (ver Cascata.jsx) — incluída aqui na posição certa para
# que "recascatear a partir da etapa 4" também refaça a 4B antes da 5.
_ORDEM_RECASCATEAMENTO = [1, 2, 3, 4, "4b", 5, 6, 7, 8]

# Caminho do engine de PPT (copiado da skill dd-deck-builder para dentro do
# projeto, já que o engine precisa de uma pasta GRAVÁVEL para copiar o
# template e salvar o .pptx temporariamente antes de mover para o destino
# final). Ver app/ppt_engine/ — contém scripts/gerar_apresentacao.py e
# assets/Template_Base.pptx, exatamente como a skill original.
_PPT_ENGINE_DIR = os.path.join(os.path.dirname(__file__), "ppt_engine")
_PPT_ENGINE_SCRIPT = os.path.join(_PPT_ENGINE_DIR, "scripts", "gerar_apresentacao.py")
# Pasta temporária do sistema para os .pptx gerados — cada chamada gera um
# arquivo com nome único (tempfile), para suportar múltiplas sessões/usuários
# sem um arquivo sobrescrever o outro.
_PPT_SAIDA_DIR = os.path.join(tempfile.gettempdir(), "procurement_ppt_saida")

from . import etapa1, etapa2, etapa3, etapa4, etapa4b, etapa5, etapa6, etapa7, etapa8


app = FastAPI(
    title="Analisador de Procurement — A&M",
    description="API que expõe o pipeline de 8 etapas de análise de procurement.",
    version="1.0.0",
)


@app.on_event("startup")
def startup():
    """Inicializa o banco SQLite e valida configurações obrigatórias."""
    database.inicializar_banco()
    auth.verificar_jwt_secret_na_startup()


@app.middleware("http")
async def auto_persistir_sessao(request: Request, call_next):
    """
    Após cada requisição mutante bem-sucedida (POST/PUT/PATCH) que envolve
    um session_id, persiste automaticamente o Estudo no banco SQLite.

    Isso garante que o trabalho não se perde em caso de restart — a próxima
    chamada a obter_estudo recupera a sessão do banco se ela não estiver mais
    em memória.
    """
    response = await call_next(request)
    if request.method in ("POST", "PUT", "PATCH") and response.status_code < 400:
        session_id = request.path_params.get("session_id")
        if session_id and sessions.sessao_existe(session_id):
            try:
                estudo = sessions.obter_estudo(session_id)
                database.salvar_estudo(session_id, estudo)
            except Exception as e:
                print(f"[WARN] Falha ao persistir sessão {session_id[:8]}…: {e}")
    return response


# CORS liberado para desenvolvimento local (o frontend React roda em outra
# porta). Em produção, restrinja allow_origins ao domínio real do frontend.

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Tratamento de erros — converte exceções de negócio em respostas HTTP
# ---------------------------------------------------------------------------

@app.exception_handler(ErroEtapa)
async def handler_erro_etapa(request, exc: ErroEtapa):
    from fastapi.responses import JSONResponse
    return JSONResponse(
        status_code=502,
        content={"detail": exc.mensagem, "resposta_bruta": exc.resposta_bruta},
    )


@app.exception_handler(ChaveApiAusente)
async def handler_chave_ausente(request, exc: ChaveApiAusente):
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=500, content={"detail": str(exc)})


@app.exception_handler(anthropic.AuthenticationError)
async def handler_chave_invalida(request, exc: anthropic.AuthenticationError):
    from fastapi.responses import JSONResponse
    return JSONResponse(
        status_code=500,
        content={"detail": "Chave da API do Claude inválida ou expirada. Verifique ANTHROPIC_API_KEY no servidor."},
    )


@app.exception_handler(anthropic.APIConnectionError)
async def handler_erro_conexao_anthropic(request, exc: anthropic.APIConnectionError):
    from fastapi.responses import JSONResponse
    return JSONResponse(
        status_code=502,
        content={"detail": "Não foi possível conectar à API do Claude. Verifique sua conexão de internet."},
    )


@app.exception_handler(sessions.SessaoNaoEncontrada)
async def handler_sessao_nao_encontrada(request, exc: sessions.SessaoNaoEncontrada):
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=404, content={"detail": str(exc)})


def _get_estudo(session_id: str):
    """Helper: busca o Estudo da sessão ou levanta 404 com mensagem clara."""
    return sessions.obter_estudo(session_id)


# ---------------------------------------------------------------------------
# Auth — login e emissão de JWT (Parte 2)
# ---------------------------------------------------------------------------

@app.post("/auth/login", response_model=TokenResponse)
def login(body: LoginRequest):
    """
    Autentica um usuário e devolve um JWT com expiração de 8 horas.

    Regras de segurança:
    - Usuário inexistente, senha errada e conta inativa → 401 com mensagem
      GENÉRICA (não revelamos qual dos três falhou, para não vazar informação).
    - A verificação de senha usa bcrypt.checkpw — tempo constante, resistente
      a timing attacks.
    - Em nenhum momento a senha em texto puro é logada ou armazenada.
    """
    usuario = database.buscar_usuario_por_email(body.email)

    # Resposta genérica: qualquer falha vira o mesmo 401
    _ERRO_401 = HTTPException(status_code=401, detail="Email ou senha inválidos.")

    if usuario is None:
        raise _ERRO_401
    if not usuario["ativo"]:
        raise _ERRO_401
    if not database.verificar_senha(body.senha, usuario["senha_hash"]):
        raise _ERRO_401

    token = auth.criar_token(
        usuario_id=usuario["id"],
        time_id=usuario["time_id"],
        papel=usuario["papel"],
    )
    return TokenResponse(access_token=token)


# ---------------------------------------------------------------------------
# Admin — gestão de usuários (Parte 5)
# ---------------------------------------------------------------------------

@app.post("/admin/usuarios", response_model=CriarUsuarioResponse, status_code=201)
def admin_criar_usuario(body: CriarUsuarioRequest, admin: _Admin):
    """
    Cria um novo usuário no time do admin autenticado com papel='membro'.

    - Gera uma senha temporária forte e aleatória (secrets.token_urlsafe).
    - Armazena apenas o hash bcrypt — a senha em texto puro é devolvida
      UMA vez na resposta para o admin repassar ao novo usuário.
    - Retorna 409 se o email já estiver cadastrado.
    """
    senha_temp = secrets.token_urlsafe(12)  # ~16 chars URL-safe
    senha_hash = database.hashear_senha(senha_temp)
    try:
        novo_id = database.criar_usuario(
            email=body.email,
            senha_hash=senha_hash,
            time_id=admin["time_id"],
            papel="membro",
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    return CriarUsuarioResponse(id=novo_id, email=body.email, senha_temporaria=senha_temp)


@app.get("/admin/usuarios", response_model=ListaUsuariosResponse)
def admin_listar_usuarios(admin: _Admin):
    """Lista todos os usuários do time do admin autenticado (sem expor senha)."""
    usuarios = database.listar_usuarios_do_time(admin["time_id"])
    return ListaUsuariosResponse(
        usuarios=[UsuarioResumo(**u) for u in usuarios]
    )


@app.patch("/admin/usuarios/{usuario_id}/desativar", status_code=200)
def admin_desativar_usuario(usuario_id: int, admin: _Admin):
    """
    Desativa (ativo=0) um usuário do time do admin.
    O admin não pode desativar a si mesmo.
    """
    if usuario_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Você não pode desativar sua própria conta.")
    encontrado = database.desativar_usuario(usuario_id, admin["time_id"])
    if not encontrado:
        raise HTTPException(status_code=404, detail="Usuário não encontrado neste time.")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Saúde / diagnóstico
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {
        "status": "ok",
        "sessoes_ativas": sessions.total_sessoes_ativas(),
        "sessoes_salvas_no_banco": len(database.listar_sessoes_salvas()),
    }


@app.get("/estudos")
def listar_estudos(usuario: _Auth):
    """Lista estudos do time do usuário autenticado."""
    return {"estudos": database.listar_estudos_resumo(time_id=usuario["time_id"])}


@app.get("/pipeline")
def listar_pipeline():
    """Devolve a declaração das 8 etapas (número, título, se tem checkpoint)."""
    return {"etapas": ETAPAS, "total": total_etapas()}


# ---------------------------------------------------------------------------
# Sessão
# ---------------------------------------------------------------------------

@app.post("/sessoes", response_model=SessaoCriada)
def criar_sessao_rota(usuario: _Auth):
    """Cria uma nova sessão de estudo vazia, associada ao time do usuário."""
    session_id = sessions.criar_sessao(time_id=usuario["time_id"])
    return SessaoCriada(session_id=session_id)


@app.get("/sessoes/{session_id}")
def obter_estado_sessao(session_id: str, _: _AuthSessao):
    """Devolve o estado completo do Estudo — usado para retomar onde parou."""
    estudo = _get_estudo(session_id)
    return {
        "cliente": estudo.cliente,
        "setor": estudo.setor,
        "documentos": [
            {k: v for k, v in d.items() if k != "texto"}  # não manda o texto bruto de volta
            for d in estudo.documentos
        ],
        "proponentes": estudo.proponentes,
        "categoria": estudo.categoria,
        "micro_categoria": estudo.micro_categoria,
        "modelo_precificacao": estudo.modelo_precificacao,
        "baseline": estudo.baseline,
        "edital": estudo.edital,
        "propostas_tecnicas": estudo.propostas_tecnicas,
        "propostas_comerciais": estudo.propostas_comerciais,
        "comparacao_tecnica": estudo.comparacao_tecnica,
        "equalizacao_comercial": estudo.equalizacao_comercial,
        "recomendacoes": estudo.recomendacoes,
        "estrategia_categoria": estudo.estrategia_categoria,
        "taxa_desconto": estudo.taxa_desconto,
        "regra_moeda": estudo.regra_moeda,
        "premissas": estudo.premissas,
        "faltantes": estudo.faltantes,
        "fraquezas": estudo.fraquezas,
        "etapa_atual": estudo.etapa_atual,
    }


@app.delete("/sessoes/{session_id}")
def encerrar_sessao(session_id: str, _: _AuthSessao):
    sessions.encerrar_sessao(session_id)
    return {"status": "encerrada"}


# ---------------------------------------------------------------------------
# Etapa 1 — upload + classificação
# ---------------------------------------------------------------------------

@app.post("/sessoes/{session_id}/etapa1/upload")
async def rodar_etapa1_upload(session_id: str, _: _AuthSessao, arquivos: list[UploadFile] = File(...)):
    """
    Recebe os arquivos enviados pelo usuário (edital, baseline, propostas),
    lê o conteúdo de cada um (PDF/Word/Excel/txt) e roda a classificação.

    read_uploaded_file e rodar_etapa1 são funções síncronas pesadas (pandas,
    pdfplumber, chamada HTTP ao Claude). Rodá-las diretamente num async def
    bloquearia o event loop do uvicorn — conexões longas seriam derrubadas com
    ERR_FAILED. asyncio.to_thread() move cada operação para um thread pool,
    mantendo o event loop livre durante todo o processamento.
    """
    estudo = _get_estudo(session_id)

    import time as _time
    documentos_lidos = []
    _t_leitura_total = _time.time()
    print(f"[PERF] etapa1 upload — {len(arquivos)} arquivo(s) recebidos")
    for arquivo in arquivos:
        raw_bytes = await arquivo.read()
        _t0 = _time.time()
        texto = await asyncio.to_thread(read_uploaded_file, arquivo.filename, raw_bytes)
        print(f"[PERF] etapa1 leitura '{arquivo.filename}' ({len(raw_bytes)/1024:.0f} KB → {len(texto)} chars): {_time.time() - _t0:.2f}s")
        documentos_lidos.append({"nome": arquivo.filename, "texto": texto})
    print(f"[PERF] etapa1 leitura TOTAL ({len(arquivos)} arquivo(s)): {_time.time() - _t_leitura_total:.2f}s")

    resultado = await asyncio.to_thread(etapa1.rodar_etapa1, estudo, documentos_lidos)
    return resultado


@app.post("/sessoes/{session_id}/etapa1/correcao")
def aplicar_correcao_etapa1(session_id: str, body: Etapa1CorrecaoRequest, _: _AuthSessao):
    """Correção estruturada (caminho antigo — edição direta, sem decidir intenção)."""
    estudo = _get_estudo(session_id)
    checkpoint = etapa1.aplicar_correcao_etapa1(estudo, body.correcao)
    return {"checkpoint": checkpoint}


@app.post("/sessoes/{session_id}/etapa1/chat")
def chat_etapa1(session_id: str, body: Etapa1ChatRequest, _: _AuthSessao):
    """
    Chat livre da Etapa 1: o usuário fala em linguagem natural (editar,
    perguntar, ou confirmar) e o Claude decide a intenção. Usado pela
    caixa de chat na tela de revisão da Etapa 1.
    """
    estudo = _get_estudo(session_id)
    resultado = etapa1.processar_mensagem_etapa1(estudo, body.mensagem)
    return resultado


@app.get("/sessoes/{session_id}/etapa1/resumo-executivo")
def resumo_executivo_etapa1_rota(session_id: str, _: _AuthSessao):
    """KPIs: cliente, categoria + modelo de precificação, nº de proponentes, nº de pontos de atenção."""
    estudo = _get_estudo(session_id)
    return triagem_view.resumo_executivo_triagem(estudo)


@app.get("/sessoes/{session_id}/etapa1/cenario-atual")
def cenario_atual_etapa1_rota(session_id: str, _: _AuthSessao):
    """Documentos do cenário atual (As Is): edital e baseline, cada um podendo estar ausente."""
    estudo = _get_estudo(session_id)
    return triagem_view.cenario_atual_triagem(estudo)


@app.get("/sessoes/{session_id}/etapa1/proponentes")
def proponentes_etapa1_rota(session_id: str, _: _AuthSessao):
    """Lista de proponentes com seus arquivos (técnica/comercial/combinada) — sem paginação, poucos por natureza."""
    estudo = _get_estudo(session_id)
    return {"itens": triagem_view.proponentes_triagem(estudo)}


@app.get("/sessoes/{session_id}/etapa1/pontos-atencao")
def pontos_atencao_etapa1_rota(session_id: str, _: _AuthSessao):
    """Lista de faltantes/alertas registrados na classificação."""
    estudo = _get_estudo(session_id)
    return {"itens": triagem_view.pontos_atencao_triagem(estudo)}


# ---------------------------------------------------------------------------
# Etapa 2 — baseline (+ checkpoint condicional de anualização)
# ---------------------------------------------------------------------------

@app.post("/sessoes/{session_id}/etapa2/rodar")
def rodar_etapa2_rota(session_id: str, _: _AuthSessao):
    estudo = _get_estudo(session_id)
    return etapa2.rodar_etapa2(estudo)


@app.post("/sessoes/{session_id}/etapa2/confirmar-anualizacao")
def confirmar_anualizacao_rota(session_id: str, body: Etapa2AnualizacaoRequest, _: _AuthSessao):
    estudo = _get_estudo(session_id)
    msg = etapa2.confirmar_periodo_anualização(estudo, body.periodo)
    return {"mensagem": msg}


@app.get("/sessoes/{session_id}/etapa2/resumo-executivo")
def resumo_executivo_etapa2_rota(session_id: str, _: _AuthSessao):
    """KPIs: gasto anual, micro-categoria, fatores de TCO, razoabilidade do modelo."""
    estudo = _get_estudo(session_id)
    return baseline_view.resumo_executivo_baseline(estudo)


@app.get("/sessoes/{session_id}/etapa2/detalhe")
def detalhe_etapa2_rota(session_id: str, _: _AuthSessao):
    """Conteúdo completo do baseline (Pareto, fatores de TCO, drivers de should-cost) — sem paginação."""
    estudo = _get_estudo(session_id)
    return baseline_view.detalhe_baseline(estudo)


# ---------------------------------------------------------------------------
# Etapa 3 — edital técnico
# ---------------------------------------------------------------------------

@app.post("/sessoes/{session_id}/etapa3/rodar")
def rodar_etapa3_rota(session_id: str, _: _AuthSessao):
    estudo = _get_estudo(session_id)
    return etapa3.rodar_etapa3(estudo)


@app.get("/sessoes/{session_id}/etapa3/requisitos")
def consultar_requisitos_etapa3_rota(
    session_id: str,
    _: _AuthSessao,
    pagina: int = Query(1, ge=1),
    tamanho_pagina: int = Query(20, ge=1, le=200),
    busca: str = Query(""),
    status: str | None = Query(None),
    ordenar_por: str = Query("id"),
    direcao: str = Query("asc", pattern="^(asc|desc)$"),
):
    """Consulta paginada/filtrada/ordenada dos requisitos do edital."""
    estudo = _get_estudo(session_id)
    return edital_view.consultar_requisitos(
        estudo, pagina=pagina, tamanho_pagina=tamanho_pagina, busca=busca,
        status=status, ordenar_por=ordenar_por, direcao=direcao,
    )


@app.get("/sessoes/{session_id}/etapa3/resumo-executivo")
def resumo_executivo_etapa3_rota(session_id: str, _: _AuthSessao):
    """KPIs: total de requisitos, mandatórios de peso Alto, tamanho do delta de escopo."""
    estudo = _get_estudo(session_id)
    return edital_view.resumo_executivo_edital(estudo)


@app.get("/sessoes/{session_id}/etapa3/delta-escopo")
def detalhe_delta_escopo_etapa3_rota(session_id: str, _: _AuthSessao):
    """Conteúdo completo do delta de escopo (adicionados/removidos/modificados vs baseline)."""
    estudo = _get_estudo(session_id)
    return edital_view.detalhe_delta_escopo(estudo)


# ---------------------------------------------------------------------------
# Etapa 4 — propostas técnicas
# ---------------------------------------------------------------------------

@app.post("/sessoes/{session_id}/etapa4/rodar")
def rodar_etapa4_rota(session_id: str, _: _AuthSessao):
    estudo = _get_estudo(session_id)
    return etapa4.rodar_etapa4(estudo)


@app.get("/sessoes/{session_id}/etapa4/propostas")
def consultar_propostas_etapa4_rota(
    session_id: str,
    _: _AuthSessao,
    pagina: int = Query(1, ge=1),
    tamanho_pagina: int = Query(20, ge=1, le=200),
    busca: str = Query(""),
    status: str | None = Query(None),
    ordenar_por: str = Query("fornecedor"),
    direcao: str = Query("asc", pattern="^(asc|desc)$"),
):
    """
    Consulta paginada/filtrada/ordenada das propostas já analisadas pela
    Etapa 4 — não roda nenhuma análise nova, só consulta o que já está em
    estudo.propostas_tecnicas. Desenhado para escalar a centenas de
    propostas sem mandar tudo de uma vez para o frontend.
    """
    estudo = _get_estudo(session_id)
    return propostas_view.consultar_propostas(
        estudo,
        pagina=pagina,
        tamanho_pagina=tamanho_pagina,
        busca=busca,
        status=status,
        ordenar_por=ordenar_por,
        direcao=direcao,
    )


@app.get("/sessoes/{session_id}/etapa4/resumo-executivo")
def resumo_executivo_etapa4_rota(session_id: str, _: _AuthSessao):
    """KPIs agregados sobre TODAS as propostas, independente de paginação/filtro."""
    estudo = _get_estudo(session_id)
    return propostas_view.resumo_executivo_agregado(estudo)


@app.get("/sessoes/{session_id}/etapa4/propostas/{fornecedor}")
def detalhe_proposta_etapa4_rota(session_id: str, fornecedor: str, _: _AuthSessao):
    """Detalhe completo (requisito a requisito) de UM fornecedor — carregado sob demanda."""
    estudo = _get_estudo(session_id)
    detalhe = propostas_view.detalhe_de_um_fornecedor(estudo, fornecedor)
    if detalhe is None:
        raise HTTPException(status_code=404, detail=f"Fornecedor '{fornecedor}' não encontrado nesta sessão.")
    return detalhe


# ---------------------------------------------------------------------------
# Etapa 4B — extração comercial (suporte à Etapa 6)
# ---------------------------------------------------------------------------

@app.post("/sessoes/{session_id}/etapa4b/rodar")
def rodar_etapa4b_rota(session_id: str, _: _AuthSessao):
    estudo = _get_estudo(session_id)
    return etapa4b.rodar_etapa4b(estudo)


# ---------------------------------------------------------------------------
# Etapa 5 — comparação técnica (+ downloads)
# ---------------------------------------------------------------------------

@app.post("/sessoes/{session_id}/etapa5/rodar")
def rodar_etapa5_rota(session_id: str, _: _AuthSessao):
    estudo = _get_estudo(session_id)
    return etapa5.rodar_etapa5(estudo)


@app.get("/sessoes/{session_id}/etapa5/fornecedores")
def consultar_comparacao_etapa5_rota(
    session_id: str,
    _: _AuthSessao,
    pagina: int = Query(1, ge=1),
    tamanho_pagina: int = Query(20, ge=1, le=200),
    busca: str = Query(""),
    status: str | None = Query(None),
    ordenar_por: str = Query("fornecedor"),
    direcao: str = Query("asc", pattern="^(asc|desc)$"),
):
    """
    Consulta paginada/filtrada/ordenada da comparação técnica, com
    FORNECEDOR como linha (transposto da matriz requisito × fornecedor).
    """
    estudo = _get_estudo(session_id)
    return comparacao_view.consultar_comparacao(
        estudo, pagina=pagina, tamanho_pagina=tamanho_pagina, busca=busca,
        status=status, ordenar_por=ordenar_por, direcao=direcao,
    )


@app.get("/sessoes/{session_id}/etapa5/resumo-executivo")
def resumo_executivo_etapa5_rota(session_id: str, _: _AuthSessao):
    """KPIs: nº de fornecedores, é comparação real, fornecedores com gap, pior fornecedor."""
    estudo = _get_estudo(session_id)
    return comparacao_view.resumo_executivo_comparacao(estudo)


@app.get("/sessoes/{session_id}/etapa5/fornecedores/{fornecedor}")
def detalhe_fornecedor_etapa5_rota(session_id: str, fornecedor: str, _: _AuthSessao):
    """Matriz completa de requisitos de UM fornecedor — carregada sob demanda ao expandir a linha."""
    estudo = _get_estudo(session_id)
    detalhe = comparacao_view.matriz_completa_de_um_fornecedor(estudo, fornecedor)
    if detalhe is None:
        raise HTTPException(status_code=404, detail=f"Fornecedor '{fornecedor}' não encontrado nesta sessão.")
    return detalhe


@app.get("/sessoes/{session_id}/etapa5/word")
def download_word_etapa5(session_id: str, _: _AuthSessao):
    estudo = _get_estudo(session_id)
    buffer = etapa5.gerar_word_etapa5(estudo)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": "attachment; filename=comparacao_tecnica.docx"},
    )


@app.get("/sessoes/{session_id}/etapa5/excel")
def download_excel_etapa5(session_id: str, _: _AuthSessao):
    estudo = _get_estudo(session_id)
    buffer = etapa5.gerar_excel_etapa5(estudo)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=comparacao_tecnica.xlsx"},
    )


@app.get("/sessoes/{session_id}/etapa5/ppt")
def download_ppt_etapa5(session_id: str, _: _AuthSessao):
    estudo = _get_estudo(session_id)
    try:
        caminho = etapa5_para_ppt.gerar_pptx_etapa5(
            estudo,
            caminho_engine=_PPT_ENGINE_SCRIPT,
            caminho_saida_dir=_PPT_SAIDA_DIR,
            arquivo_saida=f"comparacao_tecnica_{session_id}.pptx",
        )
    except (RuntimeError, FileNotFoundError) as e:
        raise ErroEtapa(f"Erro ao gerar o PPT da Etapa 5: {e}")
    return FileResponse(
        caminho,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        filename="comparacao_tecnica.pptx",
    )


# ---------------------------------------------------------------------------
# Etapa 6 — equalização comercial (checkpoint obrigatório de taxa/moeda)
# ---------------------------------------------------------------------------

@app.get("/sessoes/{session_id}/etapa6/precisa-checkpoint")
def precisa_checkpoint_etapa6_rota(session_id: str, _: _AuthSessao):
    estudo = _get_estudo(session_id)
    return {"precisa_checkpoint": etapa6.precisa_checkpoint_etapa6(estudo)}


@app.post("/sessoes/{session_id}/etapa6/checkpoint")
def confirmar_checkpoint_etapa6_rota(session_id: str, body: Etapa6CheckpointRequest, _: _AuthSessao):
    estudo = _get_estudo(session_id)
    msg = etapa6.confirmar_taxa_e_moeda(estudo, body.taxa_desconto, body.regra_moeda)
    return {"mensagem": msg}


@app.post("/sessoes/{session_id}/etapa6/rodar")
def rodar_etapa6_rota(session_id: str, _: _AuthSessao):
    estudo = _get_estudo(session_id)
    return etapa6.rodar_etapa6(estudo)


@app.get("/sessoes/{session_id}/etapa6/fornecedores")
def consultar_equalizacao_etapa6_rota(
    session_id: str,
    _: _AuthSessao,
    pagina: int = Query(1, ge=1),
    tamanho_pagina: int = Query(20, ge=1, le=200),
    busca: str = Query(""),
    status: str | None = Query(None),
    ordenar_por: str = Query("preco"),
    direcao: str = Query("asc", pattern="^(asc|desc)$"),
):
    """
    Consulta paginada/filtrada/ordenada da equalização comercial — não
    refaz nenhum cálculo, só consulta o que rodar_etapa6 já gravou em
    estudo.equalizacao_comercial.
    """
    estudo = _get_estudo(session_id)
    return equalizacao_view.consultar_equalizacao(
        estudo,
        pagina=pagina,
        tamanho_pagina=tamanho_pagina,
        busca=busca,
        status=status,
        ordenar_por=ordenar_por,
        direcao=direcao,
    )


@app.get("/sessoes/{session_id}/etapa6/resumo-executivo")
def resumo_executivo_etapa6_rota(session_id: str, _: _AuthSessao):
    """KPIs comerciais: baseline, quantidade de propostas, valor médio, melhor proposta (menor preço)."""
    estudo = _get_estudo(session_id)
    return equalizacao_view.resumo_executivo_agregado(estudo)


@app.get("/sessoes/{session_id}/etapa6/fornecedores/{fornecedor}")
def detalhe_fornecedor_etapa6_rota(session_id: str, fornecedor: str, _: _AuthSessao):
    """Detalhe completo (on-tops, ajustes, premissas) de UM fornecedor — carregado sob demanda."""
    estudo = _get_estudo(session_id)
    detalhe = equalizacao_view.detalhe_de_um_fornecedor(estudo, fornecedor)
    if detalhe is None:
        raise HTTPException(status_code=404, detail=f"Fornecedor '{fornecedor}' não encontrado nesta sessão.")
    return detalhe


@app.get("/sessoes/{session_id}/etapa6/word")
def download_word_etapa6(session_id: str, _: _AuthSessao):
    estudo = _get_estudo(session_id)
    buffer = etapa6.gerar_word_etapa6(estudo)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": "attachment; filename=equalizacao_comercial.docx"},
    )


@app.get("/sessoes/{session_id}/etapa6/excel")
def download_excel_etapa6(session_id: str, _: _AuthSessao):
    estudo = _get_estudo(session_id)
    buffer = etapa6.gerar_excel_etapa6(estudo)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=equalizacao_comercial.xlsx"},
    )


@app.get("/sessoes/{session_id}/etapa6/ppt")
def download_ppt_etapa6(session_id: str, _: _AuthSessao):
    estudo = _get_estudo(session_id)
    try:
        caminho = etapa6_para_ppt.gerar_pptx_etapa6(
            estudo,
            caminho_engine=_PPT_ENGINE_SCRIPT,
            caminho_saida_dir=_PPT_SAIDA_DIR,
            arquivo_saida=f"equalizacao_comercial_{session_id}.pptx",
        )
    except (RuntimeError, FileNotFoundError) as e:
        raise ErroEtapa(f"Erro ao gerar o PPT da Etapa 6: {e}")
    return FileResponse(
        caminho,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        filename="equalizacao_comercial.pptx",
    )


# ---------------------------------------------------------------------------
# Etapa 7 — recomendações finais (neutras) (+ downloads)
# ---------------------------------------------------------------------------

@app.post("/sessoes/{session_id}/etapa7/rodar")
def rodar_etapa7_rota(session_id: str, _: _AuthSessao):
    estudo = _get_estudo(session_id)
    return etapa7.rodar_etapa7(estudo)


@app.get("/sessoes/{session_id}/etapa7/resumo-executivo")
def resumo_executivo_etapa7_rota(session_id: str, _: _AuthSessao):
    """KPIs: maior savings, fornecedor associado, nº de cenários, nº de pontos de negociação."""
    estudo = _get_estudo(session_id)
    return recomendacoes_view.resumo_executivo_recomendacoes(estudo)


@app.get("/sessoes/{session_id}/etapa7/conteudo")
def conteudo_etapa7_rota(session_id: str, _: _AuthSessao):
    """Conteúdo completo (três melhores, cenários, pontos de negociação, leitura final) — sem paginação."""
    estudo = _get_estudo(session_id)
    return recomendacoes_view.conteudo_completo_recomendacoes(estudo)


@app.get("/sessoes/{session_id}/etapa7/word")
def download_word_etapa7(session_id: str, _: _AuthSessao):
    estudo = _get_estudo(session_id)
    buffer = etapa7.gerar_word_etapa7(estudo)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": "attachment; filename=recomendacoes_finais.docx"},
    )


@app.get("/sessoes/{session_id}/etapa7/excel")
def download_excel_etapa7(session_id: str, _: _AuthSessao):
    estudo = _get_estudo(session_id)
    buffer = etapa7.gerar_excel_etapa7(estudo)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=recomendacoes_finais.xlsx"},
    )


@app.get("/sessoes/{session_id}/etapa7/ppt")
def download_ppt_etapa7(session_id: str, _: _AuthSessao):
    estudo = _get_estudo(session_id)
    try:
        caminho = etapa7_para_ppt.gerar_pptx_etapa7(
            estudo,
            caminho_engine=_PPT_ENGINE_SCRIPT,
            caminho_saida_dir=_PPT_SAIDA_DIR,
            arquivo_saida=f"recomendacoes_finais_{session_id}.pptx",
        )
    except (RuntimeError, FileNotFoundError) as e:
        raise ErroEtapa(f"Erro ao gerar o PPT da Etapa 7: {e}")
    return FileResponse(
        caminho,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        filename="recomendacoes_finais.pptx",
    )


# ---------------------------------------------------------------------------
# Etapa 8 — estratégia da categoria (Kraljic) (+ downloads)
# ---------------------------------------------------------------------------

@app.post("/sessoes/{session_id}/etapa8/rodar")
def rodar_etapa8_rota(session_id: str, body: Etapa8Request, _: _AuthSessao):
    estudo = _get_estudo(session_id)
    return etapa8.rodar_etapa8(
        estudo,
        categoria_manual=body.categoria_manual,
        impacto_manual=body.impacto_manual,
        risco_manual=body.risco_manual,
    )


@app.post("/sessoes/{session_id}/etapa8/confirmar-risco")
def confirmar_risco_etapa8_rota(session_id: str, body: Etapa8RiscoConfirmacaoRequest, _: _AuthSessao):
    estudo = _get_estudo(session_id)
    msg = etapa8.confirmar_risco_suprimento(estudo, body.risco)
    return {"mensagem": msg}


@app.get("/sessoes/{session_id}/etapa8/word")
def download_word_etapa8(session_id: str, _: _AuthSessao):
    estudo = _get_estudo(session_id)
    buffer = etapa8.gerar_word_etapa8(estudo)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": "attachment; filename=estrategia_categoria.docx"},
    )


@app.get("/sessoes/{session_id}/etapa8/excel")
def download_excel_etapa8(session_id: str, _: _AuthSessao):
    estudo = _get_estudo(session_id)
    buffer = etapa8.gerar_excel_etapa8(estudo)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=estrategia_categoria.xlsx"},
    )


@app.post("/sessoes/{session_id}/etapa/{numero}/corrigir")
def corrigir_etapa_rota(session_id: str, numero: int, body: CorrecaoGenericaRequest, _: _AuthSessao):
    """
    Chat conversacional para qualquer etapa de 2 a 8 (a Etapa 1 tem seu
    próprio endpoint em /etapa1/chat, com o mesmo princípio). Decide a
    intenção da mensagem do usuário (edição/pergunta/confirmação/
    esclarecimento) em vez de assumir sempre que é uma correção a aplicar.
    """
    estudo = _get_estudo(session_id)
    resposta = correcao_generica.processar_mensagem_generica(estudo, numero, body.correcao)
    return resposta


@app.get("/sessoes/{session_id}/etapa8/ppt")
def download_ppt_etapa8(session_id: str, _: _AuthSessao):
    estudo = _get_estudo(session_id)
    try:
        caminho = etapa8_para_ppt.gerar_pptx_etapa8(
            estudo,
            caminho_engine=_PPT_ENGINE_SCRIPT,
            caminho_saida_dir=_PPT_SAIDA_DIR,
            arquivo_saida=f"estrategia_categoria_{session_id}.pptx",
        )
    except (RuntimeError, FileNotFoundError) as e:
        raise ErroEtapa(f"Erro ao gerar o PPT da Etapa 8: {e}")
    return FileResponse(
        caminho,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        filename="estrategia_categoria.pptx",
    )


# ---------------------------------------------------------------------------
# Recascateamento — refazer a partir de uma etapa, propagando para as
# seguintes. Usado quando o usuário corrige uma etapa já concluída (via chat
# livre ou pelo botão "refazer análise") e as etapas posteriores, que
# dependem dela, precisam ser recalculadas para não ficarem inconsistentes.
# ---------------------------------------------------------------------------

def _rodar_uma_etapa(estudo, numero):
    """
    Roda uma única etapa pelo número (1, 2, 3, 4, "4b", 5, 6, 7, 8) e devolve
    seu resultado — mesma função que cada rota individual já chama, só
    centralizada aqui para reuso no recascateamento.

    Para a Etapa 1: reclassifica usando estudo.documentos já existentes (sem
    precisar de novo upload) — formato compatível, já que documentos_lidos
    espera {nome, texto}, igual ao que já está em estudo.documentos.

    Para a Etapa 6: NÃO roda se o checkpoint de taxa/moeda ainda não foi
    preenchido — a chamada quem decide parar é quem chama esta função.
    """
    if numero == 1:
        documentos_lidos = [{"nome": d["nome"], "texto": d.get("texto", "")} for d in estudo.documentos]
        return etapa1.rodar_etapa1(estudo, documentos_lidos)
    if numero == 2:
        return etapa2.rodar_etapa2(estudo)
    if numero == 3:
        return etapa3.rodar_etapa3(estudo)
    if numero == 4:
        return etapa4.rodar_etapa4(estudo)
    if numero == "4b":
        return etapa4b.rodar_etapa4b(estudo)
    if numero == 5:
        return etapa5.rodar_etapa5(estudo)
    if numero == 6:
        return etapa6.rodar_etapa6(estudo)
    if numero == 7:
        return etapa7.rodar_etapa7(estudo)
    if numero == 8:
        return etapa8.rodar_etapa8(estudo)
    raise ValueError(f"Número de etapa desconhecido: {numero}")


@app.post("/sessoes/{session_id}/recascatear/{etapa_inicial}")
def recascatear_a_partir_de(session_id: str, etapa_inicial: str, _: _AuthSessao):
    """
    Refaz a etapa informada e propaga automaticamente para todas as etapas
    seguintes do pipeline, na ordem real de execução (incluindo a 4B, que
    roda entre a Etapa 4 e a Etapa 5).

    etapa_inicial: "1", "2", ..., "8" (string, para aceitar também "4b" no
    futuro caso o frontend precise recascatear a partir dela isoladamente —
    hoje só é chamada como parte do recascateamento da Etapa 4).

    Para a Etapa 6: se faltar taxa_desconto/regra_moeda, a propagação PARA
    ali (mesmo comportamento de checkpoint bloqueante da cascata normal) —
    devolve etapas_executadas com o que já rodou e parou_em="6_checkpoint",
    para o frontend saber que precisa mostrar o formulário de novo.

    Devolve: {etapas_executadas: [{etapa, resultado}], parou_em: str|None}
    """
    estudo = _get_estudo(session_id)

    try:
        idx_inicial = _ORDEM_RECASCATEAMENTO.index(int(etapa_inicial))
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Etapa inicial inválida: {etapa_inicial}")

    etapas_executadas = []
    parou_em = None

    for numero in _ORDEM_RECASCATEAMENTO[idx_inicial:]:
        if numero == 6 and etapa6.precisa_checkpoint_etapa6(estudo):
            parou_em = "6_checkpoint"
            break
        resultado = _rodar_uma_etapa(estudo, numero)
        etapas_executadas.append({"etapa": numero, "resultado": resultado})
        if numero == 8 and (resultado.get("falta_impacto") or resultado.get("falta_risco")):
            parou_em = "8_checkpoint"
            break

    return {"etapas_executadas": etapas_executadas, "parou_em": parou_em}
