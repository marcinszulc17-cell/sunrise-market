import { bookingAvailableSlots, getOffer } from "./api";

type PurchaseMode = "purchase" | "appointment" | "daily";

type AvailabilitySummary = {
  text: string;
  title: string;
};

const offerCache = new Map<string, any>();
const summaryCache = new Map<string, AvailabilitySummary | null>();
const inflight = new Set<string>();

function purchaseMode(offer: any): PurchaseMode {
  const mode = String(offer?.attributes?.purchase_mode || "purchase");
  return mode === "appointment" || mode === "daily" ? mode : "purchase";
}

function formatAppointment(iso: string): string {
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatDay(iso: string): string {
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}

async function loadSummary(offerId: string, offer: any): Promise<AvailabilitySummary | null> {
  const mode = purchaseMode(offer);
  if (mode === "purchase") return null;

  const from = new Date();
  const to = new Date(from);
  to.setDate(to.getDate() + (mode === "appointment" ? 14 : 45));

  const slots = await bookingAvailableSlots(offerId, from, to);
  const first = slots[0];
  if (!first) {
    return {
      text: "Sprawdź dostępność",
      title: mode === "appointment" ? "Brak wolnego terminu w najbliższych 14 dniach" : "Brak wolnego dnia w najbliższych 45 dniach",
    };
  }

  if (mode === "appointment") {
    return {
      text: `Najbliższy termin: ${formatAppointment(first.starts_at)}`,
      title: "Najbliższy realnie dostępny termin z kalendarza sprzedawcy",
    };
  }

  return {
    text: `Najbliżej dostępne: ${formatDay(first.starts_at)}`,
    title: "Najbliższy realnie dostępny dzień z kalendarza wynajmu",
  };
}

function insertSummary(article: HTMLElement, summary: AvailabilitySummary) {
  if (article.querySelector('[data-booking-availability-summary="1"]')) return;
  const body = article.querySelector(".p-4.flex.flex-col") as HTMLElement | null;
  if (!body) return;

  const actions = Array.from(body.children).find((el) => (el as HTMLElement).className.includes("flex gap-2 mt-1"));
  const row = document.createElement("div");
  row.dataset.bookingAvailabilitySummary = "1";
  row.className = "text-xs font-semibold rounded-xl px-3 py-2";
  row.style.background = "rgba(56,224,240,.07)";
  row.style.border = "1px solid rgba(56,224,240,.18)";
  row.style.color = "var(--ink)";
  row.textContent = `📅 ${summary.text}`;
  row.title = summary.title;

  if (actions) body.insertBefore(row, actions);
  else body.appendChild(row);
}

async function enrich(article: HTMLElement, offerId: string) {
  if (article.dataset.bookingAvailabilityResolved === "1") return;
  article.dataset.bookingAvailabilityResolved = "1";

  try {
    let offer = offerCache.get(offerId);
    if (!offer) {
      offer = await getOffer(offerId);
      offerCache.set(offerId, offer);
    }
    if (!offer || purchaseMode(offer) === "purchase") return;

    let summary = summaryCache.get(offerId);
    if (summary === undefined) {
      summary = await loadSummary(offerId, offer);
      summaryCache.set(offerId, summary);
    }
    if (summary) insertSummary(article, summary);
  } catch {
    article.dataset.bookingAvailabilityResolved = "0";
  }
}

function scan() {
  if (window.location.pathname !== "/") return;
  for (const article of Array.from(document.querySelectorAll("article")) as HTMLElement[]) {
    if (article.dataset.bookingAvailabilityResolved === "1") continue;
    const link = article.querySelector('a[href^="/produkt/"]') as HTMLAnchorElement | null;
    if (!link) continue;
    const offerId = (link.getAttribute("href") || "").split("/produkt/")[1]?.split("?")[0];
    if (!offerId || inflight.has(offerId)) continue;
    inflight.add(offerId);
    void enrich(article, offerId).finally(() => inflight.delete(offerId));
  }
}

export function startMarketBookingAvailability() {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  scan();
  const observer = new MutationObserver(scan);
  observer.observe(document.body, { childList: true, subtree: true });
  const timer = window.setInterval(scan, 1500);
  return () => {
    observer.disconnect();
    window.clearInterval(timer);
  };
}
