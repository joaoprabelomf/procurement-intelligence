import { useState, useEffect } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { History, FolderOpen, Plus, RefreshCw } from "lucide-react";
import TopBar from "../components/TopBar";
import Card from "../components/Card";
import Button from "../components/Button";
import { useSessao } from "../lib/SessaoContext";
import { listarEstudos, extrairMensagemErro } from "../lib/api";

const TOTAL_ETAPAS = 8;

function formatarData(isoString) {
  if (!isoString) return "—";
  try {
    return new Date(isoString).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function ProgressoEtapa({ etapa }) {
  const pct = Math.round(((etapa - 1) / TOTAL_ETAPAS) * 100);
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-1.5 bg-am-border rounded-full overflow-hidden">
        <div
          className="h-full bg-am-blue rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-am-text-secondary whitespace-nowrap">
        Etapa {etapa}/{TOTAL_ETAPAS}
      </span>
    </div>
  );
}

export default function Historico() {
  const { email, reabrirSessao } = useSessao();
  const navigate = useNavigate();
  const [estudos, setEstudos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  // Requer login (email definido no contexto)
  if (!email) {
    return <Navigate to="/login" replace />;
  }

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    setCarregando(true);
    setErro(null);
    try {
      const lista = await listarEstudos();
      setEstudos(lista);
    } catch (err) {
      setErro(extrairMensagemErro(err));
    } finally {
      setCarregando(false);
    }
  }

  function handleReabrir(estudo) {
    reabrirSessao(estudo.session_id, email);
    navigate("/cascata", { state: { reabrindo: true } });
  }

  function handleNovoEstudo() {
    navigate("/upload");
  }

  const subtitulo =
    estudos.length === 0 && !carregando
      ? "Nenhum estudo salvo ainda"
      : `${estudos.length} estudo${estudos.length !== 1 ? "s" : ""} salvo${estudos.length !== 1 ? "s" : ""}`;

  return (
    <div className="min-h-screen bg-am-bg p-5">
      <div className="max-w-4xl mx-auto">
        <TopBar />

        <Card
          title="Histórico de estudos"
          subtitle={subtitulo}
          className="mt-2"
        >
          {/* Barra de ações */}
          <div className="flex items-center justify-between mb-4">
            <Button variant="ghost" size="sm" icon={RefreshCw} onClick={carregar} disabled={carregando}>
              Atualizar
            </Button>
            <Button variant="primary" size="sm" icon={Plus} onClick={handleNovoEstudo}>
              Novo estudo
            </Button>
          </div>

          {/* Estado de carregamento */}
          {carregando && (
            <div className="py-10 text-center text-sm text-am-text-secondary">
              Carregando estudos…
            </div>
          )}

          {/* Erro */}
          {erro && !carregando && (
            <div className="py-6 text-center text-sm text-am-danger">{erro}</div>
          )}

          {/* Lista vazia */}
          {!carregando && !erro && estudos.length === 0 && (
            <div className="py-12 flex flex-col items-center gap-3 text-am-text-secondary">
              <History size={36} className="text-am-border-strong" />
              <p className="text-sm font-medium">Nenhum estudo salvo ainda</p>
              <p className="text-xs">Inicie um novo estudo para que ele apareça aqui.</p>
              <Button variant="secondary" size="sm" icon={Plus} onClick={handleNovoEstudo} className="mt-2">
                Iniciar primeiro estudo
              </Button>
            </div>
          )}

          {/* Tabela de estudos */}
          {!carregando && !erro && estudos.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-am-border">
                    <th className="text-left text-xs font-semibold text-am-text-secondary py-2 pr-4 w-[30%]">
                      Cliente / Estudo
                    </th>
                    <th className="text-left text-xs font-semibold text-am-text-secondary py-2 pr-4 w-[20%]">
                      Categoria
                    </th>
                    <th className="text-left text-xs font-semibold text-am-text-secondary py-2 pr-4 w-[20%]">
                      Progresso
                    </th>
                    <th className="text-left text-xs font-semibold text-am-text-secondary py-2 pr-4 w-[20%]">
                      Última atualização
                    </th>
                    <th className="py-2 w-[10%]" />
                  </tr>
                </thead>
                <tbody>
                  {estudos.map((estudo) => (
                    <tr
                      key={estudo.session_id}
                      className="border-b border-am-border last:border-0 hover:bg-am-bg transition-colors"
                    >
                      <td className="py-3 pr-4">
                        <p className="font-medium text-am-navy truncate max-w-[200px]">
                          {estudo.cliente}
                        </p>
                        <p className="text-xs text-am-text-secondary font-mono">
                          {estudo.session_id.slice(0, 8)}…
                        </p>
                      </td>
                      <td className="py-3 pr-4">
                        {estudo.micro_categoria || estudo.categoria ? (
                          <>
                            <p className="text-am-text truncate max-w-[140px]">
                              {estudo.micro_categoria || "—"}
                            </p>
                            {estudo.categoria && (
                              <p className="text-xs text-am-text-secondary">{estudo.categoria}</p>
                            )}
                          </>
                        ) : (
                          <span className="text-am-text-secondary text-xs">Não classificado</span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <ProgressoEtapa etapa={estudo.etapa_atual} />
                      </td>
                      <td className="py-3 pr-4 text-xs text-am-text-secondary">
                        {formatarData(estudo.atualizado_em)}
                      </td>
                      <td className="py-3 text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={FolderOpen}
                          onClick={() => handleReabrir(estudo)}
                        >
                          Reabrir
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <p className="text-xs text-am-text-secondary text-center mt-4">
          Os estudos são salvos automaticamente a cada etapa concluída.
        </p>
      </div>
    </div>
  );
}
