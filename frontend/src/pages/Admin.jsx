import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { UserPlus, RefreshCw, ShieldOff, Copy, Check } from "lucide-react";
import TopBar from "../components/TopBar";
import Card from "../components/Card";
import Button from "../components/Button";
import {
  adminCriarUsuario,
  adminListarUsuarios,
  adminDesativarUsuario,
  extrairMensagemErro,
  getTokenPayload,
} from "../lib/api";

function formatarData(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return "—"; }
}

export default function Admin() {
  const navigate = useNavigate();
  const payload = getTokenPayload();

  // Redireciona se não for admin
  if (!payload || payload.papel !== "admin") {
    return (
      <div className="min-h-screen bg-am-bg p-5 flex items-center justify-center">
        <p className="text-am-danger font-medium">Acesso restrito a administradores.</p>
      </div>
    );
  }

  const [emailNovo, setEmailNovo] = useState("");
  const [criando, setCriando] = useState(false);
  const [erroCriacao, setErroCriacao] = useState(null);
  const [senhaCriada, setSenhaCriada] = useState(null); // { email, senha_temporaria }
  const [copiado, setCopiado] = useState(false);

  const [usuarios, setUsuarios] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erroLista, setErroLista] = useState(null);
  const [desativando, setDesativando] = useState(null); // ID em processo

  useEffect(() => { carregarUsuarios(); }, []);

  async function carregarUsuarios() {
    setCarregando(true);
    setErroLista(null);
    try {
      setUsuarios(await adminListarUsuarios());
    } catch (err) {
      setErroLista(extrairMensagemErro(err));
    } finally {
      setCarregando(false);
    }
  }

  async function handleCriar(e) {
    e.preventDefault();
    if (!emailNovo.trim()) return;
    setCriando(true);
    setErroCriacao(null);
    setSenhaCriada(null);
    try {
      const resultado = await adminCriarUsuario(emailNovo.trim());
      setSenhaCriada({ email: resultado.email, senha: resultado.senha_temporaria });
      setEmailNovo("");
      await carregarUsuarios();
    } catch (err) {
      setErroCriacao(extrairMensagemErro(err));
    } finally {
      setCriando(false);
    }
  }

  async function handleDesativar(id) {
    setDesativando(id);
    try {
      await adminDesativarUsuario(id);
      await carregarUsuarios();
    } catch (err) {
      alert(extrairMensagemErro(err));
    } finally {
      setDesativando(null);
    }
  }

  async function handleCopiarSenha() {
    if (!senhaCriada) return;
    await navigator.clipboard.writeText(senhaCriada.senha);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <div className="min-h-screen bg-am-bg p-5">
      <div className="max-w-3xl mx-auto">
        <TopBar caso="Administração" />

        {/* Criar usuário */}
        <Card title="Criar novo usuário" subtitle="O sistema gera uma senha temporária — repasse-a ao usuário">
          <form onSubmit={handleCriar} className="flex gap-2">
            <input
              type="email"
              value={emailNovo}
              onChange={(e) => { setEmailNovo(e.target.value); setErroCriacao(null); }}
              placeholder="nome@alvarezandmarsal.com"
              className="flex-1 rounded-md border border-am-border-strong px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-am-blue/20 focus:border-am-blue"
              required
            />
            <Button type="submit" variant="primary" icon={UserPlus} disabled={criando}>
              {criando ? "Criando..." : "Criar usuário"}
            </Button>
          </form>

          {erroCriacao && (
            <p className="text-sm text-am-danger mt-3">{erroCriacao}</p>
          )}

          {senhaCriada && (
            <div className="mt-4 rounded-lg border border-am-blue/30 bg-am-blue/5 p-4">
              <p className="text-sm font-semibold text-am-navy mb-1">
                Usuário criado: {senhaCriada.email}
              </p>
              <p className="text-xs text-am-text-secondary mb-2">
                Copie a senha temporária abaixo e repasse ao usuário. Ela não será exibida novamente.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-white border border-am-border rounded px-3 py-2 text-sm font-mono tracking-wider text-am-navy">
                  {senhaCriada.senha}
                </code>
                <button
                  onClick={handleCopiarSenha}
                  title="Copiar senha"
                  className="p-2 rounded-md border border-am-border hover:border-am-blue text-am-text-secondary hover:text-am-blue transition"
                >
                  {copiado ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
                </button>
              </div>
            </div>
          )}
        </Card>

        {/* Lista de usuários */}
        <div className="mt-4">
          <Card>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-semibold text-am-navy">Usuários do time</p>
                <p className="text-xs text-am-text-secondary mt-0.5">
                  {carregando ? "Carregando..." : `${usuarios.length} usuário${usuarios.length !== 1 ? "s" : ""}`}
                </p>
              </div>
              <button onClick={carregarUsuarios} className="text-am-text-secondary hover:text-am-blue transition" title="Recarregar">
                <RefreshCw size={15} className={carregando ? "animate-spin" : ""} />
              </button>
            </div>
            {erroLista && <p className="text-sm text-am-danger">{erroLista}</p>}

            {!carregando && usuarios.length === 0 && !erroLista && (
              <p className="text-sm text-am-text-secondary">Nenhum usuário encontrado.</p>
            )}

            {usuarios.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-am-border text-am-text-secondary text-xs uppercase tracking-wide">
                      <th className="text-left py-2 pr-4">Email</th>
                      <th className="text-left py-2 pr-4">Papel</th>
                      <th className="text-left py-2 pr-4">Status</th>
                      <th className="text-left py-2 pr-4">Criado em</th>
                      <th className="py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {usuarios.map((u) => (
                      <tr key={u.id} className="border-b border-am-border last:border-0">
                        <td className="py-2.5 pr-4 text-am-text">{u.email}</td>
                        <td className="py-2.5 pr-4">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            u.papel === "admin"
                              ? "bg-am-navy/10 text-am-navy"
                              : "bg-am-border text-am-text-secondary"
                          }`}>
                            {u.papel}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4">
                          <span className={`text-xs font-medium ${u.ativo ? "text-green-700" : "text-am-text-secondary"}`}>
                            {u.ativo ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 text-am-text-secondary text-xs">{formatarData(u.criado_em)}</td>
                        <td className="py-2.5">
                          {u.ativo && u.papel !== "admin" && (
                            <button
                              onClick={() => handleDesativar(u.id)}
                              disabled={desativando === u.id}
                              title="Desativar usuário"
                              className="text-am-text-secondary hover:text-am-danger transition disabled:opacity-40"
                            >
                              <ShieldOff size={15} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
