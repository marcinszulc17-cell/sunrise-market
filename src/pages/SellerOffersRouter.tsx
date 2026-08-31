import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import SellerOffersManage from "./SellerOffersManage";
import PrivateSellerOffers from "./PrivateSellerOffers";

export default function SellerOffersRouter() {
  const [type, setType] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setType(null); return; }
      const { data, error } = await supabase.rpc("my_trade_partner_status");
      if (error) { setType(null); return; }
      setType((data?.[0]?.seller_type as string | undefined) ?? null);
    })();
  }, []);

  if (type === undefined) return <div className="mx-auto max-w-5xl px-4 py-8">Ładowanie…</div>;
  if (type === "private_partner") return <PrivateSellerOffers />;
  return <SellerOffersManage />;
}
