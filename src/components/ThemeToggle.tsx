import { useState } from "react";
import { getTheme, toggleTheme } from "../lib/theme";

export default function ThemeToggle() {
  const [t, setT] = useState(getTheme());
  return (
    <button
      onClick={() => setT(toggleTheme())}
      title={t === "light" ? "Tryb ciemny" : "Tryb jasny"}
      aria-label="Przełącz motyw"
      className="w-9 h-9 rounded-xl grid place-items-center text-base shrink-0"
      style={{ background: "var(--glass)", border: "1px solid var(--line)" }}
    >
      {t === "light" ? "🌙" : "☀️"}
    </button>
  );
}
