import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, FileText, X, Loader2, History, AlertTriangle } from "lucide-react";
import TopBar from "../components/TopBar";
import Card from "../components/Card";
import Button from "../components/Button";
import { useSessao } from "../lib/SessaoContext";
import { uploadEtapa1, extrairMensagemErro } from "../lib/api";

const MAX_ARQUIVOS = 30;

export default function UploadDocumentos() {
  const [arquivos, setArquivos] = useState([]);
  const [arrastando, setArrastando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);
  const [avisoLimite, setAvisoLimite] = useState(null);
  const { sessionId, criarSessaoDeEstudo } = useSessao();
  const navigate = useNavigate();

  function adicionarArquivos(novosArquivos) {
    const lista = Array.from(novosArquivos);
    const nomesExistentes = new Set(arquivos.map((a) => a.name));
    const semDuplicados = lista.filter((a) => !nomesExistentes.has(a.name));
    const candidatos = [...arquivos, ...semDuplicados];

    if (candidatos.length > MAX_ARQUIVOS) {
      const rejeitados = candidatos.length - MAX_ARQUIVOS;
      setArquivos(candidatos.slice(0, MAX_ARQUIVOS));
      setAvisoLimite(
        rejeitados === 1
          ? `1 arquivo não foi adicionado pois o limite é ${MAX_ARQUIVOS} arquivos por estudo.`
          : `${rejeitados} arquivos não foram adicionados pois o limite é ${MAX_ARQUIVOS} por estudo.`
      );
    } else {
      setArquivos(candidatos);
      setAvisoLimite(null);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setArrastando(false);
    if (arquivos.length >= MAX_ARQUIVOS) return;
    adicionarArquivos(e.dataTransfer.files);
  }

  function removerArquivo(nome) {
    setArquivos((atuais) => atuais.filter((a) => a.name !== nome));
    setAvisoLimite(null);
  }

  async function handleClassificar() {
    if (arquivos.length === 0) return;
    setEnviando(true);
    setErro(null);
    try {
      const id = sessionId ?? (await criarSessaoDeEstudo());
      const resultado = await uploadEtapa1(id, arquivos);
      navigate("/cascata", { state: { resultadoEtapa1: resultado } });
    } catch (err) {
      setErro(extrairMensagemErro(err, "upload"));
    } finally {
      setEnviando(false);
    }
  }

  const noLimite = arquivos.length >= MAX_ARQUIVOS;
  const processoGrande = arquivos.length > 20 && !noLimite;

  return (
    <div className="min-h-screen bg-am-bg p-5">
      <div className="max-w-3xl mx-auto">
        <TopBar />

        <Card title="Novo estudo" subtitle="Suba o edital, o baseline e as propostas dos fornecedores">

          {/* Zona de drag-and-drop */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (!noLimite) setArrastando(true);
            }}
            onDragLeave={() => setArrastando(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg py-10 px-6 flex flex-col items-center justify-center text-center transition ${
              noLimite
                ? "border-am-border opacity-50 cursor-not-allowed"
                : arrastando
                ? "border-am-blue bg-am-blue/5"
                : "border-am-border-strong"
            }`}
          >
            <Upload size={28} className="text-am-blue mb-3" />
            {noLimite ? (
              <p className="text-sm text-am-text-secondary">
                Limite de {MAX_ARQUIVOS} arquivos atingido — remova um para adicionar outro.
              </p>
            ) : (
              <>
                <p className="text-sm text-am-text mb-1">Arraste os arquivos aqui, ou</p>
                <label className="text-sm text-am-blue font-medium cursor-pointer hover:underline">
                  escolha na sua pasta
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    accept=".pdf,.docx,.xlsx,.xls,.xlsm,.txt"
                    onChange={(e) => adicionarArquivos(e.target.files)}
                  />
                </label>
                <p className="text-xs text-am-text-secondary mt-3">
                  PDF, Word, Excel ou texto — edital, baseline e propostas de cada fornecedor
                </p>
              </>
            )}
          </div>

          {/* Aviso de limite excedido */}
          {avisoLimite && (
            <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-600" />
              <div className="text-sm text-amber-800">
                <p className="font-medium">Limite de {MAX_ARQUIVOS} arquivos atingido</p>
                <p className="text-xs mt-0.5">{avisoLimite}</p>
                <p className="text-xs mt-1 text-amber-700">
                  Dica: remova anexos que não são edital, baseline ou proposta (certidões,
                  portfólios, catálogos). Se for um processo muito grande, considere dividir
                  em dois estudos separados.
                </p>
              </div>
            </div>
          )}

          {/* Aviso suave para processos grandes (20–29 arquivos) */}
          {processoGrande && (
            <p className="text-xs text-am-text-secondary mt-2 text-center">
              Processo grande ({arquivos.length} arquivos) — a classificação pode levar até 1 minuto.
            </p>
          )}

          {/* Lista de arquivos com contador */}
          {arquivos.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-medium ${noLimite ? "text-amber-700" : "text-am-text-secondary"}`}>
                  {arquivos.length} / {MAX_ARQUIVOS} arquivos
                </span>
                {noLimite && (
                  <span className="text-xs text-amber-700">Limite atingido</span>
                )}
              </div>
              <div className="space-y-2">
                {arquivos.map((arquivo) => (
                  <div
                    key={arquivo.name}
                    className="flex items-center justify-between bg-am-bg rounded-md px-3 py-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText size={16} className="text-am-blue shrink-0" />
                      <span className="text-sm text-am-text truncate">{arquivo.name}</span>
                      <span className="text-xs text-am-text-secondary shrink-0">
                        {(arquivo.size / 1024).toFixed(0)} KB
                      </span>
                    </div>
                    <button
                      onClick={() => removerArquivo(arquivo.name)}
                      className="text-am-text-secondary hover:text-am-danger shrink-0 ml-2"
                      aria-label={`Remover ${arquivo.name}`}
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {erro && <p className="text-sm text-am-danger mt-3">{erro}</p>}

          <div className="mt-5 flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              icon={History}
              onClick={() => navigate("/historico")}
            >
              Ver estudos anteriores
            </Button>
            <Button
              variant="primary"
              icon={enviando ? Loader2 : undefined}
              disabled={arquivos.length === 0 || enviando}
              onClick={handleClassificar}
              className={enviando ? "[&_svg]:animate-spin" : ""}
            >
              {enviando
                ? arquivos.length > 20
                  ? "Classificando (processo grande, aguarde)…"
                  : "Classificando…"
                : "Classificar documentos"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
