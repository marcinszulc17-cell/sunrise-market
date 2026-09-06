// Asystent Suri w Sunrise Market (decyzja właściciela 2026-09-06): Suri jest mózgiem operacyjnym ekosystemu (hub MySunrise),
// w Market działa jej asystent — persona „Sunny”. Model językowy: hub MySunrise `mkt-ai` (X-Sunrise-Service-Token), a gdy hub
// nie odpowie — ANTHROPIC_API_KEY (jeśli ustawiony). Bez AI asystent nadal działa: pokazuje dopasowane oferty (suri_recommend).
// Akcje: chat (domyślna) | history | seller_reply (podpowiedź odpowiedzi sprzedawcy w Wiadomościach; wymaga JWT).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
const SUPA = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_KEY") ?? "";
const HUB = (Deno.env.get("MYSUNRISE_PAY_BASE_URL") ?? "https://lvmrhgpxhqvfuoftblky.supabase.co/functions/v1").replace(/\/$/, "");
export const ASSISTANT_NAME = "Sunny";

const SYSTEM = `Jesteś ${ASSISTANT_NAME} — asystent Suri w Sunrise Market. Suri to mózg operacyjny ekosystemu Sunrise; Ty pomagasz klientom w Sunrise Market (sunrisemarket.pl) — marketplace dla wszystkich: sprzedawcy prywatni, firmy i marki własne Sunrise. Mówisz po polsku, ciepło i konkretnie, zawsze w interesie kupującego; 1 emoji maksymalnie, bez lania wody. Krótko: 2–5 zdań.

Fakty o Sunrise Market (nie wymyślaj innych):
• Płatność: portfel Sunrise Pay (promowany) albo karta przez Stripe. Cashback 3% wraca na portfel przy KAŻDEJ metodzie płatności.
• Ochrona Kupujących: każda transakcja idzie przez Sunrise — sprzedawca dostaje pieniądze dopiero po potwierdzeniu odbioru (albo automatycznie po 14 dniach); spór można otworzyć w Zamówieniach.
• Rezerwacje: usługi z terminem (wybór dnia i godziny) oraz wynajem na dni (od–do, kaucja, umowa najmu akceptowana przy płatności, protokół wydania/zwrotu ze zdjęciami i kodem SMS).
• Odbiór osobisty u sprzedawcy, jeśli sprzedawca go włączył. Darmowa dostawa od 149 zł.
• Wiadomości do sprzedawcy, „Pokaż numer”, umawianie oględzin (auta) i prezentacji (nieruchomości), Sunrise Verify (raport pojazdu / analiza nieruchomości).
• Ulubione, porównywarka, zapisane wyszukiwania z alertem o nowych ogłoszeniach, logowanie Face ID.
• Sprzedawanie: Sprzedawca (bez NIP, 299 zł/rok) i Partner Handlowy (firma, 499 zł/rok) — pierwszy rok gratis; prowizja 7,9% (Sunrise Pay) / 12,9% (karta).
• Jedno konto Sunrise (MySunrise) działa w całym ekosystemie.
Proponuj wyłącznie oferty z podanej listy (z ceną), nie obiecuj terminów dostawy ani parametrów, których nie ma. Gdy lista jest pusta, powiedz to wprost i zaproponuj doprecyzowanie (kategoria, budżet, miasto) albo zapisanie wyszukiwania. Pamiętaj, co klient mówił wcześniej.`;

async function serviceToken(sb: any): Promise<string> {
  const env = Deno.env.get("SUNRISE_MARKET_SERVICE_TOKEN"); if (env) return env;
  const { data } = await sb.from("internal_secrets").select("value").eq("key", "sunrise_pay_service_token").maybeSingle();
  return String(data?.value ?? "");
}

