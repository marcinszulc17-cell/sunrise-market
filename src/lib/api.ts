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
// Zapytanie do Suri (edge function: fakty z bazy + Claude)
export async function askSuri(message: string, sessionId?: string, userId?: string) {
  const { data, error } = await supabase.functions.invoke("suri-commerce",
    { body: { message, session_id: sessionId, user_id: userId } });
  if (error) throw error;
  return data;
}
