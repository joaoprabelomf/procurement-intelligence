import { useState } from "react";
import { ArrowRight } from "lucide-react";
import Button from "./Button";

// Aparece apenas quando a Etapa 2 sinaliza precisa_confirmar_anualização
// (ex.: tabela de preços sem período claro de vigência).
export default function CheckpointAnualizacao({ sugestao, onConfirmar, carregando }) {
  const [periodo, setPeriodo] = useState(sugestao || "");

  function handleSubmit(e) {
    e.preventDefault();
    if (!periodo.trim()) return;
    onConfirmar(periodo);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-sm text-am-text">
        O período de anualização do baseline precisa de confirmação.
        {sugestao && <> Sugestão: <span className="font-medium">{sugestao}</span>.</>}
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value)}
          placeholder="Ex.: contrato vigente de 12 meses, jan-dez 2025"
          className="flex-1 rounded-md border border-am-border-strong px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-am-blue/20 focus:border-am-blue"
        />
        <Button type="submit" variant="primary" icon={ArrowRight} disabled={!periodo.trim() || carregando}>
          Confirmar
        </Button>
      </div>
    </form>
  );
}