type Turn = { role: "user" | "assistant"; content: string };
/** Model: najpierw hub MySunrise (mkt-ai), potem Anthropic (jeśli klucz). Zwraca null, gdy AI niedostępne. */
async function llm(sb: any, system: string, turns: Turn[], opts: { json?: boolean; max_tokens?: number; temperature?: number } = {}): Promise<{ text: string | null; error?: string }> {
  try {
    const token = await serviceToken(sb);
    if (token) {
      const r = await fetch(`${HUB}/mkt-ai`, { method: "POST", headers: { "Content-Type": "application/json", "X-Sunrise-Service-Token": token }, body: JSON.stringify({ system, messages: turns, json: opts.json === true, max_tokens: opts.max_tokens ?? 450, temperature: opts.temperature ?? 0.5 }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d?.ok && d.text) return { text: String(d.text) };
      if (d?.error) console.warn("mkt-ai:", d.error);
    }
  } catch (e) { console.warn("mkt-ai fetch failed", (e as Error).message); }
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (key) {
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: opts.max_tokens ?? 450, system, messages: turns }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d?.content?.[0]?.text) return { text: String(d.content[0].text) };
      return { text: null, error: String(d?.error?.message ?? r.status) };
    } catch (e) { return { text: null, error: (e as Error).message }; }
  }
  return { text: null, error: "ai_unavailable" };
}

// Słowa kluczowe → kategoria / tryb / budżet (bez AI). Slugi = market.categories.
const CAT_SLUGS = { car: "motoryzacja", home: "nieruchomosci", oze: "oze-i-energia", services: "uslugi-i-reklama", stay: "noclegi", garden: "dom-i-ogrod", electronics: "elektronika" } as const;
const STOP = new Set(["szukam", "szukać", "chcę", "chce", "chciałbym", "chciałabym", "potrzebuję", "potrzebuje", "poproszę", "prosze", "proszę", "jakieś", "jakiś", "jakaś", "coś", "cos", "dla", "mnie", "sobie", "może", "moze", "na", "do", "za", "od", "w", "z", "i", "o", "a", "tys", "zł", "zl", "pln", "tysięcy", "tysiecy", "tanio", "tanie", "taniego", "okolicy", "okolice"]);
function parseIntent(message: string): { query: string; budget: number | null; category_slug: string | null; mode: string | null } {
  const t = ` ${String(message ?? "").toLowerCase()} `;
  let category_slug: string | null = null, mode: string | null = null, budget: number | null = null;
  if (/\b(auto|auta|aut|samoch|osobów|kombi|suv|hatchback|sedan|motocykl|skuter|bmw|audi|ford|toyota|skoda|volkswagen|vw|opel|renault|hyundai|kia|mercedes|fiat|peugeot|citroen|nissan|mazda|honda|volvo)/.test(t)) category_slug = CAT_SLUGS.car;
  if (/\b(mieszkani|dom(u|ek|ku|y)?\b|działk|dzialk|lokal|kawalerk|nieruchom|apartament)/.test(t)) category_slug = CAT_SLUGS.home;
  if (/\b(fotowolta|panele|panel pv|\bpv\b|pomp[aęy] ciep|magazyn energii|falownik|kocioł|kociol|pellet|termostat|oze|energi)/.test(t)) category_slug = CAT_SLUGS.oze;
  if (/\b(remont|hydraulik|elektryk|transport|przeprowadzk|sprząta|sprzata|fryzjer|kosmety|masaż|masaz|korepety|naprawa|serwis|montaż|montaz|fachow|wykonawc)/.test(t)) category_slug = category_slug ?? CAT_SLUGS.services;
  if (/\b(nocleg|hotel|pensjonat|apartament na|pokój|pokoj|kwater)/.test(t)) category_slug = CAT_SLUGS.stay;
  if (/\b(wynaj|wypożycz|wypozycz|na weekend|na dzień|na dzien|na dni|na tydzień|na tydzien|na dobę|na dobe)/.test(t)) mode = "daily";
  else if (/\b(termin|umów|umow|wizyt|zapisać|zapisac|rezerwac)/.test(t) && category_slug !== CAT_SLUGS.car) mode = "appointment";
  else if (/\b(kupi[ćc]|kupno|kupię|kupie|zakup)/.test(t)) mode = "purchase";
  const m = t.match(/(?:do|za|max(?:ymalnie)?|budżet|budzet|około|okolo)?\s*(\d{1,3}(?:[ \.]\d{3})+|\d+(?:[,.]\d+)?)\s*(tys\.?|tysięcy|tysiecy|k\b|zł|zl|pln)/);
  if (m) { const n = Number(m[1].replace(/[ \.]/g, "").replace(",", ".")); if (Number.isFinite(n)) budget = /^(tys|tysi|k)/.test(m[2]) ? n * 1000 : n; }
  if (!mode && budget != null && budget >= 1000) mode = "purchase"; // „auto do 20 tys.” = zakup, nie wynajem za dobę
  const query = t.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w && !STOP.has(w) && !/^\d+$/.test(w)).slice(0, 5).join(" ");
  return { query, budget, category_slug, mode };
}

