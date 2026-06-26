import { Navigate } from "react-router-dom";
import { useSessao } from "../lib/SessaoContext";

export default function RotaProtegida({ children }) {
  const { sessionId } = useSessao();
  if (!sessionId) {
    return <Navigate to="/login" replace />;
  }
  return children;
}
