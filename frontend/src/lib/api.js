// lib/api.js — ponto único de comunicação com o backend.
//
// Se a URL ou porta do backend mudar, este é o único lugar que precisa
// ser editado. Lê de uma variável de ambiente (VITE_API_URL) com um
// valor padrão razoável para desenvolvimento local.

import axios from "axios";

export const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export const api = axios.create({
  baseURL: API_URL,
});

// Extrai uma mensagem de erro legível de qualquer resposta de erro da API.
// O backend sempre devolve { detail: "..." } nos erros (ver main.py),
// então isso cobre os casos esperados. Os casos de rede são distinguidos:
//   ECONNABORTED → timeout (upload demorou demais)
//   ERR_NETWORK  → conexão perdida (servidor derrubou a conexão) ou servidor offline
//   outros       → mensagem genérica do axios
export function extrairMensagemErro(error, contexto) {
  if (error?.response?.data?.detail) {
    return error.response.data.detail;
  }
  if (error?.code === "ECONNABORTED") {
    if (contexto === "upload") {
      return "O servidor demorou para processar os arquivos. Tente novamente — se persistir, envie menos arquivos por vez.";
    }
    return "O servidor demorou para responder. Tente novamente.";
  }
  if (error?.code === "ERR_NETWORK") {
    if (contexto === "upload") {
      return "Falha na comunicação durante o upload. Verifique se o backend está rodando e tente novamente.";
    }
    return "Não foi possível conectar ao servidor. Confirme que o backend está rodando em " + API_URL + ".";
  }
  return error?.message || "Ocorreu um erro inesperado.";
}

// ---------------------------------------------------------------------------
// Sessão
// ---------------------------------------------------------------------------

export async function criarSessao() {
  const { data } = await api.post("/sessoes");
  return data.session_id;
}

export async function obterEstadoSessao(sessionId) {
  const { data } = await api.get(`/sessoes/${sessionId}`);
  return data;
}

// ---------------------------------------------------------------------------
// Pipeline (metadados das 8 etapas)
// ---------------------------------------------------------------------------

export async function listarPipeline() {
  const { data } = await api.get("/pipeline");
  return data;
}

// ---------------------------------------------------------------------------
// Etapa 1 — upload e classificação
// ---------------------------------------------------------------------------

export async function uploadEtapa1(sessionId, arquivos) {
  const formData = new FormData();
  for (const arquivo of arquivos) {
    formData.append("arquivos", arquivo);
  }
  // Timeout de 10 minutos: o backend lê e parseia todos os arquivos (pandas/
  // pdfplumber) e depois chama a IA para classificá-los — com muitos arquivos
  // grandes isso pode demorar alguns minutos. Sem timeout longo o axios usaria
  // o padrão (0 = infinito), mas o browser pode encerrar a conexão antes.
  const { data } = await api.post(
    `/sessoes/${sessionId}/etapa1/upload`,
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 600_000,
    }
  );
  return data;
}

export async function chatEtapa1(sessionId, mensagem) {
  const { data } = await api.post(`/sessoes/${sessionId}/etapa1/chat`, { mensagem });
  return data;
}

export async function resumoExecutivoEtapa1(sessionId) {
  const { data } = await api.get(`/sessoes/${sessionId}/etapa1/resumo-executivo`);
  return data;
}

export async function cenarioAtualEtapa1(sessionId) {
  const { data } = await api.get(`/sessoes/${sessionId}/etapa1/cenario-atual`);
  return data;
}

export async function proponentesEtapa1(sessionId) {
  const { data } = await api.get(`/sessoes/${sessionId}/etapa1/proponentes`);
  return data;
}

export async function pontosAtencaoEtapa1(sessionId) {
  const { data } = await api.get(`/sessoes/${sessionId}/etapa1/pontos-atencao`);
  return data;
}

// ---------------------------------------------------------------------------
// Etapa 2 — baseline (+ checkpoint condicional de anualização)
// ---------------------------------------------------------------------------

export async function rodarEtapa2(sessionId) {
  const { data } = await api.post(`/sessoes/${sessionId}/etapa2/rodar`);
  return data;
}

export async function resumoExecutivoEtapa2(sessionId) {
  const { data } = await api.get(`/sessoes/${sessionId}/etapa2/resumo-executivo`);
  return data;
}

export async function detalheEtapa2(sessionId) {
  const { data } = await api.get(`/sessoes/${sessionId}/etapa2/detalhe`);
  return data;
}

