import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  History, FolderOpen, Plus, RefreshCw,
  Archive, ArchiveRestore, Trash2, TriangleAlert, X,
} from "lucide-react";
import TopBar from "../components/TopBar";
import Card from "../components/Card";
import Button from "../components/Button";
import { useSessao } from "../lib/SessaoContext";
import {
  listarEstudos,
  extrairMensagemErro,
  arquivarEstudo,
  desarquivarEstudo,
  apagarEstudo,
  getTokenPayload,
} from "../lib/api";

const TOTAL_ETAPAS = 8;
const CATEGORIAS_MACRO = ["Serviço", "Material", "Commodity"];

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

  // Lista e estado geral
  const [estudos, setEstudos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [mostrarArquivados, setMostrarArquivados] = useState(false);
  const [acaoEmAndamento, setAcaoEmAndamento] = useState(null);
  const [estudoParaApagar, setEstudoParaApagar] = useState(null);

  // Filtros — texto do cliente tem debounce separado para não disparar a cada letra
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [filtroCliente, setFiltroCliente] = useState("");         // valor do input (imediato)
  const [filtroClienteQuery, setFiltroClienteQuery] = useState(""); // valor enviado ao backend (debounced)
  const [filtroDataDe, setFiltroDataDe] = useState("");
  const [filtroDataAte, setFiltroDataAte] = useState("");
  const debounceRef = useRef(null);

  const isAdmin = getTokenPayload()?.papel === "admin";
  const temFiltrosAtivos = filtroCategoria || filtroCliente || filtroDataDe || filtroDataAte;

  // Rebusca quando muda o modo (ativo/arquivado) ou qualquer filtro confirmado
  useEffect(() => {
    carregar();
  }, [mostrarArquivados, filtroCategoria, filtroClienteQuery, filtroDataDe, filtroDataAte]); // eslint-disable-line react-hooks/exhaustive-deps

  async function carregar() {
    setCarregando(true);
    setErro(null);
    try {
      const lista = await listarEstudos(mostrarArquivados, {
        categoria: filtroCategoria,
        cliente: filtroClienteQuery,
        dataDe: filtroDataDe,
        dataAte: filtroDataAte,
      });
      setEstudos(lista);
    } catch (err) {
      setErro(extrairMensagemErro(err));
    } finally {
      setCarregando(false);
    }
  }

  function handleClienteChange(val) {
    setFiltroCliente(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setFiltroClienteQuery(val), 400);
  }

  function limparFiltros() {
    clearTimeout(debounceRef.current);
    setFiltroCategoria("");
    setFiltroCliente("");
    setFiltroClienteQuery("");
    setFiltroDataDe("");
    setFiltroDataAte("");
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

  async function handleApagar(estudo) {
    setAcaoEmAndamento(estudo.session_id);
    setErro(null);
    try {
      await apagarEstudo(estudo.session_id);
      setEstudoParaApagar(null);
      await carregar();
    } catch (err) {
      setErro(extrairMensagemErro(err));
      setEstudoParaApagar(null);
    } finally {
      setAcaoEmAndamento(null);
    }
  }

  function handleFecharModal() {
    if (acaoEmAndamento) return;
    setEstudoParaApagar(null);
  }

  function handleNovoEstudo() {
    navigate("/upload");
  }

  const n = estudos.length;
  const subtitulo =
    n === 0 && !carregando
      ? mostrarArquivados
        ? "Nenhum estudo arquivado"
        : temFiltrosAtivos
        ? "Nenhum resultado para os filtros aplicados"
        : "Nenhum estudo salvo ainda"
      : mostrarArquivados
      ? `${n} estudo${n !== 1 ? "s" : ""} arquivado${n !== 1 ? "s" : ""}`
      : `${n} estudo${n !== 1 ? "s" : ""} salvo${n !== 1 ? "s" : ""}`;

  // Classe compartilhada para inputs/select da barra de filtros
  const inputCls =
    "text-xs border border-am-border rounded-md px-2 py-1.5 bg-white text-am-text " +
    "placeholder:text-am-text-secondary focus:outline-none focus:ring-1 focus:ring-am-blue";

  return (
    <div className="min-h-screen bg-am-bg p-5">
      <div className="max-w-4xl mx-auto">
        <TopBar />

        <Card
          title={mostrarArquivados ? "Estudos arquivados" : "Histórico de estudos"}
          subtitle={subtitulo}
          className="mt-2"
        >
          {/* ── Barra de ações ─────────────────────────────────────────── */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                icon={RefreshCw}
                onClick={carregar}
                disabled={carregando}
              >
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

          {/* ── Barra de filtros ───────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2 p-3 mb-4 bg-am-bg border border-am-border rounded-lg">
            {/* Categoria macro */}
            <select
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value)}
              className={inputCls}
            >
              <option value="">Todas as categorias</option>
              {CATEGORIAS_MACRO.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>

            {/* Busca por cliente */}
            <input
              type="text"
              placeholder="Buscar por cliente…"
              value={filtroCliente}
              onChange={(e) => handleClienteChange(e.target.value)}
              className={`${inputCls} min-w-[160px] flex-1`}
            />

            {/* Período de datas */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-am-text-secondary">De</span>
              <input
                type="date"
                value={filtroDataDe}
                onChange={(e) => setFiltroDataDe(e.target.value)}
                className={inputCls}
              />
              <span className="text-xs text-am-text-secondary">até</span>
              <input
                type="date"
                value={filtroDataAte}
                onChange={(e) => setFiltroDataAte(e.target.value)}
                className={inputCls}
              />
            </div>

            {/* Limpar filtros — só aparece quando há algo ativo */}
            {temFiltrosAtivos && (
              <button
                onClick={limparFiltros}
                className="flex items-center gap-1 text-xs text-am-blue hover:underline whitespace-nowrap"
              >
                <X size={12} />
                Limpar filtros
              </button>
            )}
          </div>

          {/* ── Carregando ─────────────────────────────────────────────── */}
          {carregando && (
            <div className="py-10 text-center text-sm text-am-text-secondary">
              Carregando estudos…
            </div>
          )}

          {/* ── Erro ───────────────────────────────────────────────────── */}
          {erro && !carregando && (
            <div className="py-6 text-center text-sm text-am-danger">{erro}</div>
          )}

          {/* ── Lista vazia ────────────────────────────────────────────── */}
          {!carregando && !erro && estudos.length === 0 && (
            <div className="py-12 flex flex-col items-center gap-3 text-am-text-secondary">
              {mostrarArquivados ? (
                <>
                  <Archive size={36} className="text-am-border-strong" />
                  <p className="text-sm font-medium">Nenhum estudo arquivado</p>
                  {!temFiltrosAtivos && (
                    <p className="text-xs">Arquive um estudo para que ele apareça aqui.</p>
                  )}
                </>
              ) : temFiltrosAtivos ? (
                <>
                  <History size={36} className="text-am-border-strong" />
                  <p className="text-sm font-medium">Nenhum resultado para os filtros aplicados</p>
                  <button
                    onClick={limparFiltros}
                    className="text-xs text-am-blue hover:underline flex items-center gap-1 mt-1"
                  >
                    <X size={12} />
                    Limpar filtros
                  </button>
                </>
              ) : (
                <>
                  <History size={36} className="text-am-border-strong" />
                  <p className="text-sm font-medium">Nenhum estudo salvo ainda</p>
                  <p className="text-xs">Inicie um novo estudo para que ele apareça aqui.</p>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={Plus}
                    onClick={handleNovoEstudo}
                    className="mt-2"
                  >
                    Iniciar primeiro estudo
                  </Button>
                </>
              )}
            </div>
          )}

          {/* ── Tabela de estudos ──────────────────────────────────────── */}
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
                              <p className="text-xs text-am-text-secondary">
                                {estudo.categoria}
                              </p>
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
                          {/* Apagar: admin na view de arquivados — abre modal */}
                          {isAdmin && mostrarArquivados && (
                            <Button
                              variant="ghost"
                              size="sm"
                              icon={Trash2}
                              title="Apagar definitivamente"
                              onClick={() => setEstudoParaApagar(estudo)}
                              disabled={acaoEmAndamento === estudo.session_id}
                              className="text-red-500 hover:text-red-700"
                            />
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

      {/* ── Modal de confirmação de exclusão permanente ─────────────────── */}
      {estudoParaApagar && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={handleFecharModal}
        >
          <div
            className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabeçalho */}
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0 mt-0.5 rounded-full bg-red-100 p-2">
                <TriangleAlert size={18} className="text-red-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-am-navy leading-snug">
                  Apagar estudo definitivamente?
                </h2>
                <p className="text-sm text-am-text-secondary mt-0.5 font-medium truncate">
                  {estudoParaApagar.cliente}
                </p>
              </div>
            </div>

            {/* Aviso */}
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 mb-5 text-sm text-red-800 leading-relaxed">
              <p>
                <strong>Esta ação não pode ser desfeita.</strong> O estudo será removido
                permanentemente e <strong>deixará de alimentar a memória do time</strong>{" "}
                — ele não aparecerá mais em benchmarks de preço, savings ou casos similares.
              </p>
              <p className="mt-2 text-xs text-red-600">
                Se não tiver certeza, clique em Cancelar e mantenha o estudo arquivado.
              </p>
            </div>

            {/* Ações */}
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleFecharModal}
                disabled={acaoEmAndamento === estudoParaApagar.session_id}
              >
                Cancelar
              </Button>
              <Button
                variant="danger"
                size="sm"
                icon={Trash2}
                onClick={() => handleApagar(estudoParaApagar)}
                disabled={acaoEmAndamento === estudoParaApagar.session_id}
              >
                {acaoEmAndamento === estudoParaApagar.session_id
                  ? "Apagando…"
                  : "Apagar definitivamente"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
