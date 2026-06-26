# Procurement Intelligence — Frontend

Interface React do Analisador de Procurement, com a identidade visual
Alvarez & Marsal. Substitui a interface anterior em Streamlit.

Para instalar e rodar, siga o **COMO_RODAR.md** nesta mesma pasta —
ele tem o passo a passo completo, incluindo a instalação do Node.js.

## Estrutura

```
src/
├── pages/        — as 6 telas (Login, Upload, Cascata, 3 Resultados)
├── components/    — peças reutilizadas entre telas (Stepper, Card, etc.)
├── lib/
│   ├── api.js            — toda a comunicação com o backend
│   └── SessaoContext.jsx — estado da sessão (session_id, estudo)
└── assets/        — logo e foto institucional A&M
```

## Backend

Este frontend depende do backend (FastAPI) estar rodando em
`http://127.0.0.1:8000` (ou outro endereço configurado em `.env`).
Veja o `COMO_RODAR.md` do projeto `backend` para configurá-lo primeiro.
