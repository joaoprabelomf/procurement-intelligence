import { createContext, useContext, useState, useCallback } from "react";
import {
  criarSessao as criarSessaoApi,
  obterEstadoSessao,
  fazerLogin,
  setStoredEmail,
  clearToken,
  clearStoredEmail,
  getStoredEmail,
} from "../lib/api";

const SessaoContext = createContext(null);

export function SessaoProvider({ children }) {
  const [sessionId, setSessionId] = useState(null);
  const [email, setEmail] = useState(() => getStoredEmail());
  const [estudo, setEstudo] = useState(null);

  // Autentica no backend e persiste o token + email no localStorage.
  // Não cria sessão de estudo — isso fica para criarSessaoDeEstudo().
  const iniciarSessao = useCallback(async (emailLogin, senha) => {
    await fazerLogin(emailLogin, senha);
    setStoredEmail(emailLogin);
    setEmail(emailLogin);
  }, []);

  // Cria uma nova sessão de estudo no backend (POST /sessoes).
  // Chamado no momento do upload, não no login.
  const criarSessaoDeEstudo = useCallback(async () => {
    const id = await criarSessaoApi();
    setSessionId(id);
    return id;
  }, []);

  // Reabre um estudo já existente no banco sem criar uma sessão nova.
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

  const logout = useCallback(() => {
    clearToken();
    clearStoredEmail();
    setSessionId(null);
    setEmail(null);
    setEstudo(null);
  }, []);

  const encerrarSessao = useCallback(() => {
    setSessionId(null);
    setEmail(null);
    setEstudo(null);
  }, []);

  return (
    <SessaoContext.Provider
      value={{
        sessionId,
        email,
        estudo,
        iniciarSessao,
        criarSessaoDeEstudo,
        reabrirSessao,
        atualizarEstudo,
        logout,
        encerrarSessao,
      }}
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
