import { useState, useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Search, ChevronDown, ChevronUp, ChevronRight, Plus, Minus, Settings2 } from "lucide-react";
import { consultarEqualizacaoEtapa6, detalheFornecedorEtapa6 } from "../lib/api";

const FILTROS_STATUS = [
  { valor: "todos", label: "Todos" },
  { valor: "economia", label: "Com economia" },
  { valor: "aumento", label: "Com aumento" },
  { valor: "com_on_tops", label: "Com on-tops" },
];

const COLUNAS = [
  { chave: "fornecedor", label: "Fornecedor", ordenavel: true, largura: "minmax(150px, 1.2fr)" },
  { chave: "metodo", label: "Método de equalização", ordenavel: false, largura: "minmax(200px, 2fr)" },
  { chave: "preco", label: "Preço total equalizado", ordenavel: true, largura: "150px" },
  { chave: "savings", label: "Savings", ordenavel: true, largura: "110px" },
  { chave: "on_tops", label: "On-tops", ordenavel: true, largura: "90px" },
];

function formatarMoeda(valor, moeda = "BRL") {
  if (valor == null) return "—";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: moeda });
}

function SavingsBadge({ valorPercentual }) {
  if (valorPercentual == null) return <span className="text-am-text-secondary text-xs">—</span>;
  const positivo = valorPercentual >= 0;
  return (
    <span className={`text-xs font-mono-num font-medium ${positivo ? "text-am-positive" : "text-am-danger"}`}>
      {positivo ? "+" : ""}{valorPercentual.toFixed(1)}%
    </span>
  );
}

function ListaOnTops({ titulo, itens, icon: Icon, cor }) {
  if (!itens || itens.length === 0) return null;
  return (
    <div className="text-sm">
      <p className={`font-medium ${cor} flex items-center gap-1.5 mb-1`}>
        <Icon size={13} /> {titulo}
      </p>
      <ul className="space-y-1">
        {itens.map((o, i) => (
          <li key={i} className="text-am-text-secondary flex items-baseline justify-between gap-2">
            <span>{o.item}</span>
            <span className="font-mono-num text-xs shrink-0">
              {o.valor_estimado != null
                ? `${o.direcao === "soma" ? "+" : "−"}${formatarMoeda(o.valor_estimado)}`
                : `${o.direcao === "soma" ? "+" : "−"}(não estimado)`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LinhaDetalhe({ fornecedor, sessionId }) {
  const [detalhe, setDetalhe] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    detalheFornecedorEtapa6(sessionId, fornecedor)
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

  return (
    <div className="px-4 py-4 bg-am-bg/60 space-y-3">
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-[11px] text-am-text-secondary mb-0.5">Preço base equalizado</p>
          <p className="font-mono-num font-medium text-am-navy">{formatarMoeda(detalhe.preco_base_equalizado)}</p>
        </div>
        <div>
          <p className="text-[11px] text-am-text-secondary mb-0.5">Preço total equalizado</p>
          <p className="font-mono-num font-medium text-am-navy">{formatarMoeda(detalhe.preco_total_equalizado)}</p>
        </div>
        <div>
          <p className="text-[11px] text-am-text-secondary mb-0.5">Savings vs baseline</p>
          <p className="font-mono-num font-medium text-am-positive">
            {detalhe.savings_vs_baseline != null ? formatarMoeda(detalhe.savings_vs_baseline) : "—"}
          </p>
        </div>
      </div>

      <p className="text-sm text-am-text">{detalhe.metodo_equalizacao}</p>

      <div className="grid grid-cols-2 gap-3">
        <ListaOnTops titulo="On-tops de escopo (edital vs baseline)" itens={detalhe.on_tops_escopo} icon={Plus} cor="text-am-blue" />
        <ListaOnTops titulo="On-tops de desvio (inclusão/exclusão/gap)" itens={detalhe.on_tops_desvio} icon={Minus} cor="text-am-alert" />
      </div>

      {detalhe.ajustes_condicoes?.length > 0 && (
        <div className="text-sm">
          <p className="font-medium text-am-text-secondary flex items-center gap-1.5 mb-1">
            <Settings2 size={13} /> Ajustes de condições (frete/impostos/prazo/moeda)
          </p>
          <ul className="space-y-1">
            {detalhe.ajustes_condicoes.map((a, i) => (
              <li key={i} className="text-am-text-secondary">
                <span className="text-xs uppercase text-am-text-secondary/70 mr-1">[{a.tipo}]</span>
                {a.comentario}
              </li>
            ))}
          </ul>
        </div>
      )}

      {detalhe.faltantes?.length > 0 && (
        <div className="text-sm">
          <p className="font-medium text-am-danger mb-1">Limitações desta equalização</p>
          <ul className="list-disc pl-5 text-am-text-secondary space-y-0.5">
            {detalhe.faltantes.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

// Tabela de equalização comercial (Etapa 6) — mesmo padrão de paginação/
// busca/ordenação/virtualização da TabelaPropostas (Etapa 4), adaptado
// para colunas COMERCIAIS (preço, savings, on-tops) em vez de técnicas
// (aderência, gaps, silêncio).
export default function TabelaEqualizacao({ sessionId, moeda = "BRL" }) {
  const [busca, setBusca] = useState("");
  const [buscaDebounced, setBuscaDebounced] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("todos");
  const [ordenarPor, setOrdenarPor] = useState("preco");
  const [direcao, setDirecao] = useState("asc");
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState({ itens: [], total_filtrado: 0, total_paginas: 1 });
  const [carregando, setCarregando] = useState(true);
  const [linhaExpandida, setLinhaExpandida] = useState(null);
  const tamanhoPagina = 50;

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
    consultarEqualizacaoEtapa6(sessionId, {
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
    measureElement: (el) => el?.getBoundingClientRect().height ?? 48,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [linhaExpandida, virtualizer]);

  return (
    <div className="space-y-3">
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
                      <span className="text-xs text-am-text-secondary truncate">{item.metodo_equalizacao}</span>
                      <span className="text-xs font-mono-num text-am-text">{formatarMoeda(item.preco_total_equalizado, moeda)}</span>
                      <SavingsBadge valorPercentual={item.savings_percentual} />
                      <span className="text-xs text-am-text-secondary">
                        {(item.n_on_tops_escopo + item.n_on_tops_desvio) > 0 ? `${item.n_on_tops_escopo + item.n_on_tops_desvio}` : "—"}
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
