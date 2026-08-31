import { supabase } from "./supabase";

export type BookingDepositAction = "refund" | "retain";

export async function settleBookingDeposit(bookingId: string, action: BookingDepositAction, note?: string) {
  const { data, error } = await supabase.functions.invoke("booking-deposit-action", {
    body: { booking_id: bookingId, action, note: note || null },
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || "Nie udało się rozliczyć kaucji.");
  return data as { ok: true; action: BookingDepositAction; deposit_status: string; amount: number };
}
