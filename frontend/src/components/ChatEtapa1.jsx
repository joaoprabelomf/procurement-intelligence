import { useState } from "react";
import { Send, Check, Pencil } from "lucide-react";
import ReactMarkdown from "react-markdown";
import Button from "./Button";
import { chatEtapa1 } from "../lib/api";

// Painel de revisão da Etapa 1: mostra o formulário estruturado (documentos
// classificados, proponentes agrupados) E uma caixa de chat livre por baixo,
// para correções em linguagem natural — decisão tomada com o usuário:
// "os dois: formulário visível + chat livre como opção extra".
export default function ChatEtapa1({ sessionId, resultado, onAtualizar, onConfirmado }) {
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [historico, setHistorico] = useState([]);

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
      if (resp.tipo === "edicao" && resp.checkpoint) {
        onAtualizar(resp.checkpoint);
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

  return (
    <div className="space-y-4">
      {/* Resumo estruturado — formulário visível */}
      <div className="bg-am-bg rounded-md p-4 text-sm text-am-text leading-relaxed prose-sm [&_strong]:font-semibold [&_strong]:text-am-navy [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5">
        <ReactMarkdown>{resultado?.resumo_checkpoint || resultado?.checkpoint || ""}</ReactMarkdown>
      </div>

      {/* Histórico de chat */}
      {historico.length > 0 && (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {historico.map((msg, idx) => (
            <div
              key={idx}
              className={`text-sm rounded-md px-3 py-2 ${
                msg.autor === "usuario"
                  ? "bg-am-blue/10 text-am-text ml-auto max-w-[80%]"
                  : "bg-am-bg text-am-text max-w-[80%]"
              }`}
            >
              {msg.texto}
            </div>
          ))}
        </div>
      )}

      {/* Caixa de chat livre */}
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
