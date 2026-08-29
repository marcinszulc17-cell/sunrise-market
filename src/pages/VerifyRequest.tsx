import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

type Req={id:string;offer_id:string;kind:"vehicle"|"property";status:string;price_gross:number;result:any;error_message:string|null;created_at:string;updated_at:string};
const labels:Record<string,string>={payment_pending:"Oczekuje na płatność",paid:"Opłacone",processing:"Weryfikacja w toku",ready:"Raport gotowy",failed:"Nie udało się przygotować raportu",cancelled:"Anulowane",draft:"Szkic"};
export default function VerifyRequest(){
 const {id}=useParams(); const [sp]=useSearchParams(); const [r,setR]=useState<Req|null>(null); const [busy,setBusy]=useState(true); const [err,setErr]=useState<string|null>(null);
 async function load(){
  if(!id)return; setBusy(true); setErr(null);
  const {data:{session}}=await supabase.auth.getSession();
  if(!session){window.location.href=`/login?next=${encodeURIComponent(window.location.pathname+window.location.search)}`;return;}
  const {data,error}=await supabase.functions.invoke("verify-status",{body:{request_id:id,session_id:sp.get("session_id")||null}});
  setBusy(false); if(error||!data?.request){setErr(error?.message||data?.error||"Nie udało się pobrać zlecenia.");return;} setR(data.request);
 }
 useEffect(()=>{load();},[id]);
 if(busy)return <main className="min-h-screen px-4 py-12" style={{background:"var(--bg)",color:"var(--mut)"}}>Sprawdzam płatność i status weryfikacji…</main>;
 return <main className="min-h-screen px-4 py-10" style={{background:"var(--bg)",color:"var(--ink)"}}><div className="mx-auto max-w-2xl">
  <Link to={r?`/produkt/${r.offer_id}`:"/"} className="text-sm" style={{color:"var(--gold)"}}>← Wróć do ogłoszenia</Link>
  <div className="mt-5 rounded-3xl p-6 sm:p-8" style={{background:"var(--glass)",border:"1px solid var(--line)"}}>
   <div className="text-sm font-semibold" style={{color:"var(--gold)"}}>🛡 SUNRISE VERIFY</div><h1 className="mt-2 text-3xl font-semibold">{r?.kind==="property"?"Weryfikacja nieruchomości":"Weryfikacja pojazdu"}</h1>
   {err?<div className="mt-5 rounded-xl p-4 text-sm text-red-400" style={{border:"1px solid rgba(239,68,68,.3)"}}>{err}</div>:r&&<>
    <div className="mt-6 rounded-2xl p-5" style={{background:"rgba(200,150,90,.08)",border:"1px solid rgba(200,150,90,.22)"}}><div className="text-xs" style={{color:"var(--mut)"}}>Status</div><div className="mt-1 text-xl font-semibold">{labels[r.status]||r.status}</div><div className="mt-2 text-sm" style={{color:"var(--mut)"}}>Cena usługi: {Number(r.price_gross).toLocaleString("pl-PL",{minimumFractionDigits:2})} zł</div></div>
    {r.status==="processing"&&<div className="mt-5 text-sm leading-6" style={{color:"var(--mut)"}}>Płatność została potwierdzona. Zlecenie trafiło do kolejki Sunrise Verify. Po podłączeniu źródła danych raport zostanie w tym miejscu uzupełniony automatycznie.</div>}
    {r.status==="ready"&&<div className="mt-5 rounded-2xl p-5" style={{border:"1px solid rgba(122,184,154,.3)"}}><div className="font-semibold">Raport gotowy</div><pre className="mt-3 whitespace-pre-wrap text-sm">{JSON.stringify(r.result,null,2)}</pre></div>}
    {r.status==="failed"&&<div className="mt-5 text-sm text-red-400">{r.error_message||"Raport nie został przygotowany. Skontaktuj się z obsługą."}</div>}
    <button onClick={load} className="mt-6 rounded-xl px-4 py-2 text-sm font-semibold" style={{border:"1px solid var(--line)"}}>Odśwież status</button>
   </>}
  </div>
 </div></main>;
}
