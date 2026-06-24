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
// Checkout przez edge function (kupujący z JWT; płaci z portfela, nalicza cashback)
export async function checkout(items: { offer_id: string; qty: number }[]) {
  const { data, error } = await supabase.functions.invoke("checkout", { body: { items } });
  if (error) throw error;
  return data;
}
// ── Panel sprzedawcy ──────────────────────────────────────────────
export async function becomeSeller(legalName: string, nip?: string) {
  const { data, error } = await supabase.rpc("become_seller", { p_legal_name: legalName, p_nip: nip ?? null });
  if (error) throw error;
  return data as string;
}
export async function myOffers() {
  const { data, error } = await supabase.rpc("my_offers");
  if (error) throw error;
  return data ?? [];
}
export async function createOffer(args: { title: string; description: string; price: number; stock: number; categorySlug: string }) {
  const { data, error } = await supabase.rpc("create_offer", {
    p_title: args.title, p_description: args.description, p_price: args.price,
    p_stock: args.stock, p_category_slug: args.categorySlug,
  });
  if (error) throw error;
  return data as string;
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
