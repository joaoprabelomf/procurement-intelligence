import { useState } from "react";
import { ArrowRight } from "lucide-react";
import Button from "./Button";

export default function CheckpointEtapa6({ onConfirmar, carregando }) {
  const [taxa, setTaxa] = useState("");
  const [moeda, setMoeda] = useState("BRL");

  function handleSubmit(e) {
    e.preventDefault();
    if (taxa === "") return;
    onConfirmar(parseFloat(taxa), moeda);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-am-text">
        Para equalizar comercialmente as propostas, preciso de dois dados:
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-am-text-secondary mb-1.5">
            Taxa de desconto (%)
          </label>
          <input
            type="number"
            step="0.1"
            value={taxa}
            onChange={(e) => setTaxa(e.target.value)}
            placeholder="8.0"
            className="w-full rounded-md border border-am-border-strong px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-am-blue/20 focus:border-am-blue"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-am-text-secondary mb-1.5">
            Moeda de referência
          </label>
          <select
            value={moeda}
            onChange={(e) => setMoeda(e.target.value)}
            className="w-full rounded-md border border-am-border-strong px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-am-blue/20 focus:border-am-blue"
          >
            <option value="BRL">BRL — Real</option>
            <option value="USD">USD — Dólar</option>
            <option value="EUR">EUR — Euro</option>
          </select>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" variant="primary" icon={ArrowRight} disabled={taxa === "" || carregando}>
          {carregando ? "Equalizando..." : "Confirmar e equalizar"}
        </Button>
      </div>
    </form>
  );
}
