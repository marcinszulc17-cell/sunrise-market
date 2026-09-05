import { supabase } from "./supabase";

export type MarketConfig = {
  cashbackRate: number;
  topupMinPln: number;
  topupMaxPln: number;
};

const DEFAULT_CONFIG: MarketConfig = { cashbackRate: 0.03, topupMinPln: 10, topupMaxPln: 25000 };
let cached: MarketConfig | null = null;
let inflight: Promise<MarketConfig> | null = null;

export async function getMarketConfig(): Promise<MarketConfig> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data, error } = await supabase.rpc("public_market_config");
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      const rate = Number(row?.cashback_rate ?? DEFAULT_CONFIG.cashbackRate);
      const tmin = Number(row?.topup_min_pln ?? DEFAULT_CONFIG.topupMinPln), tmax = Number(row?.topup_max_pln ?? DEFAULT_CONFIG.topupMaxPln);
      cached = {
        cashbackRate: Number.isFinite(rate) && rate >= 0 ? rate : DEFAULT_CONFIG.cashbackRate,
        topupMinPln: Number.isFinite(tmin) && tmin > 0 ? tmin : DEFAULT_CONFIG.topupMinPln,
        topupMaxPln: Number.isFinite(tmax) && tmax > 0 ? tmax : DEFAULT_CONFIG.topupMaxPln,
      };
      return cached;
    } catch {
      cached = DEFAULT_CONFIG;
      return cached;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function cashbackFor(amount: number, rate: number) {
  return Math.round(Math.max(0, Number(amount) || 0) * Math.max(0, Number(rate) || 0) * 100) / 100;
}
