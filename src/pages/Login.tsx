import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

// Prosty ekran logowania/rejestracji (Supabase Auth, e-mail + hasło).
// Trasa: /login. Po zalogowaniu przekierowuje na /portfel.
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
          // Konto już istnieje → podpowiedz logowanie zamiast surowego błędu
          if (/already|registered|exists/i.test(error.message)) {
            setMsg("Ten e-mail ma już konto. Zaloguj się poniżej.");
            setMode("login");
            return;
          }
          throw error;
        }
        // Lejek do MySunrise: zakładamy konto+portfel w MySunrise (source:market — bez maili/powiadomień)
        try { await supabase.functions.invoke("sso-register", { body: { email, password } }); } catch { /* nie blokuj rejestracji Marketu */ }
        // Konto jest auto-potwierdzane → od razu logujemy i wchodzimy do portfela
        const { error: signErr } = await supabase.auth.signInWithPassword({ email, password });
        if (signErr) {
          setMsg("Konto utworzone. Możesz się teraz zalogować.");
          setMode("login");
          return;
        }
        window.location.href = "/portfel";
      } else {
        // 1) natywne logowanie Marketu
        let { error } = await supabase.auth.signInWithPassword({ email, password });
        // 2) jeśli nie ma konta w Markecie — most SSO: sprawdź konto MySunrise i zaloguj tym samym
        if (error) {
          try {
            const { data } = await supabase.functions.invoke("sso-login", { body: { email, password } });
            if (data?.ok) ({ error } = await supabase.auth.signInWithPassword({ email, password }));
          } catch { /* most niedostępny — zostaje błąd logowania Marketu */ }
        }
        if (error) {
          if (/invalid login|credentials/i.test(error.message)) throw new Error("Nieprawidłowy e-mail lub hasło.");
          if (/not confirmed/i.test(error.message)) throw new Error("Konto wymaga potwierdzenia e-mail. Napisz do nas — aktywujemy je od ręki.");
          throw error;
        }
        window.location.href = "/portfel";
      }
    } catch (err) {
      setMsg((err as Error).message);
    } finally { setBusy(false); }
  }

  async function logout() {
    await supabase.auth.signOut();
    setMe(null);
  }

  return (
    <div className="mx-auto max-w-sm p-6 text-zinc-100">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-xl grid place-items-center text-white"
             style={{ background: "linear-gradient(135deg,#F26B1D,#E0A21B)" }}>☀</div>
        <h1 className="text-xl font-bold">Sunrise Market</h1>
      </div>

      {me ? (
        <div className="rounded-xl bg-zinc-900/70 p-5 ring-1 ring-amber-500/20">
          <p className="text-zinc-300 mb-3">Zalogowano jako <b>{me}</b>.</p>
          <div className="flex gap-2">
            <a href="/portfel" className="rounded-lg bg-amber-500 px-4 py-2 font-semibold text-zinc-900">Portfel</a>
            <button onClick={logout} className="rounded-lg bg-zinc-800 px-4 py-2">Wyloguj</button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <h2 className="text-lg font-semibold">{mode === "login" ? "Zaloguj się" : "Załóż konto"}</h2>
          {mode === "login" && <p className="text-xs text-zinc-400 -mt-1">Masz konto <b className="text-zinc-300">MySunrise</b>? Zaloguj się tymi samymi danymi — jedno konto działa w Markecie i MySunrise.</p>}
          <input type="email" required placeholder="e-mail" value={email}
                 onChange={(e) => setEmail(e.target.value)}
                 className="w-full rounded-lg bg-zinc-800 px-3 py-2" />
          <input type="password" required placeholder="hasło (min. 6 znaków)" value={password}
                 onChange={(e) => setPassword(e.target.value)}
                 className="w-full rounded-lg bg-zinc-800 px-3 py-2" />
          <button type="submit" disabled={busy}
                  className="w-full rounded-lg bg-amber-500 px-4 py-2 font-semibold text-zinc-900 disabled:opacity-50">
            {busy ? "…" : mode === "login" ? "Zaloguj" : "Zarejestruj"}
          </button>
          <button type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setMsg(null); }}
                  className="w-full text-sm text-zinc-400 hover:text-zinc-200">
            {mode === "login" ? "Nie masz konta? Załóż" : "Masz konto? Zaloguj się"}
          </button>
        </form>
      )}

      {msg && <div className="mt-4 rounded-lg bg-amber-500/10 px-4 py-2 text-amber-300 text-sm">{msg}</div>}
    </div>
  );
}
