import { FormEvent, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

function safeNext() {
  const value = new URLSearchParams(window.location.search).get("next") || "/";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function friendlyError(message: string) {
  if (/invalid login credentials/i.test(message)) return "Nieprawidłowy e-mail lub hasło.";
  if (/email not confirmed/i.test(message)) return "Potwierdź adres e-mail i spróbuj ponownie.";
  if (/too many requests/i.test(message)) return "Za dużo prób. Spróbuj ponownie za chwilę.";
  return message || "Nie udało się zalogować.";
}

/**
 * Hero logowania: docelowa grafika Sunrise Market (public/market-login-original.jpg).
 * Desktop — pełna wysokość ekranu w lewej kolumnie, mobile — kadr u góry.
 * Logika logowania (e-mail + hasło, SSO Supabase) bez zmian.
 */
export default function Login() {
  const next = useMemo(() => safeNext(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { error: signErr } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signErr) throw signErr;
      try {
        await supabase.functions.invoke("sso-register", { body: { password } });
      } catch {}
      window.location.replace(next);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(friendlyError(message));
      setBusy(false);
    }
  }

  return (
    <main className="min-h-[100dvh] lg:grid lg:grid-cols-[1.05fr_.95fr]" style={{ background: "linear-gradient(180deg,#0b1119,#080c12)", color: "var(--ink)" }}>
      <aside className="relative h-[38vh] min-h-[240px] w-full overflow-hidden lg:h-[100dvh] lg:min-h-[100dvh]">
        <img
          src="/market-login-original.jpg"
          alt="Sunrise Market — zakupy, rezerwacje i cashback"
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(180deg,rgba(8,12,18,.15) 0%,rgba(8,12,18,.05) 45%,rgba(8,12,18,.88) 100%)" }} />
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-40 lg:block" style={{ background: "linear-gradient(90deg,rgba(8,12,18,0),rgba(8,12,18,.95))" }} />
        <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8 lg:p-12">
          <img src="/logo-sunrise-market.png" alt="Sunrise Market" className="h-12 w-auto rounded-2xl bg-white p-2 shadow-2xl sm:h-14 lg:h-16" />
          <h1 className="mt-5 hidden max-w-xl font-display text-4xl font-semibold leading-[1.05] lg:block xl:text-5xl">
            Kupuj, sprzedawaj i rezerwuj w jednym miejscu.
          </h1>
          <p className="mt-4 hidden max-w-lg text-base leading-7 lg:block" style={{ color: "var(--mut)" }}>
            Zakupy, usługi, booking i cashback połączone w jednym cyfrowym rynku Sunrise.
          </p>
        </div>
      </aside>

      <section className="flex min-h-[62dvh] items-center justify-center px-5 py-10 sm:px-8 lg:min-h-[100dvh] lg:px-12">
        <div className="w-full max-w-lg">
          <div className="rounded-[2rem] p-7 shadow-2xl backdrop-blur-xl sm:p-10" style={{ background: "rgba(12,18,26,.9)", border: "1px solid rgba(200,150,90,.28)", boxShadow: "0 30px 90px rgba(0,0,0,.45)" }}>
            <div className="text-center lg:text-left">
              <div className="text-xs font-semibold uppercase tracking-[.24em]" style={{ color: "var(--gold)" }}>Sunrise Market</div>
              <h2 className="mt-2 font-display text-4xl font-semibold">Witaj ponownie</h2>
              <p className="mt-3 text-sm leading-6" style={{ color: "var(--mut)" }}>
                Zaloguj się bezpośrednio do Sunrise Market swoim kontem Sunrise.
              </p>
            </div>

            <form onSubmit={submit} className="mt-8 space-y-5">
              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-medium">E-mail</label>
                <input id="email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="twoj@email.pl" className="w-full rounded-2xl px-4 py-4 text-base outline-none" style={{ background: "rgba(255,255,255,.055)", border: "1px solid rgba(255,255,255,.12)", color: "var(--ink)" }} />
              </div>
              <div>
                <label htmlFor="password" className="mb-2 block text-sm font-medium">Hasło</label>
                <input id="password" type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className="w-full rounded-2xl px-4 py-4 text-base outline-none" style={{ background: "rgba(255,255,255,.055)", border: "1px solid rgba(255,255,255,.12)", color: "var(--ink)" }} />
              </div>
              {error && (
                <div className="rounded-2xl px-4 py-3 text-sm" style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.25)", color: "#fecaca" }}>{error}</div>
              )}
              <button type="submit" disabled={busy} className="flex w-full items-center justify-center rounded-2xl px-4 py-4 text-base font-bold text-black transition hover:brightness-110 disabled:opacity-60" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>
                {busy ? "Logowanie…" : "Zaloguj się do Sunrise Market"}
              </button>
            </form>

            <div className="mt-5 text-center text-xs" style={{ color: "var(--mut)" }}>
              Jedno konto Sunrise działa w całym ekosystemie.
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
