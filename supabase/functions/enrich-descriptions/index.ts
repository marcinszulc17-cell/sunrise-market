// enrich-descriptions: POLSKA nazwa + DŁUGI opis PL (Claude) dla ofert first-party.
// Wszystkie odczyty/zapisy przez publiczne RPC (claim_enrich_batch, apply_enrichment, release_enrich_claim).
import { createClient } from 'jsr:@supabase/supabase-js@2';
const BRIDGE_TOKEN = Deno.env.get('BRIDGE_INTERNAL_TOKEN') ?? '';
const ANTHROPIC = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_KEY')!;
const pub = createClient(Deno.env.get('SUPABASE_URL')!, svc);

Deno.serve(async (req) => {
  if (BRIDGE_TOKEN && req.headers.get('x-bridge-token') !== BRIDGE_TOKEN) return new Response('unauthorized', { status: 401 });
  if (!ANTHROPIC) return new Response(JSON.stringify({ error: 'Brak ANTHROPIC_API_KEY' }), { status: 500 });
  const body = await req.json().catch(() => ({}));
  const limit = Math.min(Number(body.limit ?? 12), 20);

  const { data: claimed, error } = await pub.rpc('claim_enrich_batch', { p_limit: limit });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  const todo = (claimed ?? []) as { id: string; title: string }[];
  if (todo.length === 0) return new Response(JSON.stringify({ done: 0, message: 'Brak ofert' }), { headers: { 'Content-Type': 'application/json' } });

  const prompt = `Jesteś polskim copywriterem e-commerce. Dla każdego produktu (tytuł po angielsku) wykonaj DWIE rzeczy PO POLSKU:\n1) NAZWA: zwięzła, naturalna polska nazwa produktu (max 70 znaków, bez cudzysłowów).\n2) OPIS: długi opis sprzedażowy (180-260 słów) w 3-4 akapitach oddzielonych PUSTĄ LINIĄ: hak; cechy i wykonanie; zastosowanie i dla kogo; dlaczego warto (wygoda, jakość, cashback 3% w Sunrise Pay). Naturalna polszczyzna, bez zmyślania parametrów, bez cen.\n\nFORMAT — dla każdego produktu dokładnie taki blok:\n###<id>\nNAZWA: <polska nazwa>\n<opis PL>\n\nZwróć TYLKO takie bloki.\n\nPRODUKTY:\n${todo.map((o) => `###${o.id}\nEN: ${o.title}`).join('\n\n')}`;

  let txt = '';
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 7000, messages: [{ role: 'user', content: prompt }] }),
    });
    const j = await r.json();
    txt = j?.content?.[0]?.text ?? '';
  } catch (_e) { txt = ''; }

  const doneIds = new Set<string>();
  const parts = txt.split(/###\s*/).map((s) => s.trim()).filter(Boolean);
  let done = 0;
  for (const part of parts) {
    const nl = part.indexOf('\n');
    if (nl < 0) continue;
    const id = part.slice(0, nl).trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) continue;
    let rest = part.slice(nl + 1).trim();
    let plTitle = '';
    const m = rest.match(/^\s*(?:nazwa|tytu[lł])\s*:\s*(.+)$/im);
    if (m) { plTitle = m[1].trim().replace(/^\"|\"$/g,'').slice(0, 180); rest = (rest.slice(0, m.index) + rest.slice((m.index||0) + m[0].length)).trim(); }
    const desc = rest.trim();
    if (!todo.find((o) => o.id === id) || desc.length < 120) continue;
    const { data: ok } = await pub.rpc('apply_enrichment', { p_id: id, p_title: plTitle, p_desc: desc });
    if (ok) { done++; doneIds.add(id); }
  }
  for (const o of todo) { if (!doneIds.has(o.id)) { await pub.rpc('release_enrich_claim', { p_id: o.id }); } }
  return new Response(JSON.stringify({ done, batch: todo.length }), { headers: { 'Content-Type': 'application/json' } });
});
