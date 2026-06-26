import logoAm from "../assets/logo-am.png";
import { useSessao } from "../lib/SessaoContext";

function iniciaisDoEmail(email) {
  if (!email) return "?";
  const local = email.split("@")[0] || "";
  return local.slice(0, 2).toUpperCase() || "?";
}

export default function TopBar({ cliente, caso }) {
  const { email } = useSessao();
  return (
    <div className="bg-am-navy rounded-lg px-5 py-3 flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        <img src={logoAm} alt="A&M" className="h-6 w-auto brightness-0 invert" />
        <span className="text-white text-sm font-semibold">Procurement Intelligence</span>
        {caso && (
          <span className="text-am-blue-light text-xs pl-3 border-l border-am-navy-light">
            {caso}
          </span>
        )}
      </div>
      <div className="flex items-center gap-4">
        {cliente && (
          <span className="text-am-blue-light text-xs">{cliente}</span>
        )}
        <div className="w-7 h-7 rounded-full bg-am-blue flex items-center justify-center text-white text-xs font-semibold">
          {iniciaisDoEmail(email)}
        </div>
      </div>
    </div>
  );
}
