import { supabase } from "./supabase";

export type BookingCancelRefundResult = {
  ok: boolean;
  already?: boolean;
  booking_id?: string;
  order_id?: string;
  refunded?: number;
  payment_provider?: "sunrise_pay" | "stripe" | string;
  error?: string;
  message?: string;
};

export async function cancelPaidBookingWithRefund(bookingId: string): Promise<BookingCancelRefundResult> {
  const { data, error } = await supabase.functions.invoke("booking-cancel-refund", {
    body: { booking_id: bookingId },
  });
  if (error) throw error;
  const result = (data ?? {}) as BookingCancelRefundResult;
  if (!result.ok) {
    throw new Error(result.message || result.error || "Nie udało się anulować rezerwacji i zwrócić płatności.");
  }
  return result;
}
