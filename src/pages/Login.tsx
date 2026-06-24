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
        if (error) throw error;
        setMsg("Konto utworzone. Jeśli włączone jest potwierdzanie e-mail — sprawdź skrzynkę. Inaczej możesz się zalogować.");
        setMode("login");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
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
