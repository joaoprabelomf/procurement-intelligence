import { Check, Loader2 } from "lucide-react";

// Stepper de progresso das 8 etapas.
// etapaAtual: número da etapa em destaque/visualizada (1-8).
// etapasConcluidas: array de números já concluídos.
// etapasProcessando: Set de números com chamada de IA em andamento agora
//   (processamento em background — pode ser diferente de etapaAtual, já
//   que o usuário pode estar visualizando uma etapa enquanto outra processa).
const LABELS = [
  "Triagem",
  "Baseline",
  "Edital",
  "Propostas",
  "Comparação",
  "Comercial",
  "Recomendações",
  "Categoria",
];

export default function Stepper({ etapaAtual, etapasConcluidas = [], etapasProcessando, onClicarEtapa }) {
  const processando = etapasProcessando instanceof Set ? etapasProcessando : new Set();
  return (
    <div className="flex items-center w-full">
      {LABELS.map((label, idx) => {
        const numero = idx + 1;
        const concluida = etapasConcluidas.includes(numero);
        const ativa = numero === etapaAtual;
        const emProcessamento = processando.has(numero);
        const clicavel = concluida && !!onClicarEtapa;
        return (
          <div key={numero} className="flex-1 flex flex-col items-center relative">
            {idx > 0 && (
              <div
                className={`absolute top-[13px] right-1/2 w-full h-0.5 z-0 ${
                  concluida || ativa ? "bg-am-navy" : "bg-am-border"
                }`}
              />
            )}
            <div className="relative z-10">
              <button
                type="button"
                onClick={clicavel ? () => onClicarEtapa(numero) : undefined}
                disabled={!clicavel}
                className={`w-[26px] h-[26px] rounded-full flex items-center justify-center text-[11px] font-semibold z-10 ${
                  clicavel ? "cursor-pointer hover:ring-2 hover:ring-am-blue/30" : "cursor-default"
                } ${
                  concluida
                    ? "bg-am-navy text-white"
                    : ativa
                    ? "bg-am-blue text-white"
                    : "bg-white border-[1.5px] border-am-border-strong text-am-text-secondary"
                }`}
              >
                {concluida ? <Check size={13} /> : numero}
              </button>
              {emProcessamento && (
                <span className="absolute -top-1 -right-1 flex items-center justify-center w-3.5 h-3.5 bg-am-alert rounded-full animate-pulse z-20">
                  <Loader2 size={9} className="text-white animate-spin" />
                </span>
              )}
            </div>
            <span
              className={`text-[10px] mt-1.5 text-center ${
                ativa ? "text-am-blue font-semibold" : concluida ? "text-am-text" : "text-am-text-secondary"
              }`}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
