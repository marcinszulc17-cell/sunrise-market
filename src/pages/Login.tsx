import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { refAttribute } from "../lib/api";
import { refreshCustomerAccess } from "../lib/customerAccess";

function nextTarget(): string {
  const n = new URLSearchParams(window.location.search).get("next");
  return n && n.startsWith("/") ? n : "/";
}

async function attributeRef(): Promise<void> {
  try {
    const code = localStorage.getItem("sunrise_ref");
    if (code && code.trim()) { await refAttribute(code.trim()); localStorage.removeItem("sunrise_ref"); }
  } catch { /* nie blokuj logowania */ }
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [me, setMe] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.email ?? null));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      let { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        try {
          const { data } = await supabase.functions.invoke("sso-login", { body: { email, password } });
          if (data?.ok) ({ error } = await supabase.auth.signInWithPassword({ email, password }));
        } catch { /* most SSO niedostępny */ }
      }
      if (error) {
        if (/invalid login|credentials/i.test(error.message)) throw new Error("Nieprawidłowy e-mail lub hasło MySunrise.");
        if (/not confirmed/i.test(error.message)) throw new Error("Potwierdź konto w MySunrise i spróbuj ponownie.");
        throw error;
      }
      await refreshCustomerAccess();
      await attributeRef();
      window.location.href = nextTarget();
    } catch (err) {
      setMsg((err as Error).message);
    } finally { setBusy(false); }
  }

  async function logout() { await supabase.auth.signOut(); setMe(null); }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 backdrop-blur" style={{ background: "var(--header)", borderBottom: "1px solid var(--line)" }}>
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-3">
          <a href="/" className="flex items-center gap-2">
            <img src="/logo-sunrise-market.png" alt="Sunrise Market" className="h-8 w-auto rounded-lg bg-white p-1" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          </a>
          <div className="flex-1" />
          <a href="/" className="navlink text-sm">← Sklep</a>
        </div>
      </header>

      <div className="mx-auto max-w-sm px-4 py-10">
        <h1 className="font-display text-2xl font-semibold mb-1">{me ? "Twoje konto" : "Zaloguj się kontem MySunrise"}</h1>
        <p className="text-sm mb-6" style={{ color: "var(--mut)" }}>MySunrise jest hubem. Jedno konto i jedno logowanie działa we wszystkich usługach Sunrise.</p>

        {me ? (
          <div className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
            <p className="mb-4" style={{ color: "var(--mut)" }}>Zalogowano jako <b style={{ color: "var(--ink)" }}>{me}</b>.</p>
            <div className="flex flex-wrap gap-2">
              <a href="/" className="rounded-lg px-4 py-2 font-semibold" style={{ background: "linear-gradient(135deg,#E8C896,#C8965A)", color: "#241606" }}>🛍️ Do sklepu</a>
              <a href="/portfel" className="rounded-lg px-4 py-2 font-medium" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>Portfel</a>
              <a href="/zamowienia" className="rounded-lg px-4 py-2 font-medium" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>Zamówienia</a>
              <button onClick={logout} className="rounded-lg px-4 py-2" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>Wyloguj</button>
            </div>
          </div>
        ) : (
          <>
            <form onSubmit={submit} className="space-y-3">
              <input type="email" required placeholder="e-mail MySunrise" value={email} onChange={(e) => setEmail(e.target.value)}
                     className="w-full rounded-lg px-3 py-2 outline-none" style={{ background: "var(--glass)", border: "1px solid var(--line)", color: "var(--ink)" }} />
              <input type="password" required placeholder="hasło MySunrise" value={password} onChange={(e) => setPassword(e.target.value)}
                     className="w-full rounded-lg px-3 py-2 outline-none" style={{ background: "var(--glass)", border: "1px solid var(--line)", color: "var(--ink)" }} />
              <button type="submit" disabled={busy} className="w-full rounded-lg px-4 py-2 font-semibold disabled:opacity-50"
                      style={{ background: "linear-gradient(135deg,#E8C896,#C8965A)", color: "#241606" }}>
                {busy ? "…" : "Zaloguj przez MySunrise"}
              </button>
            </form>
            <div className="mt-5 rounded-xl p-4 text-sm" style={{ background: "var(--glass)", border: "1px solid var(--line)", color: "var(--mut)" }}>
              Nie masz jeszcze konta? Rejestracja odbywa się wyłącznie w MySunrise.
              <a href="https://mysunrise.pl/dolacz" className="mt-2 block font-semibold navlink">Załóż konto w MySunrise →</a>
            </div>
          </>
        )}

        {msg && <div className="mt-4 rounded-lg px-4 py-2 text-sm" style={{ background: "rgba(200,150,90,.12)", color: "#E8C896" }}>{msg}</div>}
      </div>
    </div>
  );
}
