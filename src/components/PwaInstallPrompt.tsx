import { useEffect, useState } from "react";

/**
 * Podpowiedź „Zapisz aplikację” — TYLKO na app.sunrisemarket.pl (decyzja właściciela 2026-09-05).
 * Tam, gdzie system na to pozwala (Android, Chrome/Edge na komputerze), dialog instalacji odpala się sam
 * przy pierwszym dotknięciu strony — ale dopiero od DRUGIEJ wizyty (pierwsze wejście: tylko subtelny, zamykany pasek); iPhone (Safari) nie ma takiego API — zostaje instrukcja.
 * Nie blokuje ekranu: mały pasek u dołu. Znika na stałe po zainstalowaniu (event `appinstalled`,
 * tryb standalone) i na 7 dni po „Nie teraz”. Android/Chrome: natywny dialog z `beforeinstallprompt`;
 * iPhone/iPad (Safari): krótka instrukcja Udostępnij → „Do ekranu początkowego”.
 */
type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
const SNOOZE_KEY = "sm:pwa-install-snooze";
const DONE_KEY = "sm:pwa-installed";
const VISITS_KEY = "sm:pwa-visits"; // dialog systemowy dopiero od 2. wizyty — pierwsze wejście bez agresywnego popupu
const SNOOZE_MS = 7 * 24 * 3600 * 1000;

function isStandalone() {
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true;
}
function isIos() { return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream; }
function read(key: string) { try { return localStorage.getItem(key); } catch { return null; } }
function write(key: string, v: string) { try { localStorage.setItem(key, v); } catch { /* prywatny tryb */ } }

export default function PwaInstallPrompt() {
  const isAppDomain = window.location.hostname.toLowerCase() === "app.sunrisemarket.pl";
  const [deferred, setDeferred] = useState<BIP | null>(null);
  const [visible, setVisible] = useState(false);
  const [iosHelp, setIosHelp] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as BIP); };
    const onInstalled = () => { write(DONE_KEY, "1"); setVisible(false); setDeferred(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  // Android / Chrome / Edge: systemowy dialog instalacji otwiera się AUTOMATYCZNIE przy pierwszym dotknięciu
  // czegokolwiek na stronie (przeglądarka wymaga gestu użytkownika — bez kliknięcia nie da się wywołać prompt()).
  // Klient tylko potwierdza „Zainstaluj”. Odrzucenie = 7 dni ciszy, potem pasek jako łagodniejsze przypomnienie.
  const [visits] = useState(() => { const n = Number(read(VISITS_KEY) || 0) + 1; write(VISITS_KEY, String(n)); return n; });
  useEffect(() => {
    if (!isAppDomain || !deferred || isStandalone() || read(DONE_KEY) === "1" || visits < 2) return;
    const snooze = Number(read(SNOOZE_KEY) || 0);
    if (snooze && Date.now() - snooze < SNOOZE_MS) return;
    let fired = false;
    const onFirstTap = async () => {
      if (fired) return; fired = true;
      document.removeEventListener("pointerdown", onFirstTap, true);
      try {
        await deferred.prompt();
        const { outcome } = await deferred.userChoice;
        if (outcome === "accepted") write(DONE_KEY, "1"); else write(SNOOZE_KEY, String(Date.now()));
      } catch { /* przeglądarka odmówiła — zostaje pasek */ }
      setDeferred(null); setVisible(false);
    };
    document.addEventListener("pointerdown", onFirstTap, true);
    return () => document.removeEventListener("pointerdown", onFirstTap, true);
  }, [isAppDomain, deferred, visits]);

  useEffect(() => {
    if (!isAppDomain || isStandalone() || read(DONE_KEY) === "1") { setVisible(false); return; }
    const snooze = Number(read(SNOOZE_KEY) || 0);
    if (snooze && Date.now() - snooze < SNOOZE_MS) { setVisible(false); return; }
    // Android/Chrome: pokazujemy, gdy przeglądarka zgłosi gotowość; iOS: od razu (brak beforeinstallprompt).
    if (deferred || isIos()) { const t = setTimeout(() => setVisible(true), 1500); return () => clearTimeout(t); }
    setVisible(false);
  }, [isAppDomain, deferred]);

  if (!isAppDomain || !visible) return null;

  async function install() {
    if (deferred) {
      try { await deferred.prompt(); const { outcome } = await deferred.userChoice; if (outcome === "accepted") { write(DONE_KEY, "1"); setVisible(false); } else { write(SNOOZE_KEY, String(Date.now())); setVisible(false); } } catch { setVisible(false); }
      setDeferred(null); return;
    }
    setIosHelp(true);
  }
  function later() { write(SNOOZE_KEY, String(Date.now())); setVisible(false); }

  return <div role="dialog" aria-label="Zapisz aplikację Sunrise Market" className="fixed inset-x-3 z-[60] rounded-2xl p-4 shadow-2xl sm:left-auto sm:right-4 sm:w-[380px]" style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 76px)", background: "var(--header)", border: "1px solid rgba(245,166,35,.35)", color: "var(--ink)" }}>
    <div className="flex items-start gap-3">
      <img src="/icon-192x192.png" alt="" className="h-11 w-11 rounded-xl" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">Zapisz Sunrise Market jako aplikację</div>
        {iosHelp
          ? <p className="mt-1 text-sm leading-5" style={{ color: "var(--mut)" }}>W Safari dotknij <b>Udostępnij</b> (ikona kwadratu ze strzałką), a potem <b>„Do ekranu początkowego”</b>. Ikona pojawi się obok innych aplikacji.</p>
          : <p className="mt-1 text-sm leading-5" style={{ color: "var(--mut)" }}>Szybszy dostęp z ekranu głównego, pełny ekran i powiadomienia o zamówieniach.</p>}
        <div className="mt-3 flex gap-2">
          {!iosHelp && <button type="button" onClick={install} className="rounded-xl px-4 py-2 text-sm font-semibold" style={{ background: "linear-gradient(135deg,#E8891A,#F5A623)", color: "#101012" }}>{deferred ? "Zainstaluj" : "Jak zapisać?"}</button>}
          <button type="button" onClick={later} className="rounded-xl px-4 py-2 text-sm" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>{iosHelp ? "Rozumiem" : "Nie teraz"}</button>
        </div>
      </div>
      <button type="button" onClick={later} aria-label="Zamknij" className="-mr-2 -mt-2 grid h-11 w-11 place-items-center rounded-xl text-xl leading-none" style={{ color: "var(--mut)" }}>×</button>
    </div>
  </div>;
}
