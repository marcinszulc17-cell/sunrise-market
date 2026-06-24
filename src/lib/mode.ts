// Tryb konta: kupujący vs sprzedawca (jedno logowanie, dwa konta/widoki).
const KEY = "sunrise_mode";
export type Mode = "buyer" | "seller";

export function getMode(): Mode {
  try { return localStorage.getItem(KEY) === "seller" ? "seller" : "buyer"; } catch { return "buyer"; }
}
export function setMode(m: Mode) {
  try { localStorage.setItem(KEY, m); } catch { /* ignore */ }
}
