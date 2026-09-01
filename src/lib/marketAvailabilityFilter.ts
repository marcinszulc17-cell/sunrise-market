import { ensureMarketDiscovery, marketDiscoveryFor, type MarketDiscoverySummary } from "./marketDiscoveryBatch";

type AvailabilityFilter = "any" | "today" | "weekend";
type ModeFilter = "all" | "purchase" | "appointment" | "daily";

let activeAvailability: AvailabilityFilter = "any";
let activeMode: ModeFilter = "all";
let applying = false;

function offerIdFor(article: HTMLElement): string | null {
  const link = article.querySelector('a[href^="/produkt/"]') as HTMLAnchorElement | null;
  if (!link) return null;
  return (link.getAttribute("href") || "").split("/produkt/")[1]?.split("?")[0] || null;
}

function showArticle(article: HTMLElement, show: boolean) {
  article.style.display = show ? "" : "none";
  if (show) delete article.dataset.marketDiscoveryHidden;
  else article.dataset.marketDiscoveryHidden = "1";
}

function matches(summary: MarketDiscoverySummary | null | undefined) {
  if (!summary) return activeMode === "all" && activeAvailability === "any";
  if (activeMode !== "all" && summary.booking_type !== activeMode) return false;
  if (activeAvailability === "today" && !summary.available_today) return false;
  if (activeAvailability === "weekend" && !summary.available_this_weekend) return false;
  return true;
}

async function scanCards() {
  if (window.location.pathname !== "/" || applying) return;
  const pairs = (Array.from(document.querySelectorAll("article")) as HTMLElement[])
    .map((article) => ({ article, offerId: offerIdFor(article) }))
    .filter((x): x is { article: HTMLElement; offerId: string } => Boolean(x.offerId));
  if (!pairs.length) return;

  applying = true;
  try {
    await ensureMarketDiscovery([...new Set(pairs.map((x) => x.offerId))]);
    for (const { article, offerId } of pairs) showArticle(article, matches(marketDiscoveryFor(offerId)));
  } catch {
    for (const { article } of pairs) showArticle(article, true);
  } finally {
    applying = false;
  }
}

function styleButtons(buttons: HTMLButtonElement[], key: "mode" | "availability") {
  for (const button of buttons) {
    const selected = key === "mode"
      ? button.dataset.marketMode === activeMode
      : button.dataset.availabilityFilter === activeAvailability;
    button.style.background = selected ? "linear-gradient(135deg,#C8965A,#E8C896)" : "var(--bg)";
    button.style.color = selected ? "#000" : "var(--ink)";
    button.style.border = selected ? "1px solid transparent" : "1px solid var(--line)";
    button.setAttribute("aria-pressed", selected ? "true" : "false");
  }
}

function injectControls() {
  if (window.location.pathname !== "/" || document.querySelector('[data-market-discovery-filters="1"]')) return;
  const heading = Array.from(document.querySelectorAll("div")).find((el) => (el.textContent || "").trim() === "Filtry ofert") as HTMLElement | undefined;
  const panel = heading?.closest(".rounded-2xl") as HTMLElement | null;
  if (!panel) return;

  const wrap = document.createElement("div");
  wrap.dataset.marketDiscoveryFilters = "1";
  wrap.className = "mt-4 space-y-4 border-t pt-4";
  wrap.style.borderColor = "var(--line)";

  const modeBlock = document.createElement("div");
  const modeLabel = document.createElement("div");
  modeLabel.className = "mb-2 text-xs font-semibold";
  modeLabel.style.color = "var(--mut)";
  modeLabel.textContent = "Rodzaj oferty";
  const modeRow = document.createElement("div");
  modeRow.className = "flex flex-wrap gap-2";
  const modeDefs: Array<[ModeFilter, string]> = [
    ["all", "Wszystkie"],
    ["purchase", "Kup teraz"],
    ["appointment", "Usługi"],
    ["daily", "Wynajem"],
  ];
  const modeButtons = modeDefs.map(([value, text]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.marketMode = value;
    button.className = "rounded-xl px-3 py-2 text-xs font-semibold";
    button.textContent = text;
    button.onclick = () => {
      activeMode = value;
      if (value === "purchase") activeAvailability = "any";
      styleButtons(modeButtons, "mode");
      styleButtons(availabilityButtons, "availability");
      void scanCards();
    };
    modeRow.appendChild(button);
    return button;
  });
  modeBlock.append(modeLabel, modeRow);

  const availabilityBlock = document.createElement("div");
  const availabilityLabel = document.createElement("div");
  availabilityLabel.className = "mb-2 text-xs font-semibold";
  availabilityLabel.style.color = "var(--mut)";
  availabilityLabel.textContent = "Dostępność rezerwacji";
  const availabilityRow = document.createElement("div");
  availabilityRow.className = "flex flex-wrap gap-2";
  const availabilityDefs: Array<[AvailabilityFilter, string]> = [
    ["any", "Dowolny termin"],
    ["today", "Dostępne dziś"],
    ["weekend", "Ten weekend"],
  ];
  const availabilityButtons = availabilityDefs.map(([value, text]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.availabilityFilter = value;
    button.className = "rounded-xl px-3 py-2 text-xs font-semibold";
    button.textContent = text;
    button.onclick = () => {
      activeAvailability = value;
      if (value !== "any" && activeMode === "purchase") activeMode = "all";
      styleButtons(modeButtons, "mode");
      styleButtons(availabilityButtons, "availability");
      void scanCards();
    };
    availabilityRow.appendChild(button);
    return button;
  });
  availabilityBlock.append(availabilityLabel, availabilityRow);

  wrap.append(modeBlock, availabilityBlock);
  panel.appendChild(wrap);
  styleButtons(modeButtons, "mode");
  styleButtons(availabilityButtons, "availability");
}

export function startMarketAvailabilityFilter() {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  const scan = () => {
    injectControls();
    void scanCards();
  };
  scan();
  const observer = new MutationObserver(scan);
  observer.observe(document.body, { childList: true, subtree: true });
  const timer = window.setInterval(scan, 1500);
  return () => {
    observer.disconnect();
    window.clearInterval(timer);
    for (const article of Array.from(document.querySelectorAll("article")) as HTMLElement[]) showArticle(article, true);
  };
}
