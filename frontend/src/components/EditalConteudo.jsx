import { useState, useEffect } from "react";
import { Send, Check, RefreshCw, Pencil, ListChecks, AlertCircle, GitCompare, FileSearch } from "lucide-react";
import ReactMarkdown from "react-markdown";
import Button from "./Button";
import Card from "./Card";
import TabelaRequisitos from "./TabelaRequisitos";
import { resumoExecutivoEtapa3, deltaEscopoEtapa3 } from "../lib/api";

// "Mini-app" da Etapa 3 (Edital Técnico) — tabela com REQUISITO como linha
// (não fornecedor, que só aparece nas etapas seguintes). Filtro por tipo
// (mandatório/desejável) e peso fazem sentido aqui, diferente da Etapa 2.
export default function EditalConteudo({
  sessionId,
  onEnviarMensagem,
  onConfirmar,
  onRefazer,
  mostrarRefazer,
  carregandoRefazer,
}) {
  const [resumo, setResumo] = useState(null);
  const [delta, setDelta] = useState(null);
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [historico, setHistorico] = useState([]);
  const [chaveRecarregar, setChaveRecarregar] = useState(0);

  useEffect(() => {
    resumoExecutivoEtapa3(sessionId).then(setResumo);
    deltaEscopoEtapa3(sessionId).then(setDelta);
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
    { label: "Total de requisitos", valor: resumo.n_requisitos, icon: ListChecks, cor: "text-am-navy" },
    { label: "Mandatórios de peso Alto", valor: resumo.n_mandatorios_peso_alto, icon: AlertCircle, cor: "text-am-danger" },
    { label: "Itens no delta de escopo", valor: resumo.n_itens_delta_escopo, icon: GitCompare, cor: "text-am-blue" },
    { label: "Tem baseline para comparar?", valor: resumo.tem_baseline_para_comparar ? "Sim" : "Não", icon: FileSearch, cor: resumo.tem_baseline_para_comparar ? "text-am-positive" : "text-am-text-secondary" },
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
                  <p className={`text-xl font-bold font-mono-num ${item.cor} truncate`}>{item.valor}</p>
                </div>
                <item.icon size={16} className={`${item.cor} opacity-60 mt-0.5 shrink-0`} />
              </div>
            </Card>
          ))}
        </div>
      )}

      {resumo?.resumo_edital && (
        <Card className="!shadow-none !bg-am-bg">
          <p className="text-sm text-am-text">{resumo.resumo_edital}</p>
        </Card>
      )}

      <TabelaRequisitos key={chaveRecarregar} sessionId={sessionId} />

      {delta?.tem_baseline && (delta.adicionados?.length > 0 || delta.removidos?.length > 0 || delta.modificados?.length > 0) && (
        <Card title="Delta de escopo (edital vs baseline)">
          {delta.narrativa_delta && <p className="text-sm text-am-text mb-3">{delta.narrativa_delta}</p>}
          <div className="grid grid-cols-3 gap-3 text-sm">
            {delta.adicionados?.length > 0 && (
              <div>
                <p className="font-medium text-am-blue mb-1.5">Adicionados</p>
                <ul className="space-y-1">
                  {delta.adicionados.map((a, i) => (
                    <li key={i} className="text-am-text-secondary">
                      {a.item} <span className="text-xs">({a.impacto_custo})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {delta.removidos?.length > 0 && (
              <div>
                <p className="font-medium text-am-alert mb-1.5">Removidos</p>
                <ul className="space-y-1">
                  {delta.removidos.map((r, i) => (
                    <li key={i} className="text-am-text-secondary">
                      {r.item} <span className="text-xs">({r.impacto_custo})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {delta.modificados?.length > 0 && (
              <div>
                <p className="font-medium text-am-navy mb-1.5">Modificados</p>
                <ul className="space-y-1">
                  {delta.modificados.map((m, i) => (
                    <li key={i} className="text-am-text-secondary">
                      {m.item}: {m.antes} → {m.depois}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>
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
          placeholder="Pergunte ou peça uma correção, ex: 'quais requisitos são de peso alto?'"
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
