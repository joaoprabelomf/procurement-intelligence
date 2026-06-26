import { useState, useEffect, useRef } from "react";

// Barra de progresso SIMULADA — não existe percentual real vindo da IA
// (a API do Claude não informa "30% pronto"), então isso só dá uma
// sensação visual de avanço contínuo, sem prometer precisão. Sobe até 90%
// de forma suave e desacelerada, e só completa os 10% finais quando a
// chamada de verdade terminar (prop `concluido`) — nunca mostra 100% antes
// da resposta real chegar.
export default function BarraProgresso({ concluido, mensagem }) {
  const [percentual, setPercentual] = useState(0);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (concluido) {
      setPercentual(100);
      return;
    }
    setPercentual(0);
    intervalRef.current = setInterval(() => {
      setPercentual((atual) => {
        if (atual >= 90) return atual;
        // Desacelera conforme se aproxima de 90 — sensação de progresso
        // real, sem nunca prometer estar perto do fim antes da hora.
        const incremento = atual < 50 ? 4 : atual < 75 ? 2 : 0.5;
        return Math.min(90, atual + incremento);
      });
    }, 220);
    return () => clearInterval(intervalRef.current);
  }, [concluido]);

  return (
    <div className="w-full">
      <div className="h-1.5 bg-am-border rounded-full overflow-hidden">
        <div
          className="h-full bg-am-blue rounded-full transition-all duration-300 ease-out"
          style={{ width: `${percentual}%` }}
        />
      </div>
      {mensagem && (
        <p className="text-xs text-am-text-secondary mt-2 text-center">{mensagem}</p>
      )}
    </div>
  );
}
