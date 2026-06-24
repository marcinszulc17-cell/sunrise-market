import { supabase } from "./supabase";

// Doładowanie portfela: tworzy Stripe Checkout i przekierowuje do płatności.
// user_id NIE jest wysyłany — backend bierze go z JWT (bezpieczeństwo).
export async function topupWallet(amountPln: number): Promise<void> {
  const { data, error } = await supabase.functions.invoke("wallet-topup", {
    body: { amount: amountPln },
  });
  if (error) throw error;
  if (!data?.url) throw new Error(data?.error ?? "Nie udało się utworzyć płatności");
  window.location.href = data.url as string; // redirect na Stripe Checkout
}

// Saldo portfela (lustro lub MySunrise – zależnie od backendu).
export async function getWalletBalance(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from("wallet_mirror").select("balance").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return Number(data?.balance ?? 0);
}

// Historia operacji portfela.
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
