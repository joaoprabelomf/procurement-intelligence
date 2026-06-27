import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, FileText, X, Loader2, History } from "lucide-react";
import TopBar from "../components/TopBar";
import Card from "../components/Card";
import Button from "../components/Button";
import { useSessao } from "../lib/SessaoContext";
import { uploadEtapa1, extrairMensagemErro } from "../lib/api";

export default function UploadDocumentos() {
  const [arquivos, setArquivos] = useState([]);
  const [arrastando, setArrastando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);
  const { sessionId, criarSessaoDeEstudo } = useSessao();
  const navigate = useNavigate();

  const adicionarArquivos = useCallback((novosArquivos) => {
    const lista = Array.from(novosArquivos);
    setArquivos((atuais) => {
      const nomesExistentes = new Set(atuais.map((a) => a.name));
      const semDuplicados = lista.filter((a) => !nomesExistentes.has(a.name));
      return [...atuais, ...semDuplicados];
    });
  }, []);

  function handleDrop(e) {
    e.preventDefault();
    setArrastando(false);
    adicionarArquivos(e.dataTransfer.files);
  }

  function removerArquivo(nome) {
    setArquivos((atuais) => atuais.filter((a) => a.name !== nome));
  }

  async function handleClassificar() {
    if (arquivos.length === 0) return;
    setEnviando(true);
    setErro(null);
    try {
      // sessionId é null após reload da página — cria uma sessão nova sob demanda
      const id = sessionId ?? await criarSessaoDeEstudo();
      const resultado = await uploadEtapa1(id, arquivos);
      navigate("/cascata", { state: { resultadoEtapa1: resultado } });
    } catch (err) {
      setErro(extrairMensagemErro(err, "upload"));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="min-h-screen bg-am-bg p-5">
      <div className="max-w-3xl mx-auto">
        <TopBar />

        <Card title="Novo estudo" subtitle="Suba o edital, o baseline e as propostas dos fornecedores">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setArrastando(true);
            }}
            onDragLeave={() => setArrastando(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg py-10 px-6 flex flex-col items-center justify-center text-center transition ${
              arrastando ? "border-am-blue bg-am-blue/5" : "border-am-border-strong"
            }`}
          >
            <Upload size={28} className="text-am-blue mb-3" />
            <p className="text-sm text-am-text mb-1">
              Arraste os arquivos aqui, ou
            </p>
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
          </div>

          {arquivos.length > 0 && (
            <div className="mt-4 space-y-2">
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
                    className="text-am-text-secondary hover:text-am-danger shrink-0"
                    aria-label={`Remover ${arquivo.name}`}
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
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
              {enviando ? `Classificando${arquivos.length > 5 ? " (pode demorar com muitos arquivos)..." : "..."}` : "Classificar documentos"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
