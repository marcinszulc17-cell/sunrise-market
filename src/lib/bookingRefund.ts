import { supabase } from "./supabase";

type RefundResult = {
  ok?: boolean;
  already?: boolean;
  amount?: number;
  booking_id?: string;
  order_id?: string;
  payment_provider?: string;
  error?: string;
  message?: string;
};

async function functionErrorMessage(error: unknown) {
  const fallback = error instanceof Error ? error.message : "Nie udało się wykonać zwrotu.";
  const context = (error as { context?: Response } | null)?.context;
  if (!context || typeof context.clone !== "function") return fallback;
  try {
    const body = await context.clone().json() as RefundResult;
    return body.message || body.error || fallback;
  } catch {
    return fallback;
  }
}

export async function refundPaidBooking(bookingId: string) {
  const { data, error } = await supabase.functions.invoke("booking-refund-action", {
    body: { booking_id: bookingId },
  });
  if (error) throw new Error(await functionErrorMessage(error));
  const result = (data ?? {}) as RefundResult;
  if (!result.ok) throw new Error(result.message || result.error || "Nie udało się wykonać zwrotu.");
  return result;
}