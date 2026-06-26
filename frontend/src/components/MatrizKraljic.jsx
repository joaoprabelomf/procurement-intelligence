const QUADRANTES = {
  estrategico: { label: "Estratégico", x: "alto", y: "alto" },
  alavancagem: { label: "Alavancagem", x: "alto", y: "baixo" },
  gargalo: { label: "Gargalo", x: "baixo", y: "alto" },
  nao_critico: { label: "Não-crítico", x: "baixo", y: "baixo" },
};

// impacto/risco: "alto" | "baixo" — usados para posicionar o ponto.
// quadrante: chave de QUADRANTES — usado para destacar o quadrante ativo.
export default function MatrizKraljic({ impacto, risco, quadrante }) {
  // Impacto financeiro é o eixo X (colunas), risco de suprimento é o eixo Y (linhas) —
  // mesma convenção usada no etapa8.py (QUADRANTES = {(impacto, risco): quadrante}).
  const cx = impacto === "alto" ? 245 : 107;
  const cy = risco === "alto" ? 48 : 192;

  function corQuadrante(chave) {
    return chave === quadrante ? "#EAF1F7" : "#F8F9FA";
  }

  return (
    <svg viewBox="0 0 320 300" className="w-full max-w-[320px] mx-auto block">
      <rect x="44" y="14" width="126" height="126" fill={corQuadrante("gargalo")} />
      <rect x="170" y="14" width="126" height="126" fill={corQuadrante("estrategico")} />
      <rect x="44" y="140" width="126" height="126" fill={corQuadrante("nao_critico")} />
      <rect x="170" y="140" width="126" height="126" fill={corQuadrante("alavancagem")} />

      <line x1="44" y1="14" x2="44" y2="266" stroke="#CBD5E1" strokeWidth="1" />
      <line x1="44" y1="266" x2="296" y2="266" stroke="#CBD5E1" strokeWidth="1" />
      <line x1="170" y1="14" x2="170" y2="266" stroke="#E2E8F0" strokeWidth="1" />
      <line x1="44" y1="140" x2="296" y2="140" stroke="#E2E8F0" strokeWidth="1" />

      <text x="107" y="30" textAnchor="middle" fontSize="10" fill={quadrante === "gargalo" ? "#00244A" : "#64748B"} fontWeight={quadrante === "gargalo" ? 600 : 400}>
        Gargalo
      </text>
      <text x="233" y="30" textAnchor="middle" fontSize="10" fill={quadrante === "estrategico" ? "#00244A" : "#64748B"} fontWeight={quadrante === "estrategico" ? 600 : 400}>
        Estratégico
      </text>
      <text x="107" y="156" textAnchor="middle" fontSize="10" fill={quadrante === "nao_critico" ? "#00244A" : "#64748B"} fontWeight={quadrante === "nao_critico" ? 600 : 400}>
        Não-crítico
      </text>
      <text x="233" y="156" textAnchor="middle" fontSize="10" fill={quadrante === "alavancagem" ? "#00244A" : "#64748B"} fontWeight={quadrante === "alavancagem" ? 600 : 400}>
        Alavancagem
      </text>

      <circle cx={cx} cy={cy} r="8" fill="#3585B7" />
      <circle cx={cx} cy={cy} r="15" fill="none" stroke="#3585B7" strokeWidth="1.5" opacity="0.35" />

      <text x="14" y="140" textAnchor="middle" fontSize="10" fill="#64748B" transform="rotate(-90, 14, 140)">
        Risco de suprimento
      </text>
      <text x="170" y="286" textAnchor="middle" fontSize="10" fill="#64748B">
        Impacto financeiro
      </text>
    </svg>
  );
}
