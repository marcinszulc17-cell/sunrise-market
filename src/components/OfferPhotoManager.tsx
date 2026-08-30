import { useRef, useState } from "react";

type Props = {
  images: string[];
  onChange: (images: string[]) => void;
  onAddFiles?: (files: FileList | null) => void;
  uploading?: boolean;
  maxImages?: number;
  baseLimit?: number;
  onBuyMore?: () => void;
  onEnhanceAi?: (url: string, index: number) => void;
  aiBusyIndex?: number | null;
};

export default function OfferPhotoManager({ images, onChange, onAddFiles, uploading, maxImages=12, baseLimit=12, onBuyMore, onEnhanceAi, aiBusyIndex }: Props) {
  const [dragIndex,setDragIndex]=useState<number|null>(null);
  const [overIndex,setOverIndex]=useState<number|null>(null);
  const [uploadDragOver,setUploadDragOver]=useState(false);
  const touchFrom=useRef<number|null>(null);

  function move(from:number,to:number){
    if(from===to || from<0 || to<0 || from>=images.length || to>=images.length) return;
    const next=[...images]; const [item]=next.splice(from,1); next.splice(to,0,item); onChange(next);
  }
  function main(i:number){ if(i===0) return; onChange([images[i],...images.filter((_,j)=>j!==i)]); }
  function remove(i:number){ onChange(images.filter((_,j)=>j!==i)); }
  function left(i:number){ if(i>0) move(i,i-1); }
  function right(i:number){ if(i<images.length-1) move(i,i+1); }

  return <div>
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
      <b>Zdjęcia ({images.length}/{maxImages})</b>
      <span style={{color:"var(--mut)"}}>Przeciągnij, aby zmienić kolejność · pierwsze = główne</span>
    </div>
    {onAddFiles && <label
      className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed p-5 text-center text-sm transition"
      style={{
        borderColor: uploadDragOver ? "var(--gold)" : "var(--line)",
        background: uploadDragOver ? "rgba(200,150,90,.10)" : "transparent",
        boxShadow: uploadDragOver ? "0 0 0 2px rgba(200,150,90,.14) inset" : "none",
      }}
      onDragEnter={e=>{e.preventDefault();e.stopPropagation();setUploadDragOver(true)}}
      onDragOver={e=>{e.preventDefault();e.stopPropagation();setUploadDragOver(true);e.dataTransfer.dropEffect="copy"}}
      onDragLeave={e=>{e.preventDefault();e.stopPropagation();setUploadDragOver(false)}}
      onDrop={e=>{
        e.preventDefault();
        e.stopPropagation();
        setUploadDragOver(false);
        if(uploading) return;
        const files=e.dataTransfer.files;
        if(files?.length) onAddFiles(files);
      }}
    >
      <span className="font-semibold">{uploading?"Wysyłanie…":uploadDragOver?"Puść zdjęcia tutaj":"Przeciągnij zdjęcia tutaj"}</span>
      {!uploading&&!uploadDragOver&&<span className="mt-1 text-xs" style={{color:"var(--mut)"}}>albo kliknij, żeby wybrać pliki</span>}
      <input className="hidden" type="file" multiple accept="image/*" onChange={e=>onAddFiles(e.target.files)}/>
    </label>}
    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {images.map((url,i)=><div key={`${url}-${i}`}
        draggable
        onDragStart={()=>setDragIndex(i)}
        onDragOver={e=>{e.preventDefault();setOverIndex(i)}}
        onDrop={e=>{e.preventDefault(); if(dragIndex!==null) move(dragIndex,i); setDragIndex(null);setOverIndex(null)}}
        onDragEnd={()=>{setDragIndex(null);setOverIndex(null)}}
        onTouchStart={()=>{touchFrom.current=i}}
        className="group overflow-hidden rounded-xl p-2 transition"
        style={{border: overIndex===i?"2px solid var(--gold)":"1px solid var(--line)",background:"var(--glass)"}}>
        <div className="relative cursor-grab active:cursor-grabbing">
          <img src={url} className="aspect-square w-full rounded-lg object-cover" alt="" draggable={false}/>
          <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">☰ {i+1}</span>
          <button type="button" onClick={()=>remove(i)} className="absolute right-1 top-1 rounded-full bg-black/75 px-2 py-0.5 text-xs text-white">×</button>
          {i===0&&<span className="absolute bottom-1 left-1 rounded bg-black/75 px-2 py-1 text-[10px] font-semibold text-white">★ Główne</span>}
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1">
          <button type="button" disabled={i===0} onClick={()=>left(i)} className="rounded-md py-1 text-xs disabled:opacity-30" style={{border:"1px solid var(--line)"}}>←</button>
          <button type="button" onClick={()=>main(i)} className="rounded-md py-1 text-[10px] font-semibold" style={{border:"1px solid var(--line)",color:i===0?"var(--gold)":"var(--ink)"}}>{i===0?"Główne":"Na główne"}</button>
          <button type="button" disabled={i===images.length-1} onClick={()=>right(i)} className="rounded-md py-1 text-xs disabled:opacity-30" style={{border:"1px solid var(--line)"}}>→</button>
        </div>
        {onEnhanceAi&&<button type="button" disabled={aiBusyIndex!==null&&aiBusyIndex!==undefined} onClick={()=>onEnhanceAi(url,i)} className="mt-1.5 w-full rounded-md py-1.5 text-[11px] font-semibold disabled:opacity-50" style={{border:"1px solid rgba(200,150,90,.35)",color:"var(--gold)"}}>{aiBusyIndex===i?"AI poprawia…":"✨ Popraw AI"}</button>}
      </div>)}
    </div>
    {images.length>=baseLimit&&images.length<maxImages&&<div className="mt-3 rounded-xl p-3 text-xs" style={{border:"1px solid rgba(200,150,90,.25)",background:"rgba(200,150,90,.08)"}}>Wykorzystano bezpłatny limit {baseLimit} zdjęć. Dodatkowe miejsca mogą być kupione jako rozszerzenie oferty.</div>}
    {images.length>=maxImages&&onBuyMore&&<button type="button" onClick={onBuyMore} className="mt-3 w-full rounded-xl py-2.5 text-sm font-semibold" style={{border:"1px solid var(--gold)",color:"var(--gold)"}}>+ Dokup dodatkowe zdjęcia</button>}
    <div className="mt-2 text-[11px]" style={{color:"var(--mut)"}}>Dodawanie: przeciągnij pliki na pole powyżej lub kliknij. Kolejność: przeciągaj kafelki; na telefonie użyj ← / → albo „Na główne”.</div>
  </div>;
}
