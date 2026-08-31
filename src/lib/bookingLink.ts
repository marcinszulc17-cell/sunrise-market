export function offerDetailHref(offerId: string, booking = false): string {
  const base = `/produkt/${offerId}`;
  return booking ? `${base}?booking=1` : base;
}

export function shouldAutoOpenBooking(search: string): boolean {
  try {
    const params = new URLSearchParams(search);
    return params.get("booking") === "1";
  } catch {
    return false;
  }
}
