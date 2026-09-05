import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.27.0";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_KEY");
const MODEL_FAST = "claude-haiku-4-5-20251001";
const MODEL_SMART = "claude-sonnet-4-6";

const SURI_SYSTEM = `Jesteś Suri — energiczna, kompetentna ekspertka zakupowa Sunrise Market (marketplace ekosystemu Sunrise). Mówisz po polsku: ciepło, z entuzjazmem, ale konkretnie i szczerze — zawsze w interesie KUPUJĄCEGO. Masz lekki, żywy ton (możesz użyć 1 emoji), bez lania wody.

Znasz Sunrise od podszewki:
• Płatność WYŁĄCZNIE portfelem Sunrise Pay — klient najpierw doładowuje portfel, a po zakupie 3% cashbacku wraca na saldo.
• Portfel doładowujesz kartą i możesz połączyć z aplikacją MySunrise.
• Produkty Sunrise (nasze, dropship) — wysyłka z magazynu partnera, realny termin 15–25 dni roboczych, kurierem pod adres.
• Produkty sprzedawców zewnętrznych — własny magazyn, zwykle Paczkomat InPost, darmowa dostawa od 149 zł.

Doradzasz na podstawie preferencji i historii klienta, proponujesz podobne i lepsze okazje, ale nie naciskasz. Pamiętasz, co klient mówił wcześniej w tej rozmowie, i nawiązujesz do tego. Nie wymyślasz produktów spoza podanej listy ofert. Przy cenie jesteś szczera. Krótko, żywo, rzeczowo.`;

function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE_KEY!, { db: { schema: "market" } });
  try {
    const body = await req.json();
    const { action, message, session_id, user_id } = body ?? {};

    // --- historia rozmowy: do wczytania po ponownym otwarciu czatu ---
    if (action === "history") {
      if (!session_id) return json({ messages: [] });
      const { data } = await sb.from("suri_messages")
        .select("role, content, created_at")
        .eq("session_id", session_id)
        .order("created_at", { ascending: true })
        .limit(50);
      return json({ messages: data ?? [] });
    }

    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) return json({ reply: "Przepraszam, chwilowo nie moge odpowiadac — administrator nie wlaczyl jeszcze mojego silnika AI.", offers: [] });
    const claude = new Anthropic({ apiKey: key });

    // lekka personalizacja: ostatnie kategorie kupione przez klienta
    let prefs = "";
    if (user_id) {
      try {
        const { data: hist } = await sb.rpc("buyer_pref_categories", { p_user: user_id, p_limit: 5 });
        if (hist && hist.length) prefs = `Preferencje klienta (ostatnie kategorie): ${hist.map((h: any) => h.name).join(", ")}.`;
      } catch { /* brak historii */ }
    }

    // pamiec rozmowy: ostatnie wiadomosci tej sesji jako kontekst dla modelu
    let convo: { role: "user" | "assistant"; content: string }[] = [];
    if (session_id) {
      try {
        const { data: prev } = await sb.from("suri_messages")
          .select("role, content")
          .eq("session_id", session_id)
          .order("created_at", { ascending: true })
          .limit(20);
        convo = (prev ?? []).map((m: any) => ({ role: m.role === "user" ? "user" : "assistant", content: String(m.content ?? "") }))
          .filter((m: any) => m.content.length > 0);
      } catch { /* brak historii */ }
    }

    let intent: any = {};
    try {
      const im = await claude.messages.create({ model: MODEL_FAST, max_tokens: 200,
        system: "Wyciagnij z wiadomosci JSON: {query, budget (liczba lub null), category_slug (lub null)}. Zwroc TYLKO JSON.",
        messages: [{ role: "user", content: message }] });
      intent = JSON.parse((im.content[0] as any).text);
    } catch { intent = { query: message }; }
    const { data: offers } = await sb.rpc("suri_recommend", { p_query: intent.query ?? message, p_budget: intent.budget ?? null, p_category_slug: intent.category_slug ?? null, p_limit: 4 });

    const turns = [...convo, { role: "user" as const, content: `${prefs}\nPytanie klienta: ${message}\nOferty z bazy (użyj tylko tych): ${JSON.stringify(offers)}` }];
    const reply = await claude.messages.create({
      model: MODEL_SMART, max_tokens: 450,
      system: SURI_SYSTEM,
      messages: turns,
    });
    const text = (reply.content[0] as any).text;

    // zapis rozmowy (najpierw upewnij sie ze sesja istnieje - FK). Zapis nie moze psuc odpowiedzi.
    if (session_id) {
      try {
        await sb.from("suri_sessions").upsert({ id: session_id, user_id: user_id ?? null }, { onConflict: "id", ignoreDuplicates: true });
        await sb.from("suri_messages").insert([{ session_id, role: "user", content: message }, { session_id, role: "suri", content: text }]);
      } catch (_e) { /* pamiec best-effort */ }
    }
    return json({ reply: text, offers: offers ?? [] });
  } catch (err) {
    const m = String((err as any)?.message ?? err);
    const friendly = (m.includes("authentication") || m.includes("x-api-key")) ? "Moj silnik AI ma nieprawidlowy klucz — popros administratora o poprawienie ANTHROPIC_API_KEY." : (m.includes("credit") ? "Brak kredytow AI — administrator musi doladowac konto Anthropic." : "Ups, cos poszlo nie tak. Sprobuj jeszcze raz.");
    return json({ reply: friendly, offers: [] });
  }
});
