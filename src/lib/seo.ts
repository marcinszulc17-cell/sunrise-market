import { useEffect } from "react";

const BASE = "https://sunrise-market.vercel.app";

function setMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
  el.setAttribute("content", content);
}
function setCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) { el = document.createElement("link"); el.rel = "canonical"; document.head.appendChild(el); }
  el.href = href;
}

/** Ustawia tytuł, meta description, OG/Twitter i canonical dla danej podstrony (SPA). */
export function useSeo(title: string, description: string, path = "") {
  useEffect(() => {
    const full = title.includes("Sunrise Market") ? title : `${title} — Sunrise Market`;
    document.title = full;
    setMeta("name", "description", description);
    setMeta("property", "og:title", full);
    setMeta("property", "og:description", description);
    setMeta("property", "og:url", BASE + path);
    setMeta("name", "twitter:title", full);
    setMeta("name", "twitter:description", description);
    setCanonical(BASE + (path || "/"));
  }, [title, description, path]);
}

/** Wstrzykuje JSON-LD Product na stronie produktu i sprząta po odmontowaniu. */
export function useProductJsonLd(p: { id: string; name: string; price: number; image?: string | null; rating?: number; reviews?: number } | null) {
  useEffect(() => {
    if (!p) return;
    const data: any = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: p.name,
      url: `${BASE}/produkt/${p.id}`,
      offers: { "@type": "Offer", priceCurrency: "PLN", price: p.price, availability: "https://schema.org/InStock", url: `${BASE}/produkt/${p.id}` },
    };
    if (p.image) data.image = p.image;
    if (p.rating && p.reviews) data.aggregateRating = { "@type": "AggregateRating", ratingValue: p.rating, reviewCount: p.reviews };
    const s = document.createElement("script");
    s.type = "application/ld+json";
    s.setAttribute("data-seo", "product");
    s.textContent = JSON.stringify(data);
    document.head.appendChild(s);
    return () => { s.remove(); };
  }, [p]);
}
