import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { refAttribute } from "../lib/api";

// Ekran logowania/rejestracji (Supabase Auth). Po sukcesie wraca tam, skąd
// przyszedł użytkownik (?next=...) lub na stronę główną — nigdy nie zostawia go
// w ślepym zaułku (wcześniej wpychał na /portfel bez możliwości powrotu).
function nextTarget(): string {
  const n = new URLSearchParams(window.location.search).get("next");
  return n && n.startsWith("/") ? n : "/";
}
// Po zalogowaniu: jesli byl kod polecajacy (?ref=), przypnij klienta do ambasadora.
async function attributeRef(): Promise<void> {
  try {
    const code = localStorage.getItem("sunrise_ref");
    if (code && code.trim()) { await refAttribute(code.trim()); localStorage.removeItem("sunrise_ref"); }
  } catch { /* nie blokuj logowania */ }
}

export default function Login() {
  const [mode, setMode] = useState<"login" | "register">("login");
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
      if (mode === "register") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) {
          if (/already|registered|exists/i.test(error.message)) {
            setMsg("Ten e-mail ma już konto. Zaloguj się poniżej.");
            setMode("login");
            return;
          }
          throw error;
        }
        try { await supabase.functions.invoke("sso-register", { body: { email, password } }); } catch { /* nie blokuj rejestracji Marketu */ }
        const { error: signErr } = await supabase.auth.signInWithPassword({ email, password });
        if (signErr) { setMsg("Konto utworzone. Możesz się teraz zalogować."); setMode("login"); return; }
        await attributeRef();
        window.location.href = nextTarget();
      } else {
        let { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          try {
            const { data } = await supabase.functions.invoke("sso-login", { body: { email, password } });
            if (data?.ok) ({ error } = await supabase.auth.signInWithPassword({ email, password }));
          } catch { /* most SSO niedostępny */ }
        }
        if (error) {
          if (/invalid login|credentials/i.test(error.message)) throw new Error("Nieprawidłowy e-mail lub hasło.");
          if (/not confirmed/i.test(error.message)) throw new Error("Konto wymaga potwierdzenia e-mail. Napisz do nas — aktywujemy je od ręki.");
          throw error;
        }
        await attributeRef();
        window.location.href = nextTarget();
      }
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
            <div className="w-9 h-9 rounded-xl grid place-items-center text-lg" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)", color: "#241606" }}>☀</div>
            <span className="font-display text-xl font-semibold">Sunrise Market</span>
          </a>
          <div className="flex-1" />
          <a href="/" className="navlink text-sm">← Sklep</a>
        </div>
      </header>

      <div className="mx-auto max-w-sm px-4 py-10">
        <h1 className="font-display text-2xl font-semibold mb-1">{me ? "Twoje konto" : mode === "login" ? "Zaloguj się" : "Załóż konto"}</h1>
        <p className="text-sm mb-6" style={{ color: "var(--mut)" }}>Jedno konto działa w Markecie i aplikacji MySunrise.</p>

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
          <form onSubmit={submit} className="space-y-3">
            {mode === "login" && <p className="text-xs -mt-1" style={{ color: "var(--mut)" }}>Masz konto <b>MySunrise</b>? Zaloguj się tymi samymi danymi.</p>}
            <input type="email" required placeholder="e-mail" value={email} onChange={(e) => setEmail(e.target.value)}
                   className="w-full rounded-lg px-3 py-2 outline-none" style={{ background: "var(--glass)", border: "1px solid var(--line)", color: "var(--ink)" }} />
            <input type="password" required placeholder="hasło (min. 6 znaków)" value={password} onChange={(e) => setPassword(e.target.value)}
                   className="w-full rounded-lg px-3 py-2 outline-none" style={{ background: "var(--glass)", border: "1px solid var(--line)", color: "var(--ink)" }} />
            <button type="submit" disabled={busy} className="w-full rounded-lg px-4 py-2 font-semibold disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg,#E8C896,#C8965A)", color: "#241606" }}>
              {busy ? "…" : mode === "login" ? "Zaloguj" : "Zarejestruj"}
            </button>
            <button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setMsg(null); }}
                    className="w-full text-sm navlink">
              {mode === "login" ? "Nie masz konta? Załóż" : "Masz konto? Zaloguj się"}
            </button>
          </form>
        )}

        {msg && <div className="mt-4 rounded-lg px-4 py-2 text-sm" style={{ background: "rgba(200,150,90,.12)", color: "#E8C896" }}>{msg}</div>}
      </div>
    </div>
  );
}
