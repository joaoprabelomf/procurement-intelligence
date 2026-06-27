import { Navigate } from "react-router-dom";
import { getToken } from "../lib/api";

export default function RotaProtegida({ children }) {
  if (!getToken()) {
    return <Navigate to="/login" replace />;
  }
  return children;
}
