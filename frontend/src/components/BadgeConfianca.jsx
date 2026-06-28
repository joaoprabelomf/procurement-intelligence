import { CheckCircle, AlertTriangle, XCircle, Circle } from "lucide-react";

const CONFIG = {
  alta: {
    label: "Confiança alta",
    Icon: CheckCircle,
    className: "bg-am-positive/10 border border-am-positive/20 text-am-navy",
  },
  media: {
    label: "Confiança média",
    Icon: AlertTriangle,
    className: "bg-am-alert/10 border border-am-alert/20 text-am-navy",
  },
  baixa: {
    label: "Confiança baixa",
    Icon: XCircle,
    className: "bg-am-danger/10 border border-am-danger/20 text-am-danger",
  },
  incompleta: {
    label: "Incompleta",
    Icon: Circle,
    className: "bg-am-bg border border-am-border text-am-text-secondary",
  },
};

export default function BadgeConfianca({ confiancaEtapa }) {
  if (!confiancaEtapa) return null;
  const { nivel, sinais = [] } = confiancaEtapa;
  const cfg = CONFIG[nivel];
  if (!cfg) return null;
  const { label, Icon, className } = cfg;
  const tooltip = sinais.length > 0 ? sinais.join(" · ") : label;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${className}`}
      title={tooltip}
    >
      <Icon size={12} />
      {label}
    </span>
  );
}
