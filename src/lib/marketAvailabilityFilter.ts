import { bookingAvailableSlots, getOffer } from "./api";

type AvailabilityFilter = "any" | "today" | "tomorrow" | "weekend";
type PurchaseMode = "purchase" | "appointment" | "daily";

let active: AvailabilityFilter = "any";
const offerCache = new Map<string, any>();
const matchCache = new Map<string, boolean>();
const inflight = new Set<string>();

function purchaseMode(offer: any): PurchaseMode {
  const mode = String(offer?.attributes?.purchase_mode || "purchase");
  return mode === "appointment" || mode === "daily" ? mode : "purchase";
}

function startOfLocalDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function rangeFor(filter: Exclude<AvailabilityFilter, "any">): { from: Date; to: Date } {
  const now = new Date();
  if (filter === "today") {
    const from = now;
    const to = startOfLocalDay(now);
    to.setDate(to.getDate() + 1);
    return { from, to };
  }
  if (filter === "tomorrow") {
    const from = startOfLocalDay(now);
    from.setDate(from.getDate() + 1);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    return { from, to };
  }

  const day = now.getDay();
  const from = startOfLocalDay(now);
  if (day === 6) {
    // Saturday: current weekend starts now.
  } else if (day === 0) {
    from.setDate(from.getDate() - 1);
  } else {
    from.setDate(from.getDate() + (6 - day));
  }
  if (from < now) from.setTime(now.getTime());
  const to = startOfLocalDay(from);
  const fromDay = from.getDay();
  to.setDate(to.getDate() + (fromDay === 0 ? 1 : 2));
  return { from, to };
}

function offerIdFor(article: HTMLElement): string | null {
  const link = article.querySelector('a[href^="/produkt/"]') as HTMLAnchorElement | null;
  if (!link) return null;
  return (link.getAttribute("href") || "").split("/produkt/")[1]?.split("?")[0] || null;
}

function showArticle(article: HTMLElement, show: boolean) {
  if (show) {
    if (article.dataset.availabilityHidden === "1") {
      article.style.display = "";
      delete article.dataset.availabilityHidden;
    }
    return;
  }
  article.dataset.availabilityHidden = "1";
  article.style.display = "none";
}

async function matches(offerId: string, filter: Exclude<AvailabilityFilter, "any">): Promise<boolean> {
  const key = `${offerId}:${filter}`;
  if (matchCache.has(key)) return matchCache.get(key)!;

  let offer = offerCache.get(offerId);
  if (!offer) {
    offer = await getOffer(offerId);
    offerCache.set(offerId, offer);
  }

  if (!offer || purchaseMode(offer) === "purchase") {
    matchCache.set(key, false);
    return false;
  }

  const { from, to } = rangeFor(filter);
  const slots = await bookingAvailableSlots(offerId, from, to);
  const result = slots.length > 0;
  matchCache.set(key, result);
  return result;
}

function resetCards() {
  for (const article of Array.from(document.querySelectorAll("article")) as HTMLElement[]) showArticle(article, true);
}

async function applyToCard(article: HTMLElement) {
  if (active === "any") {
    showArticle(article, true);
    return;
  }

  const offerId = offerIdFor(article);
  if (!offerId || inflight.has(offerId)) return;
  inflight.add(offerId);
  try {
    const current = active;
    const ok = await matches(offerId, current);
    if (active === current) showArticle(article, ok);
  } catch {
    // On API failure do not hide an offer by mistake.
    showArticle(article, true);
  } finally {
    inflight.delete(offerId);
  }
}

function scanCards() {
  if (window.location.pathname !== "/") return;
  for (const article of Array.from(document.querySelectorAll("article")) as HTMLElement[]) void applyToCard(article);
}

function setActive(next: AvailabilityFilter, buttons: HTMLButtonElement[]) {
  active = next;
  matchCache.clear();
  for (const button of buttons) {
    const selected = button.dataset.availabilityFilter === active;
    button.style.background = selected ? "linear-gradient(135deg,#C8965A,#E8C896)" : "var(--bg)";
    button.style.color = selected ? "#000" : "var(--ink)";
    button.style.border = selected ? "1px solid transparent" : "1px solid var(--line)";
    button.setAttribute("aria-pressed", selected ? "true" : "false");
  }
  if (active === "any") resetCards();
  else scanCards();
}

function injectControls() {
  if (window.location.pathname !== "/" || document.querySelector('[data-market-availability-filter="1"]')) return;

  const heading = Array.from(document.querySelectorAll("div")).find((el) => (el.textContent || "").trim() === "Filtry ofert") as HTMLElement | undefined;
  const panel = heading?.closest(".rounded-2xl") as HTMLElement | null;
  if (!panel) return;

  const wrap = document.createElement("div");
  wrap.dataset.marketAvailabilityFilter = "1";
  wrap.className = "mt-4 border-t pt-4";
  wrap.style.borderColor = "var(--line)";

  const label = document.createElement("div");
  label.className = "mb-2 text-xs font-semibold";
  label.style.color = "var(--mut)";
  label.textContent = "Dostępność rezerwacji";
  wrap.appendChild(label);

  const row = document.createElement("div");
  row.className = "flex flex-wrap gap-2";
  wrap.appendChild(row);

  const defs: Array<[AvailabilityFilter, string]> = [
    ["any", "Dowolny termin"],
    ["today", "Dostępne dzisiaj"],
    ["tomorrow", "Dostępne jutro"],
    ["weekend", "Ten weekend"],
  ];

  const buttons = defs.map(([value, text]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.availabilityFilter = value;
    button.className = "rounded-xl px-3 py-2 text-xs font-semibold";
    button.textContent = text;
    button.onclick = () => setActive(value, buttons);
    row.appendChild(button);
    return button;
  });

  panel.appendChild(wrap);
  setActive(active, buttons);
}

export function startMarketAvailabilityFilter() {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  const scan = () => {
    injectControls();
    if (active !== "any") scanCards();
  };
  scan();
  const observer = new MutationObserver(scan);
  observer.observe(document.body, { childList: true, subtree: true });
  const timer = window.setInterval(scan, 1200);
  return () => {
    observer.disconnect();
    window.clearInterval(timer);
    resetCards();
  };
}
