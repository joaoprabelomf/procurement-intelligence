import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { History, FolderOpen, Plus, RefreshCw, Archive, ArchiveRestore } from "lucide-react";
import TopBar from "../components/TopBar";
import Card from "../components/Card";
import Button from "../components/Button";
import { useSessao } from "../lib/SessaoContext";
import {
  listarEstudos,
  extrairMensagemErro,
  arquivarEstudo,
  desarquivarEstudo,
  getTokenPayload,
} from "../lib/api";

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
  const [mostrarArquivados, setMostrarArquivados] = useState(false);
  const [acaoEmAndamento, setAcaoEmAndamento] = useState(null);

  const isAdmin = getTokenPayload()?.papel === "admin";

  useEffect(() => {
    carregar();
  }, [mostrarArquivados]); // eslint-disable-line react-hooks/exhaustive-deps

  async function carregar() {
    setCarregando(true);
    setErro(null);
    try {
      const lista = await listarEstudos(mostrarArquivados);
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

  async function handleArquivar(estudo) {
    setAcaoEmAndamento(estudo.session_id);
    setErro(null);
    try {
      await arquivarEstudo(estudo.session_id);
      await carregar();
    } catch (err) {
      setErro(extrairMensagemErro(err));
    } finally {
      setAcaoEmAndamento(null);
    }
  }

  async function handleDesarquivar(estudo) {
    setAcaoEmAndamento(estudo.session_id);
    setErro(null);
    try {
      await desarquivarEstudo(estudo.session_id);
      await carregar();
    } catch (err) {
      setErro(extrairMensagemErro(err));
    } finally {
      setAcaoEmAndamento(null);
    }
  }

  function handleNovoEstudo() {
    navigate("/upload");
  }

  const subtitulo =
    estudos.length === 0 && !carregando
      ? mostrarArquivados
        ? "Nenhum estudo arquivado"
        : "Nenhum estudo salvo ainda"
      : mostrarArquivados
      ? `${estudos.length} estudo${estudos.length !== 1 ? "s" : ""} arquivado${estudos.length !== 1 ? "s" : ""}`
      : `${estudos.length} estudo${estudos.length !== 1 ? "s" : ""} salvo${estudos.length !== 1 ? "s" : ""}`;

  return (
    <div className="min-h-screen bg-am-bg p-5">
      <div className="max-w-4xl mx-auto">
        <TopBar />

        <Card
          title={mostrarArquivados ? "Estudos arquivados" : "Histórico de estudos"}
          subtitle={subtitulo}
          className="mt-2"
        >
          {/* Barra de ações */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" icon={RefreshCw} onClick={carregar} disabled={carregando}>
                Atualizar
              </Button>
              {isAdmin && (
                <Button
                  variant={mostrarArquivados ? "secondary" : "ghost"}
                  size="sm"
                  icon={Archive}
                  onClick={() => setMostrarArquivados(!mostrarArquivados)}
                >
                  {mostrarArquivados ? "Ver ativos" : "Ver arquivados"}
                </Button>
              )}
            </div>
            {!mostrarArquivados && (
              <Button variant="primary" size="sm" icon={Plus} onClick={handleNovoEstudo}>
                Novo estudo
              </Button>
            )}
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
              {mostrarArquivados ? (
                <>
                  <Archive size={36} className="text-am-border-strong" />
                  <p className="text-sm font-medium">Nenhum estudo arquivado</p>
                  <p className="text-xs">Arquive um estudo para que ele apareça aqui.</p>
                </>
              ) : (
                <>
                  <History size={36} className="text-am-border-strong" />
                  <p className="text-sm font-medium">Nenhum estudo salvo ainda</p>
                  <p className="text-xs">Inicie um novo estudo para que ele apareça aqui.</p>
                  <Button variant="secondary" size="sm" icon={Plus} onClick={handleNovoEstudo} className="mt-2">
                    Iniciar primeiro estudo
                  </Button>
                </>
              )}
            </div>
          )}

          {/* Tabela de estudos */}
          {!carregando && !erro && estudos.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-am-border">
                    <th className="text-left text-xs font-semibold text-am-text-secondary py-2 pr-4 w-[28%]">
                      Cliente / Estudo
                    </th>
                    <th className="text-left text-xs font-semibold text-am-text-secondary py-2 pr-4 w-[20%]">
                      Categoria
                    </th>
                    <th className="text-left text-xs font-semibold text-am-text-secondary py-2 pr-4 w-[18%]">
                      Progresso
                    </th>
                    <th className="text-left text-xs font-semibold text-am-text-secondary py-2 pr-4 w-[18%]">
                      Última atualização
                    </th>
                    <th className="py-2 w-[16%]" />
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
                      <td className="py-3">
                        <div className="flex items-center justify-end gap-1.5 flex-nowrap">
                          {/* Reabrir: só na view ativa */}
                          {!mostrarArquivados && (
                            <Button
                              variant="secondary"
                              size="sm"
                              icon={FolderOpen}
                              onClick={() => handleReabrir(estudo)}
                            >
                              Reabrir
                            </Button>
                          )}
                          {/* Arquivar: admin na view ativa (ícone sem texto para caber) */}
                          {isAdmin && !mostrarArquivados && (
                            <Button
                              variant="ghost"
                              size="sm"
                              icon={Archive}
                              title="Arquivar estudo"
                              onClick={() => handleArquivar(estudo)}
                              disabled={acaoEmAndamento === estudo.session_id}
                            />
                          )}
                          {/* Restaurar: admin na view de arquivados */}
                          {isAdmin && mostrarArquivados && (
                            <Button
                              variant="ghost"
                              size="sm"
                              icon={ArchiveRestore}
                              onClick={() => handleDesarquivar(estudo)}
                              disabled={acaoEmAndamento === estudo.session_id}
                            >
                              Restaurar
                            </Button>
                          )}
                        </div>
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
