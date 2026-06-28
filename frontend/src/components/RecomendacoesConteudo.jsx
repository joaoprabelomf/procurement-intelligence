import { useState, useEffect } from "react";
import { Send, Check, RefreshCw, Pencil, TrendingDown, Trophy, GitBranch, Handshake } from "lucide-react";
import ReactMarkdown from "react-markdown";
import Button from "./Button";
import Card from "./Card";
import BadgeRAG from "./BadgeRAG";
import BadgeConfianca from "./BadgeConfianca";
import DownloadBar from "./DownloadBar";
import { resumoExecutivoEtapa7, conteudoEtapa7, urlDownloadEtapa7Word, urlDownloadEtapa7Excel, urlDownloadEtapa7Ppt } from "../lib/api";

function formatarMoeda(valor) {
  if (valor == null) return "—";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// "Mini-app" da Etapa 7 (Recomendações Finais) — SEM tabela densa, por
// decisão deliberada: os dados aqui são poucos e qualitativos por design
// do prompt (2-4 cenários, poucos pontos de negociação). A visão certa é
// cards de cenário lado a lado, respeitando a regra de neutralidade da
// própria etapa (nenhum ranking visual entre "três melhores").
export default function RecomendacoesConteudo({
  sessionId,
  casosConsultados = 0,
  confiancaEtapa = null,
  onEnviarMensagem,
  onConfirmar,
  onRefazer,
  mostrarRefazer,
  carregandoRefazer,
}) {
  const [resumo, setResumo] = useState(null);
  const [conteudo, setConteudo] = useState(null);
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [historico, setHistorico] = useState([]);
  const [chaveRecarregar, setChaveRecarregar] = useState(0);

  useEffect(() => {
    resumoExecutivoEtapa7(sessionId).then(setResumo);
    conteudoEtapa7(sessionId).then(setConteudo);
  }, [sessionId, chaveRecarregar]);

  async function enviarMensagem(e) {
    e.preventDefault();
    if (!mensagem.trim()) return;
    const minhaMensagem = mensagem;
    setMensagem("");
    setHistorico((h) => [...h, { autor: "usuario", texto: minhaMensagem }]);
    setEnviando(true);
    try {
      const resp = await onEnviarMensagem(minhaMensagem);
      setHistorico((h) => [...h, { autor: "assistente", texto: resp.texto, tipo: resp.tipo }]);
      if (resp.tipo === "edicao") setChaveRecarregar((k) => k + 1);
    } catch (err) {
      setHistorico((h) => [...h, { autor: "assistente", texto: "Não consegui processar essa correção agora.", tipo: "erro" }]);
    } finally {
      setEnviando(false);
    }
  }

  const kpis = resumo ? [
    { label: "Maior savings", valor: formatarMoeda(resumo.maior_savings_absoluto), icon: TrendingDown, cor: "text-am-navy" },
    { label: "Fornecedor associado", valor: resumo.fornecedor_maior_savings || "—", icon: Trophy, cor: "text-am-positive" },
    { label: "Cenários de decisão", valor: resumo.n_cenarios_decisao, icon: GitBranch, cor: "text-am-blue" },
    { label: "Pontos de negociação", valor: resumo.n_pontos_negociacao, icon: Handshake, cor: "text-am-alert" },
  ] : [];

  const tres = conteudo?.tres_melhores || {};

  return (
    <div className="space-y-4">
      {(confiancaEtapa || casosConsultados > 0) && (
        <div className="flex flex-wrap gap-2">
          <BadgeConfianca confiancaEtapa={confiancaEtapa} />
          <BadgeRAG casosConsultados={casosConsultados} />
        </div>
      )}

      {resumo && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {kpis.map((item) => (
            <Card key={item.label} className="!shadow-card">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className="text-[11px] text-am-text-secondary mb-1.5">{item.label}</p>
                  <p className={`text-lg font-bold font-mono-num ${item.cor} break-words`}>{item.valor}</p>
                </div>
                <item.icon size={16} className={`${item.cor} opacity-60 mt-0.5 shrink-0`} />
              </div>
            </Card>
          ))}
        </div>
      )}

      {!conteudo?.eh_comparacao_real && conteudo && (
        <div className="bg-am-alert/10 text-am-navy text-sm rounded-md px-4 py-2.5">
          Apenas 1 fornecedor avaliado — não há comparação entre propostas.
        </div>
      )}

      {/* "Três melhores" — sem hierarquia visual entre eles, mesma regra
          de neutralidade do prompt da Etapa 7 (nenhum é destacado como "o" recomendado). */}
      {(tres.melhor_preco || tres.melhor_tecnica || tres.melhor_custo_beneficio) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { chave: "melhor_preco", label: "Melhor preço" },
            { chave: "melhor_tecnica", label: "Melhor técnica" },
            { chave: "melhor_custo_beneficio", label: "Melhor custo-benefício" },
          ].map(({ chave, label }) => {
            const item = tres[chave];
            if (!item) return null;
            return (
              <Card key={chave}>
                <p className="text-xs text-am-text-secondary mb-1.5">{label}</p>
                <p className="text-sm font-semibold text-am-navy mb-1.5">{item.fornecedor}</p>
                <p className="text-xs text-am-text-secondary leading-relaxed">{item.justificativa}</p>
              </Card>
            );
          })}
        </div>
      )}

      {conteudo?.cenarios_decisao?.length > 0 && (
        <Card title="Cenários de decisão">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {conteudo.cenarios_decisao.map((c, idx) => (
              <div key={idx} className="border border-am-border rounded-md p-3">
                <div className="flex items-baseline gap-2 mb-1.5">
                  <p className="text-sm font-semibold text-am-navy">{c.nome}</p>
                  <span className="text-xs text-am-text-secondary">({c.fornecedor_associado})</span>
                </div>
                <p className="text-sm text-am-text mb-1.5">{c.descricao}</p>
                <p className="text-xs text-am-text-secondary"><span className="font-medium">Trade-off:</span> {c.trade_off}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {conteudo?.pontos_negociacao?.length > 0 && (
        <Card title="Pontos de negociação">
          <div className="space-y-3">
            {conteudo.pontos_negociacao.map((p, idx) => (
              <div key={idx}>
                <p className="text-sm font-semibold text-am-navy mb-1.5">{p.fornecedor}</p>
                <ul className="space-y-1">
                  {(p.alavancas || []).map((a, i) => (
                    <li key={i} className="text-sm text-am-text-secondary">
                      <span className="text-xs text-am-blue font-medium">[{a.origem}]</span> {a.ponto} — {a.argumento}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      )}

      {conteudo?.leitura_final && (
        <Card title="Leitura final">
          <p className="text-sm text-am-text leading-relaxed">{conteudo.leitura_final}</p>
        </Card>
      )}

      <DownloadBar
        urlWord={urlDownloadEtapa7Word(sessionId)}
        urlExcel={urlDownloadEtapa7Excel(sessionId)}
        urlPpt={urlDownloadEtapa7Ppt(sessionId)}
        label="Entregáveis da etapa 7"
      />

      {historico.length > 0 && (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {historico.map((msg, idx) => (
            <div
              key={idx}
              className={`text-sm rounded-md px-3 py-2 max-w-[80%] ${
                msg.autor === "usuario" ? "bg-am-blue/10 text-am-text ml-auto" :
                msg.tipo === "esclarecimento" ? "bg-am-alert/10 text-am-navy" :
                msg.tipo === "edicao" ? "bg-am-positive/10 text-am-navy" :
                "bg-am-bg text-am-text"
              }`}
            >
              <ReactMarkdown>{msg.texto}</ReactMarkdown>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={enviarMensagem} className="flex gap-2">
        <input
          type="text"
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
          placeholder="Pergunte ou peça uma correção, ex: 'qual o trade-off do cenário de economia?'"
          className="flex-1 rounded-md border border-am-border-strong px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-am-blue/20 focus:border-am-blue"
          disabled={enviando}
        />
        <Button variant="secondary" size="md" icon={Send} disabled={enviando || !mensagem.trim()}>
          Enviar
        </Button>
      </form>

      <div className="flex items-center justify-between pt-2 border-t border-am-border">
        <p className="text-xs text-am-text-secondary flex items-center gap-1.5">
          <Pencil size={12} /> Pergunte sobre os dados ou peça correções
        </p>
        <div className="flex gap-2">
          {mostrarRefazer && (
            <Button variant="secondary" icon={RefreshCw} onClick={onRefazer} disabled={carregandoRefazer} className={carregandoRefazer ? "[&_svg]:animate-spin" : ""}>
              {carregandoRefazer ? "Refazendo..." : "Refazer análise"}
            </Button>
          )}
          {onConfirmar && (
            <Button variant="primary" icon={Check} onClick={onConfirmar}>
              Confirmar e seguir
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
