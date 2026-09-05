import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { amiOperator } from "../lib/api";

type VerifyRow = {
  id:string; offer_id:string; user_id:string; kind:"vehicle"|"property"; status:string;
  price_gross:number; input:any; result:any; error_message:string|null; created_at:string;
  paid_at:string|null; report_ready_at:string|null; offer_title:string;
};

const statusLabel:Record<string,string>={
  payment_pending:"Oczekuje na płatność", paid:"Opłacone", processing:"Do weryfikacji",
  ready:"Raport gotowy", failed:"Błąd", cancelled:"Anulowane", draft:"Szkic"
};

export default function OperatorVerify(){
  const [allowed,setAllowed]=useState<boolean|null>(null);
  const [rows,setRows]=useState<VerifyRow[]>([]);
  const [loading,setLoading]=useState(true);
  const [open,setOpen]=useState<string|null>(null);
  const [result,setResult]=useState<Record<string,string>>({});
  const [err,setErr]=useState<string|null>(null);
  const [busy,setBusy]=useState<string|null>(null);

  async function load(){
    setLoading(true); setErr(null);
    const ok=await amiOperator().catch(()=>false); setAllowed(ok);
    if(!ok){setLoading(false);return;}
    const {data,error}=await supabase.schema("market").rpc("operator_verification_requests");
    if(error){setErr(error.message);setLoading(false);return;}
    setRows((data||[]) as VerifyRow[]); setLoading(false);
  }
  useEffect(()=>{load();},[]);

  async function save(row:VerifyRow,status:"processing"|"ready"|"failed"){
    setBusy(row.id); setErr(null);
    let payload:any={};
    if(status==="ready"){
      const text=result[row.id]||"";
      payload={summary:text,completed_manually:true,completed_at:new Date().toISOString()};
      if(!text.trim()){setErr("Wpisz wynik weryfikacji przed oznaczeniem raportu jako gotowy.");setBusy(null);return;}
    }
    const {error}=await supabase.schema("market").rpc("operator_complete_verification",{
      p_request_id:row.id,
      p_result:payload,
      p_status:status,
      p_error_message:status==="failed"?(result[row.id]||"Weryfikacja nie mogła zostać zakończona."):null,
    });
    setBusy(null);
    if(error){setErr(error.message);return;}
    await load();
  }

  if(allowed===false)return <main className="min-h-screen px-4 py-10" style={{background:"var(--bg)",color:"var(--ink)"}}><div className="mx-auto max-w-5xl"><p>Brak uprawnień operatora.</p><Link to="/" style={{color:"var(--gold)"}}>← Wróć</Link></div></main>;

  return <main className="min-h-screen px-4 py-8" style={{background:"var(--bg)",color:"var(--ink)"}}>
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/operator" className="text-sm" style={{color:"var(--gold)"}}>← Back-office</Link>
        <div className="flex-1" />
        <button onClick={load} className="rounded-xl px-4 py-2 text-sm" style={{border:"1px solid var(--line)"}}>Odśwież</button>
      </div>
      <div className="mt-6 rounded-3xl p-6" style={{background:"linear-gradient(135deg,rgba(232,137,26,.14),rgba(56,224,240,.07))",border:"1px solid rgba(232,137,26,.28)"}}>
        <div className="text-sm font-semibold" style={{color:"var(--gold)"}}>🛡 SUNRISE VERIFY</div>
        <h1 className="mt-1 text-3xl font-semibold">Kolejka weryfikacji</h1>
        <p className="mt-2 text-sm" style={{color:"var(--mut)"}}>Płatne raporty pojazdów i nieruchomości. Na start raport może być uzupełniany operacyjnie; później podepniemy automatyczne źródła danych.</p>
      </div>
      {err&&<div className="mt-4 rounded-xl p-3 text-sm text-red-400" style={{border:"1px solid rgba(239,68,68,.3)"}}>{err}</div>}
      {loading?<p className="mt-6" style={{color:"var(--mut)"}}>Ładowanie…</p>:<div className="mt-6 grid gap-3">
        {rows.map(r=><div key={r.id} className="rounded-2xl p-4" style={{background:"var(--glass)",border:"1px solid var(--line)"}}>
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold" style={{color:"var(--gold)"}}>{r.kind==="vehicle"?"POJAZD":"NIERUCHOMOŚĆ"} · {statusLabel[r.status]||r.status}</div>
              <div className="mt-1 font-semibold">{r.offer_title}</div>
              <div className="mt-1 text-xs" style={{color:"var(--mut)"}}>Zlecenie: {r.id} · {new Date(r.created_at).toLocaleString("pl-PL")} · {Number(r.price_gross).toFixed(2)} zł</div>
            </div>
            <Link to={`/produkt/${r.offer_id}`} target="_blank" className="rounded-lg px-3 py-2 text-xs" style={{border:"1px solid var(--line)"}}>Otwórz ofertę</Link>
            <button onClick={()=>setOpen(open===r.id?null:r.id)} className="rounded-lg px-3 py-2 text-xs font-semibold" style={{border:"1px solid var(--line)"}}>{open===r.id?"Zwiń":"Obsłuż"}</button>
          </div>
          {open===r.id&&<div className="mt-4 border-t pt-4" style={{borderColor:"var(--line)"}}>
            <textarea rows={8} value={result[r.id]??(typeof r.result?.summary==="string"?r.result.summary:"")} onChange={e=>setResult({...result,[r.id]:e.target.value})} placeholder={r.kind==="vehicle"?"Wpisz wynik: VIN, przebieg, szkody, status, uwagi, źródła…":"Wpisz wynik: KW, właściciel, działy III/IV, obciążenia, uwagi, źródła…"} className="w-full rounded-xl p-3 text-sm outline-none" style={{background:"var(--bg)",border:"1px solid var(--line)",color:"var(--ink)"}} />
            <div className="mt-3 flex flex-wrap gap-2">
              <button disabled={busy===r.id} onClick={()=>save(r,"processing")} className="rounded-xl px-4 py-2 text-sm" style={{border:"1px solid var(--line)"}}>W toku</button>
              <button disabled={busy===r.id} onClick={()=>save(r,"failed")} className="rounded-xl px-4 py-2 text-sm text-red-300" style={{border:"1px solid rgba(239,68,68,.35)"}}>Oznacz błąd</button>
              <button disabled={busy===r.id} onClick={()=>save(r,"ready")} className="rounded-xl px-5 py-2 text-sm font-semibold text-black" style={{background:"linear-gradient(135deg,#E8891A,#F5A623)"}}>{busy===r.id?"Zapisuję…":"Raport gotowy"}</button>
            </div>
          </div>}
        </div>)}
        {rows.length===0&&<div className="rounded-2xl p-6 text-sm" style={{background:"var(--glass)",border:"1px solid var(--line)",color:"var(--mut)"}}>Brak zleceń Sunrise Verify.</div>}
      </div>}
    </div>
  </main>;
}