// Odpowiedzi na częste pytania bez AI (te same fakty, co w SYSTEM).
const FAQ: [RegExp, string][] = [
  [/ochron[aęy] kupuj|bezpiecz|oszust|gwarancj/i, "Ochrona Kupujących: każda transakcja idzie przez Sunrise — sprzedawca dostaje pieniądze dopiero po tym, jak potwierdzisz odbiór (albo automatycznie po 14 dniach). Jeśli coś jest nie tak, otwierasz spór w Zamówieniach i rozstrzyga go operator. 🛡"],
  [/cashback|punkt|zwrot.*(%|procent)/i, "Cashback to 3% wartości każdego zakupu — wraca na Twój portfel Sunrise Pay przy każdej metodzie płatności (portfel albo karta) i możesz go wydać na kolejne zakupy."],
  [/płatno|platno|zapłac|zaplac|karta|kart[ąa]|blik|przelew|portfel/i, "Płacisz portfelem Sunrise Pay (promowany) albo kartą przez Stripe. Przy każdej metodzie dostajesz 3% cashbacku, a pieniądze trafiają do sprzedawcy dopiero po Twoim odbiorze."],
  [/odbi[óo]r osob|odebra[ćc] osob|osobi[śs]cie|na miejscu|punkt odbioru/i, "Tak — odbiór osobisty jest bezpłatny. Produkty Sunrise odbierzesz w Nowym Tomyślu (adres i termin dostaniesz w powiadomieniu „Gotowe do odbioru”), a u innych sprzedawców tam, gdzie włączyli punkt odbioru. Wybierasz to w koszyku przy dostawie."],
  [/dostaw|wysył|wysyl|kurier|przesył|przesyl/i, "Dostawa kurierem (darmowa od 149 zł) albo odbiór osobisty u sprzedawcy, jeśli go włączył — wybierasz w koszyku. Status przesyłki śledzisz w Zamówieniach."],
  [/wynaj|kaucj|umow[aęy] najmu|protok/i, "Wynajem na dni: wybierasz okres od–do, płacisz z góry razem z kaucją i akceptujesz umowę najmu. Przy wydaniu i zwrocie jest protokół ze zdjęciami i kod SMS/QR, a kaucja wraca po zwrocie."],
  [/sprzeda(wa|ć|c)|wystaw|ogłoszeni|ogloszeni|prowizj|partner handlowy/i, "Sprzedawać może każdy: Sprzedawca (bez NIP, 299 zł/rok) albo Partner Handlowy (firma, 499 zł/rok) — pierwszy rok gratis. Prowizja 7,9% przy Sunrise Pay i 12,9% przy karcie. Zacznij od „Dodaj ogłoszenie”."],
  [/zwrot|reklamac|odst[ąa]pi/i, "Zwrot lub reklamację zgłaszasz w Zamówieniach (spór w oknie Ochrony Kupujących). Operator rozstrzyga i w razie potrzeby zwraca pieniądze na kartę albo portfel Sunrise Pay."],
  [/face id|touch id|logow|hasł|haslo|konto/i, "Jedno konto Sunrise (MySunrise) działa w całym ekosystemie. W Moje konto → Ustawienia możesz włączyć logowanie Face ID / Touch ID."],
];
function faqReply(message: string): string | null { for (const [re, a] of FAQ) if (re.test(message)) return a; return null; }

