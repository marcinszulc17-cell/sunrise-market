import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function SaleConfirmation(){
  const { token } = useParams();
  const [info,setInfo]=useState<any>(null);
  const [loading,setLoading]=useState(true);
  const [done,setDone]=useState(false);
  const [err,setErr]=useState<string|null>(null);

  useEffect(()=>{
    if(!token){setLoading(false);setErr("Brak linku potwierdzającego.");return;}
    supabase.rpc("sale_confirmation_info",{p_token:token}).then(({data,error})=>{
      if(error) setErr(error.message); else setInfo((data&&data[0])||null);
      setLoading(false);
    });
  },[token]);

  async function confirm(){
    if(!token)return;
    const {data,error}=await supabase.rpc("confirm_offer_sale",{p_token:token});
    if(error){setErr(error.message);return;}
    if(data===true) setDone(true); else setErr("To potwierdzenie jest już wykorzystane albo nieważne.");
  }

  return <main className="min-h-screen grid place-items-center px-4" style={{background:"var(--bg)",color:"var(--ink)"}}>
    <div className="w-full max-w-xl rounded-3xl p-6 sm:p-8" style={{background:"var(--glass)",border:"1px solid var(--line)"}}>
      <div className="text-sm font-semibold" style={{color:"var(--gold)"}}>SUNRISE MARKET</div>
      {loading?<div className="mt-6" style={{color:"var(--mut)"}}>Ładowanie…</div>:done?<><div className="mt-6 text-5xl">✅</div><h1 className="mt-4 text-3xl font-semibold">Sprzedaż potwierdzona</h1><p className="mt-3" style={{color:"var(--mut)"}}>Dziękujemy. Potwierdzenie zostało zapisane w Sunrise Market.</p><a href="/" className="mt-6 inline-block rounded-xl px-5 py-3 font-semibold text-black" style={{background:"linear-gradient(135deg,#E8891A,#F5A623)"}}>Wróć do Marketu</a></>:err?<><h1 className="mt-6 text-2xl font-semibold">Nie udało się potwierdzić</h1><p className="mt-3 text-sm" style={{color:"var(--mut)"}}>{err}</p></>:info?<><h1 className="mt-6 text-3xl font-semibold">Potwierdź zakup</h1><p className="mt-3 leading-7" style={{color:"var(--mut)"}}>Sprzedawca <b style={{color:"var(--ink)"}}>{info.seller}</b> oznaczył ofertę jako sprzedaną. Potwierdź tylko wtedy, jeśli faktycznie kupiłeś tę ofertę.</p><div className="mt-5 rounded-2xl p-4" style={{border:"1px solid var(--line)"}}><div className="text-xs" style={{color:"var(--mut)"}}>Oferta</div><div className="mt-1 font-semibold">{info.title}</div></div><button onClick={confirm} className="mt-6 w-full rounded-xl py-3 font-semibold text-black" style={{background:"linear-gradient(135deg,#E8891A,#F5A623)"}}>Tak, kupiłem tę ofertę</button><p className="mt-3 text-xs leading-5" style={{color:"var(--mut)"}}>Potwierdzenie służy wyłącznie do oznaczenia sprzedaży w statystykach Sunrise Market.</p></>:<><h1 className="mt-6 text-2xl font-semibold">Link jest nieważny</h1></>}
    </div>
  </main>;
}
