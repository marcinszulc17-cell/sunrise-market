import { supabase } from "./supabase";

export type BookingServiceV2 = {
  id: string;
  name: string;
  description?: string | null;
  duration_minutes: number;
  price_gross: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
};

export type BookingResourceV2 = {
  id: string;
  name: string;
  kind: "staff" | "vehicle" | "property" | "room" | "equipment" | "other";
  description?: string | null;
};

export type BookingRateV2 = {
  id: string;
  starts_on: string;
  ends_on: string;
  price_per_unit: number | null;
  min_units: number | null;
  label?: string | null;
};

export type BookingCatalogV2 = {
  config: {
    offer_id: string;
    booking_type: "appointment" | "daily";
    timezone: string;
    duration_minutes: number | null;
    slot_interval_minutes: number;
    min_notice_hours: number;
    max_advance_days: number;
    min_units: number;
    max_units: number;
    price_per_unit: number;
    cleaning_fee_gross: number;
    deposit_gross: number;
    instant_booking: boolean;
  };
  services: BookingServiceV2[];
  resources: BookingResourceV2[];
  rates: BookingRateV2[];
};

export type BookingSlotV2 = {
  starts_at: string;
  ends_at: string;
  amount_gross: number;
  service_id: string | null;
  resource_id: string | null;
};

export type BookingUnavailableDayV2 = {
  day: string;
  reason: "booked" | "blocked" | string;
};

export type BookingHoldV2 = {
  booking_id: string;
  starts_at: string;
  ends_at: string;
  base_amount_gross: number;
  fees_gross: number;
  deposit_gross: number;
  amount_gross: number;
  hold_expires_at: string;
};

export async function bookingPublicCatalogV2(offerId: string): Promise<BookingCatalogV2 | null> {
  const { data, error } = await supabase.schema("market").rpc("booking_public_catalog", { p_offer: offerId });
  if (error) throw error;
  return (data as BookingCatalogV2 | null) ?? null;
}

export async function bookingAvailableSlotsV2(
  offerId: string,
  from: Date,
  to: Date,
  serviceId?: string | null,
  resourceId?: string | null,
): Promise<BookingSlotV2[]> {
  const { data, error } = await supabase.schema("market").rpc("booking_available_slots_v2", {
    p_offer: offerId,
    p_service: serviceId ?? null,
    p_resource: resourceId ?? null,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  if (error) throw error;
  return (data ?? []) as BookingSlotV2[];
}

export async function bookingUnavailableDaysV2(
  offerId: string,
  fromDay: string,
  toDay: string,
  resourceId?: string | null,
): Promise<BookingUnavailableDayV2[]> {
  const rpc = resourceId ? "booking_unavailable_days_resource_v2" : "booking_unavailable_days_v2";
  const params = resourceId
    ? { p_offer: offerId, p_resource: resourceId, p_from: fromDay, p_to: toDay }
    : { p_offer: offerId, p_from: fromDay, p_to: toDay };
  const { data, error } = await supabase.schema("market").rpc(rpc, params);
  if (error) throw error;
  return (data ?? []) as BookingUnavailableDayV2[];
}

export async function createBookingHoldV2(params: {
  offerId: string;
  startsAt: Date;
  endsAt?: Date | null;
  serviceId?: string | null;
  resourceId?: string | null;
}): Promise<BookingHoldV2> {
  const { data, error } = await supabase.schema("market").rpc("create_booking_hold_v2", {
    p_offer: params.offerId,
    p_starts_at: params.startsAt.toISOString(),
    p_ends_at: params.endsAt?.toISOString() ?? null,
    p_service: params.serviceId ?? null,
    p_resource: params.resourceId ?? null,
  });
  if (error) throw error;
  const row = (data as BookingHoldV2[] | null)?.[0];
  if (!row) throw new Error("Nie udało się utworzyć rezerwacji");
  return row;
}

export async function bookingDailyQuoteV2(
  offerId: string,
  fromDay: string,
  toDay: string,
  resourceId?: string | null,
) {
  if (!fromDay || !toDay || toDay <= fromDay) return { days: 0, base: 0 };
  const rpc = resourceId ? "booking_daily_quote_resource_v2" : "booking_daily_quote_v2";
  const params = resourceId
    ? { p_offer: offerId, p_resource: resourceId, p_from: fromDay, p_to: toDay }
    : { p_offer: offerId, p_from: fromDay, p_to: toDay };
  const { data, error } = await supabase.schema("market").rpc(rpc, params);
  if (error) throw error;
  const row = (data as Array<{ days: number; base: number }> | null)?.[0];
  return { days: Number(row?.days ?? 0), base: Number(row?.base ?? 0) };
}