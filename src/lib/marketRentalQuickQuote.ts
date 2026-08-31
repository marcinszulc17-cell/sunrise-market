import { getOffer } from "./api";
import { bookingDailyQuoteV2 } from "./bookingV2";

type PurchaseMode = "purchase" | "appointment" | "daily";

const offerCache = new Map<string, any>();
const inflight = new Set<string>();

function purchaseMode(offer: any): PurchaseMode {
  const mode = String(offer?.attributes?.purchase_mode || "purchase");
  return mode === "appointment" || mode === "daily" ? mode : "purchase";
}

function offerIdFor(article: HTMLElement): string | null {
  const link = article.querySelector('a[href^="/produkt/"]') as HTMLAnchorElement | null;
  if (!link) return null;
  return (link.getAttribute("href") || "").split("/produkt/")[1]?.split("?")[0] || null;
}

function todayKey(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function money(value: number) {
  return `${value.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
}

function insertQuote(article: HTMLElement, offerId: string) {
  if (article.querySelector('[data-rental-quick-quote="1"]')) return;
  const body = article.querySelector(".p-4.flex.flex-col") as HTMLElement | null;
  if (!body) return;

  const actions = Array.from(body.children).find((el) => (el as HTMLElement).className.includes("flex gap-2 mt-1"));
  const wrap = document.createElement("div");
  wrap.dataset.rentalQuickQuote = "1";
  wrap.className = "rounded-2xl p-3 text-xs";
  wrap.style.background = "rgba(200,150,90,.06)";
  wrap.style.border = "1px solid rgba(200,150,90,.20)";

  const title = document.createElement("div");
  title.className = "mb-2 font-semibold";
  title.textContent = "Szybka wycena wynajmu";
  wrap.appendChild(title);

  const fields = document.createElement("div");
  fields.className = "grid grid-cols-2 gap-2";

  const from = document.createElement("input");
  from.type = "date";
  from.min = todayKey(0);
  from.value = todayKey(1);
  from.setAttribute("aria-label", "Wynajem od");
  from.className = "min-w-0 rounded-xl px-2 py-2 text-xs";
  from.style.background = "var(--bg)";
  from.style.border = "1px solid var(--line)";
  from.style.color = "var(--ink)";

  const to = document.createElement("input");
  to.type = "date";
  to.min = todayKey(1);
  to.value = todayKey(2);
  to.setAttribute("aria-label", "Wynajem do");
  to.className = "min-w-0 rounded-xl px-2 py-2 text-xs";
  to.style.background = "var(--bg)";
  to.style.border = "1px solid var(--line)";
  to.style.color = "var(--ink)";

  fields.append(from, to);
  wrap.appendChild(fields);

  const result = document.createElement("div");
  result.className = "mt-2 flex min-h-[34px] items-center justify-between gap-2 rounded-xl px-3 py-2";
  result.style.background = "var(--glass)";
  result.style.border = "1px solid var(--line)";
  result.innerHTML = '<span style="color:var(--mut)">Wybierz daty</span>';
  wrap.appendChild(result);

  const link = document.createElement("a");
  link.className = "mt-2 block rounded-xl px-3 py-2 text-center font-semibold";
  link.style.background = "linear-gradient(135deg,#C8965A,#E8C896)";
  link.style.color = "#211406";
  link.style.textDecoration = "none";
  link.textContent = "Sprawdź i zarezerwuj";
  wrap.appendChild(link);

  let request = 0;
  const refresh = async () => {
    const current = ++request;
    const fromDay = from.value;
    const toDay = to.value;
    to.min = fromDay || todayKey(0);

    const params = new URLSearchParams({ booking: "1" });
    if (fromDay) params.set("from", fromDay);
    if (toDay) params.set("to", toDay);
    link.href = `/produkt/${encodeURIComponent(offerId)}?${params.toString()}`;

    if (!fromDay || !toDay || toDay <= fromDay) {
      result.innerHTML = '<span style="color:var(--mut)">Wybierz prawidłowy zakres</span>';
      return;
    }

    result.innerHTML = '<span style="color:var(--mut)">Liczenie ceny…</span>';
    try {
      const quote = await bookingDailyQuoteV2(offerId, fromDay, toDay);
      if (current !== request) return;
      if (quote.days <= 0) {
        result.innerHTML = '<span style="color:var(--mut)">Termin niedostępny lub poza zakresem</span>';
        return;
      }
      result.replaceChildren();
      const days = document.createElement("span");
      days.style.color = "var(--mut)";
      days.textContent = `${quote.days} ${quote.days === 1 ? "dzień" : "dni"}`;
      const price = document.createElement("strong");
      price.style.color = "var(--gold)";
      price.textContent = money(quote.base);
      result.append(days, price);
      link.textContent = `Zarezerwuj · ${money(quote.base)}`;
    } catch {
      if (current !== request) return;
      result.innerHTML = '<span style="color:var(--mut)">Nie udało się policzyć — sprawdź w kalendarzu</span>';
      link.textContent = "Sprawdź i zarezerwuj";
    }
  };

  from.addEventListener("change", refresh);
  to.addEventListener("change", refresh);

  if (actions) body.insertBefore(wrap, actions);
  else body.appendChild(wrap);
  void refresh();
}

async function enrich(article: HTMLElement, offerId: string) {
  if (article.dataset.rentalQuoteResolved === "1") return;
  article.dataset.rentalQuoteResolved = "1";
  try {
    let offer = offerCache.get(offerId);
    if (!offer) {
      offer = await getOffer(offerId);
      offerCache.set(offerId, offer);
    }
    if (!offer || purchaseMode(offer) !== "daily") return;
    insertQuote(article, offerId);
  } catch {
    article.dataset.rentalQuoteResolved = "0";
  }
}

function scan() {
  if (window.location.pathname !== "/") return;
  for (const article of Array.from(document.querySelectorAll("article")) as HTMLElement[]) {
    if (article.dataset.rentalQuoteResolved === "1") continue;
    const offerId = offerIdFor(article);
    if (!offerId || inflight.has(offerId)) continue;
    inflight.add(offerId);
    void enrich(article, offerId).finally(() => inflight.delete(offerId));
  }
}

export function startMarketRentalQuickQuote() {
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
