import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

type Req={id:string;offer_id:string;kind:"vehicle"|"property";status:string;price_gross:number;result:any;error_message:string|null;created_at:string;updated_at:string};
const labels:Record<string,string>={payment_pending:"Oczekuje na płatność",paid:"Opłacone",processing:"Weryfikacja w toku",ready:"Raport gotowy",failed:"Nie udało się przygotować raportu",cancelled:"Anulowane",draft:"Szkic"};
const yn=(v:any)=>v===true?"Zgodne":v===false?"Niezgodne":"Brak danych";

export default function VerifyRequest(){
 const {id}=useParams(); const [sp]=useSearchParams(); const [r,setR]=useState<Req|null>(null); const [busy,setBusy]=useState(true); const [err,setErr]=useState<string|null>(null);
 async function load(silent=false){
  if(!id)return; if(!silent)setBusy(true); setErr(null);
  const {data:{session}}=await supabase.auth.getSession();
  if(!session){window.location.href=`/login?next=${encodeURIComponent(window.location.pathname+window.location.search)}`;return;}
  const {data,error}=await supabase.functions.invoke("verify-status",{body:{request_id:id,session_id:sp.get("session_id")||null}});
  if(!silent)setBusy(false); if(error||!data?.request){setErr(error?.message||data?.error||"Nie udało się pobrać zlecenia.");return;} setR(data.request);
 }
 useEffect(()=>{load();},[id]);
 useEffect(()=>{if(!r||!["paid","processing"].includes(r.status))return;const t=setInterval(()=>load(true),4000);return()=>clearInterval(t)},[r?.status,id]);
 const score=Number(r?.result?.validation?.score ?? NaN);
 const checks=useMemo(()=>Array.isArray(r?.result?.validation?.checks)?r!.result.validation.checks:[],[r]);
 const warnings=useMemo(()=>Array.isArray(r?.result?.warnings)?r!.result.warnings:[],[r]);
 if(busy)return <main className="min-h-screen px-4 py-12" style={{background:"var(--bg)",color:"var(--mut)"}}>Sprawdzam płatność i status weryfikacji…</main>;
 return <main className="min-h-screen px-4 py-10" style={{background:"var(--bg)",color:"var(--ink)"}}><div className="mx-auto max-w-4xl">
  <Link to={r?`/produkt/${r.offer_id}`:"/"} className="text-sm" style={{color:"var(--gold)"}}>← Wróć do ogłoszenia</Link>
  <div className="mt-5 overflow-hidden rounded-3xl" style={{background:"var(--glass)",border:"1px solid var(--line)"}}>
   <div className="p-6 sm:p-8" style={{background:"linear-gradient(135deg,rgba(232,137,26,.14),rgba(56,224,240,.05))"}}><div className="text-sm font-semibold tracking-[.15em]" style={{color:"var(--gold)"}}>🛡 SUNRISE VERIFY</div><h1 className="mt-2 text-3xl font-semibold">{r?.kind==="property"?"Raport nieruchomości":"Raport pojazdu"}</h1><p className="mt-2 text-sm" style={{color:"var(--mut)"}}>Niezależna warstwa sprawdzająca dane oferty w dostępnych źródłach i wskazująca różnice, zanim podejmiesz decyzję.</p></div>
   <div className="p-6 sm:p-8">
   {err?<div className="rounded-xl p-4 text-sm text-red-400" style={{border:"1px solid rgba(239,68,68,.3)"}}>{err}</div>:r&&<>
    <div className="grid gap-3 sm:grid-cols-3"><Box label="Status" value={labels[r.status]||r.status}/><Box label="Cena usługi" value={`${Number(r.price_gross).toLocaleString("pl-PL",{minimumFractionDigits:2})} zł`}/><Box label="Wygenerowano" value={r.result?.generated_at?new Date(r.result.generated_at).toLocaleString("pl-PL"):"—"}/></div>

    {["paid","processing"].includes(r.status)&&<div className="mt-6 rounded-2xl p-5" style={{background:"rgba(56,224,240,.07)",border:"1px solid rgba(56,224,240,.2)"}}><div className="flex items-center gap-3"><span className="h-3 w-3 animate-pulse rounded-full" style={{background:"var(--gold)"}}/><b>Automatyczna weryfikacja trwa</b></div><p className="mt-2 text-sm leading-6" style={{color:"var(--mut)"}}>System odpytuje dostępne źródła i sam odświeży ten ekran, gdy raport będzie gotowy.</p></div>}

    {r.status==="ready"&&<>
      <div className="mt-6 grid gap-4 lg:grid-cols-[240px_1fr]">
        <div className="rounded-2xl p-5 text-center" style={{border:"1px solid rgba(122,184,154,.3)",background:"rgba(122,184,154,.07)"}}><div className="text-xs" style={{color:"var(--mut)"}}>Zgodność danych</div><div className="mt-2 text-5xl font-bold" style={{color:Number.isFinite(score)&&score>=90?"var(--green)":"var(--gold)"}}>{Number.isFinite(score)?`${score}%`:"—"}</div><div className="mt-2 text-xs" style={{color:"var(--mut)"}}>Dotyczy wyłącznie pól, które udało się porównać.</div></div>
        <div className="rounded-2xl p-5" style={{border:"1px solid var(--line)"}}><div className="text-sm font-semibold">Podsumowanie</div><p className="mt-2 leading-7">{r.result?.summary||"Raport został przygotowany."}</p><div className="mt-4 flex flex-wrap gap-2">{Object.entries(r.result?.coverage||{}).map(([k,v])=><span key={k} className="rounded-full px-3 py-1 text-xs" style={{background:v?"rgba(122,184,154,.12)":"rgba(232,137,26,.12)",color:v?"var(--green)":"var(--gold)"}}>{v?"✓":"○"} {coverageLabel(k)}</span>)}</div></div>
      </div>

      {checks.length>0&&<section className="mt-6"><h2 className="text-xl font-semibold">Porównanie danych</h2><div className="mt-3 overflow-hidden rounded-2xl" style={{border:"1px solid var(--line)"}}>{checks.map((c:any,i:number)=><div key={`${c.label}-${i}`} className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[1.2fr_1fr_1fr_auto]" style={{borderBottom:i<checks.length-1?"1px solid var(--line)":"none"}}><b>{c.label}</b><span><span className="text-xs" style={{color:"var(--mut)"}}>Oferta</span><br/>{String(c.expected??"—")}</span><span><span className="text-xs" style={{color:"var(--mut)"}}>Źródło</span><br/>{String(c.actual??"—")}</span><span className="font-semibold" style={{color:c.match===true?"var(--green)":c.match===false?"#fca5a5":"var(--mut)"}}>{yn(c.match)}</span></div>)}</div></section>}

      {r.kind==="vehicle"&&<section className="mt-6 grid gap-3 sm:grid-cols-2"><SourceCard title="Identyfikacja VIN" ok={Boolean(r.result?.coverage?.vin_identity||r.result?.coverage?.vin_decode)} text="Dekoder VIN służy do potwierdzenia podstawowej tożsamości pojazdu."/><SourceCard title="CEPiK / dane publiczne" ok={Boolean(r.result?.coverage?.cepik_reference||r.result?.coverage?.public_registry)} text="Publiczne dane są wykorzystywane zgodnie z zakresem, jaki udostępnia źródło."/><SourceCard title="Historia rozszerzona" ok={Boolean(r.result?.coverage?.extended_history)} text="Szkody, kradzieże, aukcje i dodatkowa historia wymagają aktywnego dostawcy B2B."/><SourceCard title="Historia polska – dokładny pojazd" ok={Boolean(r.result?.coverage?.exact_polish_history)} text="Pełna usługa wymaga kompletu danych identyfikujących konkretny pojazd."/></section>}

      {r.kind==="property"&&<section className="mt-6 grid gap-3 sm:grid-cols-2"><SourceCard title="Geoportal / działka" ok={Boolean(r.result?.coverage?.geoportal)} text="Weryfikacja danych lokalizacyjnych i działki w podłączonych źródłach publicznych."/><SourceCard title="Księga wieczysta" ok={Boolean(r.result?.coverage?.land_register)} text="Analiza KW wymaga dostępnego źródła oraz danych wejściowych nieruchomości."/></section>}

      {warnings.length>0&&<section className="mt-6 rounded-2xl p-5" style={{background:"rgba(232,137,26,.08)",border:"1px solid rgba(232,137,26,.22)"}}><h2 className="font-semibold">Na co zwrócić uwagę</h2><ul className="mt-3 space-y-2 text-sm leading-6">{warnings.map((w:string,i:number)=><li key={i}>• {w}</li>)}</ul></section>}

      <div className="mt-6 rounded-2xl p-5 text-sm leading-6" style={{background:"var(--header)",border:"1px solid var(--line)",color:"var(--mut)"}}><b style={{color:"var(--ink)"}}>Ważne:</b> Sunrise Verify wspiera decyzję zakupową, ale nie zastępuje badania technicznego pojazdu, opinii rzeczoznawcy, notariusza ani profesjonalnego badania stanu prawnego nieruchomości.</div>
    </>}
    {r.status==="failed"&&<div className="mt-5 text-sm text-red-400">{r.error_message||"Raport nie został przygotowany. Skontaktuj się z obsługą."}</div>}
    <button onClick={()=>load()} className="mt-6 rounded-xl px-4 py-2 text-sm font-semibold" style={{border:"1px solid var(--line)"}}>Odśwież status</button>
   </>}
   </div>
  </div>
 </div></main>;
}

function Box({label,value}:{label:string;value:string}){return <div className="rounded-2xl p-4" style={{background:"var(--header)",border:"1px solid var(--line)"}}><div className="text-xs" style={{color:"var(--mut)"}}>{label}</div><div className="mt-1 font-semibold">{value}</div></div>}
function SourceCard({title,ok,text}:{title:string;ok:boolean;text:string}){return <div className="rounded-2xl p-4" style={{border:"1px solid var(--line)",background:"var(--header)"}}><div className="flex items-center justify-between gap-3"><b>{title}</b><span className="text-xs font-semibold" style={{color:ok?"var(--green)":"var(--gold)"}}>{ok?"✓ dostępne":"○ zakres ograniczony"}</span></div><p className="mt-2 text-sm leading-6" style={{color:"var(--mut)"}}>{text}</p></div>}
function coverageLabel(k:string){return ({vin_identity:"VIN",vin_decode:"VIN",cepik_reference:"CEPiK",public_registry:"Rejestr publiczny",extended_history:"Historia rozszerzona",exact_polish_history:"Historia PL",geoportal:"Geoportal",land_register:"Księga wieczysta"} as Record<string,string>)[k]||k.split("_").join(" ")}
