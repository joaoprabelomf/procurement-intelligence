import { useState } from "react";
import { ArrowRight } from "lucide-react";
import Button from "./Button";

// Aparece apenas quando rodar_etapa8 devolve falta_impacto e/ou
// falta_risco — ou seja, quando nem o baseline (impacto) nem a pesquisa
// via web search (risco) conseguiram resolver automaticamente.
export default function CheckpointRiscoEtapa8({ faltaImpacto, faltaRisco, onConfirmar, carregando }) {
  const [impacto, setImpacto] = useState("alto");
  const [risco, setRisco] = useState("alto");

  function handleSubmit(e) {
    e.preventDefault();
    onConfirmar({
      impactoManual: faltaImpacto ? impacto : undefined,
      riscoManual: faltaRisco ? risco : undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-am-text">
        Para montar a Matriz de Kraljic, preciso confirmar manualmente:
      </p>

      <div className="grid grid-cols-2 gap-3">
        {faltaImpacto && (
          <div>
            <label className="block text-xs font-medium text-am-text-secondary mb-1.5">
              Impacto financeiro
            </label>
            <select
              value={impacto}
              onChange={(e) => setImpacto(e.target.value)}
              className="w-full rounded-md border border-am-border-strong px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-am-blue/20 focus:border-am-blue"
            >
              <option value="alto">Alto</option>
              <option value="baixo">Baixo</option>
            </select>
          </div>
        )}
        {faltaRisco && (
          <div>
            <label className="block text-xs font-medium text-am-text-secondary mb-1.5">
              Risco de suprimento
            </label>
            <select
              value={risco}
              onChange={(e) => setRisco(e.target.value)}
              className="w-full rounded-md border border-am-border-strong px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-am-blue/20 focus:border-am-blue"
            >
              <option value="alto">Alto</option>
              <option value="baixo">Baixo</option>
            </select>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button type="submit" variant="primary" icon={ArrowRight} disabled={carregando}>
          {carregando ? "Montando estratégia..." : "Confirmar e montar estratégia"}
        </Button>
      </div>
    </form>
  );
}
