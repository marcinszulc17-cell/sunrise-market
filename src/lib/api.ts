import { supabase } from "./supabase";
// Wyszukiwanie ofert (RPC search_offers w bazie — trgm + ilike)
export async function searchOffers(query: string | null, categorySlug: string | null = null) {
  const { data, error } = await supabase.rpc("search_offers", {
    p_query: query, p_category_slug: categorySlug, p_limit: 40,
  });
  if (error) throw error;
  return data ?? [];
}
// Szczegóły jednej oferty (RPC get_offer — security definer, omija RLS)
export async function getOffer(id: string) {
  const { data, error } = await supabase.rpc("get_offer", { p_id: id });
  if (error) throw error;
  return (data && data[0]) ?? null;
}
// Checkout przez edge function (kupujący z JWT; płaci z portfela, nalicza cashback, dostawa)
export async function checkout(items: { offer_id: string; qty: number }[], shippingCode?: string) {
  const { data, error } = await supabase.functions.invoke("checkout", { body: { items, shipping_code: shippingCode ?? null } });
  if (error) throw error;
  return data;
}

// ── Dostawa / cykl zamówienia ─────────────────────────────────────
export async function listShipping() {
  const { data, error } = await supabase.rpc("list_shipping"); if (error) throw error; return data ?? [];
}
export async function sellerOrders() {
  const { data, error } = await supabase.rpc("seller_orders"); if (error) throw error; return data ?? [];
}
export async function markShipped(orderId: string) {
  const { data, error } = await supabase.rpc("mark_shipped", { p_order: orderId }); if (error) throw error; return data as string;
}
export async function confirmDelivery(orderId: string) {
  const { error } = await supabase.rpc("confirm_delivery", { p_order: orderId }); if (error) throw error;
}
// ── Zwroty / reklamacje ───────────────────────────────────────────
export async function openReturn(orderId: string, reason: string) {
  const { data, error } = await supabase.rpc("open_return", { p_order: orderId, p_reason: reason }); if (error) throw error; return data;
}
export async function myReturns() {
  const { data, error } = await supabase.rpc("my_returns"); if (error) throw error; return data ?? [];
}
export async function listReturns() {
  const { data, error } = await supabase.rpc("list_returns"); if (error) throw error; return data ?? [];
}
export async function resolveReturn(returnId: string, approve: boolean) {
  const { error } = await supabase.rpc("resolve_return", { p_return: returnId, p_approve: approve }); if (error) throw error;
}

// ── Akcje operatora: KYC + moderacja ──────────────────────────────
export async function amiOperator(): Promise<boolean> {
  const { data, error } = await supabase.rpc("ami_operator"); if (error) return false; return data === true;
}
// Czy zalogowany użytkownik jest sprzedawcą (mapowanie po e-mailu)
export async function mySeller() {
  const { data, error } = await supabase.rpc("my_seller"); if (error) throw error; return (data && data[0]) ?? null;
}
export async function listPendingSellers() {
  const { data, error } = await supabase.rpc("list_pending_sellers"); if (error) throw error; return data ?? [];
}
export async function reviewSeller(sellerId: string, approve: boolean) {
  const { error } = await supabase.rpc("review_seller", { p_seller: sellerId, p_approve: approve }); if (error) throw error;
}
export async function listOffersAdmin() {
  const { data, error } = await supabase.rpc("list_offers_admin"); if (error) throw error; return data ?? [];
}
export async function moderateOffer(offerId: string, hide: boolean) {
  const { error } = await supabase.rpc("moderate_offer", { p_offer: offerId, p_hide: hide }); if (error) throw error;
}

// ── Przychody / cennik / operator / promocje / powiadomienia ──────
export async function pricingList() {
  const { data, error } = await supabase.rpc("pricing_list"); if (error) throw error; return data;
}
export async function operatorConsole() {
  const { data, error } = await supabase.rpc("operator_console"); if (error) throw error; return data;
}
export async function mySubscription() {
  const { data, error } = await supabase.rpc("my_subscription"); if (error) throw error; return (data && data[0]) ?? null;
}
export async function homePromoted() {
  const { data, error } = await supabase.rpc("home_promoted"); if (error) throw error; return data ?? [];
}
export async function activeHomeBanner() {
  const { data, error } = await supabase.rpc("active_home_banner"); if (error) throw error; return (data && data[0]) ?? null;
}
export async function promoteOffer(offerId: string, days: number) {
  const { data, error } = await supabase.rpc("my_promote_offer", { p_offer: offerId, p_days: days });
  if (error) throw error; return Number(data);
}
export async function myNotifications() {
  const { data, error } = await supabase.rpc("my_notifications"); if (error) throw error; return data ?? [];
}
export async function markNotificationsRead() {
  const { error } = await supabase.rpc("mark_notifications_read"); if (error) throw error;
}

// ── Zamówienia kupującego ─────────────────────────────────────────
export async function myOrders() {
  const { data, error } = await supabase.rpc("my_orders");
  if (error) throw error;
  return data ?? [];
}

// ── Opinie ────────────────────────────────────────────────────────
export async function offerReviews(offerId: string) {
  const { data, error } = await supabase.rpc("offer_reviews", { p_offer: offerId });
  if (error) throw error;
  return data ?? [];
}
export async function addReview(offerId: string, rating: number, comment: string) {
  const { error } = await supabase.rpc("add_review_simple", { p_offer: offerId, p_rating: rating, p_comment: comment });
  if (error) throw error;
}

// ── Panel sprzedawcy ──────────────────────────────────────────────
export async function becomeSeller(legalName: string, nip: string, accept: boolean) {
  const { data, error } = await supabase.rpc("become_seller", { p_legal_name: legalName, p_nip: nip || null, p_accept: accept });
  if (error) throw error;
  return data as string;
}
export async function myOffers() {
  const { data, error } = await supabase.rpc("my_offers");
  if (error) throw error;
  return data ?? [];
}
export async function createOffer(args: { title: string; description: string; price: number; stock: number; categorySlug: string; imageUrl?: string }) {
  const { data, error } = await supabase.rpc("create_offer", {
    p_title: args.title, p_description: args.description, p_price: args.price,
    p_stock: args.stock, p_category_slug: args.categorySlug, p_image_url: args.imageUrl ?? null,
  });
  if (error) throw error;
  return data as string;
}
// Upload zdjęcia produktu do Storage (publiczny bucket) → zwraca publiczny URL
export async function uploadProductImage(file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("product-images").upload(path, file, { upsert: false });
  if (error) throw error;
  return supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
}
// Saldo portfela zalogowanego (kupujący/sprzedawca)
export async function myBalance(): Promise<number> {
  const { data, error } = await supabase.rpc("my_balance");
  if (error) throw error;
  return Number(data ?? 0);
}
// Kategorie (drzewo) — do formularza oferty
export async function topCategories() {
  const { data, error } = await supabase.from("categories").select("id,slug,name").is("parent_id", null).order("sort_order");
  if (error) throw error;
  return data ?? [];
}
export async function childCategories(parentId: string) {
  const { data, error } = await supabase.from("categories").select("id,slug,name").eq("parent_id", parentId).order("sort_order");
  if (error) throw error;
  return data ?? [];
}

// Zapytanie do Suri (edge function: fakty z bazy + Claude)
export async function askSuri(message: string, sessionId?: string, userId?: string) {
  const { data, error } = await supabase.functions.invoke("suri-commerce",
    { body: { message, session_id: sessionId, user_id: userId } });
  if (error) throw error;
  return data;
}
