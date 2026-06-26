import { FileText, FileSpreadsheet, Presentation } from "lucide-react";

export default function DownloadBar({ urlWord, urlExcel, urlPpt, label = "Exportar entregáveis" }) {
  return (
    <div className="bg-white rounded-lg shadow-card px-5 py-3.5 flex items-center justify-between">
      <span className="text-xs text-am-text-secondary">{label}</span>
      <div className="flex gap-2.5">
        <a
          href={urlWord}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-am-navy border border-am-border rounded-md px-3.5 py-1.5 hover:bg-am-bg transition"
        >
          <FileText size={15} className="text-am-blue" />
          Word
        </a>
        <a
          href={urlExcel}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-am-navy border border-am-border rounded-md px-3.5 py-1.5 hover:bg-am-bg transition"
        >
          <FileSpreadsheet size={15} className="text-am-blue" />
          Excel
        </a>
        {urlPpt && (
          <a
            href={urlPpt}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-am-navy border border-am-navy rounded-md px-3.5 py-1.5 hover:bg-am-navy-light transition"
          >
            <Presentation size={15} />
            PPT
          </a>
        )}
      </div>
    </div>
  );
}

