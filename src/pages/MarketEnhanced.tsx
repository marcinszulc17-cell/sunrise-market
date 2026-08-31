import { useEffect } from "react";
import Market from "./Market";
import { getOffer } from "../lib/api";
import { offerDetailHref } from "../lib/bookingLink";
import { supabase } from "../lib/supabase";

function isSpecial(slug: string) {
  return slug.includes("motoryzacja-samochody-osobowe") || slug.startsWith("nieruchomosci-") || slug.startsWith("uslugi-") || slug.startsWith("ogloszenia-lokalne-");
}

function purchaseMode(offer: any): "purchase" | "appointment" | "daily" {
  const mode = String(offer?.attributes?.purchase_mode || "purchase");
  return mode === "appointment" || mode === "daily" ? mode : "purchase";
}

function primaryCta(offer: any): { label: string; booking: boolean; badge?: string } {
  const slug = String(offer?.category_slug || "").toLowerCase();
  const mode = purchaseMode(offer);

  if (mode === "daily") {
    if (slug.startsWith("nieruchomosci-") || slug.includes("hotel") || slug.includes("nocleg") || slug.includes("apartament")) {
      return { label: "Zarezerwuj pobyt", booking: true, badge: "Rezerwacja online" };
    }
    if (slug.includes("motoryzacja") || slug.includes("samochod") || slug.includes("pojazd")) {
      return { label: "Zarezerwuj pojazd", booking: true, badge: "Rezerwacja online" };
    }
    return { label: "Wybierz daty", booking: true, badge: "Rezerwacja online" };
  }

  if (mode === "appointment") {
    if (slug.startsWith("uslugi-") || slug.includes("serwis") || slug.includes("beauty") || slug.includes("zdrow")) {
      return { label: "Umów usługę", booking: true, badge: "Termin online" };
    }
    return { label: "Wybierz termin", booking: true, badge: "Termin online" };
  }

  return { label: isSpecial(slug) ? "Zobacz ofertę" : "Szczegóły", booking: false };
}

function fmt(v: any) {
  return v === null || v === undefined || v === "" ? "" : String(v);
}

function metaFor(o: any) {
  const a = o?.attributes || {};
  const slug = String(o?.category_slug || "");
  if (slug.includes("motoryzacja-samochody-osobowe")) {
    const mileage = a.mileage_km ? `${Number(a.mileage_km).toLocaleString("pl-PL")} km` : "";
    return [fmt(a.year), mileage, fmt(a.fuel), a.power_hp ? `${a.power_hp} KM` : ""].filter(Boolean);
  }
  if (slug.startsWith("nieruchomosci-")) {
    const ppm = a.area_m2 && o?.price_gross ? `${Math.round(Number(o.price_gross) / Number(a.area_m2)).toLocaleString("pl-PL")} zł/m²` : "";
    return [a.area_m2 ? `${a.area_m2} m²` : "", a.rooms ? `${a.rooms} pok.` : "", fmt(a.location), ppm].filter(Boolean);
  }
  return [];
}

function cashbackText(price: number, rate: number) {
  const amount = Math.round(price * rate * 100) / 100;
  const percent = (rate * 100).toLocaleString("pl-PL", { maximumFractionDigits: 1 });
  return `Cashback ${percent}% · +${amount.toLocaleString("pl-PL", { maximumFractionDigits: 2 })} pkt`;
}

function addBookingBadge(body: HTMLElement, badgeText: string) {
  if (body.querySelector('[data-booking-badge="1"]')) return;
  const badge = document.createElement("span");
  badge.dataset.bookingBadge = "1";
  badge.className = "text-[11px] font-semibold px-2 py-1 rounded-full self-start";
  badge.style.background = "rgba(56,224,240,.10)";
  badge.style.border = "1px solid rgba(56,224,240,.25)";
  badge.style.color = "var(--ink)";
  badge.textContent = badgeText;
  const trustRow = Array.from(body.children).find((el) => (el as HTMLElement).className.includes("flex-wrap"));
  if (trustRow) trustRow.appendChild(badge);
}

