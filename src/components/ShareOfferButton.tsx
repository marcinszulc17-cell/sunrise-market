// „Udostępnij / Kopiuj link do ogłoszenia”: na telefonie natywny arkusz udostępniania (WhatsApp, Messenger, SMS…),
// na desktopie kopiowanie do schowka z widocznym potwierdzeniem. Link zawsze na sunrisemarket.pl/produkt/:id
// (podgląd z miniaturką robi /api/og). Fallback dla starych przeglądarek: zaznaczone pole z linkiem.
import { useState } from "react";

export default function ShareOfferButton({ offerId, title, className, style }: { offerId: string; title?: string; className?: string; style?: React.CSSProperties }) {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");
  const url = `https://sunrisemarket.pl/produkt/${offerId}`;

  async function share() {
    const nav = navigator as Navigator & { share?: (d: { title?: string; text?: string; url: string }) => Promise<void> };
    const mobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent);
    if (mobile && typeof nav.share === "function") {
      try { await nav.share({ title: title || "Sunrise Market", text: title ? `${title} — Sunrise Market` : undefined, url }); return; } catch { /* anulowane → spróbuj skopiować */ }
    }
    try {
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(url); setState("copied"); setTimeout(() => setState("idle"), 2500); return; }
      throw new Error("no clipboard");
    } catch {
      try {
        const ta = document.createElement("textarea"); ta.value = url; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select(); const ok = document.execCommand("copy"); document.body.removeChild(ta);
        if (ok) { setState("copied"); setTimeout(() => setState("idle"), 2500); return; }
      } catch { /* dalej */ }
      setState("manual");
    }
  }

  if (state === "manual") {
    return <div className={className} style={{ ...style, display: "grid", gap: 6 }}>
      <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} autoFocus className="w-full rounded-xl px-3 py-2 text-sm" style={{ background: "var(--header)", border: "1px solid var(--line)", color: "var(--ink)" }} />
      <span className="text-xs" style={{ color: "var(--mut)" }}>Zaznacz i skopiuj link ręcznie.</span>
    </div>;
  }
  return <button type="button" onClick={share} aria-live="polite" className={className} style={style}>
    {state === "copied" ? "✓ Link skopiowany" : "🔗 Udostępnij ogłoszenie"}
  </button>;
}
