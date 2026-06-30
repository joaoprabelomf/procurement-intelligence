import { useState, useEffect } from "react";
import { Send, Check, RefreshCw, Pencil, Users, AlertTriangle, TrendingDown, ShieldAlert } from "lucide-react";
import ReactMarkdown from "react-markdown";
import Button from "./Button";
import Card from "./Card";
import DownloadBar from "./DownloadBar";
import TabelaComparacao from "./TabelaComparacao";
import { resumoExecutivoEtapa5, baixarEtapa5Word, baixarEtapa5Excel, baixarEtapa5Ppt } from "../lib/api";

// "Mini-app" da Etapa 5 (Comparação Técnica) — KPIs técnicos (não
// comerciais: sem preço, por design da própria etapa) + tabela com
// fornecedor como linha, matriz completa ao expandir.
export default function ComparacaoConteudo({
  sessionId,
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
    resumoExecutivoEtapa5(sessionId).then(setResumo);
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

  const labelGap = resumo?.tem_mandatorios_formais !== false ? "Com gap mandatório" : "Com gap relevante";

  const kpis = resumo ? [
    { label: "Fornecedores comparados", valor: resumo.n_fornecedores, icon: Users, cor: "text-am-navy" },
    { label: "É comparação real?", valor: resumo.eh_comparacao_real ? "Sim" : "Não (1 só)", icon: ShieldAlert, cor: resumo.eh_comparacao_real ? "text-am-positive" : "text-am-alert" },
    { label: labelGap, valor: resumo.n_fornecedores_com_gap, icon: AlertTriangle, cor: "text-am-danger" },
    { label: "Fornecedor com mais gaps", valor: resumo.fornecedor_mais_gaps?.fornecedor || "—", sub: resumo.fornecedor_mais_gaps ? `${resumo.fornecedor_mais_gaps.n_gaps} gap(s)` : null, icon: TrendingDown, cor: "text-am-alert" },
  ] : [];

  return (
    <div className="space-y-4">
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

      {resumo?.resumo_executivo && (
        <Card className="!shadow-none !bg-am-bg">
          <p className="text-sm text-am-text">{resumo.resumo_executivo}</p>
        </Card>
      )}

      <TabelaComparacao key={chaveRecarregar} sessionId={sessionId} temMandatoriosFormais={resumo?.tem_mandatorios_formais !== false} />

      <DownloadBar
        baixarWord={() => baixarEtapa5Word(sessionId)}
        baixarExcel={() => baixarEtapa5Excel(sessionId)}
        baixarPpt={() => baixarEtapa5Ppt(sessionId)}
        label="Entregáveis da etapa 5"
      />

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
          placeholder="Pergunte ou peça uma correção, ex: 'qual fornecedor tem maior conformidade?'"
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
            <Button variant="secondary" icon={RefreshCw} onClick={onRefazer} disabled={carregandoRefazer} className={carregandoRefazer ? "[&_svg]:animate-spin" : ""}>
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
