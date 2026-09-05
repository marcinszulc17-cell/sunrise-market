// Powiadomienia push (VAPID): włączenie/wyłączenie w Moje konto → Ustawienia. Subskrypcja zapisywana RPC
// save_push_subscription; wysyłka edge fn send-web-push dla nowych wpisów market.notifications.
// Na iPhonie działa dopiero po zapisaniu aplikacji na ekranie początkowym (Safari 16.4+, tryb standalone).
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

function b64ToUint8(b64: string) { const pad = "=".repeat((4 - (b64.length % 4)) % 4); const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(raw, c => c.charCodeAt(0)); }
function supported() { return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window; }
function isIosBrowserTab() { return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true); }

export default function PushToggle() {
  const [state, setState] = useState<"checking" | "unsupported" | "ios_tab" | "off" | "on" | "denied">("checking");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!supported()) { setState(isIosBrowserTab() ? "ios_tab" : "unsupported"); return; }
      if (Notification.permission === "denied") { setState("denied"); return; }
      try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); setState(sub ? "on" : "off"); } catch { setState("off"); }
    })();
  }, []);

  async function enable() {
    setBusy(true); setErr(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setState(perm === "denied" ? "denied" : "off"); return; }
      const { data: key, error: kErr } = await supabase.schema("market").rpc("push_public_key");
      if (kErr || !key) throw new Error("Powiadomienia push nie są jeszcze skonfigurowane.");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(String(key)) });
      const { error } = await supabase.schema("market").rpc("save_push_subscription", { p_sub: sub.toJSON(), p_user_agent: navigator.userAgent });
      if (error) throw error;
      setState("on");
    } catch (e: any) { setErr(e?.message || "Nie udało się włączyć powiadomień."); }
    finally { setBusy(false); }
  }
  async function disable() {
    setBusy(true); setErr(null);
    try {
      const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription();
      if (sub) { await supabase.schema("market").rpc("remove_push_subscription", { p_endpoint: sub.endpoint }); await sub.unsubscribe(); }
      setState("off");
    } catch (e: any) { setErr(e?.message || "Nie udało się wyłączyć."); } finally { setBusy(false); }
  }

  const text = state === "on" ? "Włączone — dostaniesz powiadomienie o opłaceniu, wysyłce i doręczeniu zamówienia, o sporach i nowych opiniach."
    : state === "off" ? "Dostawaj powiadomienia o zamówieniach, rezerwacjach i opiniach nawet, gdy aplikacja jest zamknięta."
    : state === "denied" ? "Zablokowane w przeglądarce. Włącz je w ustawieniach witryny (ikona kłódki przy adresie), a potem wróć tutaj."
    : state === "ios_tab" ? "Na iPhonie powiadomienia działają po zapisaniu Sunrise Market na ekranie początkowym (Udostępnij → „Do ekranu początkowego”)."
    : state === "unsupported" ? "Ta przeglądarka nie obsługuje powiadomień push." : "Sprawdzam…";

  return <div className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1"><div className="text-sm" style={{ color: "var(--mut)" }}>Powiadomienia push</div><div className="mt-1 font-semibold">{state === "on" ? "🔔 Włączone" : "🔕 Wyłączone"}</div><p className="mt-1 text-sm leading-5" style={{ color: "var(--mut)" }}>{text}</p>{err && <p className="mt-2 text-xs" style={{ color: "#f87171" }}>{err}</p>}</div>
      {(state === "off" || state === "on") && <button type="button" disabled={busy} onClick={state === "on" ? disable : enable} className="rounded-xl px-4 py-2 text-sm font-semibold" style={state === "on" ? { background: "var(--header)", border: "1px solid var(--line)", opacity: busy ? .6 : 1 } : { background: "linear-gradient(135deg,#E8891A,#F5A623)", color: "#101012", opacity: busy ? .6 : 1 }}>{busy ? "…" : state === "on" ? "Wyłącz" : "Włącz"}</button>}
    </div>
  </div>;
}
