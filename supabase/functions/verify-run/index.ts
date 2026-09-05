import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_KEY");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

async function fetchJson(url: string, init?: RequestInit) {
  const r = await fetch(url, init);
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

function norm(v: unknown) {
  return String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function compactDate(v: unknown) {
  const s = String(v ?? "").trim();
  const pl = s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
  if (pl) return `${pl[3]}${pl[2].padStart(2,"0")}${pl[1].padStart(2,"0")}`;
  const iso = s.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/);
  if (iso) return `${iso[1]}${iso[2].padStart(2,"0")}${iso[3].padStart(2,"0")}`;
  return "";
}

function regionFor(location: unknown) {
  const s = norm(location);
  const rules: [string,string][] = [
    ["nowy tomyśl","30"],["nowy tomysl","30"],["pozna","30"],["wielkop","30"],
    ["dolnośl","02"],["kujawsko","04"],["lubels","06"],["lubusk","08"],
    ["łód","10"],["lodz","10"],["małopol","12"],["malopol","12"],["mazowie","14"],
    ["opol","16"],["podkar","18"],["podlas","20"],["pomorsk","22"],["śląsk","24"],
    ["slask","24"],["świętok","26"],["swietok","26"],["warmi","28"],["zachodniop","32"],
  ];
  return rules.find(([k]) => s.includes(k))?.[1] ?? null;
}

function compare(label: string, expected: unknown, actual: unknown, numeric = false) {
  let match: boolean | null = null;
  if (expected !== null && expected !== undefined && expected !== "" && actual !== null && actual !== undefined && actual !== "") {
    match = numeric ? Number(expected) === Number(actual) : norm(expected) === norm(actual);
  }
  return { label, expected: expected ?? null, actual: actual ?? null, match };
}

async function decodeVin(attrs: any) {
  const vin = String(attrs?.vin ?? "").trim();
  if (!vin) return null;
  const params = new URLSearchParams({ format: "json" });
  if (attrs?.year) params.set("modelyear", String(attrs.year));
  const data = await fetchJson(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${encodeURIComponent(vin)}?${params}`);
  const r = data?.Results?.[0];
  if (!r) return null;
  const checks = [
    compare("VIN — marka", attrs.brand, r.Make),
    compare("VIN — model", attrs.model, r.Model),
    compare("VIN — rok", attrs.year, r.ModelYear, true),
  ];
  const known = checks.filter((x) => x.match !== null);
  const matched = known.filter((x) => x.match === true);
  return {
    source: "NHTSA vPIC",
    vin,
    make: r.Make || null,
    model: r.Model || null,
    model_year: r.ModelYear || null,
    manufacturer: r.Manufacturer || null,
    plant_country: r.PlantCountry || null,
    vehicle_type: r.VehicleType || null,
    checks,
    score: known.length ? Math.round(matched.length / known.length * 100) : null,
  };
}

async function cepikReference(attrs: any) {
  const region = regionFor(attrs?.location);
  if (!region) return { status: "skipped", reason: "region_unknown", reference_only: true };
  const first = compactDate(attrs?.first_registration);
  const year = first ? Number(first.slice(0,4)) : Number(attrs?.year) || new Date().getFullYear();
  const p = new URLSearchParams({
    "data-od": `${year}0101`,
    "data-do": `${Math.min(year + 1, new Date().getFullYear() + 1)}1231`,
    wojewodztwo: region,
    "pokaz-wszystkie-pola": "false",
    limit: "5",
  });
  if (attrs?.brand) p.set("filter[marka]", String(attrs.brand).toUpperCase());
  if (attrs?.model) p.set("filter[model]", String(attrs.model).toUpperCase());
  if (attrs?.year) p.set("filter[rok-produkcji]", String(attrs.year));
  const data = await fetchJson(`https://api.cepik.gov.pl/pojazdy?${p}`);
  return {
    status: "ok",
    source: "CEPiK Open API",
    region,
    reference_only: true,
    returned: Number(data?.meta?.count ?? data?.data?.length ?? 0),
    note: "Publiczne API CEPiK jest używane wyłącznie jako źródło referencyjne i nie identyfikuje konkretnego pojazdu po VIN.",
  };
}

async function externalVehicle(attrs: any, offerId: string) {
  const url = Deno.env.get("VERIFY_EXTERNAL_HISTORY_URL");
  const key = Deno.env.get("VERIFY_EXTERNAL_HISTORY_KEY");
  if (!url || !key || !attrs?.vin) return null;
  return fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      vin: attrs.vin,
      registration_number: attrs.registration_number ?? null,
      first_registration: attrs.first_registration ?? null,
      offer_id: offerId,
    }),
  });
}

