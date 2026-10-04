// IndexNow — zgłoszenie nowych i zmienionych ogłoszeń prosto do wyszukiwarek.
//
// PO CO
// Sitemapa jest bierna: robot zagląda do niej, kiedy uzna za stosowne, a przy nowej
// domenie bywa to raz na kilka dni. IndexNow działa odwrotnie — to my pukamy, a Bing,
// Yandex, Seznam i Naver przychodzą po nową ofertę w ciągu minut. Jedno zgłoszenie
// trafia do wszystkich uczestników protokołu naraz. Google w nim nie uczestniczy;
// tam robotę robi sitemapa generowana na żywo i linkowanie wewnętrzne.
//
// JAK TO JEST UWIERZYTELNIONE
// Protokół wymaga, żeby klucz leżał publicznie pod https://<host>/<klucz>.txt —
// to dowód, że zgłaszający panuje nad domeną. Plik: public/4cf5…13e.txt.
// Samo wejście tutaj jest ograniczone do zadania cron Vercela albo wywołania
// z kluczem w adresie; nadużycie i tak kończy się zgłoszeniem naszych własnych
// adresów, więc chronimy tu czas funkcji, a nie tajemnicę.
export const config = { runtime: "edge" };
import { rpc, slugify } from "./_shared";

const KLUCZ = "4cf5c5682ec9e52e0ae8d10316a8013e";

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const origin = `https://${req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "sunrisemarket.pl"}`;
  const host = new URL(origin).host;

  const zCrona = (req.headers.get("user-agent") ?? "").toLowerCase().includes("vercel-cron");
  if (!zCrona && url.searchParams.get("klucz") !== KLUCZ) {
    return new Response(JSON.stringify({ error: "brak_klucza" }), { status: 401, headers: { "content-type": "application/json" } });
  }

  // Ile dni wstecz. Domyślnie 3 — cron chodzi raz na dobę, więc zapas na nieudany przebieg.
  const dni = Math.min(Math.max(Number(url.searchParams.get("dni")) || 3, 1), 30);
  const prog = Date.now() - dni * 864e5;

  const adresy = new Set<string>([origin + "/", `${origin}/sklep`, `${origin}/miasto`, `${origin}/praca`, `${origin}/noclegi`]);

  try {
    const oferty = (await rpc("search_offers_v2", {
      p_query: null, p_category_slug: null, p_price_min: null, p_price_max: null,
      p_sort: "najnowsze", p_limit: 5000, p_filters: {},
    })) as any[];
    for (const o of oferty ?? []) {
      const kiedy = o.created_at ? Date.parse(o.created_at) : NaN;
      if (Number.isFinite(kiedy) && kiedy < prog) break;   // lista jest po dacie malejąco
      adresy.add(`${origin}/oferta/${slugify(o.title)}-${o.offer_id}`);
    }
  } catch { /* zgłosimy same strony stałe */ }

  // Protokół przyjmuje do 10 000 adresów na żądanie.
  const urlList = [...adresy].slice(0, 10000);

  let status = 0, tresc = "";
  try {
    const r = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host, key: KLUCZ, keyLocation: `${origin}/${KLUCZ}.txt`, urlList }),
    });
    status = r.status;
    tresc = (await r.text()).slice(0, 300);
  } catch (e) {
    tresc = String((e as Error).message);
  }

  return new Response(JSON.stringify({ zgloszono: urlList.length, dni, status, odpowiedz: tresc }, null, 2), {
    status: status >= 200 && status < 300 ? 200 : 502,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
