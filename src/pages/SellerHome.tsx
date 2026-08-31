import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import PartnerDashboard from "./PartnerDashboard";
import SprzedawcaStart from "./SprzedawcaStart";

export default function SellerHome() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"loading" | "partner" | "business" | "none">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        navigate(`/login?next=${encodeURIComponent("/sprzedawca")}`, { replace: true });
        return;
      }
      const { data, error } = await supabase.functions.invoke("partner-dashboard", { body: {} });
      if (cancelled) return;
      if (error || data?.error) {
        setMode("business");
        return;
      }
      if (!data?.seller) setMode("none");
      else if (data.seller.type === "private_partner") setMode("partner");
      else setMode("business");
    })();
    return () => { cancelled = true; };
  }, [navigate]);

  if (mode === "loading") {
    return <main className="min-h-screen px-4 py-8 sm:px-6" style={{ background: "var(--bg)", color: "var(--ink)" }}><div className="mx-auto max-w-6xl rounded-2xl p-6" style={{ background: "var(--glass)", border: "1px solid var(--line)", color: "var(--mut)" }}>Otwieram centrum sprzedaży…</div></main>;
  }
  if (mode === "partner" || mode === "none") return <PartnerDashboard />;
  return <SprzedawcaStart />;
}
