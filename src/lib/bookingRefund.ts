import { supabase } from "./supabase";

export type BookingRefundResult = {
  ok?: boolean;
  already?: boolean;
  refunded?: number | boolean;
  order_id?: string;
  external_ref?: string;
  error?: string;
  message?: string;
};

export async function refundPaidBooking(bookingId: string) {
  const { data, error } = await supabase.functions.invoke("booking-refund-action", {
    body: { booking_id: bookingId },
  });
  if (error) throw error;
  const result = (data ?? {}) as BookingRefundResult;
  if (!result.ok) throw new Error(result.message || result.error || "Nie udało się anulować i zwrócić płatności.");
  return result;
}
