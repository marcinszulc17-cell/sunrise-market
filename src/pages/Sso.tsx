// src/pages/Sso.tsx — wejscie z MySunrise bez ponownego logowania.
// MySunrise wola funkcje sso-handoff (hub token -> token_hash) i przekierowuje tu:
// https://sunrisemarket.pl/sso#th=<token_hash>. My robimy verifyOtp -> sesja -> home.
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { refreshCustomerAccess } from "../lib/customerAccess";

export default function Sso() {
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const th = hash.get("th") || new URLSearchParams(window.location.search).get("th") || "";
        if (!th) { setErr("Brak tokenu logowania."); return; }
        const { error } = await supabase.auth.verifyOtp({ type: "email", token_hash: th });
        if (error) { setErr(error.message); return; }
        try {
          await refreshCustomerAccess();
        } catch (e: any) {
          setErr(String(e?.message || e));
          return;
        }
        window.location.replace("/");
      } catch (e: any) { setErr(String(e?.message || e)); }
    })();
  }, []);
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0f16", color: "#eaf0f7", fontFamily: "system-ui" }}>
      <div style={{ textAlign: "center" }}>
        {err ? (
          <>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Nie udało się potwierdzić konta MySunrise</div>
            <div style={{ marginTop: 8, fontSize: 13, opacity: 0.7 }}>{err}</div>
            <a href="https://mysunrise.pl" style={{ display: "inline-block", marginTop: 16, color: "#fbae42" }}>Przejdź do MySunrise →</a>
          </>
        ) : (
          <div style={{ fontSize: 16 }}>☀️ Logowanie kontem MySunrise…</div>
        )}
      </div>
    </div>
  );
}
