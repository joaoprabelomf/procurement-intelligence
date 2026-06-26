import { TrendingUp, AlertTriangle, Eye, CheckCircle2 } from "lucide-react";
import Card from "./Card";

// Cards de KPI executivo no topo da tela de Propostas — visão agregada de
// TODAS as propostas (não só a página visível na tabela), calculada no
// servidor via GET /etapa4/resumo-executivo.
export default function KpisPropostas({ resumo }) {
  if (!resumo) return null;

  const itens = [
    {
      label: "Propostas avaliadas",
      valor: resumo.n_propostas,
      icon: CheckCircle2,
      cor: "text-am-navy",
    },
    {
      label: "Aderência média",
      valor: resumo.aderencia_media != null ? `${resumo.aderencia_media}%` : "—",
      icon: TrendingUp,
      cor: "text-am-blue",
    },
    {
      label: "Com gaps mandatórios",
      valor: resumo.n_com_gaps_mandatorios,
      icon: AlertTriangle,
      cor: "text-am-danger",
    },
    {
      label: "Com silêncio mandatório",
      valor: resumo.n_com_silencio_mandatorio,
      icon: Eye,
      cor: "text-am-alert",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {itens.map((item) => (
        <Card key={item.label} className="!shadow-card">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-[11px] text-am-text-secondary mb-1.5">{item.label}</p>
              <p className={`text-2xl font-bold font-mono-num ${item.cor}`}>{item.valor}</p>
            </div>
            <item.icon size={16} className={`${item.cor} opacity-60 mt-0.5 shrink-0`} />
          </div>
        </Card>
      ))}
    </div>
  );
}
