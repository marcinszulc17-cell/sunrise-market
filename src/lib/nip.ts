// Dane firmy po NIP — edge fn `nip-lookup` (Biała Lista MF, rejestr VAT). Bez kluczy, publiczne dane rejestrowe.
import { supabase } from "./supabase";

export type NipLookup =
  | { ok: true; nip: string; name: string; regon: string; address: string; street: string; postal: string; city: string; status_vat: string }
  | { ok: false; error: string };

/** „UL. PRZEMYSŁOWA 1, 64-300 NOWY TOMYŚL” → ulica / kod / miasto. Adresy MF bywają bez przecinka lub bez kodu — wtedy zwracamy, co się da. */
export function splitPlAddress(address: string): { street: string; postal: string; city: string } {
  const a = (address || "").replace(/\s+/g, " ").trim();
  if (!a) return { street: "", postal: "", city: "" };
  const m = a.match(/^(.*?)[,\s]+(\d{2}-\d{3})\s+(.+)$/);
  if (m) return { street: m[1].replace(/,$/, "").trim(), postal: m[2], city: m[3].trim() };
  const i = a.lastIndexOf(",");
  if (i > 0) return { street: a.slice(0, i).trim(), postal: "", city: a.slice(i + 1).trim() };
  return { street: a, postal: "", city: "" };
}

export function validNip(raw: string): boolean {
  const d = raw.replace(/\D/g, "");
  if (!/^\d{10}$/.test(d)) return false;
  const w = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const sum = w.reduce((s, x, i) => s + x * Number(d[i]), 0);
  return sum % 11 === Number(d[9]);
}

export async function lookupNip(raw: string): Promise<NipLookup> {
  const nip = raw.replace(/\D/g, "");
  if (nip.length !== 10) return { ok: false, error: "NIP musi mieć 10 cyfr" };
  if (!validNip(nip)) return { ok: false, error: "Nieprawidłowy NIP (błędna suma kontrolna)" };
  const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || "https://ihehncaaokbwbdqdztna.supabase.co";
  const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: { session: null } } as any));
  const r = await fetch(`${base}/functions/v1/nip-lookup?nip=${nip}`, { headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {} });
  const j = await r.json().catch(() => ({}));
  if (!j?.ok) return { ok: false, error: j?.error || "Nie znaleziono firmy o tym NIP" };
  const addr = splitPlAddress(j.address || "");
  return { ok: true, nip, name: j.name || "", regon: j.regon || "", address: j.address || "", status_vat: j.status_vat || "", ...addr };
}
