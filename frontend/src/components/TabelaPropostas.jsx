import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Search, ChevronDown, ChevronUp, ChevronRight, AlertTriangle, Eye, Plus, Minus } from "lucide-react";
import { consultarPropostasEtapa4, detalheFornecedorEtapa4 } from "../lib/api";

const FILTROS_STATUS = [
  { valor: "todos", label: "Todos" },
  { valor: "gaps_mandatorios", label: "Com gaps" },
  { valor: "silencio_mandatorio", label: "Com silêncio" },
  { valor: "sem_gaps", label: "Sem gaps" },
];

const COLUNAS = [
  { chave: "fornecedor", label: "Fornecedor", ordenavel: true, largura: "minmax(160px, 1.4fr)" },
  { chave: "veredito", label: "Veredito técnico", ordenavel: false, largura: "minmax(220px, 2.2fr)" },
  { chave: "aderencia", label: "Aderência", ordenavel: true, largura: "110px" },
  { chave: "gaps", label: "Gaps", ordenavel: true, largura: "90px" },
  { chave: "silencios", label: "Silêncio", ordenavel: true, largura: "90px" },
  { chave: "inclusoes", label: "Inclusões", ordenavel: true, largura: "90px" },
];

function BarraAderencia({ valor }) {
  if (valor == null) return <span className="text-am-text-secondary text-xs">—</span>;
  const cor = valor >= 90 ? "bg-am-positive" : valor >= 70 ? "bg-am-alert" : "bg-am-danger";
  return (
    <div className="flex items-center gap-2">
      <div className="w-12 h-1.5 bg-am-border rounded-full overflow-hidden shrink-0">
        <div className={`h-full ${cor} rounded-full`} style={{ width: `${valor}%` }} />
      </div>
      <span className="text-xs font-mono-num text-am-text shrink-0">{valor}%</span>
    </div>
  );
}

