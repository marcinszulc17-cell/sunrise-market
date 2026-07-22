import { supabase } from "./supabase";
// Wyszukiwanie ofert (RPC search_offers w bazie — trgm + ilike)
export type SearchOpts = { sort?: string; priceMin?: number | null; priceMax?: number | null; limit?: number };
export async function searchOffers(query: string | null, categorySlug: string | null = null, opts: SearchOpts = {}) {
  const { data, error } = await supabase.rpc("search_offers", {
    p_query: query, p_category_slug: categorySlug,
    p_price_min: opts.priceMin ?? null, p_price_max: opts.priceMax ?? null,
    p_sort: opts.sort ?? null, p_limit: opts.limit ?? 40,
  });
  if (error) throw error;
  return data ?? [];
}
// ── Lista życzeń (watchlist) ──────────────────────────────────────
export async function toggleWatch(offerId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("toggle_watch", { p_offer: offerId }); if (error) throw error; return data === true;
}
export async function watchedIds(): Promise<string[]> {
  const { data, error } = await supabase.rpc("watched_ids"); if (error) return []; return (data ?? []) as string[];
}
export async function myWatchlist() {
  const { data, error } = await supabase.rpc("my_watchlist"); if (error) return [];
  return (data ?? []).map((r: any) => (typeof r === "string" ? JSON.parse(r) : r));
}
// Liczniki produktów per kategoria (z rolowaniem do przodków) + suma
export async function categoryCounts(): Promise<{ byId: Record<string, number>; total: number }> {
  const { data, error } = await supabase.rpc("category_counts");
  if (error) return { byId: {}, total: 0 };
  const byId: Record<string, number> = {}; let total = 0;
  for (const r of (data ?? []) as any[]) { byId[r.id] = Number(r.total_cnt); total = Number(r.grand_total); }
  return { byId, total };
}
// Personalizacja: zapis obejrzenia, rekomendacje „dla Ciebie", podobne produkty
export async function trackView(offerId: string) {
  try { await supabase.rpc("track_view", { p_offer: offerId }); } catch { /* niezalogowany — pomiń */ }
}
export async function recommendedOffers(limit = 12) {
  const { data, error } = await supabase.rpc("recommended_offers", { p_limit: limit });
  if (error) return [];
  return (data ?? []).map((r: any) => (typeof r === "string" ? JSON.parse(r) : r));
}
export async function similarOffers(offerId: string, limit = 8) {
  const { data, error } = await supabase.rpc("similar_offers", { p_offer: offerId, p_limit: limit });
  if (error) return [];
  return (data ?? []).map((r: any) => (typeof r === "string" ? JSON.parse(r) : r));
}
// Szczegóły jednej oferty (RPC get_offer — security definer, omija RLS)
export async function getOffer(id: string) {
  const { data, error } = await supabase.rpc("get_offer", { p_id: id });
  if (error) throw error;
  return (data && data[0]) ?? null;
}
// Galeria zdjęć oferty (główne + dodatkowe)
export async function offerImages(id: string): Promise<string[]> {
  const { data, error } = await supabase.rpc("offer_images", { p_offer: id });
  if (error) return [];
  return (data ?? []).map((r: any) => r.url);
}
// Checkout przez edge function (kupujący z JWT; płaci z portfela, nalicza cashback, dostawa)
export type ShipAddress = { name: string; phone: string; street: string; city: string; postal: string; country?: string };
export async function checkout(items: { offer_id: string; qty: number }[], shippingCodes?: string[], shipping?: ShipAddress) {
  const { data, error } = await supabase.functions.invoke("checkout", { body: { items, shipping_codes: shippingCodes ?? [], shipping: shipping ?? null } });
  if (error) throw error;
  return data;
}

