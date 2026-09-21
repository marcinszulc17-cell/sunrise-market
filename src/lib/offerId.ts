// Identyfikator oferty z adresu — niezależnie od tego, czy adres jest stary czy nowy.
//
// Stary:  /produkt/1b2c…-uuid
// Nowy:   /oferta/monter-fotowoltaiki-nowy-tomysl-1b2c…-uuid
//
// Nowy adres istnieje dla wyszukiwarek i dla ludzi, którzy ten link widzą: w wyniku Google
// pokazywana jest ścieżka, a „…/oferta/monter-fotowoltaiki-nowy-tomysl" mówi, co jest pod
// spodem, podczas gdy „…/produkt/1b2c4f9a-…" nie mówi nic. UUID zostaje na końcu, bo dzięki
// temu stare linki działają bez tabeli przekierowań, a zmiana tytułu oferty nie psuje adresu.
import { useParams } from "react-router-dom";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function offerIdFrom(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const m = String(value).match(UUID);
  return m ? m[0] : undefined;
}

/** Selektor kart ofert — adresy są dwojakie: stare /produkt/<uuid> i nowe /oferta/<slug>-<uuid>. */
export const OFFER_LINK_SELECTOR = 'a[href^="/produkt/"], a[href^="/oferta/"]';

/** Id oferty z adresu w atrybucie href (obie formy). */
export function offerIdFromHref(href: string | null | undefined): string | null {
  return offerIdFrom(href || undefined) ?? null;
}

export function useOfferId(): string | undefined {
  const { id } = useParams();
  return offerIdFrom(id);
}

/** Adres kanoniczny oferty — ten sam, który wystawiamy w canonical i w mapie strony. */
export function offerPath(id: string, title?: string | null): string {
  const slug = String(title || "")
    .toLowerCase()
    .replace(/[ąàáâã]/g, "a").replace(/ć/g, "c").replace(/[ęèéêë]/g, "e").replace(/ł/g, "l")
    .replace(/ń/g, "n").replace(/[óòôõö]/g, "o").replace(/[śš]/g, "s").replace(/[źż]/g, "z")
    .replace(/[üù]/g, "u").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
  return slug ? `/oferta/${slug}-${id}` : `/produkt/${id}`;
}
