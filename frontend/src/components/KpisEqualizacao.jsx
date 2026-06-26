import { Wallet, Hash, TrendingDown, Trophy } from "lucide-react";
import Card from "./Card";

function formatarMoeda(valor, moeda) {
  if (valor == null) return "—";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: moeda || "BRL" });
}

// Cards de KPI da Etapa 6 (Equalização Comercial) — COMERCIAIS, não
// técnicos (diferente da Etapa 4). Decisão do usuário, após ver os cards
// técnicos (gaps/aderência) aplicados por engano nesta etapa: "ao invés de
// mostrar gaps, mostrar baseline, quantidade de proposta, valor médio de
// proposta, melhor proposta".
export default function KpisEqualizacao({ resumo }) {
  if (!resumo) return null;
  const moeda = resumo.moeda_referencia || "BRL";

  const itens = [
    {
      label: "Baseline anual",
      valor: formatarMoeda(resumo.baseline_anual, moeda),
      icon: Wallet,
      cor: "text-am-navy",
    },
    {
      label: "Propostas equalizadas",
      valor: resumo.n_propostas,
      icon: Hash,
      cor: "text-am-blue",
    },
    {
      label: "Valor médio de proposta",
      valor: formatarMoeda(resumo.valor_medio_proposta, moeda),
      icon: TrendingDown,
      cor: "text-am-alert",
    },
    {
      label: "Melhor proposta",
      valor: resumo.melhor_proposta?.fornecedor || "—",
      sub: resumo.melhor_proposta
        ? `${formatarMoeda(resumo.melhor_proposta.preco_total_equalizado, moeda)} · ${resumo.melhor_proposta.savings_percentual?.toFixed(1) ?? "—"}% savings`
        : null,
      icon: Trophy,
      cor: "text-am-positive",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {itens.map((item) => (
        <Card key={item.label} className="!shadow-card">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-[11px] text-am-text-secondary mb-1.5">{item.label}</p>
              <p className={`text-xl font-bold font-mono-num ${item.cor} break-words`}>{item.valor}</p>
              {item.sub && <p className="text-[10px] text-am-text-secondary mt-1 break-words">{item.sub}</p>}
            </div>
            <item.icon size={16} className={`${item.cor} opacity-60 mt-0.5 shrink-0`} />
          </div>
        </Card>
      ))}
    </div>
  );
}