async function runVehicle(sb: any, row: any, offer: any) {
  const attrs = offer.attributes ?? {};
  const providerStatus: any = {
    vin_decoder: { status: "pending" },
    cepik_reference: { status: "pending" },
    external_history: { status: "unconfigured" },
  };
  let vin: any = null;
  let cepik: any = null;
  let external: any = null;

  try {
    vin = await decodeVin(attrs);
    providerStatus.vin_decoder = vin ? { status: "ok", source: "NHTSA vPIC" } : { status: "skipped" };
  } catch (e) {
    providerStatus.vin_decoder = { status: "error", message: String((e as Error).message ?? e) };
  }

  try {
    cepik = await cepikReference(attrs);
    providerStatus.cepik_reference = cepik;
  } catch (e) {
    providerStatus.cepik_reference = { status: "error", reference_only: true, message: String((e as Error).message ?? e) };
  }

  try {
    external = await externalVehicle(attrs, offer.id);
    if (external) providerStatus.external_history = { status: "ok" };
  } catch (e) {
    providerStatus.external_history = { status: "error", message: String((e as Error).message ?? e) };
  }

  const warnings: string[] = [];
  if (!attrs.vin) warnings.push("Brak VIN w danych oferty.");
  if (!attrs.registration_number) warnings.push("Brak numeru rejestracyjnego. Oficjalna usługa Historia Pojazdu wymaga numeru rejestracyjnego, VIN i daty pierwszej rejestracji.");
  if (providerStatus.external_history.status === "unconfigured") warnings.push("Rozszerzona historia szkód, kradzieży, przebiegu i aukcji oczekuje na aktywację dostawcy B2B.");

  const coverage = {
    vin_identity: providerStatus.vin_decoder.status === "ok",
    cepik_reference: providerStatus.cepik_reference.status === "ok",
    exact_polish_history: providerStatus.external_history.status === "ok",
    extended_history: providerStatus.external_history.status === "ok",
  };
  const score = vin?.score ?? null;
  const full = coverage.vin_identity && coverage.extended_history;
  const result = {
    kind: "vehicle",
    generated_at: new Date().toISOString(),
    automation_version: "v6",
    listing: { title: offer.title, attributes: attrs },
    sources: { vin_decoder: vin, cepik_reference: cepik, external_history: external },
    validation: { checks: vin?.checks ?? [], score },
    coverage,
    warnings,
    summary: full
      ? `Pełny automatyczny raport Sunrise Verify. Zgodność identyfikacji VIN: ${score ?? "—"}%.`
      : `Automatyczny raport Sunrise Verify — zakres podstawowy${score !== null ? `, zgodność identyfikacji VIN ${score}%` : ""}. Rozszerzona historia wymaga aktywnego źródła B2B.`,
  };
  await sb.schema("market").rpc("finish_verification_automation", {
    p_request_id: row.id,
    p_result: result,
    p_provider_status: providerStatus,
  });
  return result;
}

