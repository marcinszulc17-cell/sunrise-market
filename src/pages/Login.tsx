import { CSSProperties, FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

/**
 * Ekran logowania Sunrise Market.
 * Grafiki hero (public/sunrise-market-login-{desktop,tablet,mobile}.png) sa uzyte
 * bez modyfikacji — wariant dobierany jest przez <picture> zaleznie od szerokosci ekranu.
 * Formularz to prawdziwy HTML: e-mail, haslo z podgladem, zapamietaj mnie,
 * reset hasla i logowanie. Bez Google/Apple. Logika auth (Supabase + sso-register)
 * pozostaje bez zmian, uzytkownik zostaje w Sunrise Market.
 */

const LOGIN_CSS = `.sl-root{position:relative;min-height:100dvh;overflow:hidden;display:flex;flex-direction:column;background:#05070c;color:#fff;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
.sl-bg{position:absolute;inset:-8%;width:116%;height:116%;object-fit:cover;filter:blur(54px) saturate(115%) brightness(.36);pointer-events:none}
.sl-vig{position:absolute;inset:0;background:radial-gradient(120% 92% at 32% 42%,rgba(5,7,12,0) 0%,rgba(5,7,12,.5) 68%,rgba(5,7,12,.92) 100%);pointer-events:none}
.sl-stage{position:relative;flex:1;display:flex;flex-direction:column;justify-content:center}
.sl-banner{position:relative;width:100%}
.sl-frame{position:relative;width:100%;aspect-ratio:var(--sl-ar-m);max-height:52vh;overflow:hidden}
.sl-frame img{width:100%;height:100%;object-fit:cover;object-position:50% 38%;transform:scale(1.05);display:block}
.sl-fade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(5,7,12,0) 58%,rgba(5,7,12,.9) 100%)}
.sl-wrap{position:relative;padding:0 16px 20px;margin-top:-56px;display:flex;justify-content:center}
.sl-card{width:100%;max-width:440px;border-radius:26px;padding:24px;background:rgba(9,13,20,.62);border:1px solid rgba(255,255,255,.15);-webkit-backdrop-filter:blur(26px) saturate(150%);backdrop-filter:blur(26px) saturate(150%);box-shadow:0 44px 120px rgba(0,0,0,.66),inset 0 1px 0 rgba(255,255,255,.10)}
.sl-logo{height:56px;width:auto;max-width:280px;border-radius:11px;background:#fff;padding:5px 8px;display:block}
.sl-h1{font-size:25px;line-height:1.15;margin:16px 0 6px;font-weight:800;letter-spacing:-.02em;color:#fff}
.sl-sub{margin:0;font-size:13.5px;line-height:1.5;color:rgba(255,255,255,.55)}
.sl-label{display:block;font-size:12px;font-weight:600;color:rgba(255,255,255,.6);margin:0 0 7px}
.sl-field{position:relative;margin-top:15px}
.sl-input{width:100%;height:48px;border-radius:14px;padding:0 46px 0 14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);color:#fff;font-size:15px;outline:none;font-family:inherit}
.sl-input::placeholder{color:rgba(255,255,255,.34)}
.sl-input:focus{border-color:var(--sl-a1);background:rgba(255,255,255,.09)}
.sl-eye{position:absolute;right:6px;bottom:4px;height:40px;width:40px;display:grid;place-items:center;background:none;border:0;color:rgba(255,255,255,.5);cursor:pointer;padding:0}
.sl-eye:hover{color:rgba(255,255,255,.85)}
.sl-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:14px;font-size:12.5px}
.sl-link{color:var(--sl-a1);text-decoration:none;font-weight:600;background:none;border:0;padding:0;cursor:pointer;font-size:inherit;font-family:inherit}
.sl-link:hover{text-decoration:underline}
.sl-chk{display:flex;align-items:center;gap:8px;color:rgba(255,255,255,.62);cursor:pointer}
.sl-chk input{accent-color:var(--sl-a1);width:16px;height:16px;cursor:pointer}
.sl-btn{margin-top:18px;width:100%;height:50px;border:0;border-radius:14px;font-size:15px;font-weight:800;color:var(--sl-ink);background:linear-gradient(135deg,var(--sl-a1),var(--sl-a2));cursor:pointer;font-family:inherit}
.sl-btn:hover{filter:brightness(1.08)}
.sl-btn:disabled{opacity:.6;cursor:default}
.sl-err{margin-top:14px;border-radius:14px;padding:11px 14px;font-size:13px;background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.28);color:#fecaca}
.sl-foot{margin-top:14px;text-align:center;font-size:12.5px;color:rgba(255,255,255,.45)}
@media (min-width:640px){
.sl-banner{padding:0 clamp(16px,4vw,52px)}
.sl-frame{aspect-ratio:var(--sl-ar-t);max-height:42vh;border-radius:22px;border:1px solid rgba(255,255,255,.07)}
.sl-frame img{object-position:50% 20%;transform:scale(1.11)}
.sl-wrap{margin-top:-76px;padding-bottom:28px}
.sl-card{padding:30px;max-width:468px}
.sl-h1{font-size:28px}
}
@media (min-width:1280px){
.sl-banner{padding:0}
.sl-frame{aspect-ratio:var(--sl-ar-d);max-height:none;border-radius:0;border:0}
.sl-frame img{object-position:50% 50%;transform:scale(1.045)}
.sl-fade{background:linear-gradient(90deg,rgba(5,7,12,0) 44%,rgba(5,7,12,.5) 62%,rgba(5,7,12,.86) 79%,rgba(5,7,12,.93) 100%)}
.sl-wrap{position:absolute;inset:0;margin:0;padding:0 clamp(32px,5vw,90px);align-items:center;justify-content:flex-end}
.sl-card{max-width:452px;padding:34px}
.sl-h1{font-size:29px}
}`;

const REMEMBER_KEY = "sunrise.market.login.email";
const RESET_URL = "https://app.mysunrise.pl/forgot-password";

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

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="M3 3l18 18" />}
    </svg>
  );
}

