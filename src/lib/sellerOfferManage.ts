import { supabase } from "./supabase";

export type ManagedOffer = {
  offer_id: string;
  title: string;
  description: string | null;
  price_gross: number;
  stock: number;
  status: string;
  category: string;
  commission_model: "cashback_only" | "mlm_full";
  attributes: Record<string, unknown>;
  image_urls: string[];
};

export async function getOfferForManage(offerId: string): Promise<ManagedOffer> {
  const { data, error } = await supabase.rpc("get_offer_for_manage", { p_offer: offerId });
  if (error) throw error;
  const row = (data as ManagedOffer[] | null)?.[0];
  if (!row) throw new Error("Nie znaleziono oferty albo nie masz do niej dostępu.");
  return row;
}

export async function updateOfferManage(args: {
  offerId: string;
  title: string;
  description: string;
  price: number;
  stock: number;
  imageUrls: string[];
  commissionModel: "cashback_only" | "mlm_full";
  attributes?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await supabase.rpc("update_offer_manage", {
    p_offer: args.offerId,
    p_title: args.title,
    p_description: args.description,
    p_price: args.price,
    p_stock: args.stock,
    p_image_urls: args.imageUrls,
    p_commission_model: args.commissionModel,
    p_attributes: args.attributes ?? {},
  });
  if (error) throw error;
}
