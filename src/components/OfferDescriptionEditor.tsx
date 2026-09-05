import { useRef, useState } from "react";
import { supabase } from "../lib/supabase";

type Props = { value:string; onChange:(value:string)=>void; title:string; category?:string; compact?:boolean };

type AiAction = "generate"|"improve"|"shorten"|"expand";

export default function OfferDescriptionEditor({value,onChange,title,category,compact}:Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [busy,setBusy] = useState<AiAction|null>(null);
  const [msg,setMsg] = useState("");

  function wrap(before:string, after=before, placeholder="tekst") {
    const el=ref.current; if(!el) return;
    const start=el.selectionStart, end=el.selectionEnd;
    const selected=value.slice(start,end) || placeholder;
    const next=value.slice(0,start)+before+selected+after+value.slice(end);
    onChange(next);
    requestAnimationFrame(()=>{ el.focus(); el.setSelectionRange(start+before.length,start+before.length+selected.length); });
  }
  function prefix(prefix:string) {
    const el=ref.current; if(!el) return;
    const start=el.selectionStart, end=el.selectionEnd;
    const lineStart=value.lastIndexOf("\n",Math.max(0,start-1))+1;
    const lineEnd=value.indexOf("\n",end)===-1?value.length:value.indexOf("\n",end);
    const block=value.slice(lineStart,lineEnd).split("\n").map(x=>prefix+x).join("\n");
    onChange(value.slice(0,lineStart)+block+value.slice(lineEnd));
  }
  async function ai(action:AiAction) {
    if(!title.trim() && action==="generate") { setMsg("Najpierw wpisz tytuł oferty."); return; }
    if(action!=="generate" && !value.trim()) { setMsg("Najpierw wpisz choć krótki opis."); return; }
    setBusy(action); setMsg("");
    const {data,error}=await supabase.functions.invoke("gen-description",{body:{title,category,mode:"pro",action,current_description:value}});
    setBusy(null);
    if(error || !data?.description) { setMsg(data?.error || error?.message || "Nie udało się przygotować opisu."); return; }
    onChange(String(data.description));
  }

  const aiLabel:Record<AiAction,string>={generate:"Napisz z AI",improve:"Popraw",shorten:"Skróć",expand:"Rozwiń"};
  return <div>
    <div className="mb-2 flex flex-wrap items-center gap-1.5">
      <button type="button" title="Pogrubienie" onClick={()=>wrap("**")} className="rounded-lg px-2.5 py-1.5 text-sm font-bold" style={{border:"1px solid var(--line)"}}>B</button>
      <button type="button" title="Kursywa" onClick={()=>wrap("*")} className="rounded-lg px-2.5 py-1.5 text-sm italic" style={{border:"1px solid var(--line)"}}>I</button>
      <button type="button" title="Nagłówek" onClick={()=>prefix("## ")} className="rounded-lg px-2.5 py-1.5 text-sm" style={{border:"1px solid var(--line)"}}>H2</button>
      <button type="button" title="Lista" onClick={()=>prefix("- ")} className="rounded-lg px-2.5 py-1.5 text-sm" style={{border:"1px solid var(--line)"}}>• Lista</button>
      <button type="button" title="Link" onClick={()=>wrap("[","](https://)","tekst linku")} className="rounded-lg px-2.5 py-1.5 text-sm" style={{border:"1px solid var(--line)"}}>🔗</button>
      <span className="mx-1 h-6 w-px" style={{background:"var(--line)"}} />
      {(["generate","improve","shorten","expand"] as AiAction[]).map(a=><button key={a} type="button" disabled={!!busy} onClick={()=>ai(a)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50" style={{border:"1px solid rgba(232,137,26,.35)",color:"var(--gold)"}}>{busy===a?"AI…":`✨ ${aiLabel[a]}`}</button>)}
    </div>
    <textarea ref={ref} rows={compact?6:9} value={value} onChange={e=>onChange(e.target.value)} placeholder="Opisz ofertę. Możesz użyć nagłówków, pogrubień, list i linków…" className="w-full rounded-xl px-3 py-2.5 outline-none" style={{background:"var(--glass)",border:"1px solid var(--line)",color:"var(--ink)"}} />
    <div className="mt-1 flex items-center justify-between gap-3 text-[11px]" style={{color:"var(--mut)"}}><span>Formatowanie jest bezpiecznie renderowane w ogłoszeniu.</span><span>{value.length} znaków</span></div>
    {msg&&<div className="mt-2 text-xs" style={{color:"var(--gold)"}}>{msg}</div>}
  </div>;
}
