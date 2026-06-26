import { useState, useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Search, ChevronDown, ChevronUp } from "lucide-react";
import { consultarRequisitosEtapa3 } from "../lib/api";

const FILTROS_STATUS = [
  { valor: "todos", label: "Todos" },
  { valor: "mandatorio", label: "Mandatórios" },
  { valor: "desejavel", label: "Desejáveis" },
  { valor: "peso_alto", label: "Peso Alto" },
];

const COLUNAS = [
  { chave: "id", label: "ID", ordenavel: true, largura: "70px" },
  { chave: "categoria", label: "Categoria", ordenavel: true, largura: "130px" },
  { chave: "descricao", label: "Descrição", ordenavel: false, largura: "minmax(220px, 2.5fr)" },
  { chave: "tipo", label: "Tipo", ordenavel: true, largura: "100px" },
  { chave: "peso", label: "Peso", ordenavel: true, largura: "90px" },
];

function BadgePeso({ peso }) {
  const cor = peso === "Alto" ? "bg-am-danger/10 text-am-danger" : peso === "Médio" ? "bg-am-alert/10 text-am-navy" : "bg-am-bg text-am-text-secondary";
  return <span className={`text-xs font-medium px-2 py-0.5 rounded ${cor}`}>{peso}</span>;
}

function BadgeTipo({ tipo }) {
  const cor = tipo === "mandatório" ? "text-am-navy font-medium" : "text-am-text-secondary";
  return <span className={`text-xs ${cor}`}>{tipo}</span>;
}

// Tabela de requisitos do edital (Etapa 3) — unidade paginável é
// REQUISITO (não fornecedor, ainda não há propostas nesta etapa). Mesmo
// padrão de busca/filtro/ordenação/virtualização das Etapas 4/5/6, sem
// expansão de linha (a justificativa de peso já cabe inline, sem precisar
// de um detalhe separado).
export default function TabelaRequisitos({ sessionId }) {
  const [busca, setBusca] = useState("");
  const [buscaDebounced, setBuscaDebounced] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("todos");
  const [ordenarPor, setOrdenarPor] = useState("id");
  const [direcao, setDirecao] = useState("asc");
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState({ itens: [], total_filtrado: 0, total_paginas: 1 });
  const [carregando, setCarregando] = useState(true);
  const tamanhoPagina = 50;

  useEffect(() => {
    const timer = setTimeout(() => setBuscaDebounced(busca), 350);
    return () => clearTimeout(timer);
  }, [busca]);

  useEffect(() => {
    setPagina(1);
  }, [buscaDebounced, statusFiltro, ordenarPor, direcao]);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    consultarRequisitosEtapa3(sessionId, {
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
    estimateSize: () => 44,
    overscan: 8,
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-am-text-secondary" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por descrição ou categoria..."
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-am-border-strong outline-none focus:ring-2 focus:ring-am-blue/20 focus:border-am-blue"
          />
        </div>
        <div className="flex gap-1.5">
          {FILTROS_STATUS.map((f) => (
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
          {dados.total_filtrado} requisito{dados.total_filtrado !== 1 ? "s" : ""}
          {dados.total_filtrado !== dados.total_sem_filtro && ` (de ${dados.total_sem_filtro})`}
        </span>
      </div>

      <div className="border border-am-border rounded-lg overflow-hidden bg-white">
        <div
          className="grid gap-2 px-4 py-2 bg-am-bg border-b border-am-border text-xs font-medium text-am-text-secondary"
          style={{ gridTemplateColumns: COLUNAS.map((c) => c.largura).join(" ") }}
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
        </div>

        <div ref={parentRef} className="overflow-y-auto" style={{ maxHeight: "480px" }}>
          {carregando ? (
            <div className="px-4 py-8 text-center text-sm text-am-text-secondary">Carregando...</div>
          ) : dados.itens.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-am-text-secondary">Nenhum requisito encontrado com esses filtros.</div>
          ) : (
            <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
              {virtualizer.getVirtualItems().map((linha) => {
                const item = dados.itens[linha.index];
                return (
                  <div
                    key={item.id}
                    style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${linha.start}px)` }}
                  >
                    <div
                      className="grid gap-2 px-4 py-2 border-b border-am-border items-center"
                      style={{ gridTemplateColumns: COLUNAS.map((c) => c.largura).join(" "), minHeight: "44px" }}
                    >
                      <span className="text-xs font-mono-num text-am-text-secondary">{item.id}</span>
                      <span className="text-xs text-am-text-secondary truncate">{item.categoria}</span>
                      <span className="text-sm text-am-text truncate" title={item.descricao}>{item.descricao}</span>
                      <BadgeTipo tipo={item.tipo} />
                      <BadgePeso peso={item.peso} />
                    </div>
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
