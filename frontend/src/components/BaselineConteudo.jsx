import { useState, useEffect } from "react";
import { Send, Check, RefreshCw, Pencil, Wallet, Tag, AlertTriangle, Gauge } from "lucide-react";
import ReactMarkdown from "react-markdown";
import Button from "./Button";
import Card from "./Card";
import BadgeRAG from "./BadgeRAG";
import BadgeConfianca from "./BadgeConfianca";
import { resumoExecutivoEtapa2, detalheEtapa2 } from "../lib/api";

function formatarMoeda(valor) {
  if (valor == null) return "—";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// "Mini-app" da Etapa 2 (Cenário Atual / Baseline) — diferente das Etapas
// 4/5/6, NÃO há tabela aqui: só existe UM baseline, não uma lista de itens
// comparáveis entre si. A visão certa é cards de KPI + um painel de
// leitura única (Pareto, fatores de TCO, drivers de should-cost) — sem
// busca, filtro ou paginação, que não fariam sentido para um objeto só.
export default function BaselineConteudo({
  sessionId,
  casosConsultados = 0,
  benchmarkPreco = null,
  confiancaEtapa = null,
  onEnviarMensagem,
  onConfirmar,
  onRefazer,
  mostrarRefazer,
  carregandoRefazer,
}) {
  const [resumo, setResumo] = useState(null);
  const [detalhe, setDetalhe] = useState(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(true);
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [historico, setHistorico] = useState([]);
  const [chaveRecarregar, setChaveRecarregar] = useState(0);

  useEffect(() => {
    resumoExecutivoEtapa2(sessionId).then(setResumo);
    setCarregandoDetalhe(true);
    detalheEtapa2(sessionId).then(setDetalhe).finally(() => setCarregandoDetalhe(false));
  }, [sessionId, chaveRecarregar]);

  async function enviarMensagem(e) {
    e.preventDefault();
    if (!mensagem.trim()) return;
    const minhaMensagem = mensagem;
    setMensagem("");
    setHistorico((h) => [...h, { autor: "usuario", texto: minhaMensagem }]);
    setEnviando(true);
    try {
      const resp = await onEnviarMensagem(minhaMensagem);
      setHistorico((h) => [...h, { autor: "assistente", texto: resp.texto, tipo: resp.tipo }]);
      if (resp.tipo === "edicao") setChaveRecarregar((k) => k + 1);
    } catch (err) {
      setHistorico((h) => [...h, { autor: "assistente", texto: "Não consegui processar essa correção agora.", tipo: "erro" }]);
    } finally {
      setEnviando(false);
    }
  }

  const kpis = resumo ? [
    { label: "Gasto anual atual", valor: formatarMoeda(resumo.gasto_anual_total), icon: Wallet, cor: "text-am-navy" },
    { label: "Micro-categoria", valor: resumo.micro_categoria || "—", icon: Tag, cor: "text-am-blue" },
    { label: "Fatores de TCO não capturados", valor: resumo.n_fatores_tco, sub: resumo.n_fatores_tco_alta_relevancia ? `${resumo.n_fatores_tco_alta_relevancia} de alta relevância` : null, icon: AlertTriangle, cor: "text-am-alert" },
    { label: "Razoabilidade do modelo", valor: resumo.razoabilidade_modelo ? "Avaliada" : "—", icon: Gauge, cor: "text-am-blue" },
  ] : [];

  return (
    <div className="space-y-4">
      {(confiancaEtapa || casosConsultados > 0) && (
        <div className="flex flex-wrap gap-2">
          <BadgeConfianca confiancaEtapa={confiancaEtapa} />
          <BadgeRAG casosConsultados={casosConsultados} />
        </div>
      )}

      {resumo && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {kpis.map((item) => (
            <Card key={item.label} className="!shadow-card">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className="text-[11px] text-am-text-secondary mb-1.5">{item.label}</p>
                  <p className={`text-lg font-bold font-mono-num ${item.cor} break-words`}>{item.valor}</p>
                  {item.sub && <p className="text-[10px] text-am-text-secondary mt-1">{item.sub}</p>}
                </div>
                <item.icon size={16} className={`${item.cor} opacity-60 mt-0.5 shrink-0`} />
              </div>
            </Card>
          ))}
        </div>
      )}

      {benchmarkPreco && (
        <Card title="Contexto histórico do seu time">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] text-am-text-secondary mb-2">
                Com base em {benchmarkPreco.n} estudo(s) similar(es) da mesma categoria
              </p>
              {benchmarkPreco.label === "mediana" && (
                <div className="space-y-0.5">
                  <p className="text-sm text-am-text">
                    Mediana histórica:{" "}
                    <span className="font-bold text-am-navy">{formatarMoeda(benchmarkPreco.mediana)}</span>
                  </p>
                  <p className="text-xs text-am-text-secondary">
                    Faixa: {formatarMoeda(benchmarkPreco.minimo)} – {formatarMoeda(benchmarkPreco.maximo)}
                  </p>
                </div>
              )}
              {benchmarkPreco.label === "faixa" && (
                <p className="text-sm text-am-text">
                  Faixa de referência:{" "}
                  <span className="font-bold text-am-navy">
                    {formatarMoeda(benchmarkPreco.minimo)} – {formatarMoeda(benchmarkPreco.maximo)}
                  </span>
                </p>
              )}
              {benchmarkPreco.label === "referência" && (
                <p className="text-sm text-am-text">
                  Referência:{" "}
                  <span className="font-bold text-am-navy">{formatarMoeda(benchmarkPreco.minimo)}</span>
                </p>
              )}
            </div>
            {benchmarkPreco.desvio_pct_atual != null && (
              <div className="text-right shrink-0">
                <p className={`text-2xl font-bold font-mono-num ${benchmarkPreco.desvio_pct_atual > 0 ? "text-am-danger" : "text-am-positive"}`}>
                  {benchmarkPreco.desvio_pct_atual > 0 ? "+" : ""}{benchmarkPreco.desvio_pct_atual.toFixed(1)}%
                </p>
                <p className="text-[10px] text-am-text-secondary">
                  vs {benchmarkPreco.label} histórica
                </p>
              </div>
            )}
          </div>
        </Card>
      )}

      {carregandoDetalhe ? (
        <p className="text-sm text-am-text-secondary py-4 text-center">Carregando detalhe...</p>
      ) : detalhe && (
        <div className="space-y-3">
          {detalhe.retrato && (
            <Card title="Retrato do cenário atual">
              <p className="text-sm text-am-text leading-relaxed">{detalhe.retrato}</p>
            </Card>
          )}

          {detalhe.pareto && (
            <Card title="Onde está o dinheiro (Pareto)">
              <p className="text-sm text-am-text leading-relaxed mb-3">{detalhe.pareto}</p>
              {detalhe.valores_unitarios?.length > 0 && (
                <div className="space-y-1.5">
                  {detalhe.valores_unitarios.map((v, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-am-text w-40 truncate shrink-0">{v.item}</span>
                      <div className="flex-1 h-2 bg-am-bg rounded-full overflow-hidden">
                        <div
                          className="h-full bg-am-blue rounded-full"
                          style={{ width: `${v.share_percent ?? 0}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono-num text-am-text-secondary w-12 text-right shrink-0">
                        {v.share_percent != null ? `${v.share_percent}%` : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {detalhe.fatores_tco?.length > 0 && (
            <Card title="Fatores de TCO não capturados no preço atual">
              <div className="space-y-2">
                {detalhe.fatores_tco.map((f, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className={`text-[10px] font-medium uppercase px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${
                      f.relevancia === "alta" ? "bg-am-danger/10 text-am-danger" :
                      f.relevancia === "media" || f.relevancia === "média" ? "bg-am-alert/10 text-am-navy" :
                      "bg-am-bg text-am-text-secondary"
                    }`}>
                      {f.relevancia}
                    </span>
                    <div>
                      <span className="font-medium text-am-navy">{f.fator}</span>
                      <span className="text-am-text-secondary"> — {f.comentario}</span>
                    </div>
                  </div>
                ))}
              </div>
              {detalhe.ressalva_geral_tco && (
                <p className="text-xs text-am-text-secondary mt-3 italic">{detalhe.ressalva_geral_tco}</p>
              )}
            </Card>
          )}

          {detalhe.sintese_should_cost && (
            <Card title="Should-cost — razoabilidade do modelo">
              <p className="text-sm text-am-text leading-relaxed">{detalhe.sintese_should_cost}</p>
            </Card>
          )}
        </div>
      )}

      {historico.length > 0 && (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {historico.map((msg, idx) => (
            <div
              key={idx}
              className={`text-sm rounded-md px-3 py-2 max-w-[80%] ${
                msg.autor === "usuario" ? "bg-am-blue/10 text-am-text ml-auto" :
                msg.tipo === "esclarecimento" ? "bg-am-alert/10 text-am-navy" :
                msg.tipo === "edicao" ? "bg-am-positive/10 text-am-navy" :
                "bg-am-bg text-am-text"
              }`}
            >
              <ReactMarkdown>{msg.texto}</ReactMarkdown>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={enviarMensagem} className="flex gap-2">
        <input
          type="text"
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
          placeholder="Pergunte ou peça uma correção, ex: 'qual o fator de TCO mais relevante?'"
          className="flex-1 rounded-md border border-am-border-strong px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-am-blue/20 focus:border-am-blue"
          disabled={enviando}
        />
        <Button variant="secondary" size="md" icon={Send} disabled={enviando || !mensagem.trim()}>
          Enviar
        </Button>
      </form>

      <div className="flex items-center justify-between pt-2 border-t border-am-border">
        <p className="text-xs text-am-text-secondary flex items-center gap-1.5">
          <Pencil size={12} /> Pergunte sobre os dados ou peça correções
        </p>
        <div className="flex gap-2">
          {mostrarRefazer && (
            <Button
              variant="secondary" icon={RefreshCw} onClick={onRefazer} disabled={carregandoRefazer}
              className={carregandoRefazer ? "[&_svg]:animate-spin" : ""}
            >
              {carregandoRefazer ? "Refazendo..." : "Refazer análise"}
            </Button>
          )}
          {onConfirmar && (
            <Button variant="primary" icon={Check} onClick={onConfirmar}>
              Confirmar e seguir
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