function decorate(article: HTMLElement, offer: any, cashbackRate: number) {
  if (article.dataset.smartDecorated === "1") return;
  article.dataset.smartDecorated = "1";

  const body = article.querySelector(".p-4.flex.flex-col") as HTMLElement | null;
  if (!body) return;
  const price = Array.from(body.children).find((el) => (el as HTMLElement).className.includes("text-2xl")) as HTMLElement | undefined;

  const existingCashback = Array.from(article.querySelectorAll("span")).find((el) => (el.textContent || "").includes("Cashback")) as HTMLElement | undefined;
  if (existingCashback && Number(offer?.price_gross) > 0) {
    existingCashback.textContent = cashbackText(Number(offer.price_gross), cashbackRate);
    existingCashback.title = "Cashback naliczany zgodnie z aktualną konfiguracją Sunrise Market";
  }

  const slug = String(offer?.category_slug || "");
  const cta = primaryCta(offer);
  const mode = purchaseMode(offer);
  const special = isSpecial(slug);

  const detail = Array.from(article.querySelectorAll("a")).find((a) => {
    const text = (a.textContent || "").trim();
    return text === "Szczegóły" || text === "Zobacz ofertę" || text === "Wybierz termin" || text === "Wybierz daty" || text === "Umów usługę" || text === "Zarezerwuj pobyt" || text === "Zarezerwuj pojazd";
  }) as HTMLAnchorElement | undefined;
  if (detail) {
    detail.textContent = cta.label;
    detail.classList.add("flex-1", "justify-center", "font-semibold");
    if (cta.booking) {
      const offerId = String(offer?.offer_id || detail.getAttribute("href")?.split("/produkt/")[1]?.split("?")[0] || "");
      if (offerId) detail.setAttribute("href", offerDetailHref(offerId, true));
      detail.setAttribute("aria-label", `${cta.label}: ${offer?.title || "oferta"}`);
    }
  }

  if (cta.badge) addBookingBadge(body, cta.badge);

  if (special) {
    const meta = metaFor(offer);
    if (price && meta.length && !body.querySelector('[data-smart-meta="1"]')) {
      const row = document.createElement("div");
      row.dataset.smartMeta = "1";
      row.className = "flex flex-wrap gap-x-3 gap-y-1 text-xs";
      row.style.color = "var(--mut)";
      row.textContent = meta.join(" · ");
      price.insertAdjacentElement("afterend", row);
    }

    if (offer?.attributes?.full_vat_invoice && !body.querySelector('[data-full-vat="1"]')) {
      const badge = document.createElement("span");
      badge.dataset.fullVat = "1";
      badge.className = "text-[11px] font-semibold px-2 py-1 rounded-full self-start";
      badge.style.background = "rgba(56,224,240,.10)";
      badge.style.border = "1px solid rgba(56,224,240,.25)";
      badge.textContent = "Pełna faktura VAT";
      const priceEl = price || body;
      priceEl.insertAdjacentElement("afterend", badge);
    }
  }

  if (special || mode !== "purchase") {
    const buttons = Array.from(article.querySelectorAll("button"));
    for (const b of buttons) {
      if ((b.textContent || "").includes("Do koszyka") || (b.textContent || "").includes("Dodano do koszyka")) {
        (b as HTMLElement).style.display = "none";
      }
    }
  }

  if (special || mode !== "purchase") {
    for (const badge of Array.from(article.querySelectorAll("span"))) {
      if ((badge.textContent || "").includes("Darmowa dostawa")) (badge as HTMLElement).style.display = "none";
    }
  }
}

export default function MarketEnhanced() {
  useEffect(() => {
    let stopped = false;
    let cashbackRate = 0.03;
    const cache = new Map<string, any>();
    const inflight = new Set<string>();

    supabase.rpc("public_market_config").then(({ data }) => {
      const r = Number((data as any)?.cashback_rate);
      if (Number.isFinite(r) && r >= 0 && r <= 1) cashbackRate = r;
      document.querySelectorAll("article[data-smart-decorated='1']").forEach((el) => {
        (el as HTMLElement).dataset.smartDecorated = "0";
      });
      scan();
    }, () => {});

    async function scan() {
      if (stopped) return;
      const cards = Array.from(document.querySelectorAll("article")) as HTMLElement[];
      for (const article of cards) {
        if (article.dataset.smartDecorated === "1") continue;
        const link = article.querySelector('a[href^="/produkt/"]') as HTMLAnchorElement | null;
        if (!link) continue;
        const href = link.getAttribute("href") || "";
        const id = href.split("/produkt/")[1]?.split("?")[0];
        if (!id) continue;
        if (cache.has(id)) { decorate(article, cache.get(id), cashbackRate); continue; }
        if (inflight.has(id)) continue;
        inflight.add(id);
        getOffer(id).then((o) => {
          cache.set(id, o);
          if (o) decorate(article, o, cashbackRate);
        }).catch(() => {}).finally(() => inflight.delete(id));
      }
    }

    scan();
    const obs = new MutationObserver(() => scan());
    obs.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(scan, 1200);
    return () => { stopped = true; obs.disconnect(); window.clearInterval(timer); };
  }, []);

  return <Market />;
}
