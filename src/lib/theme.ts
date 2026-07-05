// Motyw jasny/ciemny — zapamiętany w localStorage, domyślnie ciemny.
const KEY = "sunrise_theme";
export type Theme = "dark" | "light";

export function getTheme(): Theme {
  try { return localStorage.getItem(KEY) === "light" ? "light" : "dark"; } catch { return "dark"; }
}
export function applyTheme(t: Theme) {
  if (t === "light") document.documentElement.setAttribute("data-theme", "light");
  else document.documentElement.removeAttribute("data-theme");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", t === "light" ? "#F5F6FB" : "#07070F");
}
export function setTheme(t: Theme) { try { localStorage.setItem(KEY, t); } catch { /* ignore */ } applyTheme(t); }
export function initTheme() { applyTheme(getTheme()); }
export function toggleTheme(): Theme { const n: Theme = getTheme() === "light" ? "dark" : "light"; setTheme(n); return n; }