function LinhaDetalhe({ fornecedor, sessionId }) {
  const [detalhe, setDetalhe] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    detalheFornecedorEtapa4(sessionId, fornecedor)
      .then((d) => { if (ativo) setDetalhe(d); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [fornecedor, sessionId]);

  if (carregando) {
    return <div className="px-4 py-4 text-sm text-am-text-secondary">Carregando detalhe...</div>;
  }
  if (!detalhe) {
    return <div className="px-4 py-4 text-sm text-am-danger">Não foi possível carregar o detalhe.</div>;
  }

  const conformidade = detalhe.conformidade || [];

  return (
    <div className="px-4 py-4 bg-am-bg/60 space-y-3">
      {detalhe.resumo_tecnico && (
        <p className="text-sm text-am-text">{detalhe.resumo_tecnico}</p>
      )}

      {detalhe.mandatorios_nao_cumpridos?.length > 0 && (
        <div className="text-sm">
          <p className="font-medium text-am-danger flex items-center gap-1.5 mb-1">
            <AlertTriangle size={13} /> Mandatórios não cumpridos
          </p>
          <ul className="list-disc pl-5 text-am-text-secondary space-y-0.5">
            {detalhe.mandatorios_nao_cumpridos.map((m, i) => <li key={i}>{m}</li>)}
          </ul>
        </div>
      )}

      {detalhe.mandatorios_nao_mencionados?.length > 0 && (
        <div className="text-sm">
          <p className="font-medium text-am-alert flex items-center gap-1.5 mb-1">
            <Eye size={13} /> Silêncio sobre mandatórios (confirmar com fornecedor)
          </p>
          <ul className="list-disc pl-5 text-am-text-secondary space-y-0.5">
            {detalhe.mandatorios_nao_mencionados.map((m, i) => <li key={i}>{m}</li>)}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {detalhe.inclusoes_escopo?.length > 0 && (
          <div className="text-sm">
            <p className="font-medium text-am-positive flex items-center gap-1.5 mb-1">
              <Plus size={13} /> Inclui no escopo
            </p>
            <ul className="list-disc pl-5 text-am-text-secondary space-y-0.5">
              {detalhe.inclusoes_escopo.map((m, i) => <li key={i}>{m}</li>)}
            </ul>
          </div>
        )}
        {detalhe.exclusoes_escopo?.length > 0 && (
          <div className="text-sm">
            <p className="font-medium text-am-text-secondary flex items-center gap-1.5 mb-1">
              <Minus size={13} /> Exclui do escopo
            </p>
            <ul className="list-disc pl-5 text-am-text-secondary space-y-0.5">
              {detalhe.exclusoes_escopo.map((m, i) => <li key={i}>{m}</li>)}
            </ul>
          </div>
        )}
      </div>

      {conformidade.length > 0 && (
        <div>
          <p className="text-sm font-medium text-am-navy mb-1.5">Conformidade requisito a requisito</p>
          <div className="border border-am-border rounded-md overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-white text-am-text-secondary border-b border-am-border">
                  <th className="text-left px-2.5 py-1.5 font-medium">Req.</th>
                  <th className="text-left px-2.5 py-1.5 font-medium">Descrição</th>
                  <th className="text-left px-2.5 py-1.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {conformidade.map((c, i) => (
                  <tr key={i} className="border-b border-am-border last:border-0 bg-white">
                    <td className="px-2.5 py-1.5 text-am-text-secondary">{c.req_id}</td>
                    <td className="px-2.5 py-1.5 text-am-text">{c.descricao_curta}</td>
                    <td className="px-2.5 py-1.5">
                      <span className={
                        c.status === "cumpre" ? "text-am-positive" :
                        c.status === "não cumpre" ? "text-am-danger" :
                        c.status === "parcial" ? "text-am-alert" :
                        "text-am-text-secondary"
                      }>
                        {c.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// Componente principal: tabela de propostas técnicas, paginada/filtrada no
// SERVIDOR (busca, status, ordenação são parâmetros de query — nunca
// carregamos todas as propostas de uma vez no cliente). Usa virtualização
// na lista de linhas visíveis para escalar a centenas de itens.
export default function TabelaPropostas({ sessionId }) {
  const [busca, setBusca] = useState("");
  const [buscaDebounced, setBuscaDebounced] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("todos");
  const [ordenarPor, setOrdenarPor] = useState("fornecedor");
  const [direcao, setDirecao] = useState("asc");
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState({ itens: [], total_filtrado: 0, total_paginas: 1 });
  const [carregando, setCarregando] = useState(true);
  const [linhaExpandida, setLinhaExpandida] = useState(null);
  const tamanhoPagina = 50;

  // Debounce da busca — evita disparar uma chamada de API a cada tecla.
  useEffect(() => {
    const timer = setTimeout(() => setBuscaDebounced(busca), 350);
    return () => clearTimeout(timer);
  }, [busca]);

  useEffect(() => {
    setPagina(1);
    setLinhaExpandida(null);
  }, [buscaDebounced, statusFiltro, ordenarPor, direcao]);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    consultarPropostasEtapa4(sessionId, {
      pagina, tamanhoPagina, busca: buscaDebounced, status: statusFiltro,
      ordenarPor, direcao,
    })
      .then((d) => { if (ativo) setDados(d); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [sessionId, pagina, buscaDebounced, statusFiltro, ordenarPor, direcao]);

  function alternarOrdenacao(coluna) {
    if (ordenarPor === coluna) {
      setDirecao((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setOrdenarPor(coluna);
      setDirecao("asc");
    }
  }

  const parentRef = useRef(null);
  const virtualizer = useVirtualizer({
    count: dados.itens.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 8,
    // measureElement permite que o virtualizador remeça a altura real de
    // cada linha (incluindo quando ela expande para mostrar o detalhe) —
    // sem isso, uma linha expandida ficava sobrepondo as linhas seguintes,
    // já que a virtualização continuava assumindo 48px fixos por linha.
    measureElement: (el) => el?.getBoundingClientRect().height ?? 48,
  });

  // Sempre que uma linha expande/recolhe, a altura dela muda — força o
  // virtualizador a remedir, em vez de confiar na altura estimada antiga.
  useEffect(() => {
    virtualizer.measure();
  }, [linhaExpandida, virtualizer]);

  return (
    <div className="space-y-3">
      {/* Barra de controles: busca + filtro de status */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-am-text-secondary" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por fornecedor ou item..."
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-am-border-strong outline-none focus:ring-2 focus:ring-am-blue/20 focus:border-am-blue"
          />
        </div>

        <div className="flex gap-1.5">
          {FILTROS_STATUS.map((f) => (
            <button
              key={f.valor}
              onClick={() => setStatusFiltro(f.valor)}
              className={`text-xs px-2.5 py-1.5 rounded-md font-medium transition ${
                statusFiltro === f.valor
                  ? "bg-am-navy text-white"
                  : "bg-white text-am-text-secondary border border-am-border hover:bg-am-bg"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <span className="text-xs text-am-text-secondary ml-auto">
          {dados.total_filtrado} fornecedor{dados.total_filtrado !== 1 ? "es" : ""}
          {dados.total_filtrado !== dados.total_sem_filtro && ` (de ${dados.total_sem_filtro})`}
        </span>
      </div>

      {/* Cabeçalho da tabela */}
      <div className="border border-am-border rounded-lg overflow-hidden bg-white">
        <div
          className="grid gap-2 px-4 py-2 bg-am-bg border-b border-am-border text-xs font-medium text-am-text-secondary sticky top-0"
          style={{ gridTemplateColumns: COLUNAS.map((c) => c.largura).join(" ") + " 28px" }}
        >
          {COLUNAS.map((col) => (
            <button
              key={col.chave}
              onClick={col.ordenavel ? () => alternarOrdenacao(col.chave) : undefined}
              className={`text-left flex items-center gap-1 ${col.ordenavel ? "cursor-pointer hover:text-am-navy" : "cursor-default"}`}
            >
              {col.label}
              {col.ordenavel && ordenarPor === col.chave && (
                direcao === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />
              )}
            </button>
          ))}
          <span />
        </div>

        {/* Corpo virtualizado: só renderiza as linhas visíveis na viewport,
            escalando a centenas de fornecedores sem travar o navegador. */}
        <div ref={parentRef} className="overflow-y-auto" style={{ maxHeight: "520px" }}>
          {carregando ? (
            <div className="px-4 py-8 text-center text-sm text-am-text-secondary">Carregando...</div>
          ) : dados.itens.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-am-text-secondary">
              Nenhum fornecedor encontrado com esses filtros.
            </div>
          ) : (
            <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
              {virtualizer.getVirtualItems().map((linha) => {
                const item = dados.itens[linha.index];
                const expandida = linhaExpandida === item.fornecedor;
                return (
                  <div
                    key={item.fornecedor}
                    ref={virtualizer.measureElement}
                    data-index={linha.index}
                    style={{
                      position: "absolute", top: 0, left: 0, width: "100%",
                      transform: `translateY(${linha.start}px)`,
                    }}
                  >
                    <button
                      onClick={() => setLinhaExpandida(expandida ? null : item.fornecedor)}
                      className="w-full grid gap-2 px-4 py-2.5 border-b border-am-border hover:bg-am-bg/50 text-left items-center"
                      style={{ gridTemplateColumns: COLUNAS.map((c) => c.largura).join(" ") + " 28px", minHeight: "48px" }}
                    >
                      <span className="text-sm font-medium text-am-navy truncate">{item.fornecedor}</span>
                      <span className="text-xs text-am-text-secondary truncate">{item.veredito_executivo}</span>
                      <BarraAderencia valor={item.percentual_aderencia} />
                      <span className={`text-xs font-medium ${item.n_gaps_mandatorios > 0 ? "text-am-danger" : "text-am-text-secondary"}`}>
                        {item.n_gaps_mandatorios > 0 ? `${item.n_gaps_mandatorios} gap${item.n_gaps_mandatorios > 1 ? "s" : ""}` : "—"}
                      </span>
                      <span className={`text-xs font-medium ${item.n_silencios_mandatorios > 0 ? "text-am-alert" : "text-am-text-secondary"}`}>
                        {item.n_silencios_mandatorios > 0 ? item.n_silencios_mandatorios : "—"}
                      </span>
                      <span className="text-xs text-am-text-secondary">
                        {item.n_inclusoes_escopo > 0 ? `+${item.n_inclusoes_escopo}` : "—"}
                      </span>
                      <ChevronRight size={14} className={`text-am-text-secondary transition-transform ${expandida ? "rotate-90" : ""}`} />
                    </button>
                    {expandida && <LinhaDetalhe fornecedor={item.fornecedor} sessionId={sessionId} />}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Paginação */}
      {dados.total_paginas > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setPagina((p) => Math.max(1, p - 1))}
            disabled={pagina <= 1}
            className="text-xs text-am-blue disabled:text-am-text-secondary disabled:cursor-not-allowed hover:underline"
          >
            Anterior
          </button>
          <span className="text-xs text-am-text-secondary">
            Página {dados.pagina} de {dados.total_paginas}
          </span>
          <button
            onClick={() => setPagina((p) => Math.min(dados.total_paginas, p + 1))}
            disabled={pagina >= dados.total_paginas}
            className="text-xs text-am-blue disabled:text-am-text-secondary disabled:cursor-not-allowed hover:underline"
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  );
}
