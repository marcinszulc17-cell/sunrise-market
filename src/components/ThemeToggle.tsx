import { useState } from "react";
import { getTheme, resetTheme, setTheme, storedTheme, toggleTheme, type Theme } from "../lib/theme";

export default function ThemeToggle({ size = 9 }: { size?: 9 | 11 }) {
  const [t, setT] = useState(getTheme());
  return (
    <button
      type="button"
      onClick={() => setT(toggleTheme())}
      title={t === "light" ? "Tryb ciemny" : "Tryb jasny"}
      aria-label={t === "light" ? "Włącz tryb ciemny" : "Włącz tryb jasny"}
      className={`${size === 11 ? "h-11 w-11" : "h-9 w-9"} shrink-0 grid place-items-center rounded-xl text-base`}
      style={{ background: "var(--glass)", border: "1px solid var(--line)" }}
    >
      {t === "light" ? "🌙" : "☀️"}
    </button>
  );
}

/** Karta w Moje konto → Ustawienia: Jak system / Jasny / Ciemny (telefon nie ma przełącznika w nagłówku na każdej stronie). */
export function ThemeSettings() {
  const [choice, setChoice] = useState<"system" | Theme>(storedTheme() ?? "system");
  const pick = (c: "system" | Theme) => { setChoice(c); if (c === "system") resetTheme(); else setTheme(c); };
  const opts: { id: "system" | Theme; label: string; icon: string }[] = [{ id: "system", label: "Jak system", icon: "📱" }, { id: "light", label: "Jasny", icon: "☀️" }, { id: "dark", label: "Ciemny", icon: "🌙" }];
  return <div className="rounded-2xl p-4" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
    <div className="text-sm" style={{ color: "var(--mut)" }}>Wygląd</div>
    <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Motyw">
      {opts.map((o) => <button key={o.id} type="button" role="radio" aria-checked={choice === o.id} onClick={() => pick(o.id)} className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl text-sm font-semibold" style={choice === o.id ? { background: "linear-gradient(135deg,#E8891A,#F5A623)", color: "#101012" } : { background: "var(--header)", border: "1px solid var(--line)", color: "var(--ink)" }}><span aria-hidden="true">{o.icon}</span>{o.label}</button>)}
    </div>
    <p className="mt-2 text-xs" style={{ color: "var(--mut)" }}>„Jak system” podąża za ustawieniem telefonu; wybór jasny/ciemny jest zapamiętany na tym urządzeniu.</p>
  </div>;
}
