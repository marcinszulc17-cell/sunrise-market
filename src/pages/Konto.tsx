import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { myBalance, mySeller, amiOperator } from "../lib/api";
import { getMode, setMode, type Mode } from "../lib/mode";
import { useSeo } from "../lib/seo";

const zl = (v: number) => Math.round(v).toLocaleString("pl-PL") + " zł";

export default function Konto() {
  useSeo("Moje konto", "Panel użytkownika Sunrise Market — portfel, zamówienia, tryb sprzedawcy.", "/konto");
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [email, setEmail] = useState<string>("");
  const [balance, setBalance] = useState<number>(0);
  const [seller, setSeller] = useState<any>(null);
  const [isOp, setIsOp] = useState(false);
  const [mode, setLocalMode] = useState<Mode>(getMode());

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setAuthed(false); return; }
      setAuthed(true);
      setEmail(data.user.email ?? "");
      try { setBalance(await myBalance()); } catch { /* ignore */ }
      try { setSeller(await mySeller()); } catch { /* ignore */ }
      try { setIsOp(await amiOperator()); } catch { /* ignore */ }
    });
  }, []);

  function switchMode(m: Mode) { setMode(m); setLocalMode(m); if (m === "seller") window.location.href = "/sprzedawca"; }
  async function logout() { await supabase.auth.signOut(); window.location.href = "/"; }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 backdrop-blur" style={{ background: "rgba(7,7,15,.72)", borderBottom: "1px solid var(--line)" }}>
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center gap-3">
          <a href="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl grid place-items-center text-lg" style={{ background: "linear-gradient(135deg,#F2731D,#E0A21B)" }}>☀</div>
            <span className="font-display text-xl font-semibold">Sunrise Market</span>
          </a>
          <div className="flex-1" />
          <a href="/" className="text-sm text-zinc-300 hover:text-white">← Sklep</a>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="font-display text-3xl font-semibold mb-1">Moje konto</h1>
        {email && <p className="text-sm mb-6" style={{ color: "var(--mut)" }}>{email}</p>}

        {authed === false && <p style={{ color: "var(--mut)" }}>Zaloguj się. <a href="/login" className="text-amber-400 underline">Logowanie</a>.</p>}

        {authed && (
          <div className="flex flex-col gap-4">
            {/* Portfel */}
            <div className="rounded-2xl p-6" style={{ background: "linear-gradient(135deg, rgba(242,115,29,.14), rgba(124,58,237,.12))", border: "1px solid rgba(242,115,29,.3)" }}>
              <div className="text-sm" style={{ color: "var(--mut)" }}>Portfel Sunrise Pay</div>
              <div className="font-display text-4xl font-bold mb-3" style={{ color: "var(--gold)" }}>{zl(balance)}</div>
              <a href="/portfel" className="inline-block rounded-xl px-5 py-2 font-semibold text-black" style={{ background: "linear-gradient(135deg,#F2731D,#E0A21B)" }}>Doładuj / historia</a>
            </div>

            {/* Tryb konta: kupujący / sprzedawca */}
            <div className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
              <div className="text-sm mb-3" style={{ color: "var(--mut)" }}>Tryb konta</div>
              {seller ? (
                <>
                  <div className="flex gap-2 mb-3">
                    <button onClick={() => switchMode("buyer")} className="flex-1 rounded-xl py-2.5 text-sm font-semibold"
                            style={mode === "buyer" ? { background: "linear-gradient(135deg,#F2731D,#D9560C)", color: "#000" } : { background: "var(--glass)", border: "1px solid var(--line)" }}>🛍️ Kupujący</button>
                    <button onClick={() => switchMode("seller")} className="flex-1 rounded-xl py-2.5 text-sm font-semibold"
                            style={mode === "seller" ? { background: "linear-gradient(135deg,#34E3A0,#38E0F0)", color: "#000" } : { background: "var(--glass)", border: "1px solid var(--line)" }}>🏪 Sprzedawca</button>
                  </div>
                  <p className="text-xs" style={{ color: "var(--mut)" }}>Jedno logowanie, dwa konta. Przełączasz się między zakupami a panelem sprzedawcy ({seller.legal_name}).</p>
                </>
              ) : (
                <a href="/sprzedawca" className="inline-block rounded-xl px-5 py-2 text-sm font-semibold" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>🏪 Zostań sprzedawcą</a>
              )}
            </div>

            {/* Skróty */}
            <div className="grid gap-3 sm:grid-cols-2">
              <a href="/zamowienia" className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
                <div className="text-lg mb-1">📦 Moje zamówienia</div>
                <div className="text-xs" style={{ color: "var(--mut)" }}>Status, dostawa, zwroty</div>
              </a>
              {seller && (
                <a href="/sprzedawca" onClick={() => setMode("seller")} className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
                  <div className="text-lg mb-1">🏪 Panel sprzedawcy</div>
                  <div className="text-xs" style={{ color: "var(--mut)" }}>Oferty, sprzedaż, rozliczenia</div>
                </a>
              )}
              {isOp && (
                <a href="/operator" className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
                  <div className="text-lg mb-1">🛡️ Panel operatora</div>
                  <div className="text-xs" style={{ color: "var(--mut)" }}>KYC, moderacja, zwroty</div>
                </a>
              )}
            </div>

            <button onClick={logout} className="self-start text-sm px-4 py-2 rounded-xl" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>Wyloguj</button>
          </div>
        )}
      </main>
    </div>
  );
}
