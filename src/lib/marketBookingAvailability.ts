import { ensureMarketDiscovery, marketDiscoveryFor, type MarketDiscoverySummary } from "./marketDiscoveryBatch";

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

function formatDay(day: string): string {
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${day}T12:00:00+02:00`));
}

function bookingHref(offerId: string, summary: MarketDiscoverySummary) {
  const params = new URLSearchParams({ booking: "1" });
  if (summary.booking_type === "appointment" && summary.nearest_available_at) params.set("quick", "nearest");
  if (summary.booking_type === "daily" && summary.nearest_available_day) params.set("from", summary.nearest_available_day);
  return `/produkt/${encodeURIComponent(offerId)}?${params.toString()}`;
}

function insertSummary(article: HTMLElement, offerId: string, summary: MarketDiscoverySummary) {
  if (summary.booking_type === "purchase" || article.querySelector('[data-booking-availability-summary="1"]')) return;
  const body = article.querySelector(".p-4.flex.flex-col") as HTMLElement | null;
  if (!body) return;
  const actions = Array.from(body.children).find((el) => (el as HTMLElement).className.includes("flex gap-2 mt-1"));

  const wrap = document.createElement("div");
  wrap.dataset.bookingAvailabilitySummary = "1";
  wrap.className = "rounded-xl px-3 py-2";
  wrap.style.background = "rgba(56,224,240,.07)";
  wrap.style.border = "1px solid rgba(56,224,240,.18)";

  const link = document.createElement("a");
  link.className = "block text-xs font-semibold transition hover:brightness-110";
  link.style.color = "var(--ink)";
  link.style.textDecoration = "none";
  link.href = bookingHref(offerId, summary);

  if (summary.booking_type === "appointment") {
    link.textContent = summary.nearest_available_at
      ? `📅 Najbliższy termin: ${formatAppointment(summary.nearest_available_at)} →`
      : "📅 Sprawdź dostępność";
    link.title = summary.nearest_available_at ? "Otwórz najbliższy wolny termin" : "Sprawdź kalendarz usługi";
  } else {
    link.textContent = summary.nearest_available_day
      ? `📅 Najbliżej dostępne: ${formatDay(summary.nearest_available_day)} →`
      : "📅 Sprawdź dostępność";
    link.title = summary.nearest_available_day ? "Otwórz kalendarz od najbliższego wolnego dnia" : "Sprawdź kalendarz wynajmu";
  }
  link.setAttribute("aria-label", link.title);
  wrap.appendChild(link);

  const badges = document.createElement("div");
  badges.className = "mt-2 flex flex-wrap gap-1.5";
  if (summary.available_today) {
    const b = document.createElement("span");
    b.className = "rounded-full px-2 py-1 text-[10px] font-semibold";
    b.style.background = "rgba(122,184,154,.12)";
    b.style.color = "var(--green)";
    b.textContent = "Dostępne dziś";
    badges.appendChild(b);
  }
  if (summary.available_this_weekend) {
    const b = document.createElement("span");
    b.className = "rounded-full px-2 py-1 text-[10px] font-semibold";
    b.style.background = "rgba(200,150,90,.12)";
    b.style.color = "var(--gold)";
    b.textContent = "Dostępne w weekend";
    badges.appendChild(b);
  }
  if (badges.childElementCount) wrap.appendChild(badges);

  if (actions) body.insertBefore(wrap, actions);
  else body.appendChild(wrap);
}

function offerIdFor(article: HTMLElement): string | null {
  const link = article.querySelector('a[href^="/produkt/"]') as HTMLAnchorElement | null;
  return (link?.getAttribute("href") || "").split("/produkt/")[1]?.split("?")[0] || null;
}

async function scan() {
  if (window.location.pathname !== "/") return;
  const cards = (Array.from(document.querySelectorAll("article")) as HTMLElement[])
    .filter((article) => article.dataset.bookingAvailabilityResolved !== "1");
  const pairs = cards.map((article) => ({ article, offerId: offerIdFor(article) })).filter((x): x is { article: HTMLElement; offerId: string } => Boolean(x.offerId));
  if (!pairs.length) return;

  try {
    await ensureMarketDiscovery([...new Set(pairs.map((x) => x.offerId))]);
    for (const { article, offerId } of pairs) {
      const summary = marketDiscoveryFor(offerId);
      if (summary) insertSummary(article, offerId, summary);
      article.dataset.bookingAvailabilityResolved = "1";
    }
  } catch {
    // Nie blokujemy katalogu przy chwilowym błędzie dostępności.
  }
}

export function startMarketBookingAvailability() {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  void scan();
  const observer = new MutationObserver(() => { void scan(); });
  observer.observe(document.body, { childList: true, subtree: true });
  const timer = window.setInterval(() => { void scan(); }, 1500);
  return () => {
    observer.disconnect();
    window.clearInterval(timer);
  };
}
