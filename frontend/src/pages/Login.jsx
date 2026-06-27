import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSessao } from "../lib/SessaoContext";
import { extrairMensagemErro } from "../lib/api";
import logoAm from "../assets/logo-am.png";
import skyline from "../assets/skyline.jpg";

function emailValido(valor) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erroEmail, setErroEmail] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erroServidor, setErroServidor] = useState(null);
  const { iniciarSessao } = useSessao();
  const navigate = useNavigate();

  async function autenticar(destino) {
    if (!emailValido(email)) {
      setErroEmail(true);
      return;
    }
    setErroEmail(false);
    setErroServidor(null);
    setCarregando(true);
    try {
      await iniciarSessao(email, senha);
      navigate(destino);
    } catch (err) {
      setErroServidor(extrairMensagemErro(err));
    } finally {
      setCarregando(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    autenticar("/upload");
  }

  function handleAbrirHistorico(e) {
    e.preventDefault();
    autenticar("/historico");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-am-bg p-6">
      <div className="w-full max-w-[880px] grid grid-cols-1 md:grid-cols-[1.1fr_1fr] bg-white rounded-xl overflow-hidden shadow-lg">

        <div
          className="relative bg-am-navy p-8 flex flex-col justify-between min-h-[200px] md:min-h-[460px]"
          style={{
            backgroundImage: `linear-gradient(135deg, rgba(0,36,74,0.55), rgba(0,36,74,0.85)), url(${skyline})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div>
            <img src={logoAm} alt="A&M" className="h-9 w-auto brightness-0 invert mb-1.5" />
            <p className="text-white text-sm font-semibold tracking-wide">A&amp;M</p>
          </div>
          <div>
            <p className="text-white text-sm font-semibold uppercase tracking-wider mb-1">
              leadership. action. results.
            </p>
            <p className="text-am-blue-light text-sm">Procurement Intelligence Platform</p>
          </div>
        </div>

        <div className="p-9 md:p-10 flex flex-col justify-center">
          <p className="text-lg font-semibold text-am-navy mb-1">Acessar plataforma</p>
          <p className="text-sm text-am-text-secondary mb-6">
            Analisador de Propostas
          </p>

          <form onSubmit={handleSubmit}>
            <div className="mb-3.5">
              <label className="block text-xs font-medium text-am-text-secondary mb-1.5">
                E-mail corporativo
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setErroEmail(false);
                }}
                placeholder="nome@alvarezandmarsal.com"
                className={`w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-am-blue/20 ${
                  erroEmail ? "border-am-danger" : "border-am-border-strong focus:border-am-blue"
                }`}
              />
              {erroEmail && (
                <p className="text-xs text-am-danger mt-1.5">
                  Informe um e-mail válido para continuar
                </p>
              )}
            </div>

            <div className="mb-5">
              <label className="block text-xs font-medium text-am-text-secondary mb-1.5">Senha</label>
              <input
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-md border border-am-border-strong px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-am-blue/20 focus:border-am-blue"
              />
            </div>

            {erroServidor && (
              <p className="text-xs text-am-danger mb-3">{erroServidor}</p>
            )}

            <button
              type="submit"
              disabled={carregando}
              className="w-full bg-am-navy text-white rounded-md py-2.5 text-sm font-semibold hover:bg-am-navy-light transition disabled:opacity-60"
            >
              {carregando ? "Entrando..." : "Entrar"}
            </button>

            <button
              type="button"
              onClick={handleAbrirHistorico}
              className="w-full mt-2 border border-am-border-strong text-am-navy rounded-md py-2.5 text-sm font-medium hover:bg-am-bg transition"
            >
              Ver estudos anteriores
            </button>
          </form>

          <p className="text-[11px] text-am-text-secondary text-center mt-4">
            Acesso restrito a colaboradores A&amp;M
          </p>
        </div>
      </div>
    </div>
  );
}
