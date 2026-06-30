import { useState } from "react";
import { FileText, FileSpreadsheet, Presentation, Loader2 } from "lucide-react";

// Dispara downloads autenticados: cada prop baixarX é uma função assíncrona
// (ver baixarArquivo em lib/api.js) que busca o arquivo via axios — com o
// token JWT já injetado pelo interceptor — e recebe como blob. Por isso os
// botões usam onClick em vez de <a href>, que não levaria o token e cairia
// em 401 "Not authenticated".
export default function DownloadBar({ baixarWord, baixarExcel, baixarPpt, label = "Exportar entregáveis" }) {
  const [baixando, setBaixando] = useState(null); // "word" | "excel" | "ppt" | null
  const [erro, setErro] = useState(false);

  async function executar(tipo, fn) {
    if (baixando) return;
    setErro(false);
    setBaixando(tipo);
    try {
      await fn();
    } catch {
      setErro(true);
    } finally {
      setBaixando(null);
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-card px-5 py-3.5 flex items-center justify-between">
      <span className={`text-xs ${erro ? "text-am-danger" : "text-am-text-secondary"}`}>
        {erro ? "Falha ao baixar o arquivo. Tente novamente." : label}
      </span>
      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={() => executar("word", baixarWord)}
          disabled={baixando !== null}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-am-navy border border-am-border rounded-md px-3.5 py-1.5 hover:bg-am-bg transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {baixando === "word" ? (
            <Loader2 size={15} className="text-am-blue animate-spin" />
          ) : (
            <FileText size={15} className="text-am-blue" />
          )}
          Word
        </button>
        <button
          type="button"
          onClick={() => executar("excel", baixarExcel)}
          disabled={baixando !== null}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-am-navy border border-am-border rounded-md px-3.5 py-1.5 hover:bg-am-bg transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {baixando === "excel" ? (
            <Loader2 size={15} className="text-am-blue animate-spin" />
          ) : (
            <FileSpreadsheet size={15} className="text-am-blue" />
          )}
          Excel
        </button>
        {baixarPpt && (
          <button
            type="button"
            onClick={() => executar("ppt", baixarPpt)}
            disabled={baixando !== null}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-am-navy border border-am-navy rounded-md px-3.5 py-1.5 hover:bg-am-navy-light transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {baixando === "ppt" ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Presentation size={15} />
            )}
            PPT
          </button>
        )}
      </div>
    </div>
  );
}
