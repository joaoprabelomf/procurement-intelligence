import Card from "./Card";
import MatrizKraljic from "./MatrizKraljic";
import DownloadBar from "./DownloadBar";
import BadgeRAG from "./BadgeRAG";
import BadgeConfianca from "./BadgeConfianca";
import { urlDownloadEtapa8Word, urlDownloadEtapa8Excel, urlDownloadEtapa8Ppt } from "../lib/api";

// Conteúdo visual completo do resultado da Etapa 8 (Matriz de Kraljic +
// cards de relacionamento/fornecedores + comparativo executivo + ações
// táticas + downloads). Extraído de ResultadoEtapa8.jsx para ser reutilizado
// em dois lugares:
//   1. A tela de resultado standalone (/resultado/8), que busca o estudo
//      direto da API.
//   2. Inline dentro da Cascata, quando o usuário está na Etapa 8 (por
//      pedido explícito do usuário: a Etapa 8 NÃO usa o card genérico de
//      "resumo + chat" das outras etapas — mantém seu layout rico original).
//
// analise: estudo.estrategia_categoria
// equalizacao: estudo.equalizacao_comercial
export default function ResultadoEtapa8Conteudo({ analise, equalizacao, sessionId, casosConsultados = 0, confiancaEtapa = null }) {
  const fornecedores = equalizacao?.por_fornecedor || [];

  return (
    <div className="space-y-4">
      {(confiancaEtapa || casosConsultados > 0) && (
        <div className="flex flex-wrap gap-2">
          <BadgeConfianca confiancaEtapa={confiancaEtapa} />
          <BadgeRAG casosConsultados={casosConsultados} />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[1.15fr_1fr] gap-4">
        <Card title="Matriz de Kraljic" subtitle="Complexidade de suprimento × impacto financeiro">
          <MatrizKraljic
            impacto={analise._impacto}
            risco={analise._risco}
            quadrante={analise.quadrante}
          />
          <p className="text-xs text-am-text-secondary text-center mt-2">
            Impacto: {analise._impacto} ({analise._origem_impacto}) · Risco: {analise._risco} ({analise._origem_risco})
          </p>
        </Card>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2.5">
            <Card className="!shadow-none !bg-am-bg">
              <p className="text-[11px] text-am-text-secondary mb-1.5">Relacionamento</p>
              <p className="text-sm font-semibold text-am-navy">{analise.tipo_relacionamento || "—"}</p>
            </Card>
            <Card className="!shadow-none !bg-am-bg">
              <p className="text-[11px] text-am-text-secondary mb-1.5">Fornecedores sugeridos</p>
              <p className="text-sm font-semibold text-am-navy">{analise.numero_fornecedores_sugerido || "—"}</p>
            </Card>
          </div>

          {fornecedores.length > 0 && (
            <Card title="Comparativo executivo">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-am-border text-am-text-secondary text-xs">
                    <th className="text-left pb-2 font-medium">Fornecedor</th>
                    <th className="text-right pb-2 font-medium">Preço equalizado</th>
                    <th className="text-right pb-2 font-medium">Savings</th>
                  </tr>
                </thead>
                <tbody>
                  {fornecedores.map((f) => (
                    <tr key={f.fornecedor} className="border-b border-am-bg last:border-0">
                      <td className="py-2 font-medium text-am-navy">{f.fornecedor}</td>
                      <td className="py-2 text-right">
                        {f.preco_total_equalizado != null
                          ? f.preco_total_equalizado.toLocaleString("pt-BR", { style: "currency", currency: equalizacao?.moeda_referencia || "BRL" })
                          : "—"}
                      </td>
                      <td className={`py-2 text-right font-medium ${f.savings_vs_baseline >= 0 ? "text-am-positive" : "text-am-danger"}`}>
                        {f.savings_percentual != null ? `${f.savings_percentual.toFixed(1)}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      </div>

      <Card title="Resumo da posição">
        <p className="text-sm text-am-text leading-relaxed">{analise.resumo_posicao}</p>
        {analise.estrategia_recomendada && (
          <p className="text-sm text-am-text leading-relaxed mt-3">{analise.estrategia_recomendada}</p>
        )}
      </Card>

      {analise.acoes_taticas?.length > 0 && (
        <Card title="Ações táticas">
          <div className="space-y-2">
            {analise.acoes_taticas.map((a, idx) => (
              <div key={idx} className="flex gap-3 text-sm">
                <span className="text-xs font-medium text-am-blue bg-am-blue/10 rounded px-2 py-0.5 h-fit shrink-0">
                  {a.prazo}
                </span>
                <div>
                  <p className="text-am-text">{a.acao}</p>
                  <p className="text-am-text-secondary text-xs mt-0.5">{a.racional}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <DownloadBar
        urlWord={urlDownloadEtapa8Word(sessionId)}
        urlExcel={urlDownloadEtapa8Excel(sessionId)}
        urlPpt={urlDownloadEtapa8Ppt(sessionId)}
        label="Exportar entregáveis da etapa 8"
      />
    </div>
  );
}
