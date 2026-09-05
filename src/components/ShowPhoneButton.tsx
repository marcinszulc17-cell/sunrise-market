// „Pokaż numer” (decyzja właściciela 2026-09-06): numer sprzedawcy widoczny tylko po kliknięciu i tylko dla zalogowanych;
// sprzedawca włącza publikację w Centrum sprzedaży → Odbiór i kontakt (sellers.phone_public). Gość → logowanie.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Ico, CARD } from "./home/HomeShared";

export default function ShowPhoneButton({ offerId, className, style }: { offerId: string; className?: string; style?: React.CSSProperties }) {
  const navigate = useNavigate();
  const [has, setHas] = useState(false); const [phone, setPhone] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { let alive = true; supabase.rpc("offer_has_phone", { p_offer: offerId }).then(({ data }) => { if (alive) setHas(data === true); }); return () => { alive = false; }; }, [offerId]);
  if (!has) return null;
  async function reveal() {
    const { data: s } = await supabase.auth.getSession();
    if (!s.session) { navigate(`/login?next=${encodeURIComponent(window.location.pathname)}`); return; }
    setBusy(true); const { data } = await supabase.rpc("offer_seller_phone", { p_offer: offerId }); setBusy(false); setPhone((data as string) || null);
  }
  const cls = className ?? "flex h-12 items-center justify-center gap-2 rounded-xl text-sm font-semibold";
  return phone
    ? <a href={`tel:${phone.replace(/\s+/g, "")}`} className={cls} style={{ ...CARD, ...style }}><Ico name="phone" size={18} stroke="var(--gold)" />{phone}</a>
    : <button type="button" onClick={reveal} disabled={busy} className={cls} style={{ ...CARD, ...style }}><Ico name="phone" size={18} stroke="var(--gold)" />{busy ? "…" : "Pokaż numer"}</button>;
}
