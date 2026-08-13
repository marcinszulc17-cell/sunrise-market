// Zapamiętany zamiar zakupu na czas doładowania portfela.
// Koszyk sam w sobie żyje w localStorage (cart.ts), więc tu trzymamy tylko
// dane ulotne ze stanu Reacta (adres, wybór dostawy) + kwotę docelową, aby po
// powrocie ze Stripe wznowić płatność bez ponownego wypełniania formularza.
import type { ShipAddress } from "./api";

const KEY = "sunrise_checkout_intent";
const TTL_MS = 30 * 60 * 1000; // 30 min — po tym czasie zamiar wygasa

export type CheckoutIntent = {
  addr: ShipAddress;
  shippingCodes: string[];
  grand: number; // kwota do zapłaty w chwili doładowania (kontrola spójności)
  topup: number; // kwota doładowania zainicjowana
  coupon?: string; // opcjonalny kod rabatowy
  ts: number;    // znacznik czasu utworzenia
};

export function saveIntent(i: Omit<CheckoutIntent, "ts">): void {
  try { localStorage.setItem(KEY, JSON.stringify({ ...i, ts: Date.now() })); } catch { /* ignore */ }
}

export function loadIntent(): CheckoutIntent | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const i = JSON.parse(raw) as CheckoutIntent;
    if (!i || typeof i.ts !== "number" || Date.now() - i.ts > TTL_MS) { clearIntent(); return null; }
    return i;
  } catch { return null; }
}

export function clearIntent(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export function hasIntent(): boolean {
  return loadIntent() != null;
}
