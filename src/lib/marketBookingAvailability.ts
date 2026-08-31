import { bookingAvailableSlots, getOffer } from "./api";

type PurchaseMode = "purchase" | "appointment" | "daily";

type AvailabilitySummary = {
  text: string;
  title: string;
  mode: Exclude<PurchaseMode, "purchase">;
  startsAt?: string;
  quickSlots?: string[];
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

function dayKey(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function hourLabel(iso: string): string {
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    minute: "2-digit",
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
      mode,
      text: "Sprawdź dostępność",
      title: mode === "appointment" ? "Brak wolnego terminu w najbliższych 14 dniach" : "Brak wolnego dnia w najbliższych 45 dniach",
    };
  }

  if (mode === "appointment") {
    const firstDay = dayKey(first.starts_at);
    const quickSlots = slots
      .filter((slot: any) => dayKey(slot.starts_at) === firstDay)
      .slice(0, 3)
      .map((slot: any) => String(slot.starts_at));
    return {
      mode,
      startsAt: first.starts_at,
      quickSlots,
      text: `Najbliższy termin: ${formatAppointment(first.starts_at)}`,
      title: "Kliknij konkretną godzinę, aby od razu wybrać termin",
    };
  }

  return {
    mode,
    startsAt: first.starts_at,
    text: `Najbliżej dostępne: ${formatDay(first.starts_at)}`,
    title: "Kliknij, aby otworzyć kalendarz wynajmu od najbliższej dostępności",
  };
}

function bookingHref(offerId: string, summary: AvailabilitySummary, exact?: string) {
  const params = new URLSearchParams({ booking: "1" });
  if (summary.mode === "appointment" && exact) params.set("quick", `slot:${exact}`);
  else if (summary.mode === "appointment" && summary.startsAt) params.set("quick", "nearest");
  if (summary.mode === "daily" && summary.startsAt) params.set("from", summary.startsAt.slice(0, 10));
  return `/produkt/${encodeURIComponent(offerId)}?${params.toString()}`;
}

function insertSummary(article: HTMLElement, offerId: string, summary: AvailabilitySummary) {
  if (article.querySelector('[data-booking-availability-summary="1"]')) return;
  const body = article.querySelector(".p-4.flex.flex-col") as HTMLElement | null;
  if (!body) return;

  const actions = Array.from(body.children).find((el) => (el as HTMLElement).className.includes("flex gap-2 mt-1"));
  const wrap = document.createElement("div");
  wrap.dataset.bookingAvailabilitySummary = "1";
  wrap.className = "rounded-xl px-3 py-2";
  wrap.style.background = "rgba(56,224,240,.07)";
  wrap.style.border = "1px solid rgba(56,224,240,.18)";

  const headline = document.createElement("a");
  headline.className = "block text-xs font-semibold transition hover:brightness-110";
  headline.style.color = "var(--ink)";
  headline.style.textDecoration = "none";
  headline.href = bookingHref(offerId, summary);
  headline.textContent = `📅 ${summary.text}${summary.startsAt ? " →" : ""}`;
  headline.title = summary.title;
  headline.setAttribute("aria-label", summary.title);
  wrap.appendChild(headline);

  if (summary.mode === "appointment" && summary.quickSlots?.length) {
    const slotsRow = document.createElement("div");
    slotsRow.dataset.bookingQuickSlots = "1";
    slotsRow.className = "mt-2 flex flex-wrap gap-2";
    for (const iso of summary.quickSlots) {
      const link = document.createElement("a");
      link.href = bookingHref(offerId, summary, iso);
      link.className = "rounded-lg px-2.5 py-1.5 text-xs font-semibold transition hover:brightness-110";
      link.style.background = "var(--glass)";
      link.style.border = "1px solid var(--line)";
      link.style.color = "var(--ink)";
      link.style.textDecoration = "none";
      link.textContent = hourLabel(iso);
      link.title = `Wybierz ${formatAppointment(iso)}`;
      link.setAttribute("aria-label", link.title);
      slotsRow.appendChild(link);
    }
    wrap.appendChild(slotsRow);
  }

  if (actions) body.insertBefore(wrap, actions);
  else body.appendChild(wrap);
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
    if (summary) insertSummary(article, offerId, summary);
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
