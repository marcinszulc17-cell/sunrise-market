import { supabase } from "./supabase";

export type BuyerBooking = {
  id: string;
  offer_id: string;
  title: string;
  booking_type: "appointment" | "daily";
  starts_at: string;
  ends_at: string;
  units: number;
  amount_gross: number;
  status: string;
  order_id: string | null;
  payment_provider: string | null;
  paid_at: string | null;
  hold_expires_at: string | null;
  deposit_gross: number;
  deposit_status: string;
  deposit_paid_at: string | null;
  deposit_resolved_at: string | null;
  deposit_retained_gross: number;
  deposit_resolution_note: string | null;
  created_at: string;
};

export async function myBookingsV2(): Promise<BuyerBooking[]> {
  const { data, error } = await supabase.schema("market").rpc("my_bookings_v2");
  if (error) throw error;
  return (data ?? []) as BuyerBooking[];
}
