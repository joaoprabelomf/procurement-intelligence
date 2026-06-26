import { useState, useEffect } from "react";
import { Send, Check, Pencil, Building2, Tag, Users, AlertTriangle, FileX, FileCheck } from "lucide-react";
import ReactMarkdown from "react-markdown";
import Button from "./Button";
import Card from "./Card";
import {
  chatEtapa1, resumoExecutivoEtapa1, cenarioAtualEtapa1, proponentesEtapa1, pontosAtencaoEtapa1,
} from "../lib/api";

// "Mini-app" da Etapa 1 (Triagem/Classificação) — substitui o painel de
// texto markdown por cards estruturados: KPIs, cenário atual (As Is),
// card por proponente (poucos por natureza, sem paginação), pontos de
// atenção. O CHAT continua sendo o mesmo endpoint rico já existente
// (processar_mensagem_etapa1, que decide intenção: edição/pergunta/
// confirmação) — não foi reescrito, só passou a disparar um recarregamento
// dos dados estruturados quando o tipo de resposta é "edicao".
export default function TriagemConteudo({ sessionId, onConfirmado }) {
  const [resumo, setResumo] = useState(null);
  const [cenario, setCenario] = useState(null);
  const [proponentes, setProponentes] = useState([]);
  const [pontosAtencao, setPontosAtencao] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [historico, setHistorico] = useState([]);

  async function carregarTudo() {
    setCarregando(true);
    try {
      const [r, c, p, f] = await Promise.all([
        resumoExecutivoEtapa1(sessionId),
        cenarioAtualEtapa1(sessionId),
        proponentesEtapa1(sessionId),
        pontosAtencaoEtapa1(sessionId),
      ]);
      setResumo(r);
      setCenario(c);
      setProponentes(p.itens || []);
      setPontosAtencao(f.itens || []);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarTudo();
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function enviarMensagem(e) {
    e.preventDefault();
    if (!mensagem.trim()) return;
    const minhaMensagem = mensagem;
    setMensagem("");
    setHistorico((h) => [...h, { autor: "usuario", texto: minhaMensagem }]);
    setEnviando(true);
    try {
      const resp = await chatEtapa1(sessionId, minhaMensagem);
      setHistorico((h) => [...h, { autor: "assistente", texto: resp.mensagem, tipo: resp.tipo }]);
      if (resp.tipo === "edicao") {
        // A correção pode ter mudado cliente, categoria, proponentes etc.
        // — recarrega os 4 endpoints estruturados em vez de só atualizar texto.
        await carregarTudo();
      }
      if (resp.tipo === "confirmacao") {
        onConfirmado();
      }
    } catch (err) {
      setHistorico((h) => [...h, { autor: "assistente", texto: "Não consegui processar isso agora. Tente de novo.", tipo: "erro" }]);
    } finally {
      setEnviando(false);
    }
  }

  const kpis = resumo ? [
    { label: "Cliente apoiado", valor: resumo.cliente || "—", icon: Building2, cor: "text-am-navy" },
    { label: "Categoria", valor: resumo.categoria || "—", sub: resumo.modelo_precificacao, icon: Tag, cor: "text-am-blue" },
    { label: "Proponentes identificados", valor: resumo.n_proponentes, icon: Users, cor: "text-am-navy" },
    { label: "Pontos de atenção", valor: resumo.n_pontos_atencao, icon: AlertTriangle, cor: resumo.n_pontos_atencao > 0 ? "text-am-alert" : "text-am-positive" },
  ] : [];

  if (carregando) {
    return <p className="text-sm text-am-text-secondary py-6 text-center">Carregando...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((item) => (
          <Card key={item.label} className="!shadow-card">
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <p className="text-[11px] text-am-text-secondary mb-1.5">{item.label}</p>
                <p className={`text-lg font-bold ${item.cor} break-words`}>{item.valor}</p>
                {item.sub && <p className="text-[10px] text-am-text-secondary mt-1">{item.sub}</p>}
              </div>
              <item.icon size={16} className={`${item.cor} opacity-60 mt-0.5 shrink-0`} />
            </div>
          </Card>
        ))}
      </div>

      {cenario && (
        <Card title="Cenário atual (As Is)">
          <div className="grid grid-cols-2 gap-3">
            {[
              { chave: "edital", label: "Edital (escopo técnico)" },
              { chave: "baseline", label: "Baseline (escopo comercial)" },
            ].map(({ chave, label }) => {
              const doc = cenario[chave];
              return (
                <div
                  key={chave}
                  className={`rounded-md px-3 py-2.5 flex items-start gap-2 ${doc.presente ? "bg-am-bg" : "bg-am-alert/10"}`}
                >
                  {doc.presente
                    ? <FileCheck size={15} className="text-am-blue mt-0.5 shrink-0" />
                    : <FileX size={15} className="text-am-alert mt-0.5 shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-xs text-am-text-secondary">{label}</p>
                    <p className={`text-sm font-medium truncate ${doc.presente ? "text-am-navy" : "text-am-alert"}`}>
                      {doc.presente ? doc.nome : "ausente"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {proponentes.length > 0 && (
        <Card title={`Proponentes (${proponentes.length})`}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {proponentes.map((p) => (
              <div
                key={p.id}
                className={`rounded-md border px-3 py-2.5 ${p.completo ? "border-am-border" : "border-am-alert/40 bg-am-alert/5"}`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-semibold text-am-navy truncate">{p.fornecedor}</p>
                  <span className="text-[10px] text-am-text-secondary shrink-0">{p.id}</span>
                </div>
                <div className="space-y-1 text-xs">
                  {p.arquivo_combinada ? (
                    <div className="flex items-center gap-1.5 text-am-text">
                      <FileCheck size={12} className="text-am-blue shrink-0" />
                      <span className="truncate">Combinada: {p.arquivo_combinada}</span>
                    </div>
                  ) : (
                    <>
                      <div className={`flex items-center gap-1.5 ${p.arquivo_tecnica ? "text-am-text" : "text-am-alert"}`}>
                        {p.arquivo_tecnica ? <FileCheck size={12} className="text-am-blue shrink-0" /> : <FileX size={12} className="shrink-0" />}
                        <span className="truncate">Técnica: {p.arquivo_tecnica || "ausente"}</span>
                      </div>
                      <div className={`flex items-center gap-1.5 ${p.arquivo_comercial ? "text-am-text" : "text-am-alert"}`}>
                        {p.arquivo_comercial ? <FileCheck size={12} className="text-am-blue shrink-0" /> : <FileX size={12} className="shrink-0" />}
                        <span className="truncate">Comercial: {p.arquivo_comercial || "ausente"}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {pontosAtencao.length > 0 && (
        <Card title="Pontos de atenção">
          <ul className="space-y-1.5">
            {pontosAtencao.map((p, i) => (
              <li key={i} className="text-sm text-am-text flex items-start gap-2">
                <AlertTriangle size={13} className="text-am-alert shrink-0 mt-0.5" />
                {p}
              </li>
            ))}
          </ul>
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
          placeholder='Ex.: "o cliente é Mosaic Fertilizantes" ou "junta o proponente 2 com o 3"'
          className="flex-1 rounded-md border border-am-border-strong px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-am-blue/20 focus:border-am-blue"
          disabled={enviando}
        />
        <Button variant="secondary" size="md" icon={Send} disabled={enviando || !mensagem.trim()}>
          Enviar
        </Button>
      </form>

      <div className="flex items-center justify-between pt-2 border-t border-am-border">
        <p className="text-xs text-am-text-secondary flex items-center gap-1.5">
          <Pencil size={12} /> Corrija no chat acima, ou confirme quando estiver certo
        </p>
        <Button variant="primary" icon={Check} onClick={onConfirmado}>
          Confirmar classificação
        </Button>
      </div>
    </div>
  );
}
