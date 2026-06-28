import { useState, useEffect } from "react";
import { Send, Check, RefreshCw, Pencil, TrendingDown } from "lucide-react";
import ReactMarkdown from "react-markdown";
import Button from "./Button";
import Card from "./Card";
import DownloadBar from "./DownloadBar";
import KpisEqualizacao from "./KpisEqualizacao";
import TabelaEqualizacao from "./TabelaEqualizacao";
import { resumoExecutivoEtapa6, urlDownloadEtapa6Word, urlDownloadEtapa6Excel, urlDownloadEtapa6Ppt } from "../lib/api";

function formatarPct(valor) {
  if (valor == null) return "—";
  return `${valor.toFixed(1)}%`;
}

// "Mini-app" da Etapa 6 (Equalização Comercial) — mesmo padrão da Etapa 4
// (PropostasConteudo), com KPIs e colunas COMERCIAIS em vez de técnicas:
// baseline, quantidade de propostas, valor médio, melhor proposta (menor
// preço) — decisão do usuário ao revisar a tela.
export default function EqualizacaoConteudo({
  sessionId,
  benchmarkSavings = null,
  onEnviarMensagem,
  onConfirmar,
  onRefazer,
  mostrarRefazer,
  carregandoRefazer,
}) {
  const [resumo, setResumo] = useState(null);
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [historico, setHistorico] = useState([]);
  const [chaveRecarregar, setChaveRecarregar] = useState(0);

  useEffect(() => {
    resumoExecutivoEtapa6(sessionId).then(setResumo);
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
      if (resp.tipo === "edicao") {
        setChaveRecarregar((k) => k + 1);
      }
    } catch (err) {
      setHistorico((h) => [...h, { autor: "assistente", texto: "Não consegui processar essa correção agora.", tipo: "erro" }]);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-4">
      <KpisEqualizacao resumo={resumo} />

      {benchmarkSavings && (
        <Card title="Referência histórica de savings do seu time">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] text-am-text-secondary mb-2">
                Com base em {benchmarkSavings.n} estudo(s) similar(es) da mesma categoria
              </p>
              {benchmarkSavings.label === "mediana" && (
                <div className="space-y-0.5">
                  <p className="text-sm text-am-text">
                    Mediana histórica:{" "}
                    <span className="font-bold text-am-positive">{formatarPct(benchmarkSavings.mediana)}</span>
                  </p>
                  <p className="text-xs text-am-text-secondary">
                    Faixa: {formatarPct(benchmarkSavings.minimo)} – {formatarPct(benchmarkSavings.maximo)}
                  </p>
                </div>
              )}
              {benchmarkSavings.label === "faixa" && (
                <p className="text-sm text-am-text">
                  Faixa de referência:{" "}
                  <span className="font-bold text-am-positive">
                    {formatarPct(benchmarkSavings.minimo)} – {formatarPct(benchmarkSavings.maximo)}
                  </span>
                </p>
              )}
              {benchmarkSavings.label === "referência" && (
                <p className="text-sm text-am-text">
                  Referência:{" "}
                  <span className="font-bold text-am-positive">{formatarPct(benchmarkSavings.minimo)}</span>
                </p>
              )}
            </div>
            <TrendingDown size={20} className="text-am-positive opacity-60 shrink-0 mt-1" />
          </div>
        </Card>
      )}

      <TabelaEqualizacao key={chaveRecarregar} sessionId={sessionId} moeda={resumo?.moeda_referencia || "BRL"} />

      <DownloadBar
        urlWord={urlDownloadEtapa6Word(sessionId)}
        urlExcel={urlDownloadEtapa6Excel(sessionId)}
        urlPpt={urlDownloadEtapa6Ppt(sessionId)}
        label="Entregáveis da etapa 6"
      />

      {historico.length > 0 && (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {historico.map((msg, idx) => (
            <div
              key={idx}
              className={`text-sm rounded-md px-3 py-2 max-w-[80%] ${
                msg.autor === "usuario"
                  ? "bg-am-blue/10 text-am-text ml-auto"
                  : msg.tipo === "esclarecimento"
                  ? "bg-am-alert/10 text-am-navy"
                  : msg.tipo === "edicao"
                  ? "bg-am-positive/10 text-am-navy"
                  : "bg-am-bg text-am-text"
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
          placeholder="Pergunte ou peça uma correção, ex: 'qual fornecedor tem maior savings?'"
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
              variant="secondary"
              icon={RefreshCw}
              onClick={onRefazer}
              disabled={carregandoRefazer}
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
