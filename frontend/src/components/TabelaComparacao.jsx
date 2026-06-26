import { useState, useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Search, ChevronDown, ChevronUp, ChevronRight, Plus, Minus } from "lucide-react";
import { consultarComparacaoEtapa5, detalheFornecedorEtapa5 } from "../lib/api";
import StatusBadge from "./StatusBadge";

function getFiltrosStatus(temMandatoriosFormais) {
  return [
    { valor: "todos", label: "Todos" },
    { valor: "com_gap", label: temMandatoriosFormais ? "Com gap mandatório" : "Com gap relevante" },
    { valor: "sem_gap", label: "Sem gap" },
    { valor: "com_desvio", label: "Com desvio" },
  ];
}

const COLUNAS = [
  { chave: "fornecedor", label: "Fornecedor", ordenavel: true, largura: "minmax(150px, 1.3fr)" },
  { chave: "conformidade", label: "Conformidade", ordenavel: true, largura: "150px" },
  { chave: "nao_cumpre", label: "Não cumpre", ordenavel: true, largura: "100px" },
  { chave: "parcial", label: "Parcial", ordenavel: true, largura: "90px" },
];

function BarraConformidade({ valor }) {
  if (valor == null) return <span className="text-am-text-secondary text-xs">—</span>;
  const cor = valor >= 90 ? "bg-am-positive" : valor >= 70 ? "bg-am-alert" : "bg-am-danger";
  return (
    <div className="flex items-center gap-2">
      <div className="w-14 h-1.5 bg-am-border rounded-full overflow-hidden shrink-0">
        <div className={`h-full ${cor} rounded-full`} style={{ width: `${valor}%` }} />
      </div>
      <span className="text-xs font-mono-num text-am-text shrink-0">{valor}%</span>
    </div>
  );
}