export async function confirmarAnualizacao(sessionId, periodo) {
  const { data } = await api.post(`/sessoes/${sessionId}/etapa2/confirmar-anualizacao`, { periodo });
  return data;
}

// ---------------------------------------------------------------------------
// Etapa 3
// ---------------------------------------------------------------------------

export async function rodarEtapa3(sessionId) {
  const { data } = await api.post(`/sessoes/${sessionId}/etapa3/rodar`);
  return data;
}

export async function consultarRequisitosEtapa3(sessionId, { pagina = 1, tamanhoPagina = 20, busca = "", status = null, ordenarPor = "id", direcao = "asc" } = {}) {
  const { data } = await api.get(`/sessoes/${sessionId}/etapa3/requisitos`, {
    params: { pagina, tamanho_pagina: tamanhoPagina, busca, status, ordenar_por: ordenarPor, direcao },
  });
  return data;
}

export async function resumoExecutivoEtapa3(sessionId) {
  const { data } = await api.get(`/sessoes/${sessionId}/etapa3/resumo-executivo`);
  return data;
}

export async function deltaEscopoEtapa3(sessionId) {
  const { data } = await api.get(`/sessoes/${sessionId}/etapa3/delta-escopo`);
  return data;
}

// ---------------------------------------------------------------------------
// Etapa 4 e 4B
// ---------------------------------------------------------------------------

export async function rodarEtapa4(sessionId) {
  const { data } = await api.post(`/sessoes/${sessionId}/etapa4/rodar`);
  return data;
}

export async function consultarPropostasEtapa4(sessionId, { pagina = 1, tamanhoPagina = 20, busca = "", status = null, ordenarPor = "fornecedor", direcao = "asc" } = {}) {
  const { data } = await api.get(`/sessoes/${sessionId}/etapa4/propostas`, {
    params: { pagina, tamanho_pagina: tamanhoPagina, busca, status, ordenar_por: ordenarPor, direcao },
  });
  return data;
}

export async function resumoExecutivoEtapa4(sessionId) {
  const { data } = await api.get(`/sessoes/${sessionId}/etapa4/resumo-executivo`);
  return data;
}

export async function detalheFornecedorEtapa4(sessionId, fornecedor) {
  const { data } = await api.get(`/sessoes/${sessionId}/etapa4/propostas/${encodeURIComponent(fornecedor)}`);
  return data;
}

export async function rodarEtapa4b(sessionId) {
  const { data } = await api.post(`/sessoes/${sessionId}/etapa4b/rodar`);
  return data;
}

// ---------------------------------------------------------------------------
// Etapa 5 (+ downloads)
// ---------------------------------------------------------------------------

export async function rodarEtapa5(sessionId) {
  const { data } = await api.post(`/sessoes/${sessionId}/etapa5/rodar`);
  return data;
}

export async function consultarComparacaoEtapa5(sessionId, { pagina = 1, tamanhoPagina = 20, busca = "", status = null, ordenarPor = "fornecedor", direcao = "asc" } = {}) {
  const { data } = await api.get(`/sessoes/${sessionId}/etapa5/fornecedores`, {
    params: { pagina, tamanho_pagina: tamanhoPagina, busca, status, ordenar_por: ordenarPor, direcao },
  });
  return data;
}

export async function resumoExecutivoEtapa5(sessionId) {
  const { data } = await api.get(`/sessoes/${sessionId}/etapa5/resumo-executivo`);
  return data;
}

export async function detalheFornecedorEtapa5(sessionId, fornecedor) {
  const { data } = await api.get(`/sessoes/${sessionId}/etapa5/fornecedores/${encodeURIComponent(fornecedor)}`);
  return data;
}

export function urlDownloadEtapa5Word(sessionId) {
  return `${API_URL}/sessoes/${sessionId}/etapa5/word`;
}

export function urlDownloadEtapa5Excel(sessionId) {
  return `${API_URL}/sessoes/${sessionId}/etapa5/excel`;
}

export function urlDownloadEtapa5Ppt(sessionId) {
  return `${API_URL}/sessoes/${sessionId}/etapa5/ppt`;
}

// ---------------------------------------------------------------------------
// Etapa 6 — checkpoint de taxa/moeda
// ---------------------------------------------------------------------------

export async function precisaCheckpointEtapa6(sessionId) {
  const { data } = await api.get(`/sessoes/${sessionId}/etapa6/precisa-checkpoint`);
  return data.precisa_checkpoint;
}

