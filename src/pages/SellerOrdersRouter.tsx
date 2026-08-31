import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import SellerOrders from "./SellerOrders";
import PrivatePartnerSales from "./PrivatePartnerSales";

export default function SellerOrdersRouter() {
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
  if (type === "private_partner") return <PrivatePartnerSales />;
  return <SellerOrders />;
}
