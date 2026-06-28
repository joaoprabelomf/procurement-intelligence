import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2, AlertCircle, ChevronLeft } from "lucide-react";
import TopBar from "../components/TopBar";
import Button from "../components/Button";
import Stepper from "../components/Stepper";
import Card from "../components/Card";
import BarraProgresso from "../components/BarraProgresso";
import CardEtapa from "../components/CardEtapa";
import TriagemConteudo from "../components/TriagemConteudo";
import ResultadoEtapa8Conteudo from "../components/ResultadoEtapa8Conteudo";
import PropostasConteudo from "../components/PropostasConteudo";
import EqualizacaoConteudo from "../components/EqualizacaoConteudo";
import BaselineConteudo from "../components/BaselineConteudo";
import EditalConteudo from "../components/EditalConteudo";
import ComparacaoConteudo from "../components/ComparacaoConteudo";
import RecomendacoesConteudo from "../components/RecomendacoesConteudo";
import CheckpointAnualizacao from "../components/CheckpointAnualizacao";
import CheckpointEtapa6 from "../components/CheckpointEtapa6";
import CheckpointRiscoEtapa8 from "../components/CheckpointRiscoEtapa8";
import { useSessao } from "../lib/SessaoContext";
import {
  obterEstadoSessao,
  rodarEtapa2, confirmarAnualizacao,
  rodarEtapa3, rodarEtapa4, rodarEtapa4b, rodarEtapa5,
  precisaCheckpointEtapa6, confirmarCheckpointEtapa6, rodarEtapa6,
  rodarEtapa7, rodarEtapa8, confirmarRiscoEtapa8,
  corrigirEtapa, recascatearAPartirDe,
  extrairMensagemErro,
} from "../lib/api";

// Fase de exibição de UMA etapa específica (não é mais um estado global da
// tela — cada etapa tem sua própria fase, guardada em fasePorEtapa). Isso é
// o que permite navegação não-bloqueante: a etapa N pode estar
// PROCESSANDO enquanto o usuário olha a etapa M em CONFIRMACAO.
const FASE = {
  PROCESSANDO: "processando",
  CONFIRMACAO: "confirmacao",
  CHECKPOINT_ANUALIZACAO: "checkpoint_anualizacao",
  CHECKPOINT_ETAPA6: "checkpoint_etapa6",
  CHECKPOINT_RISCO8: "checkpoint_risco8",
  ERRO: "erro",
};

const TITULO_ETAPA = {
  1: "Classificação dos documentos",
  2: "Cenário atual (baseline)",
  3: "Edital técnico",
  4: "Propostas técnicas",
  5: "Comparação técnica",
  6: "Equalização comercial",
  7: "Recomendações finais",
  8: "Estratégia da categoria",
};

const MENSAGEM_PROGRESSO = {
  1: "Lendo documentos e classificando...",
  2: "Analisando o cenário atual...",
  3: "Extraindo requisitos do edital...",
  4: "Avaliando conformidade técnica das propostas...",
  5: "Montando a comparação técnica...",
  6: "Equalizando comercialmente as propostas...",
  7: "Montando as recomendações finais...",
  8: "Posicionando a categoria na Matriz de Kraljic...",
};

