import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { SessaoProvider } from "./lib/SessaoContext";
import RotaProtegida from "./components/RotaProtegida";
import Login from "./pages/Login";
import UploadDocumentos from "./pages/UploadDocumentos";
import Cascata from "./pages/Cascata";
import Historico from "./pages/Historico";
import ResultadoEtapa5 from "./pages/ResultadoEtapa5";
import ResultadoEtapa7 from "./pages/ResultadoEtapa7";
import ResultadoEtapa8 from "./pages/ResultadoEtapa8";

function App() {
  return (
    <SessaoProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/upload"
            element={<RotaProtegida><UploadDocumentos /></RotaProtegida>}
          />
          <Route path="/historico" element={<Historico />} />
          <Route
            path="/cascata"
            element={<RotaProtegida><Cascata /></RotaProtegida>}
          />
          <Route
            path="/resultado/5"
            element={<RotaProtegida><ResultadoEtapa5 /></RotaProtegida>}
          />
          <Route
            path="/resultado/7"
            element={<RotaProtegida><ResultadoEtapa7 /></RotaProtegida>}
          />
          <Route
            path="/resultado/8"
            element={<RotaProtegida><ResultadoEtapa8 /></RotaProtegida>}
          />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </SessaoProvider>
  );
}

export default App;
