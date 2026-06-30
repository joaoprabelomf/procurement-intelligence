import { useState } from "react";
import { Send, Check, Pencil, RefreshCw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import Button from "./Button";
import DownloadBar from "./DownloadBar";
import {
  baixarEtapa5Word, baixarEtapa5Excel, baixarEtapa5Ppt,
  baixarEtapa7Word, baixarEtapa7Excel, baixarEtapa7Ppt,
  baixarEtapa8Word, baixarEtapa8Excel, baixarEtapa8Ppt,
} from "../lib/api";

const DOWNLOADS_POR_ETAPA = {
  5: { word: baixarEtapa5Word, excel: baixarEtapa5Excel, ppt: baixarEtapa5Ppt },
  7: { word: baixarEtapa7Word, excel: baixarEtapa7Excel, ppt: baixarEtapa7Ppt },
  8: { word: baixarEtapa8Word, excel: baixarEtapa8Excel, ppt: baixarEtapa8Ppt },
};

// Card genérico de revisão/confirmação de uma etapa concluída. Usado por
// TODAS as 8 etapas agora (decisão do usuário: "todas as etapas devem
// parar e perguntar"), com:
//   - resumo executivo do que a etapa encontrou
//   - chat livre de correção (genérico para 2-8; a Etapa 1 usa seu próprio
//     endpoint mais rico, repassado via prop onEnviarMensagem)
//   - downloads de Word/Excel/PPT inline, quando a etapa for 5, 7 ou 8
//   - botão de refazer a análise (quando estiver em modo "histórico", ou
//     seja, revisitando uma etapa já concluída via navegação livre)
export default function CardEtapa({
  numeroEtapa,
  sessionId,
  resumo,
  onEnviarMensagem,   // (mensagem) => Promise<{ texto, atualizado }>
  onConfirmar,        // () => void
  onRefazer,          // () => void
  mostrarRefazer = false,
  carregandoRefazer = false,
}) {
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [historico, setHistorico] = useState([]);

  const downloadsEtapa = DOWNLOADS_POR_ETAPA[numeroEtapa];

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
    } catch (err) {
      setHistorico((h) => [...h, { autor: "assistente", texto: "Não consegui processar essa correção agora. Tente de novo.", tipo: "erro" }]);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-am-bg rounded-md p-4 text-sm text-am-text leading-relaxed max-h-80 overflow-y-auto prose-sm [&_strong]:font-semibold [&_strong]:text-am-navy [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5">
        <ReactMarkdown>{resumo}</ReactMarkdown>
      </div>

      {downloadsEtapa && (
        <DownloadBar
          baixarWord={() => downloadsEtapa.word(sessionId)}
          baixarExcel={() => downloadsEtapa.excel(sessionId)}
          baixarPpt={() => downloadsEtapa.ppt(sessionId)}
          label={`Entregáveis da etapa ${numeroEtapa}`}
        />
      )}

      {historico.length > 0 && (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {historico.map((msg, idx) => (
            <div
              key={idx}
              className={`text-sm rounded-md px-3 py-2 ${
                msg.autor === "usuario"
                  ? "bg-am-blue/10 text-am-text ml-auto max-w-[80%]"
                  : msg.tipo === "esclarecimento"
                  ? "bg-am-alert/10 text-am-navy max-w-[80%]"
                  : msg.tipo === "edicao"
                  ? "bg-am-positive/10 text-am-navy max-w-[80%]"
                  : "bg-am-bg text-am-text max-w-[80%]"
              }`}
            >
              {msg.texto}
            </div>
          ))}
        </div>
      )}

      <form onSubmit={enviarMensagem} className="flex gap-2">
        <input
          type="text"
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
          placeholder="Digite uma correção em linguagem natural, se algo não estiver certo"
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