export async function confirmarCheckpointEtapa6(sessionId, taxaDesconto, regraMoeda) {
  const { data } = await api.post(`/sessoes/${sessionId}/etapa6/checkpoint`, {
    taxa_desconto: taxaDesconto,
    regra_moeda: regraMoeda,
  });
  return data;
}

export async function rodarEtapa6(sessionId) {
  const { data } = await api.post(`/sessoes/${sessionId}/etapa6/rodar`);
  return data;
}

export async function consultarEqualizacaoEtapa6(sessionId, { pagina = 1, tamanhoPagina = 20, busca = "", status = null, ordenarPor = "preco", direcao = "asc" } = {}) {
  const { data } = await api.get(`/sessoes/${sessionId}/etapa6/fornecedores`, {
    params: { pagina, tamanho_pagina: tamanhoPagina, busca, status, ordenar_por: ordenarPor, direcao },
  });
  return data;
}

export async function resumoExecutivoEtapa6(sessionId) {
  const { data } = await api.get(`/sessoes/${sessionId}/etapa6/resumo-executivo`);
  return data;
}

export async function detalheFornecedorEtapa6(sessionId, fornecedor) {
  const { data } = await api.get(`/sessoes/${sessionId}/etapa6/fornecedores/${encodeURIComponent(fornecedor)}`);
  return data;
}

export function urlDownloadEtapa6Word(sessionId) {
  return `${API_URL}/sessoes/${sessionId}/etapa6/word`;
}

export function urlDownloadEtapa6Excel(sessionId) {
  return `${API_URL}/sessoes/${sessionId}/etapa6/excel`;
}

export function urlDownloadEtapa6Ppt(sessionId) {
  return `${API_URL}/sessoes/${sessionId}/etapa6/ppt`;
}

// ---------------------------------------------------------------------------
// Etapa 7 (+ downloads)
// ---------------------------------------------------------------------------

export async function rodarEtapa7(sessionId) {
  const { data } = await api.post(`/sessoes/${sessionId}/etapa7/rodar`);
  return data;
}

export async function resumoExecutivoEtapa7(sessionId) {
  const { data } = await api.get(`/sessoes/${sessionId}/etapa7/resumo-executivo`);
  return data;
}

export async function conteudoEtapa7(sessionId) {
  const { data } = await api.get(`/sessoes/${sessionId}/etapa7/conteudo`);
  return data;
}

export function urlDownloadEtapa7Word(sessionId) {
  return `${API_URL}/sessoes/${sessionId}/etapa7/word`;
}

export function urlDownloadEtapa7Excel(sessionId) {
  return `${API_URL}/sessoes/${sessionId}/etapa7/excel`;
}

export function urlDownloadEtapa7Ppt(sessionId) {
  return `${API_URL}/sessoes/${sessionId}/etapa7/ppt`;
}

// ---------------------------------------------------------------------------
// Correção genérica (etapas 2-8) e recascateamento
// ---------------------------------------------------------------------------

export async function corrigirEtapa(sessionId, numeroEtapa, correcao) {
  const { data } = await api.post(`/sessoes/${sessionId}/etapa/${numeroEtapa}/corrigir`, { correcao });
  return data;
}

export async function recascatearAPartirDe(sessionId, etapaInicial) {
  const { data } = await api.post(`/sessoes/${sessionId}/recascatear/${etapaInicial}`);
  return data;
}

export async function rodarEtapa8(sessionId, { categoriaManual, impactoManual, riscoManual } = {}) {
  const { data } = await api.post(`/sessoes/${sessionId}/etapa8/rodar`, {
    categoria_manual: categoriaManual ?? null,
    impacto_manual: impactoManual ?? null,
    risco_manual: riscoManual ?? null,
  });
  return data;
}

export async function confirmarRiscoEtapa8(sessionId, risco) {
  const { data } = await api.post(`/sessoes/${sessionId}/etapa8/confirmar-risco`, { risco });
  return data;
}

export function urlDownloadEtapa8Word(sessionId) {
  return `${API_URL}/sessoes/${sessionId}/etapa8/word`;
}

export function urlDownloadEtapa8Excel(sessionId) {
  return `${API_URL}/sessoes/${sessionId}/etapa8/excel`;
}

export function urlDownloadEtapa8Ppt(sessionId) {
  return `${API_URL}/sessoes/${sessionId}/etapa8/ppt`;
}
