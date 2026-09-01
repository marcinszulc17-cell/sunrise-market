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
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signErr) throw signErr;

      // Utrzymujemy wspolna tozsamosc Sunrise w tle. Awaria provisioningu
      // nie blokuje wejscia do Marketu, bo sama sesja Marketu jest juz poprawna.
      try {
        await supabase.functions.invoke("sso-register", { body: { password } });
      } catch {
        // best effort
      }

      window.location.replace(next);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(friendlyError(message));
      setBusy(false);
    }
  }

  return (
    <main
      className="relative min-h-[100dvh] overflow-hidden"
      style={{
        background: "radial-gradient(circle at 50% -10%, rgba(200,150,90,.22), transparent 36%), linear-gradient(180deg,#0b1119 0%,#0a0f16 48%,#080c12 100%)",
        color: "var(--ink)",
      }}
    >
      <div className="pointer-events-none absolute -left-24 top-1/4 h-80 w-80 rounded-full blur-3xl" style={{ background: "rgba(200,150,90,.08)" }} />
      <div className="pointer-events-none absolute -right-24 bottom-0 h-96 w-96 rounded-full blur-3xl" style={{ background: "rgba(55,95,160,.08)" }} />

      <div className="relative mx-auto grid min-h-[100dvh] w-full max-w-7xl items-center gap-10 px-6 py-10 lg:grid-cols-[1.05fr_.95fr] lg:px-12">
        <section className="hidden lg:block">
          <img src="/logo-sunrise-market.png" alt="Sunrise Market" className="h-16 w-auto rounded-2xl bg-white p-2 shadow-2xl" />
          <div className="mt-10 max-w-xl">
            <div className="text-sm font-semibold uppercase tracking-[0.28em]" style={{ color: "var(--gold)" }}>Sunrise Market</div>
            <h1 className="mt-4 font-display text-6xl font-semibold leading-[1.02]">Kupuj, sprzedawaj i rezerwuj w jednym miejscu.</h1>
            <p className="mt-6 max-w-lg text-lg leading-8" style={{ color: "var(--mut)" }}>
              Jedno konto Sunrise daje dostęp do zakupów, usług, rezerwacji, programu lojalnościowego i Sunrise Wallet.
            </p>
          </div>
        </section>

        <section className="mx-auto w-full max-w-lg">
          <div className="lg:hidden flex justify-center mb-8">
            <img src="/logo-sunrise-market.png" alt="Sunrise Market" className="h-14 w-auto rounded-2xl bg-white p-2 shadow-xl" />
          </div>

          <div
            className="rounded-[2rem] p-7 shadow-2xl backdrop-blur-xl sm:p-10"
            style={{
              background: "rgba(12,18,26,.88)",
              border: "1px solid rgba(200,150,90,.28)",
              boxShadow: "0 30px 90px rgba(0,0,0,.45)",
            }}
          >
            <div className="text-center lg:text-left">
              <div className="text-xs font-semibold uppercase tracking-[0.24em]" style={{ color: "var(--gold)" }}>Sunrise Market</div>
              <h2 className="mt-2 font-display text-4xl font-semibold">Zaloguj się</h2>
              <p className="mt-3 text-sm leading-6" style={{ color: "var(--mut)" }}>
                Logujesz się bezpośrednio do Sunrise Market. Nie opuszczasz aplikacji.
              </p>
            </div>

            <form onSubmit={submit} className="mt-8 space-y-5">
              <div>
                <label htmlFor="email" className="mb-2 block text-sm font-medium">E-mail</label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="twoj@email.pl"
                  className="w-full rounded-2xl px-4 py-4 text-base outline-none transition"
                  style={{ background: "rgba(255,255,255,.055)", border: "1px solid rgba(255,255,255,.12)", color: "var(--ink)" }}
                />
              </div>

              <div>
                <label htmlFor="password" className="mb-2 block text-sm font-medium">Hasło</label>
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-2xl px-4 py-4 text-base outline-none transition"
                  style={{ background: "rgba(255,255,255,.055)", border: "1px solid rgba(255,255,255,.12)", color: "var(--ink)" }}
                />
              </div>

              {error && (
                <div className="rounded-2xl px-4 py-3 text-sm" style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.25)", color: "#fecaca" }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="flex w-full items-center justify-center rounded-2xl px-4 py-4 text-base font-bold text-black transition-transform hover:scale-[1.01] active:scale-[.99] disabled:cursor-wait disabled:opacity-60"
                style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}
              >
                {busy ? "Logowanie…" : "Zaloguj się do Sunrise Market"}
              </button>
            </form>

            <div className="mt-5 text-center text-xs leading-5" style={{ color: "var(--mut)" }}>
              Jedno konto Sunrise działa w całym ekosystemie.
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