function fallbackReply(offers: any[], message: string, intent?: any): string {
  if (!offers.length && !intent?.category_slug && !intent?.mode) { const f = faqReply(message); if (f) return f; }
  const what = [intent?.mode === "daily" ? "wynajem" : intent?.mode === "appointment" ? "usługa z terminem" : null, intent?.category_slug ? ({ motoryzacja: "motoryzacja", nieruchomosci: "nieruchomości", "oze-i-energia": "OZE i energia", "uslugi-i-reklama": "usługi", noclegi: "noclegi" } as Record<string, string>)[intent.category_slug] ?? intent.category_slug : null, intent?.budget ? `do ${Math.round(intent.budget).toLocaleString("pl-PL")} zł` : null].filter(Boolean).join(", ");
  if (offers.length) return `Rozumiem: ${what || `„${message.slice(0, 60)}”`}. Mam ${offers.length === 1 ? "jedną ofertę" : `${offers.length} oferty`} — zobacz poniżej. Chcesz zawęzić (budżet, miasto, rocznik)?`;
  return `Rozumiem: ${what || `„${message.slice(0, 60)}”`} — na razie nie mam takiej oferty. Zmień kryteria albo zapisz wyszukiwanie w wyszukiwarce, a dam znać, gdy coś się pojawi.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = createClient(SUPA, SERVICE_KEY, { db: { schema: "market" } });
  try {
    const body = await req.json();
    const { action, message, session_id, user_id } = body ?? {};

    if (action === "history") {
      if (!session_id) return json({ messages: [] });
      const { data } = await sb.from("suri_messages").select("role, content, created_at").eq("session_id", session_id).order("created_at", { ascending: true }).limit(50);
      return json({ messages: data ?? [] });
    }

    // Podpowiedź odpowiedzi dla sprzedawcy (Wiadomości) — tylko zalogowany, tylko własny wątek
    if (action === "seller_reply") {
      const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
      const { data: u } = await createClient(SUPA, SERVICE_KEY).auth.getUser(jwt);
      if (!u.user) return json({ error: "Brak autoryzacji" }, 401);
      const conversationId = String(body.conversation_id ?? "");
      const { data: conv } = await sb.from("conversations").select("id,offer_id,seller_id,buyer_id").eq("id", conversationId).maybeSingle();
      if (!conv) return json({ error: "Nie znaleziono wątku" }, 404);
      const { data: seller } = await sb.from("sellers").select("id").eq("auth_user_id", u.user.id).maybeSingle();
      const isSeller = seller && String(seller.id) === String(conv.seller_id);
      const isBuyer = String(conv.buyer_id) === u.user.id;
      if (!isSeller && !isBuyer) return json({ error: "Brak dostępu" }, 403);
      const { data: offer } = await sb.from("offers").select("title,price_gross,description,attributes").eq("id", conv.offer_id).maybeSingle();
      const { data: msgs } = await sb.from("messages").select("sender_user,body,created_at").eq("conversation_id", conversationId).order("created_at", { ascending: true }).limit(20);
      const me = u.user.id;
      const thread = (msgs ?? []).map((m: any) => `${m.sender_user === me ? "JA" : "ROZMÓWCA"}: ${String(m.body).slice(0, 400)}`).join("\n");
      const sys = `Jesteś ${ASSISTANT_NAME}, asystent Suri w Sunrise Market. Pomagasz ${isSeller ? "SPRZEDAWCY" : "KUPUJĄCEMU"} napisać odpowiedź w rozmowie o ofercie. Po polsku, uprzejmie, konkretnie, 1–3 zdania na propozycję, bez wymyślania faktów (cen, terminów, parametrów), których nie ma w ofercie ani w rozmowie. Zwróć TYLKO JSON: {"replies":["...","..."]} — 2 różne propozycje (np. rzeczowa i krótka).`;
      const ctx = `Oferta: ${offer?.title ?? "?"} — ${offer?.price_gross ?? "?"} zł.\nOpis (fragment): ${String(offer?.description ?? "").slice(0, 600)}\nAtrybuty: ${JSON.stringify(offer?.attributes ?? {}).slice(0, 500)}\n\nRozmowa:\n${thread || "(pusta)"}\n\nNapisz propozycje odpowiedzi na ostatnią wiadomość rozmówcy.`;
      const out = await llm(sb, sys, [{ role: "user", content: ctx }], { json: true, max_tokens: 400, temperature: 0.6 });
      if (!out.text) return json({ error: "Asystent jest chwilowo niedostępny", replies: [] }, 503);
      let replies: string[] = [];
      try { replies = JSON.parse(out.text.replace(/```json|```/g, "")).replies ?? []; } catch { replies = [out.text]; }
      return json({ replies: replies.slice(0, 2) });
    }

    // --- czat kupującego ---
    if (!message || typeof message !== "string") return json({ reply: "Napisz, czego szukasz 🙂", offers: [] });
    let convo: Turn[] = [];
    if (session_id) {
      try {
        const { data: prev } = await sb.from("suri_messages").select("role, content").eq("session_id", session_id).order("created_at", { ascending: true }).limit(20);
        convo = (prev ?? []).map((m: any) => ({ role: m.role === "user" ? "user" : "assistant", content: String(m.content ?? "") } as Turn)).filter((m) => m.content.length > 0);
      } catch { /* brak historii */ }
    }
    let prefs = "";
    if (user_id) {
      try { const { data: hist } = await sb.rpc("buyer_pref_categories", { p_user: user_id, p_limit: 5 }); if (hist?.length) prefs = `Preferencje klienta (ostatnie kategorie): ${hist.map((h: any) => h.name).join(", ")}.`; } catch { /* brak */ }
    }
    // intencja (kategoria / tryb / budżet / fraza): najpierw parser słów kluczowych (działa zawsze, także bez AI), potem AI może doprecyzować.
    let intent: any = parseIntent(message);
    const im = await llm(sb, `Wyciągnij z wiadomości klienta JSON: {"query": string (2-4 słowa kluczowe produktu, bez „szukam/chcę”), "budget": number|null (zł), "category_slug": ${JSON.stringify(Object.values(CAT_SLUGS))}|null, "mode": "purchase"|"appointment"|"daily"|null (daily = wynajem na dni, appointment = usługa z terminem)}. Zwróć TYLKO JSON.`, [{ role: "user", content: message }], { json: true, max_tokens: 140, temperature: 0 });
    if (im.text) { try { const j = JSON.parse(im.text.replace(/```json|```/g, "")); intent = { query: j.query || intent.query, budget: j.budget ?? intent.budget, category_slug: j.category_slug ?? intent.category_slug, mode: j.mode ?? intent.mode }; } catch { /* zostaje parser */ } }
    // Pytanie o zasady (Ochrona Kupujących, cashback, dostawa…) bez kategorii → odpowiedź z FAQ, bez listy ofert.
    const isQuestion = !intent.category_slug && (/\?/.test(message) || /^\s*(jak|co|czy|ile|gdzie|kiedy|dlaczego|po co)\b/i.test(message));
    const faq = isQuestion ? faqReply(message) : null;
    const { data: offers } = faq ? { data: [] as any[] } : await sb.rpc("suri_recommend", { p_query: intent.query || null, p_budget: intent.budget ?? null, p_category_slug: intent.category_slug ?? null, p_limit: 4, p_mode: intent.mode ?? null });
    const list = offers ?? [];

    const turns: Turn[] = [...convo, { role: "user", content: `${prefs}\nPytanie klienta: ${message}\nOferty z bazy (użyj tylko tych): ${JSON.stringify(list)}` }];
    const out = await llm(sb, SYSTEM, turns, { max_tokens: 450, temperature: 0.5 });
    const text = out.text ?? faq ?? fallbackReply(list, message, intent);

    if (session_id) {
      try {
        await sb.from("suri_sessions").upsert({ id: session_id, user_id: user_id ?? null }, { onConflict: "id", ignoreDuplicates: true });
        await sb.from("suri_messages").insert([{ session_id, role: "user", content: message }, { session_id, role: "suri", content: text }]);
      } catch { /* pamięć best-effort */ }
    }
    return json({ reply: text, offers: list, ai: Boolean(out.text) });
  } catch (err) {
    return json({ reply: "Ups, coś poszło nie tak. Spróbuj jeszcze raz.", offers: [], error: String((err as any)?.message ?? err) });
  }
});