async function runProperty(sb: any, row: any, offer: any) {
  const attrs = offer.attributes ?? {};
  const providerStatus: any = { geoportal: { status: "pending" }, land_register: { status: "unconfigured" } };
  const parcel = attrs.parcel_id ?? attrs.dzialka ?? attrs.parcel_number ?? null;
  let geoportal: any = null;
  let landRegister: any = null;

  if (parcel) {
    try {
      const r = await fetch(`https://uldk.gugik.gov.pl/?request=GetParcelById&id=${encodeURIComponent(String(parcel))}`);
      const text = await r.text();
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      geoportal = { source: "GUGiK ULDK/Geoportal", raw: text };
      providerStatus.geoportal = { status: "ok", source: "GUGiK ULDK" };
    } catch (e) {
      providerStatus.geoportal = { status: "error", message: String((e as Error).message ?? e) };
    }
  } else {
    providerStatus.geoportal = { status: "skipped", reason: "parcel_missing" };
  }

  const providerUrl = Deno.env.get("VERIFY_PROPERTY_PROVIDER_URL");
  const providerKey = Deno.env.get("VERIFY_PROPERTY_PROVIDER_KEY");
  if (providerUrl && providerKey) {
    try {
      landRegister = await fetchJson(providerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${providerKey}` },
        body: JSON.stringify({ offer_id: offer.id, attributes: attrs }),
      });
      providerStatus.land_register = { status: "ok" };
    } catch (e) {
      providerStatus.land_register = { status: "error", message: String((e as Error).message ?? e) };
    }
  }

  const warnings: string[] = [];
  if (!parcel) warnings.push("Brak numeru/identyfikatora działki do automatycznej weryfikacji Geoportalu.");
  if (providerStatus.land_register.status === "unconfigured") warnings.push("Pełna automatyczna analiza księgi wieczystej oczekuje na aktywne źródło danych.");
  const coverage = {
    geoportal: providerStatus.geoportal.status === "ok",
    land_register: providerStatus.land_register.status === "ok",
  };
  const result = {
    kind: "property",
    generated_at: new Date().toISOString(),
    automation_version: "v6",
    listing: { title: offer.title, attributes: attrs },
    sources: { geoportal, land_register: landRegister },
    coverage,
    warnings,
    summary: coverage.geoportal && coverage.land_register
      ? "Pełny automatyczny raport Sunrise Verify dla nieruchomości."
      : "Automatyczny raport Sunrise Verify — zakres podstawowy. Pełna analiza KW wymaga aktywnego źródła danych.",
  };
  await sb.schema("market").rpc("finish_verification_automation", {
    p_request_id: row.id,
    p_result: result,
    p_provider_status: providerStatus,
  });
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!SERVICE_KEY) return json({ error: "service_key_missing" }, 500);

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const internal = auth === `Bearer ${SERVICE_KEY}`;
    let user: any = null;
    let userClient: any = null;

    if (!internal) {
      userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
      const { data: { user: u }, error } = await userClient.auth.getUser();
      if (error || !u) return json({ error: "unauthorized" }, 401);
      user = u;
    }

    const body = await req.json().catch(() => ({}));
    const requestId = body.request_id as string | undefined;
    if (!requestId) return json({ error: "request_id_required" }, 400);

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: row, error } = await sb.schema("market").from("verification_requests")
      .select("id,offer_id,user_id,kind,status").eq("id", requestId).maybeSingle();
    if (error || !row) return json({ error: "not_found" }, 404);

    if (!internal) {
      const { data: isOperator } = await userClient.schema("market").rpc("ami_operator");
      if (row.user_id !== user.id && isOperator !== true) return json({ error: "forbidden" }, 403);
    }

    if (!["paid", "processing"].includes(row.status)) return json({ ok: true, skipped: true, status: row.status });

    await sb.schema("market").rpc("mark_verification_processing", {
      p_request_id: row.id,
      p_provider_status: { worker: { status: "running", at: new Date().toISOString(), version: "v6" } },
    });

    const { data: offer, error: offerError } = await sb.schema("market").from("offers")
      .select("id,title,attributes").eq("id", row.offer_id).single();
    if (offerError || !offer) throw new Error("Oferta nie istnieje");

    const result = row.kind === "vehicle"
      ? await runVehicle(sb, row, offer)
      : await runProperty(sb, row, offer);

    return json({ ok: true, status: "ready", request_id: row.id, result_summary: result.summary });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
