import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function VerifyOfferButton({offerId,kind}:{offerId:string;kind:"vehicle"|"property"}){
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState<string|null>(null);
  const price=kind==="vehicle"?"79,90 zł":"49,90 zł";
  async function start(){
    setErr(null);setBusy(true);
    const {data:{session}}=await supabase.auth.getSession();
    if(!session){
      const next=encodeURIComponent(window.location.pathname);
      window.location.href=`/login?next=${next}`;
      return;
    }
    const {data,error}=await supabase.functions.invoke("verify-checkout",{body:{offer_id:offerId,kind}});
    setBusy(false);
    if(error||!data?.url){setErr(error?.message||data?.error||"Nie udało się uruchomić płatności.");return;}
    window.location.href=data.url;
  }
  return <div className="fixed bottom-[calc(72px+env(safe-area-inset-bottom))] left-3 right-3 z-40 rounded-2xl p-3 shadow-2xl sm:bottom-[92px] sm:left-auto sm:right-4 sm:w-[min(360px,calc(100vw-40px))] sm:p-4" style={{background:"var(--header)",border:"1px solid rgba(232,137,26,.45)",color:"var(--ink)"}}>
    <div className="flex items-start gap-3"><div className="text-2xl">🛡️</div><div className="min-w-0 flex-1"><div className="font-semibold">Sunrise Verify</div><div className="mt-1 hidden text-xs leading-5 sm:block" style={{color:"var(--mut)"}}>{kind==="vehicle"?"Sprawdź dane i historię pojazdu przed zakupem.":"Zleć analizę danych nieruchomości przed zakupem."}</div></div><div className="text-sm font-bold" style={{color:"var(--gold)"}}>{price}</div></div>
    <button disabled={busy} onClick={start} className="mt-2 w-full rounded-xl py-2 text-sm font-semibold text-black disabled:opacity-60 sm:mt-3 sm:py-2.5" style={{background:"linear-gradient(135deg,#E8891A,#F5A623)"}}>{busy?"Przekierowanie…":"Zamów weryfikację"}</button>
    {err&&<div className="mt-2 text-xs text-red-400">{err}</div>}
  </div>;
}
