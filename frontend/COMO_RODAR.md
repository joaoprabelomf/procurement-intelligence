# Como rodar o frontend localmente

Este guia assume que você nunca instalou Node.js nem rodou um projeto
React antes — vai passo a passo, com os comandos exatos.

## ⚠️ Antes de tudo: tire a pasta do OneDrive

Mesma regra do backend — salve a pasta `frontend` **fora de qualquer
pasta sincronizada pelo OneDrive**. Ideal: ao lado da pasta `backend`,
por exemplo `C:\Users\SeuUsuario\frontend`.

## ⚠️ Atualizando de uma versão anterior?

Se você já tinha a pasta `frontend` rodando antes e está substituindo pelos
arquivos desta versão nova, **rode `npm install` de novo** antes de
`npm run dev` — esta versão adicionou bibliotecas novas:
- `react-markdown` (exibir corretamente os resumos de cada etapa)
- `@tanstack/react-virtual` (a nova tabela de Propostas, que escala a
  centenas de fornecedores sem travar o navegador)

## 0. Instale o Node.js

O frontend é construído em React, que precisa do Node.js para rodar
localmente (mesmo papel que o Python tem para o backend).

1. Acesse **https://nodejs.org**
2. Baixe a versão **LTS** (o botão da esquerda, marcado como recomendado
   para a maioria dos usuários — não a versão "Current")
3. Execute o instalador baixado e siga o assistente (próximo, próximo,
   instalar) — as opções padrão servem
4. Reinicie o terminal (ou o computador, se o terminal não reconhecer o
   comando depois)

Para confirmar que instalou corretamente, abra um terminal novo (`cmd`)
e rode:

```
node --version
npm --version
```

Devem aparecer números de versão (ex.: `v22.x.x` e `10.x.x`). Se aparecer
"não é reconhecido como um comando", reinicie o computador e tente de
novo — o instalador às vezes precisa disso para atualizar o PATH do
Windows.

## 1. Confirme que o backend está rodando

O frontend não funciona sozinho — ele depende do backend (que você já
configurou na entrega anterior) estar rodando em outro terminal, em
`http://127.0.0.1:8000`.

Abra `http://127.0.0.1:8000/health` no navegador. Se aparecer
`{"status":"ok",...}`, o backend está pronto. Se não aparecer, volte ao
`COMO_RODAR.md` do backend antes de continuar.

**Deixe o terminal do backend aberto** — você vai precisar de dois
terminais abertos ao mesmo tempo: um para o backend, outro para o
frontend.

## 2. Abra um terminal NOVO na pasta `frontend`

Mesmo processo do backend: abra a pasta `frontend` no Explorador de
Arquivos, clique na barra de endereço, digite `cmd`, Enter.

## 3. Instale as dependências

```
npm install
```

Isso vai baixar todas as bibliotecas que o projeto usa (React, Tailwind,
ícones, etc). Pode levar alguns minutos na primeira vez — é normal
aparecer um volume grande de texto na tela.

## 4. Rode o frontend

```
npm run dev
```

Se tudo der certo, vai aparecer algo como:

```
  VITE ready in 400 ms
  ➜  Local:   http://localhost:5173/
```

**Deixe esse terminal aberto também.**

## 5. Acesse no navegador

Abra:

```
http://localhost:5173/login
```

Você deve ver a tela de login com a identidade A&M (fundo com foto do
skyline, logo, campos de e-mail e senha).

Digite qualquer e-mail válido (ex.: `teste@alvarezandmarsal.com`) e
qualquer senha, clique em **Entrar** — isso ainda não confere senha de
verdade (combinado anteriormente: login simplificado por agora), mas já
cria uma sessão real no backend e te leva para a tela de upload de
documentos.

A partir daí, o fluxo completo está conectado: upload → classificação →
cascata das 8 etapas (com as pausas de confirmação) → telas de resultado
com os botões de exportar Word/Excel.

## O que fazer se algo der errado

- **A tela de login abre, mas dá erro ao clicar em "Entrar"**: confirme
  que o backend está rodando (`http://127.0.0.1:8000/health`). A
  mensagem de erro na tela deve indicar o motivo (ex.: "Não foi possível
  conectar ao servidor").
- **"Chave da API do Claude inválida ou expirada"** ao tentar classificar
  documentos: o backend está rodando, mas a chave configurada nele está
  errada — volte ao terminal do backend e confirme a chave (ver guia do
  backend).
- **Porta 5173 já em uso**: rode `npm run dev -- --port 5174` (ou outra
  porta livre) e acesse essa nova porta no navegador.
- **O backend está em outro endereço/porta** (não
  `http://127.0.0.1:8000`): copie `.env.example` para `.env` dentro da
  pasta `frontend` e edite a linha `VITE_API_URL=...` com o endereço
  correto. Pare o `npm run dev` (Ctrl+C) e rode de novo para a mudança
  valer.
- **Fontes parecem "genéricas" (não a fonte Inter)**: se a rede da A&M
  bloquear o Google Fonts (já aconteceu com outros serviços no projeto),
  o site continua funcionando normalmente, só usa a fonte padrão do
  Windows no lugar — isso não afeta nenhuma funcionalidade.

## Encerrando

Para parar o frontend ou o backend, clique no terminal correspondente e
aperte `Ctrl+C`. Para usar o sistema de novo depois, repita os passos 3
(backend) e 4 (frontend) — não precisa reinstalar nada, só rodar os
comandos de novo.
