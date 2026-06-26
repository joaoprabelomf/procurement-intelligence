// Mapeia os status usados em várias etapas (Etapa 4 e 5) para cor —
// mesma lógica de cores usada nos documentos Word/Excel, para que a tela
// e o arquivo exportado contem a mesma história visual.
const ESTILOS = {
  cumpre: "bg-am-positive/10 text-am-navy",
  "não cumpre": "bg-am-danger/10 text-am-danger",
  parcial: "bg-am-alert/10 text-am-navy",
  "não menciona": "bg-am-bg text-am-text-secondary",
  desvio: "bg-am-alert/10 text-am-navy",
};

export default function StatusBadge({ status }) {
  const estilo = ESTILOS[status] || "bg-am-bg text-am-text-secondary";
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${estilo}`}>
      {status}
    </span>
  );
}
