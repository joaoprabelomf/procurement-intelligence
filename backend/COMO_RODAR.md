# Como rodar o backend localmente

Este guia assume que você nunca rodou um projeto Python "de API" antes —
vai passo a passo, com os comandos exatos.

## ⚠️ Antes de tudo: tire a pasta do OneDrive

Pelas notas do projeto, a rede da A&M e o OneDrive já causaram problema
com o Streamlit antes. Salve a pasta `backend` **fora de qualquer pasta
sincronizada pelo OneDrive** — por exemplo, direto em `C:\Users\SeuUsuario\backend`,
ao lado de onde está o projeto Streamlit atual (`ProcurementAi-main`).

Se você já extraiu dentro de `OneDrive - Alvarez and Marsal\...`, mova a
pasta inteira para fora antes de continuar.

## 0. Pré-requisitos

Você já tem Python instalado (vocês usam Python 3.14, conforme o projeto
Streamlit atual). Vamos usar o mesmo Python.

## 1. Baixe a pasta `backend` inteira

Salve a pasta `backend` (com a subpasta `app` dentro) em algum lugar da
sua máquina — por exemplo, ao lado da pasta do projeto Streamlit atual,
**fora do OneDrive** (mesma regra que vocês já seguem hoje).

A estrutura deve ficar assim:
```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py
│   ├── config.py
│   ├── estudo.py
│   ├── pipeline.py
│   ├── ia.py
│   ├── leitura.py
│   ├── erros.py
│   ├── sessions.py
│   ├── schemas.py
│   ├── etapa1.py ... etapa8.py
│   └── etapa4b.py
├── requirements.txt
└── .env.example
```

## 2. Abra o terminal na pasta `backend`

No Windows: abra a pasta `backend` no Explorador de Arquivos, clique na
barra de endereço, digite `cmd` e aperte Enter. Isso abre um terminal já
dentro da pasta certa.

## 3. Crie um ambiente virtual (recomendado, evita conflito com outros projetos)

```
python -m venv venv
```

Ative o ambiente:

- Windows: `venv\Scripts\activate`
- Mac/Linux: `source venv/bin/activate`

Você vai ver `(venv)` aparecer no começo da linha do terminal — isso
confirma que está ativo.

## 4. Instale as dependências

```
python -m pip install -r requirements.txt
```

Isso vai baixar e instalar tudo que o backend precisa (FastAPI, Anthropic,
python-docx, openpyxl, pdfplumber, etc). Pode levar alguns minutos na
primeira vez.

## 5. Configure sua chave da API do Claude

Copie o arquivo `.env.example` e renomeie a cópia para `.env` (sem o
".example" no final).

Abra o arquivo `.env` num editor de texto simples (Bloco de Notas serve) e
troque o texto de exemplo pela sua chave real:

```
ANTHROPIC_API_KEY=sk-ant-sua-chave-real-aqui
```

Salve o arquivo.

**Importante:** a forma mais simples de garantir que o servidor lê essa
chave é definir a variável de ambiente diretamente no terminal antes de
rodar o servidor (passo 6). Se preferir não usar arquivo `.env`, pode
pular esta etapa e usar o comando do passo 6 que já inclui a chave.

## 6. Rode o servidor

**Windows (cmd):**
```
set ANTHROPIC_API_KEY=sk-ant-sua-chave-real-aqui
python -m uvicorn app.main:app --reload --port 8000
```

**Mac/Linux:**
```
export ANTHROPIC_API_KEY=sk-ant-sua-chave-real-aqui
python -m uvicorn app.main:app --reload --port 8000
```

Se tudo der certo, vai aparecer algo como:
```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete.
```

**Deixe esse terminal aberto** — é o servidor rodando. Fechar a janela
desliga o backend.

## 7. Confirme que está funcionando

Abra o navegador e acesse:

```
http://127.0.0.1:8000/health
```

Deve aparecer algo como `{"status":"ok","sessoes_ativas":0}`.

Você também pode acessar `http://127.0.0.1:8000/docs` — isso abre uma
página interativa (gerada automaticamente pelo FastAPI) onde dá pra ver
e testar cada rota da API sem precisar do frontend ainda.

## O que fazer se algo der errado

- **"python não é reconhecido como um comando"**: o Python não está no
  PATH do Windows. Reinstale o Python marcando a opção "Add Python to
  PATH" durante a instalação.
- **Erro ao instalar alguma dependência**: confirme que o ambiente virtual
  está ativo (deve aparecer `(venv)` no terminal) e tente de novo.
- **Erro mencionando "Meson", "vswhere.exe" ou "Visual Studio Build Tools"
  ao instalar o pandas**: isso significa que o pip tentou compilar uma
  versão do pandas que não tem binário pronto para a sua versão de Python.
  O `requirements.txt` já foi ajustado para evitar isso (usa `pandas>=2.3`
  em vez de uma versão exata antiga) — confirme que está usando a versão
  mais recente deste arquivo. Se o erro persistir, rode
  `python -m pip install --upgrade pip` antes de instalar de novo.
- **"Chave da API do Claude inválida ou expirada"** ao usar o frontend:
  confirme que a variável `ANTHROPIC_API_KEY` foi definida no MESMO
  terminal onde você rodou o `uvicorn` (ela não persiste se você fechar
  e abrir um terminal novo sem definir de novo).
- **Porta 8000 já em uso**: troque `--port 8000` por outra porta, como
  `--port 8001`, no comando do passo 6 (e lembre de atualizar a URL que o
  frontend usa para falar com o backend, quando chegarmos lá).

## Próximo passo

Com o backend rodando, o próximo passo é o frontend (React), que vai se
conectar a esse `http://127.0.0.1:8000` para mostrar as telas e enviar
os documentos, cliques de confirmação, etc.

## Sobre os PPTs (Etapas 5, 7 e 8)

Esta versão já inclui a geração de PowerPoint no padrão visual A&M, além
de Word e Excel. Isso usa um motor de apresentações próprio (pasta
`app/ppt_engine/`, com o `Template_Base.pptx` institucional embutido) —
não precisa de nenhuma configuração extra, já vem pronto para uso dentro
da pasta `backend`.