export default function Login() {
  const next = useMemo(() => safeNext(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(REMEMBER_KEY);
      if (saved) { setEmail(saved); setRemember(true); }
    } catch { /* localStorage moze byc niedostepny */ }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { error: signErr } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signErr) throw signErr;
      try {
        if (remember) window.localStorage.setItem(REMEMBER_KEY, email.trim());
        else window.localStorage.removeItem(REMEMBER_KEY);
      } catch { /* ignorujemy */ }
      try { await supabase.functions.invoke("sso-register", { body: { password } }); } catch { /* opcjonalne */ }
      window.location.replace(next);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(friendlyError(message));
      setBusy(false);
    }
  }

  const vars = {
    "--sl-a1": "#F97316",
    "--sl-a2": "#FB923C",
    "--sl-ink": "#0b0a08",
    "--sl-ar-d": "2.924",
    "--sl-ar-t": "1.3866",
    "--sl-ar-m": "0.8193",
  } as CSSProperties;

  return (
    <main className="sl-root" style={vars}>
      <style>{LOGIN_CSS}</style>
      <img className="sl-bg" src="/sunrise-market-login-desktop.png" alt="" aria-hidden="true" />
      <div className="sl-vig" />
      <div className="sl-stage">
        <div className="sl-banner">
          <div className="sl-frame">
            <picture>
              <source media="(min-width:1280px)" srcSet="/sunrise-market-login-desktop.png" />
              <source media="(min-width:640px)" srcSet="/sunrise-market-login-tablet.png" />
              <img src="/sunrise-market-login-mobile.png" alt="Sunrise Market" />
            </picture>
            <div className="sl-fade" />
          </div>
        </div>

        <div className="sl-wrap">
          <form className="sl-card" onSubmit={submit}>
            <img className="sl-logo" src="/logo-sunrise-market.png" alt="Sunrise Market" />
            <h1 className="sl-h1">Witaj ponownie</h1>
            <p className="sl-sub">Zaloguj się bezpośrednio do Sunrise Market swoim kontem Sunrise.</p>

            <div className="sl-field">
              <label className="sl-label" htmlFor="sl-email">E-mail</label>
              <input id="sl-email" className="sl-input" type="email" required autoComplete="email"
                value={email} onChange={(e) => setEmail(e.target.value)} placeholder="twoj@email.pl" />
            </div>

            <div className="sl-field">
              <label className="sl-label" htmlFor="sl-password">Hasło</label>
              <input id="sl-password" className="sl-input" type={showPassword ? "text" : "password"} required
                autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" />
              <button type="button" className="sl-eye" onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Ukryj hasło" : "Pokaż hasło"}>
                <EyeIcon off={showPassword} />
              </button>
            </div>

            <div className="sl-row">
              <label className="sl-chk">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                Zapamiętaj mnie
              </label>
              <a className="sl-link" href={RESET_URL}>Nie pamiętasz hasła?</a>
            </div>

            {error && <div className="sl-err">{error}</div>}

            <button className="sl-btn" type="submit" disabled={busy}>
              {busy ? "Logowanie…" : "Zaloguj się"}
            </button>

            <div className="sl-foot">Jedno konto Sunrise działa w całym ekosystemie.</div>
          </form>
        </div>
      </div>
    </main>
  );
}
