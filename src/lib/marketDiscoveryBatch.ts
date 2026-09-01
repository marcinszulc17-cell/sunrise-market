import { supabase } from "./supabase";

export type MarketDiscoverySummary = {
  offer_id: string;
  booking_type: "purchase" | "appointment" | "daily";
  price_from: number | null;
  nearest_available_at: string | null;
  nearest_available_day: string | null;
  available_today: boolean;
  available_this_weekend: boolean;
};

const cache = new Map<string, MarketDiscoverySummary | null>();
const pending = new Set<string>();
let inflight: Promise<void> | null = null;

async function flush() {
  await Promise.resolve();
  const ids = [...pending];
  pending.clear();
  if (!ids.length) return;

  const { data, error } = await supabase.rpc("booking_market_discovery_summary_v1", {
    p_offer_ids: ids,
    p_days: 45,
  });
  if (error) throw error;

  const returned = new Set<string>();
  for (const row of (data ?? []) as MarketDiscoverySummary[]) {
    returned.add(row.offer_id);
    cache.set(row.offer_id, row);
  }
  for (const id of ids) if (!returned.has(id)) cache.set(id, null);
}

export async function ensureMarketDiscovery(ids: string[]) {
  for (const id of ids) if (id && !cache.has(id)) pending.add(id);
  if (!pending.size) return;
  if (!inflight) {
    inflight = flush().finally(() => { inflight = null; });
  }
  await inflight;
  if (pending.size) await ensureMarketDiscovery([]);
}

export function marketDiscoveryFor(offerId: string) {
  return cache.get(offerId);
}

export function clearMarketDiscoveryCache() {
  cache.clear();
  pending.clear();
}