export default function Cascata() {
  const location = useLocation();
  const navigate = useNavigate();
  const { sessionId } = useSessao();

  // etapaVisualizada: qual etapa a TELA está mostrando agora. Independente
  // de qual etapa está processando em background — é assim que a navegação
  // não-bloqueante funciona: o usuário pode estar OLHANDO a etapa 3
  // enquanto a etapa 5 ainda está PROCESSANDO em segundo plano.
  const [etapaVisualizada, setEtapaVisualizada] = useState(1);
  const [etapasConcluidas, setEtapasConcluidas] = useState([]);
  // etapasProcessando: Set de números de etapa que têm uma chamada de IA em
  // andamento AGORA, em background — usado para o indicador pulsante no
  // Stepper e para impedir ações conflitantes na mesma etapa.
  const [etapasProcessando, setEtapasProcessando] = useState(new Set());
  // fasePorEtapa: cada etapa tem sua própria fase de exibição.
  const [fasePorEtapa, setFasePorEtapa] = useState({});
  const [resultadosPorEtapa, setResultadosPorEtapa] = useState(() => {
    const inicial = location.state?.resultadoEtapa1;
    return inicial ? { 1: inicial } : {};
  });
  const [erroPorEtapa, setErroPorEtapa] = useState({});
  const [carregandoAcao, setCarregandoAcao] = useState(false);
  const [carregandoRefazer, setCarregandoRefazer] = useState(false);
  const [carregandoReabertura, setCarregandoReabertura] = useState(false);

  // sessionId não muda durante a vida da tela, mas guardamos numa ref para
  // os callbacks assíncronos de background sempre lerem o valor mais atual,
  // mesmo que a etapaVisualizada tenha mudado nesse meio tempo.
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  const marcarConcluida = useCallback((numero) => {
    setEtapasConcluidas((atuais) => (atuais.includes(numero) ? atuais : [...atuais, numero]));
  }, []);

  const guardarResultado = useCallback((numero, resultado) => {
    setResultadosPorEtapa((atuais) => ({ ...atuais, [numero]: resultado }));
  }, []);

  const definirFase = useCallback((numero, fase) => {
    setFasePorEtapa((atuais) => ({ ...atuais, [numero]: fase }));
  }, []);

  const marcarProcessando = useCallback((numero, processando) => {
    setEtapasProcessando((atuais) => {
      const novo = new Set(atuais);
      if (processando) novo.add(numero);
      else novo.delete(numero);
      return novo;
    });
  }, []);

  const definirErro = useCallback((numero, mensagem) => {
    setErroPorEtapa((atuais) => ({ ...atuais, [numero]: mensagem }));
  }, []);

  // Roda uma etapa em BACKGROUND — não bloqueia a navegação. A tela pode
  // continuar mostrando qualquer outra etapa enquanto isso roda; o
  // indicador no Stepper (etapasProcessando) avisa visualmente, e quando a
  // chamada termina, o resultado fica disponível (o usuário vê ao navegar
  // para essa etapa, ou imediatamente se já estiver olhando para ela).
  const rodarEtapaEmBackground = useCallback(async (numero) => {
    marcarProcessando(numero, true);
    definirFase(numero, FASE.PROCESSANDO);
    definirErro(numero, null);
    try {
      if (numero === 2) {
        const resultado = await rodarEtapa2(sessionIdRef.current);
        guardarResultado(2, resultado);
        if (resultado.precisa_confirmar_anualização) {
          definirFase(2, FASE.CHECKPOINT_ANUALIZACAO);
        } else {
          marcarConcluida(2);
          definirFase(2, FASE.CONFIRMACAO);
        }
      } else if (numero === 3) {
        const resultado = await rodarEtapa3(sessionIdRef.current);
        guardarResultado(3, resultado);
        marcarConcluida(3);
        definirFase(3, FASE.CONFIRMACAO);
      } else if (numero === 4) {
        const resultado = await rodarEtapa4(sessionIdRef.current);
        guardarResultado(4, resultado);
        marcarConcluida(4);
        await rodarEtapa4b(sessionIdRef.current);
        definirFase(4, FASE.CONFIRMACAO);
      } else if (numero === 5) {
        const resultado = await rodarEtapa5(sessionIdRef.current);
        guardarResultado(5, resultado);
        marcarConcluida(5);
        definirFase(5, FASE.CONFIRMACAO);
      } else if (numero === 6) {
        const precisaCheckpoint = await precisaCheckpointEtapa6(sessionIdRef.current);
        if (precisaCheckpoint) {
          definirFase(6, FASE.CHECKPOINT_ETAPA6);
        } else {
          const resultado = await rodarEtapa6(sessionIdRef.current);
          guardarResultado(6, resultado);
          marcarConcluida(6);
          definirFase(6, FASE.CONFIRMACAO);
        }
      } else if (numero === 7) {
        const resultado = await rodarEtapa7(sessionIdRef.current);
        guardarResultado(7, resultado);
        marcarConcluida(7);
        definirFase(7, FASE.CONFIRMACAO);
      } else if (numero === 8) {
        const resultado = await rodarEtapa8(sessionIdRef.current);
        guardarResultado(8, resultado);
        if (resultado.falta_impacto || resultado.falta_risco) {
          definirFase(8, FASE.CHECKPOINT_RISCO8);
        } else {
          marcarConcluida(8);
          definirFase(8, FASE.CONFIRMACAO);
        }
      }
    } catch (err) {
      definirErro(numero, extrairMensagemErro(err));
      definirFase(numero, FASE.ERRO);
    } finally {
      marcarProcessando(numero, false);
    }
  }, [marcarProcessando, definirFase, definirErro, guardarResultado, marcarConcluida]);

  useEffect(() => {
    if (location.state?.reabrindo) {
      // ── Modo REABERTURA: carrega o estado do estudo existente no banco ──
      setCarregandoReabertura(true);
      (async () => {
        try {
          const dados = await obterEstadoSessao(sessionIdRef.current);

          // Detecta quais etapas já foram concluídas.
          // O fluxo é sempre sequencial, então etapas 1..etapa_atual foram todas percorridas.
          // Usar etapa_atual como intervalo corrige o caso em que etapa 2 (sem baseline)
          // ou etapa 3 (sem edital) não atualizam esse campo — mas etapas posteriores o fazem.
          const etapaMax = dados.etapa_atual ?? 0;
          const concluidasSet = new Set();
          for (let n = 1; n <= etapaMax; n++) concluidasSet.add(n);

          // etapa3.py sempre define estudo.edital (mesmo sem doc), mas pode não atualizar
          // etapa_atual quando não há documento. Se edital existe, etapas 2 e 3 foram rodadas.
          if (dados.edital) { concluidasSet.add(2); concluidasSet.add(3); }

          const concluidas = [...concluidasSet].sort((a, b) => a - b);

          // Usa os mesmos helpers funcionais do fluxo "ao vivo" (marcarConcluida,
          // guardarResultado, definirFase) para garantir consistência — eles usam
          // a forma funcional do setState (prev => ...) que é segura mesmo com
          // múltiplas chamadas em sequência e com Strict Mode do React.

          // Resultados: a maioria dos componentes busca os próprios dados via sessionId;
          // aqui só preenchemos o que a Cascata lê diretamente (etapas 6 e 8).
          if (dados.documentos?.length > 0) guardarResultado(1, { analise: {} });
          // Etapa 2 pode não ter baseline (sem doc de baseline) — ainda assim foi concluída;
          // guardamos um stub para que o componente renderize em CONFIRMACAO.
          if (concluidasSet.has(2))         guardarResultado(2, { analise: dados.baseline ?? null });
          if (dados.edital)                 guardarResultado(3, { analise: dados.edital });
          if (dados.propostas_tecnicas?.length > 0) guardarResultado(4, { analise: {} });
          if (dados.comparacao_tecnica)     guardarResultado(5, { analise: dados.comparacao_tecnica });
          if (dados.equalizacao_comercial)  guardarResultado(6, { analise: dados.equalizacao_comercial });
          if (dados.recomendacoes)          guardarResultado(7, { analise: dados.recomendacoes });
          if (dados.estrategia_categoria)   guardarResultado(8, { analise: dados.estrategia_categoria });

          // Marca etapas concluídas e define fase CONFIRMACAO — mesma ordem do fluxo ao vivo
          for (const n of concluidas) {
            marcarConcluida(n);
            definirFase(n, FASE.CONFIRMACAO);
          }

          // Abre direto na última etapa concluída (ou etapa 1 se nada concluído)
          const ultimaConcluida = concluidas[concluidas.length - 1] || 1;
          setEtapaVisualizada(ultimaConcluida);
        } catch {
          // Se falhar ao carregar, volta para upload
          navigate("/upload");
        } finally {
          setCarregandoReabertura(false);
        }
      })();
    } else if (Object.keys(resultadosPorEtapa).length === 0) {
      // ── Modo NOVO ESTUDO sem resultado da etapa 1 — redireciona ──
      navigate("/upload");
    } else {
      // ── Modo NOVO ESTUDO normal (vem do UploadDocumentos) ──
      definirFase(1, FASE.CONFIRMACAO);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Confirmações e checkpoints ---
  // Cada confirmação dispara a PRÓXIMA etapa em background e imediatamente
  // move a tela para visualizá-la (comportamento padrão esperado: ao
  // confirmar, "siga para a próxima"). Mas como roda em background, nada
  // impede o usuário de já clicar em outra etapa enquanto essa carrega.

  function handleConfirmar(numero) {
    marcarConcluida(numero);
    if (numero >= 8) {
      navigate("/resultado/8");
      return;
    }
    setEtapaVisualizada(numero + 1);
    rodarEtapaEmBackground(numero + 1);
  }

  async function handleConfirmarAnualizacao(periodo) {
    setCarregandoAcao(true);
    try {
      await confirmarAnualizacao(sessionIdRef.current, periodo);
      marcarConcluida(2);
      definirFase(2, FASE.CONFIRMACAO);
    } catch (err) {
      definirErro(2, extrairMensagemErro(err));
      definirFase(2, FASE.ERRO);
    } finally {
      setCarregandoAcao(false);
    }
  }

  async function handleConfirmarEtapa6(taxa, moeda) {
    setCarregandoAcao(true);
    marcarProcessando(6, true);
    try {
      await confirmarCheckpointEtapa6(sessionIdRef.current, taxa, moeda);
      const resultado = await rodarEtapa6(sessionIdRef.current);
      guardarResultado(6, resultado);
      marcarConcluida(6);
      definirFase(6, FASE.CONFIRMACAO);
    } catch (err) {
      definirErro(6, extrairMensagemErro(err));
      definirFase(6, FASE.ERRO);
    } finally {
      setCarregandoAcao(false);
      marcarProcessando(6, false);
    }
  }

  async function handleConfirmarRisco8({ impactoManual, riscoManual }) {
    setCarregandoAcao(true);
    marcarProcessando(8, true);
    try {
      const resultado = await rodarEtapa8(sessionIdRef.current, { impactoManual, riscoManual });
      guardarResultado(8, resultado);
      marcarConcluida(8);
      definirFase(8, FASE.CONFIRMACAO);
    } catch (err) {
      definirErro(8, extrairMensagemErro(err));
      definirFase(8, FASE.ERRO);
    } finally {
      setCarregandoAcao(false);
      marcarProcessando(8, false);
    }
  }

  // --- Chat de correção inteligente (etapas 2-8) ---
  // Pode ser chamado em QUALQUER etapa concluída, mesmo que outra etapa
  // esteja processando em background ao mesmo tempo (pedido explícito do
  // usuário) — cada chamada de chat é independente da máquina de cascata.

  async function handleEnviarCorrecao(numeroEtapa, mensagem) {
    const resp = await corrigirEtapa(sessionIdRef.current, numeroEtapa, mensagem);
    if (resp.tipo === "edicao" && resp.resultado) {
      const resultadoAtual = resultadosPorEtapa[numeroEtapa] || {};
      guardarResultado(numeroEtapa, { ...resultadoAtual, analise: resp.resultado });
    }
    return { texto: resp.mensagem, tipo: resp.tipo };
  }

  // --- Navegação livre pelo histórico (Stepper) — NÃO depende de nenhuma
  // outra etapa estar livre; funciona mesmo com outra etapa processando.

  function handleClicarEtapaNoStepper(numero) {
    if (!etapasConcluidas.includes(numero)) return;
    // Guard defensivo: se a etapa está concluída mas sem fase definida
    // (pode ocorrer em edge cases do fluxo de reabertura), corrige agora.
    if (!fasePorEtapa[numero]) {
      definirFase(numero, FASE.CONFIRMACAO);
    }
    setEtapaVisualizada(numero);
  }

  // --- Refazer análise + recascateamento automático ---

  async function handleRefazer(numeroEtapa) {
    setCarregandoRefazer(true);
    definirErro(numeroEtapa, null);
    marcarProcessando(numeroEtapa, true);
    try {
      const resp = await recascatearAPartirDe(sessionIdRef.current, numeroEtapa);
      for (const item of resp.etapas_executadas) {
        if (item.etapa !== "4b") {
          guardarResultado(item.etapa, item.resultado);
          marcarConcluida(item.etapa);
          definirFase(item.etapa, FASE.CONFIRMACAO);
        }
      }
      if (resp.parou_em === "6_checkpoint") {
        setEtapaVisualizada(6);
        definirFase(6, FASE.CHECKPOINT_ETAPA6);
      } else if (resp.parou_em === "8_checkpoint") {
        setEtapaVisualizada(8);
        definirFase(8, FASE.CHECKPOINT_RISCO8);
      } else {
        const ultima = resp.etapas_executadas[resp.etapas_executadas.length - 1];
        if (ultima) setEtapaVisualizada(ultima.etapa === "4b" ? 4 : ultima.etapa);
      }
    } catch (err) {
      definirErro(numeroEtapa, extrairMensagemErro(err));
      definirFase(numeroEtapa, FASE.ERRO);
    } finally {
      setCarregandoRefazer(false);
      marcarProcessando(numeroEtapa, false);
    }
  }

  const fase = fasePorEtapa[etapaVisualizada];
  const resultadoAtual = resultadosPorEtapa[etapaVisualizada];
  const erro = erroPorEtapa[etapaVisualizada];
  const mostrarRefazer = etapasConcluidas.includes(etapaVisualizada) && !etapasProcessando.has(etapaVisualizada);
  const estaProcessandoEtapaVisualizada = etapasProcessando.has(etapaVisualizada);

  if (carregandoReabertura) {
    return (
      <div className="min-h-screen bg-am-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={28} className="animate-spin text-am-blue" />
          <p className="text-sm text-am-text-secondary">Carregando estudo...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-am-bg p-5">
      <div className="max-w-4xl mx-auto">
        <TopBar />

        <Card className="mb-4">
          <Stepper
            etapaAtual={etapaVisualizada}
            etapasConcluidas={etapasConcluidas}
            etapasProcessando={etapasProcessando}
            onClicarEtapa={handleClicarEtapaNoStepper}
          />
          <div className="flex items-center justify-between mt-2">
            <p className="text-[11px] text-am-text-secondary">
              {etapasProcessando.size > 0
                ? `Etapa ${[...etapasProcessando].join(", ")} processando em segundo plano — você pode navegar livremente`
                : etapasConcluidas.length > 0
                ? "Clique em uma etapa já concluída (✓) para revisitá-la"
                : ""}
            </p>
            <Button
              variant="ghost"
              size="sm"
              icon={ChevronLeft}
              onClick={() => navigate("/historico")}
            >
              Histórico
            </Button>
          </div>
        </Card>

        <Card title={TITULO_ETAPA[etapaVisualizada]}>
          {fase === FASE.PROCESSANDO && (
            <div className="py-6 flex flex-col items-center gap-4">
              <Loader2 size={20} className="animate-spin text-am-blue" />
              <div className="w-full max-w-xs">
                <BarraProgresso concluido={false} mensagem={MENSAGEM_PROGRESSO[etapaVisualizada]} />
              </div>
            </div>
          )}

          {fase === FASE.ERRO && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 text-am-danger text-sm bg-am-danger/10 rounded-md p-3">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>{erro}</span>
              </div>
              <button
                onClick={() => rodarEtapaEmBackground(etapaVisualizada)}
                className="text-sm text-am-blue hover:underline"
              >
                Tentar de novo
              </button>
            </div>
          )}

          {/* Etapa 1: mini-app rica (KPIs + cenário atual + cards de
              proponente + pontos de atenção), substituindo o painel de
              texto markdown — pedido do usuário ao revisar a tela. O chat
              de intenção (editar/perguntar/confirmar) é o MESMO endpoint
              já existente, sem alteração de lógica. */}
          {fase === FASE.CONFIRMACAO && etapaVisualizada === 1 && (
            <TriagemConteudo
              sessionId={sessionIdRef.current}
              onConfirmado={() => handleConfirmar(1)}
            />
          )}

          {/* Etapa 8: layout rico original (Matriz de Kraljic + cards),
              SEM o card genérico — pedido explícito do usuário de manter
              o comportamento/visual original desta etapa específica. */}
          {fase === FASE.CONFIRMACAO && etapaVisualizada === 8 && (
            <div className="space-y-4">
              <ResultadoEtapa8Conteudo
                analise={resultadoAtual?.analise || {}}
                equalizacao={resultadosPorEtapa[6]?.analise || {}}
                sessionId={sessionIdRef.current}
                casosConsultados={resultadoAtual?.casos_consultados ?? 0}
              />
              <div className="flex justify-end">
                {mostrarRefazer && (
                  <button
                    onClick={() => handleRefazer(8)}
                    disabled={carregandoRefazer}
                    className="text-sm text-am-blue hover:underline"
                  >
                    {carregandoRefazer ? "Refazendo..." : "Refazer análise"}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Etapa 4: mini-app rica (KPIs + tabela paginada/filtrada/
              ordenada, escalável a centenas de propostas), SEM o card
              genérico de texto markdown — pedido explícito do usuário
              após ver a tabela ilegível em formato de texto. */}
          {fase === FASE.CONFIRMACAO && etapaVisualizada === 4 && (
            <PropostasConteudo
              sessionId={sessionIdRef.current}
              onEnviarMensagem={(mensagem) => handleEnviarCorrecao(4, mensagem)}
              onConfirmar={() => handleConfirmar(4)}
              onRefazer={() => handleRefazer(4)}
              mostrarRefazer={mostrarRefazer}
              carregandoRefazer={carregandoRefazer}
            />
          )}

          {/* Etapa 6: mini-app rica comercial (KPIs de preço/savings +
              tabela de equalização), SEM o card genérico — mesmo padrão
              de exceção da Etapa 4, aplicado aqui após o usuário revisar
              a tela e pedir KPIs comerciais (baseline, quantidade de
              propostas, valor médio, melhor proposta) em vez de técnicos. */}
          {fase === FASE.CONFIRMACAO && etapaVisualizada === 6 && (
            <EqualizacaoConteudo
              sessionId={sessionIdRef.current}
              onEnviarMensagem={(mensagem) => handleEnviarCorrecao(6, mensagem)}
              onConfirmar={() => handleConfirmar(6)}
              onRefazer={() => handleRefazer(6)}
              mostrarRefazer={mostrarRefazer}
              carregandoRefazer={carregandoRefazer}
            />
          )}

          {/* Etapa 2: sem tabela — só existe UM baseline, não uma lista de
              itens comparáveis. Cards + painel de leitura única. */}
          {fase === FASE.CONFIRMACAO && etapaVisualizada === 2 && (
            <BaselineConteudo
              sessionId={sessionIdRef.current}
              casosConsultados={resultadoAtual?.casos_consultados ?? 0}
              onEnviarMensagem={(mensagem) => handleEnviarCorrecao(2, mensagem)}
              onConfirmar={() => handleConfirmar(2)}
              onRefazer={() => handleRefazer(2)}
              mostrarRefazer={mostrarRefazer}
              carregandoRefazer={carregandoRefazer}
            />
          )}

          {/* Etapa 3: tabela com REQUISITO como linha (ainda não há
              fornecedor nesta etapa — só o edital em si). */}
          {fase === FASE.CONFIRMACAO && etapaVisualizada === 3 && (
            <EditalConteudo
              sessionId={sessionIdRef.current}
              onEnviarMensagem={(mensagem) => handleEnviarCorrecao(3, mensagem)}
              onConfirmar={() => handleConfirmar(3)}
              onRefazer={() => handleRefazer(3)}
              mostrarRefazer={mostrarRefazer}
              carregandoRefazer={carregandoRefazer}
            />
          )}

          {/* Etapa 5: tabela com FORNECEDOR como linha (matriz requisito x
              fornecedor transposta), matriz completa ao expandir. */}
          {fase === FASE.CONFIRMACAO && etapaVisualizada === 5 && (
            <ComparacaoConteudo
              sessionId={sessionIdRef.current}
              onEnviarMensagem={(mensagem) => handleEnviarCorrecao(5, mensagem)}
              onConfirmar={() => handleConfirmar(5)}
              onRefazer={() => handleRefazer(5)}
              mostrarRefazer={mostrarRefazer}
              carregandoRefazer={carregandoRefazer}
            />
          )}

          {/* Etapa 7: sem tabela densa — dados qualitativos e poucos por
              design (cenários, pontos de negociação). Cards de cenário. */}
          {fase === FASE.CONFIRMACAO && etapaVisualizada === 7 && (
            <RecomendacoesConteudo
              sessionId={sessionIdRef.current}
              casosConsultados={resultadoAtual?.casos_consultados ?? 0}
              onEnviarMensagem={(mensagem) => handleEnviarCorrecao(7, mensagem)}
              onConfirmar={() => handleConfirmar(7)}
              onRefazer={() => handleRefazer(7)}
              mostrarRefazer={mostrarRefazer}
              carregandoRefazer={carregandoRefazer}
            />
          )}

          {fase === FASE.CONFIRMACAO && etapaVisualizada > 1 &&
            ![2, 3, 4, 5, 6, 7, 8].includes(etapaVisualizada) && (
            <CardEtapa
              numeroEtapa={etapaVisualizada}
              sessionId={sessionIdRef.current}
              resumo={resultadoAtual?.resumo || resultadoAtual?.resumo_checkpoint || "Sem resumo disponível."}
              onEnviarMensagem={(mensagem) => handleEnviarCorrecao(etapaVisualizada, mensagem)}
              onConfirmar={() => handleConfirmar(etapaVisualizada)}
              onRefazer={() => handleRefazer(etapaVisualizada)}
              mostrarRefazer={mostrarRefazer}
              carregandoRefazer={carregandoRefazer}
            />
          )}

          {fase === FASE.CHECKPOINT_ANUALIZACAO && (
            <CheckpointAnualizacao
              sugestao={resultadoAtual?.analise?.comercial?.sugestao_periodo}
              onConfirmar={handleConfirmarAnualizacao}
              carregando={carregandoAcao}
            />
          )}

          {fase === FASE.CHECKPOINT_ETAPA6 && (
            <CheckpointEtapa6 onConfirmar={handleConfirmarEtapa6} carregando={carregandoAcao} />
          )}

          {fase === FASE.CHECKPOINT_RISCO8 && (
            <CheckpointRiscoEtapa8
              faltaImpacto={resultadoAtual?.falta_impacto}
              faltaRisco={resultadoAtual?.falta_risco}
              onConfirmar={handleConfirmarRisco8}
              carregando={carregandoAcao}
            />
          )}

          {!fase && !estaProcessandoEtapaVisualizada && (
            <p className="text-sm text-am-text-secondary py-6 text-center">
              Esta etapa ainda não foi iniciada.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