function LinhaDetalheMatriz({ fornecedor, sessionId, temMandatoriosFormais }) {
  const [detalhe, setDetalhe] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    detalheFornecedorEtapa5(sessionId, fornecedor)
      .then((d) => { if (ativo) setDetalhe(d); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [fornecedor, sessionId]);

  if (carregando) return <div className="px-4 py-4 text-sm text-am-text-secondary">Carregando matriz...</div>;
  if (!detalhe) return <div className="px-4 py-4 text-sm text-am-danger">Não foi possível carregar o detalhe.</div>;

  return (
    <div className="px-4 py-4 bg-am-bg/60 space-y-3">
      {detalhe.gap_mandatorio && (
        <div className="text-sm bg-am-danger/10 rounded-md px-3 py-2">
          <p className="font-medium text-am-danger">{temMandatoriosFormais ? "Gap mandatório" : "Gap relevante"}</p>
          <p className="text-am-text-secondary">{detalhe.gap_mandatorio.leitura}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {detalhe.inclusoes_exclusivas?.length > 0 && (
          <div className="text-sm">
            <p className="font-medium text-am-blue flex items-center gap-1.5 mb-1"><Plus size={13} /> Inclusões exclusivas</p>
            <ul className="list-disc pl-5 text-am-text-secondary space-y-0.5">
              {detalhe.inclusoes_exclusivas.map((i, idx) => <li key={idx}>{i.item}</li>)}
            </ul>
          </div>
        )}
        {detalhe.exclusoes_relevantes?.length > 0 && (
          <div className="text-sm">
            <p className="font-medium text-am-alert flex items-center gap-1.5 mb-1"><Minus size={13} /> Exclusões relevantes</p>
            <ul className="list-disc pl-5 text-am-text-secondary space-y-0.5">
              {detalhe.exclusoes_relevantes.map((e, idx) => <li key={idx}>{e.item}</li>)}
            </ul>
          </div>
        )}
      </div>

      <div>
        <p className="text-sm font-medium text-am-navy mb-1.5">Matriz de requisitos</p>
        <div className="border border-am-border rounded-md overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-white text-am-text-secondary border-b border-am-border">
                <th className="text-left px-2.5 py-1.5 font-medium">Req.</th>
                <th className="text-left px-2.5 py-1.5 font-medium">Descrição</th>
                <th className="text-left px-2.5 py-1.5 font-medium">Tipo</th>
                <th className="text-left px-2.5 py-1.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {detalhe.requisitos.map((r, i) => (
                <tr key={i} className="border-b border-am-border last:border-0 bg-white">
                  <td className="px-2.5 py-1.5 text-am-text-secondary">{r.req_id}</td>
                  <td className="px-2.5 py-1.5 text-am-text">{r.descricao_curta}</td>
                  <td className="px-2.5 py-1.5 text-am-text-secondary">{r.tipo}</td>
                  <td className="px-2.5 py-1.5"><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Tabela de comparação técnica (Etapa 5) — FORNECEDOR como linha (decisão
// confirmada com o usuário: igual ao padrão das Etapas 4/6), com a matriz
// completa de requisitos × status aparecendo só ao expandir a linha.
export default function TabelaComparacao({ sessionId, temMandatoriosFormais = true }) {
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
    consultarComparacaoEtapa5(sessionId, {
      pagina, tamanhoPagina, busca: buscaDebounced, status: statusFiltro, ordenarPor, direcao,
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
            placeholder="Buscar por fornecedor..."
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-am-border-strong outline-none focus:ring-2 focus:ring-am-blue/20 focus:border-am-blue"
          />
        </div>
        <div className="flex gap-1.5">
          {getFiltrosStatus(temMandatoriosFormais).map((f) => (
            <button
              key={f.valor}
              onClick={() => setStatusFiltro(f.valor)}
              className={`text-xs px-2.5 py-1.5 rounded-md font-medium transition ${
                statusFiltro === f.valor ? "bg-am-navy text-white" : "bg-white text-am-text-secondary border border-am-border hover:bg-am-bg"
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
          className="grid gap-2 px-4 py-2 bg-am-bg border-b border-am-border text-xs font-medium text-am-text-secondary"
          style={{ gridTemplateColumns: COLUNAS.map((c) => c.largura).join(" ") + " 28px" }}
        >
          {COLUNAS.map((col) => (
            <button
              key={col.chave}
              onClick={col.ordenavel ? () => alternarOrdenacao(col.chave) : undefined}
              className={`text-left flex items-center gap-1 ${col.ordenavel ? "cursor-pointer hover:text-am-navy" : "cursor-default"}`}
            >
              {col.label}
              {col.ordenavel && ordenarPor === col.chave && (direcao === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
            </button>
          ))}
          <span />
        </div>

        <div ref={parentRef} className="overflow-y-auto" style={{ maxHeight: "520px" }}>
          {carregando ? (
            <div className="px-4 py-8 text-center text-sm text-am-text-secondary">Carregando...</div>
          ) : dados.itens.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-am-text-secondary">Nenhum fornecedor encontrado com esses filtros.</div>
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
                    style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${linha.start}px)` }}
                  >
                    <button
                      onClick={() => setLinhaExpandida(expandida ? null : item.fornecedor)}
                      className="w-full grid gap-2 px-4 py-2.5 border-b border-am-border hover:bg-am-bg/50 text-left items-center"
                      style={{ gridTemplateColumns: COLUNAS.map((c) => c.largura).join(" ") + " 28px", minHeight: "48px" }}
                    >
                      <span className="text-sm font-medium text-am-navy truncate">{item.fornecedor}</span>
                      <BarraConformidade valor={item.percentual_conformidade} />
                      <span className={`text-xs font-medium ${item.n_nao_cumpre > 0 ? "text-am-danger" : "text-am-text-secondary"}`}>
                        {item.n_nao_cumpre > 0 ? item.n_nao_cumpre : "—"}
                      </span>
                      <span className={`text-xs font-medium ${item.n_parcial > 0 ? "text-am-alert" : "text-am-text-secondary"}`}>
                        {item.n_parcial > 0 ? item.n_parcial : "—"}
                      </span>
                      <ChevronRight size={14} className={`text-am-text-secondary transition-transform ${expandida ? "rotate-90" : ""}`} />
                    </button>
                    {expandida && <LinhaDetalheMatriz fornecedor={item.fornecedor} sessionId={sessionId} temMandatoriosFormais={temMandatoriosFormais} />}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {dados.total_paginas > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={pagina <= 1} className="text-xs text-am-blue disabled:text-am-text-secondary disabled:cursor-not-allowed hover:underline">
            Anterior
          </button>
          <span className="text-xs text-am-text-secondary">Página {dados.pagina} de {dados.total_paginas}</span>
          <button onClick={() => setPagina((p) => Math.min(dados.total_paginas, p + 1))} disabled={pagina >= dados.total_paginas} className="text-xs text-am-blue disabled:text-am-text-secondary disabled:cursor-not-allowed hover:underline">
            Próxima
          </button>
        </div>
      )}
    </div>
  );
}
