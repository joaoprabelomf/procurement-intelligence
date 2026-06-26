import { useState, useEffect } from "react";
import { Send, Check, RefreshCw, Pencil } from "lucide-react";
import ReactMarkdown from "react-markdown";
import Button from "./Button";
import KpisPropostas from "./KpisPropostas";
import TabelaPropostas from "./TabelaPropostas";
import { resumoExecutivoEtapa4 } from "../lib/api";

// "Mini-app" da Etapa 4 — substitui o card genérico de texto por uma
// experiência rica: KPIs executivos + tabela paginada/filtrada/ordenada
// (escalável a centenas de propostas) + chat de correção, no mesmo
// espírito do que já existe para a Etapa 8 (componente próprio, não o
// card genérico de markdown).
export default function PropostasConteudo({
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
  // chave usada para forçar a TabelaPropostas a recarregar do zero depois
  // de uma correção via chat (já que ela faz sua própria busca paginada).
  const [chaveRecarregar, setChaveRecarregar] = useState(0);

  useEffect(() => {
    resumoExecutivoEtapa4(sessionId).then(setResumo);
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
      <KpisPropostas resumo={resumo} />

      <TabelaPropostas key={chaveRecarregar} sessionId={sessionId} />

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
          placeholder="Pergunte ou peça uma correção, ex: 'qual fornecedor tem mais gaps?'"
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
