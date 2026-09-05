// Dane firmy po NIP z Bialej Listy MF (rejestr VAT) — do onboardingu partnera handlowego.
// GET/POST { nip } -> { ok, name, nip, regon, address, status_vat }
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Content-Type": "application/json" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    let nip = "";
    if (req.method === "POST") { const b = await req.json().catch(() => ({})); nip = String(b.nip || ""); }
    else { nip = new URL(req.url).searchParams.get("nip") || ""; }
    nip = nip.replace(/[^0-9]/g, "");
    if (nip.length !== 10) return new Response(JSON.stringify({ ok: false, error: "NIP musi miec 10 cyfr" }), { status: 400, headers: cors });
    const date = new Date().toISOString().slice(0, 10);
    const r = await fetch(`https://wl-api.mf.gov.pl/api/search/nip/${nip}?date=${date}`, { headers: { Accept: "application/json" } });
    if (!r.ok) return new Response(JSON.stringify({ ok: false, error: "MF HTTP " + r.status }), { status: 502, headers: cors });
    const j = await r.json();
    const s = j?.result?.subject;
    if (!s) return new Response(JSON.stringify({ ok: false, error: "Nie znaleziono firmy o tym NIP" }), { status: 404, headers: cors });
    return new Response(JSON.stringify({
      ok: true, nip,
      name: s.name || "",
      regon: s.regon || "",
      address: s.workingAddress || s.residenceAddress || "",
      status_vat: s.statusVat || "",
    }), { headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error)?.message || e) }), { status: 500, headers: cors });
  }
});
