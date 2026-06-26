import { createContext, useContext, useState, useCallback } from "react";
import { criarSessao as criarSessaoApi, obterEstadoSessao } from "../lib/api";

const SessaoContext = createContext(null);

export function SessaoProvider({ children }) {
  const [sessionId, setSessionId] = useState(null);
  const [email, setEmail] = useState(null);
  const [estudo, setEstudo] = useState(null);

  const iniciarSessao = useCallback(async (emailLogin) => {
    const id = await criarSessaoApi();
    setSessionId(id);
    setEmail(emailLogin);
    return id;
  }, []);

  // Registra o email no contexto sem criar sessão — usado antes de ir ao histórico.
  const definirEmail = useCallback((emailLogin) => {
    setEmail(emailLogin);
  }, []);

  // Reabre um estudo já existente no banco sem criar uma sessão nova.
  // Chamado pela tela de histórico ao clicar em "Reabrir".
  const reabrirSessao = useCallback((id, emailLogin) => {
    setSessionId(id);
    if (emailLogin) setEmail(emailLogin);
  }, []);

  const atualizarEstudo = useCallback(async (id) => {
    const targetId = id || sessionId;
    if (!targetId) return null;
    const dados = await obterEstadoSessao(targetId);
    setEstudo(dados);
    return dados;
  }, [sessionId]);

  const encerrarSessao = useCallback(() => {
    setSessionId(null);
    setEmail(null);
    setEstudo(null);
  }, []);

  return (
    <SessaoContext.Provider
      value={{ sessionId, email, estudo, iniciarSessao, definirEmail, reabrirSessao, atualizarEstudo, encerrarSessao }}
    >
      {children}
    </SessaoContext.Provider>
  );
}

export function useSessao() {
  const ctx = useContext(SessaoContext);
  if (!ctx) {
    throw new Error("useSessao precisa ser usado dentro de um SessaoProvider");
  }
  return ctx;
}
