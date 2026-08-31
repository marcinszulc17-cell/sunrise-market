import { getOffer } from "./api";
import { bookingDailyQuoteV2, bookingPublicCatalogV2, bookingUnavailableDaysV2, type BookingResourceV2 } from "./bookingV2";
import { cashbackFor, getMarketConfig } from "./marketConfig";

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

function hasConflict(rows: Array<{ day: string }>, fromDay: string, toDay: string) {
  return rows.some((row) => row.day >= fromDay && row.day < toDay);
}

async function availableResources(offerId: string, resources: BookingResourceV2[], fromDay: string, toDay: string) {
  const checks = await Promise.all(resources.map(async (resource) => {
    try {
      const rows = await bookingUnavailableDaysV2(offerId, fromDay, toDay, resource.id);
      return hasConflict(rows, fromDay, toDay) ? null : resource;
    } catch {
      return null;
    }
  }));
  return checks.filter(Boolean) as BookingResourceV2[];
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

  const resourceWrap = document.createElement("div");
  resourceWrap.className = "mt-2 hidden";
  const resourceLabel = document.createElement("div");
  resourceLabel.className = "mb-1 font-semibold";
  resourceLabel.style.color = "var(--mut)";
  resourceLabel.textContent = "Konkretny egzemplarz";
  const resourceSelect = document.createElement("select");
  resourceSelect.className = "w-full rounded-xl px-2 py-2 text-xs";
  resourceSelect.style.background = "var(--bg)";
  resourceSelect.style.border = "1px solid var(--line)";
  resourceSelect.style.color = "var(--ink)";
  resourceWrap.append(resourceLabel, resourceSelect);
  wrap.appendChild(resourceWrap);

  const resourceStatus = document.createElement("div");
  resourceStatus.className = "mt-2 hidden rounded-xl px-3 py-2 font-semibold";
  resourceStatus.style.background = "rgba(56,224,240,.07)";
  resourceStatus.style.border = "1px solid rgba(56,224,240,.18)";
  resourceStatus.style.color = "var(--ink)";
  wrap.appendChild(resourceStatus);

  const result = document.createElement("div");
  result.className = "mt-2 flex min-h-[34px] items-center justify-between gap-2 rounded-xl px-3 py-2";
  result.style.background = "var(--glass)";
  result.style.border = "1px solid var(--line)";
  result.innerHTML = '<span style="color:var(--mut)">Wybierz daty</span>';
  wrap.appendChild(result);

  const cashback = document.createElement("div");
  cashback.className = "mt-2 hidden rounded-xl px-3 py-2 font-semibold";
  cashback.style.background = "rgba(34,197,94,.08)";
  cashback.style.border = "1px solid rgba(34,197,94,.18)";
  cashback.style.color = "var(--green)";
  wrap.appendChild(cashback);

  const link = document.createElement("a");
  link.className = "mt-2 block rounded-xl px-3 py-2 text-center font-semibold";
  link.style.background = "linear-gradient(135deg,#C8965A,#E8C896)";
  link.style.color = "#211406";
  link.style.textDecoration = "none";
  link.textContent = "Sprawdź i zarezerwuj";
  wrap.appendChild(link);

  let resources: BookingResourceV2[] = [];
  let request = 0;

  const updateResourceOptions = (available: BookingResourceV2[], selectedId: string) => {
    if (!resources.length) {
      resourceWrap.classList.add("hidden");
      resourceStatus.classList.add("hidden");
      return;
    }
    resourceWrap.classList.remove("hidden");
    resourceStatus.classList.remove("hidden");
    resourceStatus.textContent = `${available.length} z ${resources.length} dostępne w tym terminie`;
    resourceStatus.style.color = available.length ? "var(--ink)" : "#fca5a5";

    resourceSelect.replaceChildren();
    const automatic = document.createElement("option");
    automatic.value = "";
    automatic.textContent = available.length ? `Dowolny dostępny (${available.length})` : "Brak wolnych egzemplarzy";
    resourceSelect.appendChild(automatic);
    for (const resource of available) {
      const option = document.createElement("option");
      option.value = resource.id;
      option.textContent = resource.name;
      resourceSelect.appendChild(option);
    }
    resourceSelect.value = available.some((r) => r.id === selectedId) ? selectedId : "";
  };

  const refresh = async () => {
    const current = ++request;
    const fromDay = from.value;
    const toDay = to.value;
    const selectedId = resourceSelect.value || null;
    to.min = fromDay || todayKey(0);

    link.style.pointerEvents = "auto";
    link.style.opacity = "1";
    cashback.classList.add("hidden");

    if (!fromDay || !toDay || toDay <= fromDay) {
      result.innerHTML = '<span style="color:var(--mut)">Wybierz prawidłowy zakres</span>';
      return;
    }

    result.innerHTML = '<span style="color:var(--mut)">Sprawdzam dostępność i cenę…</span>';
    try {
      if (!resources.length) {
        const catalog = await bookingPublicCatalogV2(offerId);
        if (current !== request) return;
        resources = catalog?.resources ?? [];
      }

      const available = resources.length ? await availableResources(offerId, resources, fromDay, toDay) : [];
      if (current !== request) return;
      updateResourceOptions(available, selectedId || "");

      const effectiveResourceId = resourceSelect.value || null;
      const selectedResource = resources.find((r) => r.id === effectiveResourceId) ?? null;

      if (resources.length && available.length === 0) {
        result.innerHTML = '<strong style="color:#fca5a5">Brak wolnych egzemplarzy w tym okresie</strong>';
        link.textContent = "Wybierz inne daty";
        link.style.pointerEvents = "none";
        link.style.opacity = ".55";
        return;
      }

      const [quote, unavailable, config] = await Promise.all([
        bookingDailyQuoteV2(offerId, fromDay, toDay, effectiveResourceId),
        bookingUnavailableDaysV2(offerId, fromDay, toDay, effectiveResourceId),
        getMarketConfig(),
      ]);
      if (current !== request) return;

      const conflict = hasConflict(unavailable, fromDay, toDay);
      if (conflict) {
        result.innerHTML = '<strong style="color:#fca5a5">Wybrany egzemplarz jest już zajęty</strong>';
        link.textContent = "Wybierz inny egzemplarz";
        link.style.pointerEvents = "none";
        link.style.opacity = ".55";
        return;
      }

      if (quote.days <= 0) {
        result.innerHTML = '<span style="color:var(--mut)">Termin niedostępny lub poza zakresem</span>';
        link.textContent = "Sprawdź w kalendarzu";
        return;
      }

      result.replaceChildren();
      const days = document.createElement("span");
      days.style.color = "var(--mut)";
      days.textContent = `${quote.days} ${quote.days === 1 ? "dzień" : "dni"}${selectedResource ? ` · ${selectedResource.name}` : ""}`;
      const price = document.createElement("strong");
      price.style.color = "var(--gold)";
      price.textContent = money(quote.base);
      result.append(days, price);

      const cashbackAmount = cashbackFor(quote.base, config.cashbackRate);
      cashback.textContent = `Cashback ${Math.round(config.cashbackRate * 10000) / 100}% · +${money(cashbackAmount)}`;
      cashback.classList.remove("hidden");

      const params = new URLSearchParams({ booking: "1", from: fromDay, to: toDay });
      if (selectedResource) params.set("resource", selectedResource.name);
      link.href = `/produkt/${encodeURIComponent(offerId)}?${params.toString()}`;
      link.textContent = `Zarezerwuj · ${money(quote.base)}`;
    } catch {
      if (current !== request) return;
      result.innerHTML = '<span style="color:var(--mut)">Nie udało się sprawdzić — zobacz pełny kalendarz</span>';
      link.textContent = "Sprawdź i zarezerwuj";
    }
  };

  from.addEventListener("change", refresh);
  to.addEventListener("change", refresh);
  resourceSelect.addEventListener("change", refresh);

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
