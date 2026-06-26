import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import TopBar from "../components/TopBar";
import Stepper from "../components/Stepper";
import Card from "../components/Card";
import ResultadoEtapa8Conteudo from "../components/ResultadoEtapa8Conteudo";
import { useSessao } from "../lib/SessaoContext";

export default function ResultadoEtapa8() {
  const { sessionId, estudo, atualizarEstudo } = useSessao();
  const navigate = useNavigate();
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!sessionId) {
      navigate("/login");
      return;
    }
    atualizarEstudo(sessionId).finally(() => setCarregando(false));
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (carregando || !estudo) {
    return (
      <div className="min-h-screen bg-am-bg flex items-center justify-center">
        <p className="text-am-text-secondary text-sm">Carregando...</p>
      </div>
    );
  }

  const analise = estudo.estrategia_categoria || {};
  const equalizacao = estudo.equalizacao_comercial || {};

  // Navegação: o usuário pode clicar nas etapas 5 e 7 do Stepper para
  // consultar o resultado detalhado daquela etapa específica, sem precisar
  // refazer o pipeline pela Cascata — atalho pedido pelo usuário.
  const ROTA_POR_ETAPA = { 5: "/resultado/5", 7: "/resultado/7", 8: "/resultado/8" };
  function handleClicarEtapa(numero) {
    const rota = ROTA_POR_ETAPA[numero];
    if (rota) navigate(rota);
  }

  return (
    <div className="min-h-screen bg-am-bg p-5">
      <div className="max-w-4xl mx-auto space-y-4">
        <TopBar cliente={estudo.cliente} caso={analise._categoria} />

        <Card>
          <div className="flex items-baseline justify-between mb-3.5">
            <p className="text-base font-semibold text-am-navy">
              Estratégia da categoria — {analise._categoria || estudo.categoria}
            </p>
          </div>
          <Stepper
            etapaAtual={8}
            etapasConcluidas={[1, 2, 3, 4, 5, 6, 7]}
            onClicarEtapa={handleClicarEtapa}
          />
          <p className="text-[11px] text-am-text-secondary text-center mt-2">
            Clique em uma etapa já concluída (✓) para consultar o resultado detalhado
          </p>
        </Card>

        <ResultadoEtapa8Conteudo analise={analise} equalizacao={equalizacao} sessionId={sessionId} />
      </div>
    </div>
  );
}
