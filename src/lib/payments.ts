import { supabase } from "./supabase";

// Doładowanie portfela: tworzy Stripe Checkout i przekierowuje do płatności.
// user_id NIE jest wysyłany — backend bierze go z JWT (bezpieczeństwo).
// returnTo (opcjonalne): ścieżka powrotu po płatności — podpowiedź dla backendu,
// aby wrócić np. do koszyka i dokończyć płatność (auto-doładowanie w checkoutcie).
// Gdy backend jeszcze tego nie honoruje, parametr jest po prostu ignorowany.
export async function topupWallet(amountPln: number, returnTo?: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("wallet-topup", {
    body: { amount: amountPln, return_to: returnTo ?? null },
  });
  if (error) {
    let body: any = null;
    try { const ctx = (error as any)?.context; body = ctx?.clone ? await ctx.clone().json() : ctx?.json ? await ctx.json() : null; } catch { /* brak JSON */ }
    throw new Error(body?.error ?? "Nie udało się rozpocząć doładowania — spróbuj ponownie lub zapłać kartą.");
  }
  if (!data?.url) throw new Error(data?.error ?? "Nie udało się utworzyć płatności");
  window.location.href = data.url as string;
}

// Zamiana punktów SFC na saldo Sunrise Pay. MySunrise pozostaje jedynym
// źródłem prawdy o pieniądzach; 1 pkt = 1 zł. Klucz idempotencji jest trwały
// dla użytkownika + kwoty aż do potwierdzonego sukcesu. Dzięki temu timeout,
// odświeżenie strony lub ręczny retry nie może wykonać tej samej konwersji drugi raz.
export type RedeemResult = { available: boolean; balance?: number; points?: number; converted?: number; error?: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const redeemAttemptStorageKey = (userId: string, amount: number) => `sunrise-market:redeem:${userId}:${amount.toFixed(2)}`;

function getStoredAttempt(key: string): string | null {
  try {
    const value = globalThis.localStorage?.getItem(key) ?? null;
    return value && UUID_RE.test(value) ? value : null;
  } catch {
    return null;
  }
}

function saveAttempt(key: string, value: string) {
  try { globalThis.localStorage?.setItem(key, value); } catch { /* storage is optional */ }
}

function clearAttempt(key: string) {
  try { globalThis.localStorage?.removeItem(key); } catch { /* storage is optional */ }
}

export async function redeemPoints(amountPln: number): Promise<RedeemResult> {
  const amount = Math.round(Number(amountPln) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return { available: true, error: "Nieprawidłowa liczba punktów" };

  const { data: { user } } = await supabase.auth.getUser();
  const storageKey = redeemAttemptStorageKey(user?.id ?? "anonymous", amount);
  const idempotencyKey = getStoredAttempt(storageKey) ?? crypto.randomUUID();
  saveAttempt(storageKey, idempotencyKey);

  const { data, error } = await supabase.functions.invoke("wallet-redeem-points", {
    body: { amount, idempotency_key: idempotencyKey },
  });

  if (data) {
    clearAttempt(storageKey);
    return data as RedeemResult;
  }

  if (error) {
    let body: any = null;
    try {
      const context = (error as any)?.context;
      if (context?.clone) body = await context.clone().json();
      else if (context?.json) body = await context.json();
    } catch { /* keep the same idempotency key for an uncertain retry */ }

    if (body && typeof body === "object") {
      return {
        ...body,
        available: body.available !== false,
        error: body.error || error.message || "Nie udało się zamienić punktów",
      } as RedeemResult;
    }
    return { available: true, error: error.message || "Nie udało się zamienić punktów" };
  }

  return { available: true, error: "Nie udało się połączyć z Sunrise Pay" };
}

// Historia operacji powstałych w Sunrise Market. Nie jest źródłem salda ani
// pełną historią portfela — te dane należą do MySunrise.
export async function getWalletOps(userId: string, limit = 20) {
  const { data, error } = await supabase
    .from("wallet_ops").select("type, amount, balance_after, created_at")
    .eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data ?? [];
}

// Sprzedawca zalogowanego użytkownika (RPC security definer — tylko własny rekord).
export async function getMySeller() {
  const { data, error } = await supabase.rpc("my_seller");
  if (error) throw error;
  return (data && data[0]) ?? null;
}

// Rozliczenia (wypłaty) danego sprzedawcy — RLS zwraca tylko własne.
export async function getPayouts(sellerId: string) {
  const { data, error } = await supabase
    .from("payout_runs")
    .select("id, period_start, period_end, gross_sales, commission_total, net_payout, status, paid_at")
    .eq("seller_id", sellerId)
    .order("period_start", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// Onboarding sprzedawcy do Stripe Connect: zwraca i otwiera link onboardingowy.
export async function startSellerOnboarding(sellerId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("connect-onboard", {
    body: { seller_id: sellerId },
  });
  if (error) throw error;
  if (!data?.url) throw new Error(data?.error ?? "Nie udało się rozpocząć onboardingu");
  window.location.href = data.url as string;
}
