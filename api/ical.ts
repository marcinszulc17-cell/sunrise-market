// Kalendarz oferty w formacie iCal (.ics) — link, który właściciel obiektu wkleja
// w Bookingu, Airbnb czy Nocowanie, żeby tam zablokowały się terminy zajęte u nas.
//
// Musi być publiczny, bo portale pobierają go anonimowo — dostępu pilnuje token
// w adresie (market.booking_offers.ical_token). Zły token = 404, bez zdradzania,
// czy taka oferta w ogóle istnieje. Token da się wymienić w panelu sprzedawcy,
// jeśli link wycieknie.
export const config = { runtime: "edge" };
import { rpc } from "./_shared";

const pad = (n: number) => String(n).padStart(2, "0");
const day = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
const stamp = (d: Date) => `${day(d)}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
const esc = (s: unknown) =>
  String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// RFC 5545: linia nie może przekroczyć 75 OKTETÓW (nie znaków — polskie znaki
// zajmują po dwa bajty), kontynuacja zaczyna się spacją. Nie wolno przeciąć
// znaku w połowie, więc tniemy po znakach, licząc bajty.
function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let limit = 75;
  for (const ch of line) {
    if (enc.encode(cur + ch).length > limit) {
      out.push(cur);
      cur = " " + ch;
      limit = 75; // kontynuacja: spacja wliczona w te 75 oktetów
    } else {
      cur += ch;
    }
  }
  if (cur) out.push(cur);
  return out.join("\r\n");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const offer = (url.searchParams.get("offer") ?? "").trim();
  const token = (url.searchParams.get("token") ?? "").trim();
  if (!UUID.test(offer) || !UUID.test(token)) return new Response("Not found", { status: 404 });

  let rows: any[] = [];
  try {
    rows = (await rpc("ical_export", { p_offer: offer, p_token: token })) as any[];
  } catch {
    return new Response("Service unavailable", { status: 503 });
  }
  if (!Array.isArray(rows)) return new Response("Not found", { status: 404 });

  // Pusty wynik to albo zły token, albo oferta bez żadnych zajętych terminów.
  // W obu przypadkach oddajemy poprawny, pusty kalendarz — portal ma dostać
  // plik, który umie przeczytać, a nie błąd.
  const title = rows[0]?.offer_title ?? "Sunrise Market";
  const now = new Date();
  const L = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sunrise Market//Rezerwacje//PL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    fold(`X-WR-CALNAME:${esc(title)}`),
  ];
  for (const r of rows) {
    const s = new Date(r.starts_at); const e = new Date(r.ends_at);
    if (!(e > s)) continue;
    L.push("BEGIN:VEVENT");
    L.push(`UID:${esc(r.uid)}@sunrisemarket.pl`);
    L.push(`DTSTAMP:${stamp(now)}`);
    L.push(`DTSTART;VALUE=DATE:${day(s)}`);
    L.push(`DTEND;VALUE=DATE:${day(e)}`);
    L.push(fold(`SUMMARY:${esc(r.summary)}`));
    L.push("TRANSP:OPAQUE");
    L.push("END:VEVENT");
  }
  L.push("END:VCALENDAR");

  return new Response(L.join("\r\n") + "\r\n", {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "cache-control": "public, max-age=300",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
