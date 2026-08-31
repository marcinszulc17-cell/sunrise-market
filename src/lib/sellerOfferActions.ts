import { supabase } from "./supabase";

type SellerOfferActionResult = {
  ok?: boolean;
  error?: string;
  message?: string;
  status?: string;
  visible?: boolean;
  archived?: boolean;
};

function actionError(result: SellerOfferActionResult, fallback: string) {
  return new Error(result.message || result.error || fallback);
}

export async function setMyOfferVisibility(offerId: string, visible: boolean) {
  const { data, error } = await supabase.schema("market").rpc("set_my_offer_visibility", {
    p_offer: offerId,
    p_visible: visible,
  });
  if (error) throw error;
  const result = (data ?? {}) as SellerOfferActionResult;
  if (!result.ok) throw actionError(result, "Nie udało się zmienić widoczności oferty.");
  return result;
}

export async function deleteMyOffer(offerId: string) {
  const { data, error } = await supabase.schema("market").rpc("delete_my_offer", {
    p_offer: offerId,
  });
  if (error) throw error;
  const result = (data ?? {}) as SellerOfferActionResult;
  if (!result.ok) throw actionError(result, "Nie udało się usunąć oferty.");
  return result;
}
