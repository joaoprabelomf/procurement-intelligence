import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import TopBar from "../components/TopBar";
import Stepper from "../components/Stepper";
import Card from "../components/Card";
import ComparacaoConteudo from "../components/ComparacaoConteudo";
import { useSessao } from "../lib/SessaoContext";
import { corrigirEtapa } from "../lib/api";

const ROTA_POR_ETAPA = { 5: "/resultado/5", 7: "/resultado/7", 8: "/resultado/8" };

export default function ResultadoEtapa5() {
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

  async function handleEnviarMensagem(mensagem) {
    const resp = await corrigirEtapa(sessionId, 5, mensagem);
    return { texto: resp.mensagem, tipo: resp.tipo };
  }

  function handleClicarEtapa(numero) {
    const rota = ROTA_POR_ETAPA[numero];
    if (rota) navigate(rota);
  }

  if (carregando || !estudo) {
    return (
      <div className="min-h-screen bg-am-bg flex items-center justify-center">
        <p className="text-am-text-secondary text-sm">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-am-bg p-5">
      <div className="max-w-5xl mx-auto space-y-4">
        <TopBar cliente={estudo.cliente} caso={estudo.micro_categoria} />

        <button
          onClick={() => navigate("/resultado/8")}
          className="text-xs text-am-blue hover:underline flex items-center gap-1"
        >
          <ArrowLeft size={12} /> Voltar para a estratégia da categoria
        </button>

        <Card>
          <p className="text-base font-semibold text-am-navy mb-3.5">Comparação técnica</p>
          <Stepper
            etapaAtual={5}
            etapasConcluidas={[1, 2, 3, 4, 5, 6, 7, 8]}
            onClicarEtapa={handleClicarEtapa}
          />
          <p className="text-[11px] text-am-text-secondary text-center mt-2">
            Clique em outra etapa para consultar seu resultado
          </p>
        </Card>

        <ComparacaoConteudo
          sessionId={sessionId}
          onEnviarMensagem={handleEnviarMensagem}
        />
      </div>
    </div>
  );
}
