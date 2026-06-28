// Badge discreto exibido quando uma etapa foi enriquecida com casos históricos.
// Renderiza nada quando casosConsultados é 0 ou ausente.
export default function BadgeRAG({ casosConsultados }) {
  if (!casosConsultados || casosConsultados === 0) return null;

  const label =
    casosConsultados === 1
      ? "Enriquecido com 1 caso similar do seu time"
      : `Enriquecido com ${casosConsultados} casos similares do seu time`;

  const tooltip = `${casosConsultados} estudo(s) anterior(es) da sua equipe com categoria similar foram usados como referência para enriquecer esta análise.`;

  return (
    <div
      title={tooltip}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-am-blue/10 border border-am-blue/20 text-am-navy text-xs font-medium cursor-default select-none"
    >
      <span aria-hidden="true">📚</span>
      <span>{label}</span>
    </div>
  );
}
