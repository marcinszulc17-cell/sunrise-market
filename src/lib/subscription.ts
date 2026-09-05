// Subskrypcje w Sunrise Market — jedno miejsce prawdy dla oznaczeń w UI.
// Zasady (decyzja właściciela 2026-09-05):
//  - subskrypcja jest zawsze MIESIĘCZNA (lub roczna) i zawsze opłacana Z GÓRY za okres,
//  - ma CIĄGŁOŚĆ: odnawia się automatycznie, bez przerw w usłudze,
//  - klient musi to widzieć wyraźnie: na karcie w katalogu, na stronie produktu i w koszyku.
// Źródło: offers.attributes.subscription = { interval: 'month'|'year', prepaid: true, continuous: true }
// (przenoszone z MySunrise.shop_products.subscription_interval przez mysunrise-sync).

export type SubscriptionInterval = "month" | "year";

export type SubscriptionInfo = {
  interval: SubscriptionInterval;
  /** Dopisek przy cenie, np. „/ mies.” */
  priceSuffix: string;
  /** Krótka plakietka, np. „Subskrypcja miesięczna” */
  badge: string;
  /** Pełne wyjaśnienie dla klienta */
  note: string;
};

const LEGACY_TITLE = /\bsubskrypcj|\babonament|^protect plus\b/i;

export function subscriptionInfo(attributes?: Record<string, unknown> | null, title?: string | null): SubscriptionInfo | null {
  const raw = (attributes as { subscription?: { interval?: string } } | null | undefined)?.subscription;
  let interval: SubscriptionInterval | null = raw?.interval === "year" ? "year" : raw?.interval === "month" ? "month" : null;
  // Zabezpieczenie na oferty, które nie przeszły jeszcze syncu z MySunrise.
  if (!interval && title && LEGACY_TITLE.test(title.trim())) interval = "month";
  if (!interval) return null;
  return interval === "year"
    ? { interval, priceSuffix: "/ rok", badge: "Subskrypcja roczna", note: "Subskrypcja roczna, opłacana z góry za cały rok. Odnawia się automatycznie na kolejny rok, dzięki czemu usługa działa bez przerw." }
    : { interval, priceSuffix: "/ mies.", badge: "Subskrypcja miesięczna", note: "Subskrypcja miesięczna, opłacana z góry za każdy miesiąc. Odnawia się automatycznie co miesiąc, dzięki czemu usługa działa bez przerw." };
}