// ── Dostawa / cykl zamówienia ─────────────────────────────────────
export async function listShipping() {
  const { data, error } = await supabase.rpc("list_shipping"); if (error) throw error; return data ?? [];
}
// Metody dostawy z torami (ours/seller) — koszyk hybrydowy
export type ShipMethod = { code: string; name: string; carrier: string | null; price_gross: number; lanes: string[] };
export async function listShippingLanes(): Promise<ShipMethod[]> {
  const { data, error } = await supabase.rpc("list_shipping_v2"); if (error) return [];
  return (data ?? []) as ShipMethod[];
}
// Tor realizacji + ETA dla ofert w koszyku
export type CartLane = { offer_id: string; lane: "ours" | "seller"; provider: string; eta: string };
export async function cartLanes(ids: string[]): Promise<CartLane[]> {
  if (!ids.length) return [];
  const { data, error } = await supabase.rpc("cart_lanes", { p_ids: ids }); if (error) return [];
  return (data ?? []) as CartLane[];
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

// ── Historia portfela + podsumowanie sprzedawcy ───────────────────
export async function walletHistory() {
  const { data, error } = await supabase.rpc("wallet_history"); if (error) return []; return data ?? [];
}
export async function sellerSummary() {
  const { data, error } = await supabase.rpc("seller_summary"); if (error) return null; return (data && data[0]) ?? null;
}

// ── Back-office admina ────────────────────────────────────────────
export async function adminOverview() {
  const { data, error } = await supabase.rpc("admin_overview"); if (error) throw error; return data ?? {};
}
export async function adminOrders(status?: string, search?: string) {
  const { data, error } = await supabase.rpc("admin_orders", { p_status: status ?? null, p_search: search ?? null, p_limit: 200 }); if (error) throw error; return data ?? [];
}
export async function adminOrderItems(orderId: string) {
  const { data, error } = await supabase.rpc("admin_order_items", { p_order: orderId }); if (error) return []; return data ?? [];
}
export async function adminSetOrderStatus(orderId: string, status: string) {
  const { error } = await supabase.rpc("admin_set_order_status", { p_order: orderId, p_status: status }); if (error) throw error;
}
export async function adminCustomers(search?: string) {
  const { data, error } = await supabase.rpc("admin_customers", { p_search: search ?? null, p_limit: 200 }); if (error) throw error; return data ?? [];
}
export async function adminSellers(search?: string) {
  const { data, error } = await supabase.rpc("admin_sellers", { p_search: search ?? null, p_limit: 200 }); if (error) throw error; return data ?? [];
}
export async function adminSetSellerStatus(sellerId: string, status: string) {
  const { error } = await supabase.rpc("admin_set_seller_status", { p_seller: sellerId, p_status: status }); if (error) throw error;
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

// ── Most fulfillmentu TeemDrop (operator) ─────────────────────────
export async function listBridgeOrders() {
  const { data, error } = await supabase.rpc("list_bridge_orders"); if (error) throw error; return data ?? [];
}
export async function retryBridgeOrder(bridgeId: string) {
  const { error } = await supabase.rpc("retry_bridge_order", { p_bridge: bridgeId }); if (error) throw error;
}
// Kolejka mostu z danymi zamówienia + bezpieczny auto-przekaz do TeemDrop
export async function bridgeQueue() {
  const { data, error } = await supabase.rpc("bridge_queue"); if (error) throw error; return data ?? [];
}
export async function getAutoForward(): Promise<boolean> {
  const { data, error } = await supabase.rpc("get_auto_forward"); if (error) return false; return data === true;
}
export async function setAutoForward(on: boolean): Promise<boolean> {
  const { data, error } = await supabase.rpc("set_auto_forward", { p_on: on }); if (error) throw error; return data === true;
}
export async function approveBridgeForward(bridgeId: string) {
  const { error } = await supabase.rpc("approve_bridge_forward", { p_bridge: bridgeId }); if (error) throw error;
}
export async function rejectBridgeForward(bridgeId: string) {
  const { error } = await supabase.rpc("reject_bridge_forward", { p_bridge: bridgeId }); if (error) throw error;
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
// Saldo portfela zalogowanego (kupujący/sprzedawca) — lokalny mirror (fallback)
export async function myBalance(): Promise<number> {
  const { data, error } = await supabase.rpc("my_balance");
  if (error) throw error;
  return Number(data ?? 0);
}
// ŻYWE saldo Sunrise Pay z MySunrise (server-to-server, źródło prawdy)
export type WalletLive = { linked: boolean; balance: number; points: number; gold: number | null; currency: string };
export async function walletBalance(): Promise<WalletLive> {
  const { data, error } = await supabase.functions.invoke("wallet-balance", { body: {} });
  if (error || !data) return { linked: false, balance: 0, points: 0, gold: null, currency: "PLN" };
  return data as WalletLive;
}
// ŻYWE saldo sprzedawcy z MySunrise (auto-detekcja: available=false gdy endpoint jeszcze nie wdrożony)
export type SellerWallet = { available: boolean; sunrise_pay?: number; gold?: number | null; pending?: number; withdraw_enabled?: boolean; reason?: string };
export async function sellerWallet(): Promise<SellerWallet> {
  const { data, error } = await supabase.functions.invoke("wallet-seller-balance", { body: {} });
  if (error || !data) return { available: false };
  return data as SellerWallet;
}
// Program poleceń fotowoltaiki (cross-business). Kredyt do portfela Sunrise Pay
// za polecenie, które zamieni się w umowę — funduje go biznes energetyczny, nie
// marża Marketu, i wpada do portfela WEWNĘTRZNIE (bez opłaty Stripe). Gdy backend
// energii/MySunrise nie gotowy → available:false, UI degraduje się (jak sellerWallet).
export type EnergyReferral = {
  available: boolean;
  code?: string;        // osobisty kod polecenia
  link?: string;        // gotowy link do udostępnienia
  reward_pct?: number;  // % wartości transakcji trafiający na portfel (produkty własne, np. foto)
  pending?: number;     // polecenia w toku
  converted?: number;   // polecenia zamienione w umowę
  credited?: number;    // suma zł już skredytowana do portfela
};
export async function energyReferral(): Promise<EnergyReferral> {
  const { data, error } = await supabase.functions.invoke("energy-referral", { body: {} });
  if (error || !data) return { available: false };
  return data as EnergyReferral;
}

// ── Dropshipping CJ (operator) ────────────────────────────────────
// Import katalogu CJ (oferty lądują jako draft), przegląd i aktywacja.
export async function cjImport(opts: { page?: number; pageSize?: number; categoryKeyword?: string } = {}) {
  const { data, error } = await supabase.functions.invoke("cj-import-feed", { body: opts });
  if (error) throw error;
  return data;
}
export type CjDraft = { id: string; title: string; price_gross: number; image_url: string | null; status: string; created_at: string };
export async function cjDrafts(): Promise<CjDraft[]> {
  const { data, error } = await supabase.functions.invoke("cj-admin", { body: { action: "list" } });
  if (error) throw error;
  return (data?.items ?? []) as CjDraft[];
}
export async function cjSetStatus(offerId: string, status: "active" | "draft" | "blocked") {
  const { error } = await supabase.functions.invoke("cj-admin", { body: { action: "set", offer_id: offerId, status } });
  if (error) throw error;
}
export async function cjActivateAll(): Promise<number> {
  const { data, error } = await supabase.functions.invoke("cj-admin", { body: { action: "activateAll" } });
  if (error) throw error;
  return Number(data?.activated ?? 0);
}
// Statystyki per produkt CJ: koszt, marża brutto (bez wysyłki), wyświetlenia, sprzedane, przychód.
export type CjStat = { id: string; title: string; price_gross: number; image_url: string | null; status: string; cost_zl: number; margin_zl: number; margin_pct: number; market_price: number | null; competitor_margin_zl: number | null; edge_zl: number | null; views: number; sold: number; revenue: number };
export async function cjStats(): Promise<CjStat[]> {
  const { data, error } = await supabase.functions.invoke("cj-admin", { body: { action: "stats" } });
  if (error) throw error;
  return (data?.items ?? []) as CjStat[];
}
export type CatalogStat = CjStat & { provider: string };
export async function catalogStats(opts: { provider?: string | null; search?: string | null; sort?: string; limit?: number; offset?: number } = {}): Promise<CatalogStat[]> {
  const { data, error } = await supabase.functions.invoke("cj-admin", { body: { action: "catalog_stats", provider: opts.provider ?? null, search: opts.search ?? null, sort: opts.sort ?? "sold", limit: opts.limit ?? 200, offset: opts.offset ?? 0 } });
  if (error) throw error;
  return (data?.items ?? []) as CatalogStat[];
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

// ── Sunrise Smart (abonament darmowych wysyłek) ──
export async function smartStatus(): Promise<boolean> {
  const { data } = await supabase.from("smart_members").select("expires_at,active").maybeSingle();
  if (!data || !(data as any).active) return false;
  const exp = (data as any).expires_at;
  return !exp || new Date(exp) > new Date();
}
export async function smartSubscribe() {
  const { data, error } = await supabase.functions.invoke("smart-subscribe", { body: {} });
  if (error) throw error; return data;
}
// ── Reklamy ──
export async function adRates() {
  const { data, error } = await supabase.rpc("ad_rates_list");
  if (error) return []; return data ?? [];
}
export async function adBuy(rate_code: string, offer_id: string, budget?: number) {
  const { data, error } = await supabase.functions.invoke("ad-buy", { body: { rate_code, offer_id, budget } });
  if (error) throw error; return data;
}
export async function sponsoredOffers(placement = "search", category: string | null = null, limit = 6) {
  const { data, error } = await supabase.rpc("sponsored_offers", { p_placement: placement, p_category: category, p_limit: limit });
  if (error) return []; return data ?? [];
}

export async function genDescription(title: string, category?: string, mode?: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("gen-description", { body: { title, category, mode } });
  if (error) throw error; return (data as any)?.description ?? "";
}
