// Motyw jasny/ciemny — domyślnie wg ustawień systemu (prefers-color-scheme), wybór użytkownika zapamiętany w localStorage
// (decyzja właściciela 2026-09-06: „ciemny/jasny motyw wg systemu”). Zmiana motywu systemu w trakcie działa na żywo, dopóki użytkownik nie wybrał ręcznie.
const KEY = "sunrise_theme";
export type Theme = "dark" | "light";

function systemTheme(): Theme { try { return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark"; } catch { return "dark"; } }
export function storedTheme(): Theme | null { try { const v = localStorage.getItem(KEY); return v === "light" || v === "dark" ? v : null; } catch { return null; } }
export function getTheme(): Theme { return storedTheme() ?? systemTheme(); }
export function applyTheme(t: Theme) {
  if (t === "light") document.documentElement.setAttribute("data-theme", "light");
  else document.documentElement.removeAttribute("data-theme");
  document.documentElement.style.colorScheme = t;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", t === "light" ? "#F5F6FB" : "#101012");
}
export function setTheme(t: Theme) { try { localStorage.setItem(KEY, t); } catch { /* ignore */ } applyTheme(t); }
export function resetTheme() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } applyTheme(systemTheme()); }
export function initTheme() {
  applyTheme(getTheme());
  try { window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => { if (!storedTheme()) applyTheme(systemTheme()); }); } catch { /* stare przeglądarki */ }
}
export function toggleTheme(): Theme { const n: Theme = getTheme() === "light" ? "dark" : "light"; setTheme(n); return n; }
