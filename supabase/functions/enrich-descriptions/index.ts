// enrich-descriptions: dluzszy, uzyteczny opis PL dla ofert first-party.
//
// Model dostaje KONTEKST produktu (nazwa, kategoria, waga), a nie sam tytul — z samego
// tytulu daloby sie napisac wylacznie ogolniki albo zmyslic parametry. Specyfikacja
// (symbol, EAN, waga) doklejana jest DETERMINISTYCZNIE w kodzie, wiec model nie ma jak
// przekrecic symbolu ani kodu kreskowego.
//
// Tytulow ofert od hurtowni nie zmieniamy (pilnuje apply_enrichment) — w czesciach IT kod
// modelu w nazwie jest identyfikatorem i przetlumaczona nazwa potrafi go zgubic.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const BRIDGE_TOKEN = Deno.env.get('BRIDGE_INTERNAL_TOKEN') ?? '';
const ANTHROPIC = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const MODEL = Deno.env.get('ENRICH_MODEL') ?? 'claude-haiku-4-5-20251001';
const svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_KEY')!;
const pub = createClient(Deno.env.get('SUPABASE_URL')!, svc);

type Todo = { id: string; title: string; category: string; sku: string; ean: string; weight_kg: string; specs: string };

function specBlock(o: Todo): string {
  const rows: string[] = [];
  if (o.category && o.category.toLowerCase() !== 'pozostałe') rows.push(`• Kategoria: ${o.category}`);
  if (o.sku) rows.push(`• Symbol producenta: ${o.sku}`);
  if (o.ean) rows.push(`• Kod EAN: ${o.ean}`);
  const w = Number(o.weight_kg);
  if (Number.isFinite(w) && w > 0) rows.push(`• Waga: ${String(w).replace('.', ',')} kg`);
  return rows.length ? `Specyfikacja:\n${rows.join('\n')}` : '';
}

Deno.serve(async (req) => {
  const bridgeOk = Boolean(BRIDGE_TOKEN) && req.headers.get('x-bridge-token') === BRIDGE_TOKEN;
  const { data: cronSecret } = await pub.schema('market').from('internal_secrets').select('value').eq('key', 'cron_worker_secret').maybeSingle();
  const cronOk = Boolean(cronSecret?.value) && req.headers.get('x-cron-secret') === cronSecret.value;
  if (!bridgeOk && !cronOk) return new Response('unauthorized', { status: 401 });
  if (!ANTHROPIC) return new Response(JSON.stringify({ error: 'Brak ANTHROPIC_API_KEY' }), { status: 500 });
  const body = await req.json().catch(() => ({}));
  const limit = Math.min(Number(body.limit ?? 12), 20);
  const debug = body.debug === true;

  const { data: claimed, error } = await pub.rpc('claim_enrich_batch', { p_limit: limit });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  const todo = (claimed ?? []) as Todo[];
  if (todo.length === 0) return new Response(JSON.stringify({ done: 0, message: 'Brak ofert do wzbogacenia' }), { headers: { 'Content-Type': 'application/json' } });

  const prompt = `Jestes polskim copywriterem e-commerce. Dla kazdego produktu napisz OPIS PO POLSKU.

ZASADY:
- Pisz WYLACZNIE o tym, co wynika z podanych danych. NIE wymyslaj parametrow, norm, certyfikatow, gwarancji ani zgodnosci z urzadzeniami, ktorych nie podano.
- Jesli danych jest malo, napisz opis krotszy — to lepsze niz zmyslanie.
- Nie podawaj cen ani promocji. Nie uzywaj emoji. Nie zaczynaj od "Oto".
- Nie powtarzaj symbolu producenta ani kodu EAN — zostana dodane osobno.

STRUKTURA: 2-3 akapity oddzielone PUSTA LINIA, lacznie 110-180 slow:
1) Czym produkt jest i do czego sluzy.
2) Zastosowania i dla kogo.
3) Zamkniecie: wysylka z magazynu dostawcy, cashback 3% na portfel Sunrise Pay.

FORMAT — dla kazdego produktu dokladnie taki blok:
###<id>
<opis PL>

Zwroc TYLKO takie bloki.

PRODUKTY:
${todo.map((o) => `###${o.id}\nNazwa: ${o.title}${o.category ? `\nKategoria: ${o.category}` : ''}`).join('\n\n')}`;

  let txt = '';
  let apiError = '';
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 4000, messages: [{ role: 'user', content: prompt }] }),
    });
    const j = await r.json();
    txt = j?.content?.[0]?.text ?? '';
    if (!txt) apiError = `status ${r.status}: ${JSON.stringify(j?.error ?? j).slice(0, 300)}`;
  } catch (e) { apiError = String((e as Error)?.message ?? e).slice(0, 300); }

  const doneIds = new Set<string>();
  const parts = txt.split(/###\s*/).map((s) => s.trim()).filter(Boolean);
  let done = 0;
  const failures: string[] = [];
  for (const part of parts) {
    const nl = part.indexOf('\n');
    if (nl < 0) continue;
    const id = part.slice(0, nl).trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) continue;
    const item = todo.find((o) => o.id === id);
    if (!item) continue;
    let desc = part.slice(nl + 1).trim();
    desc = desc.replace(/^\s*(?:nazwa|tytu[lł])\s*:\s*.+$/im, '').trim();
    if (desc.length < 120) { failures.push(`${id}: opis ${desc.length} znakow`); continue; }
    const spec = specBlock(item);
    const full = spec ? `${desc}\n\n${spec}` : desc;
    const { data: ok, error: aErr } = await pub.rpc('apply_enrichment', { p_id: id, p_title: '', p_desc: full });
    if (ok) { done++; doneIds.add(id); } else failures.push(`${id}: ${aErr?.message ?? 'apply_enrichment=false'}`);
  }
  for (const o of todo) { if (!doneIds.has(o.id)) { await pub.rpc('release_enrich_claim', { p_id: o.id }); } }
  const out: Record<string, unknown> = { done, batch: todo.length };
  if (done < todo.length) { out.api_error = apiError || null; out.blocks = parts.length; out.failures = failures.slice(0, 5); }
  if (debug) out.sample = txt.slice(0, 400);
  return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json' } });
});
