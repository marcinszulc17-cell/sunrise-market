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

function isHeic(file: File) {
  const name = file.name.toLowerCase();
  return file.type === "image/heic" || file.type === "image/heif" || name.endsWith(".heic") || name.endsWith(".heif");
}

async function normalizePhotoFiles(files: FileList): Promise<FileList> {
  const output = new DataTransfer();
  let converter: any = null;

  for (const file of Array.from(files)) {
    if (!isHeic(file)) {
      output.items.add(file);
      continue;
    }

    if (!converter) {
      const moduleUrl = "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/+esm";
      const mod: any = await import(/* @vite-ignore */ moduleUrl);
      converter = mod.default ?? mod;
    }

    const converted = await converter({ blob: file, toType: "image/jpeg", quality: 0.9 });
    const blob = Array.isArray(converted) ? converted[0] : converted;
    const baseName = file.name.replace(/\.(heic|heif)$/i, "");
    output.items.add(new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: Date.now() }));
  }

  return output.files;
}

export default function OfferPhotoManager({ images, onChange, onAddFiles, uploading, maxImages=12, baseLimit=12, onBuyMore, onEnhanceAi, aiBusyIndex }: Props) {
  const [dragIndex,setDragIndex]=useState<number|null>(null);
  const [overIndex,setOverIndex]=useState<number|null>(null);
  const [uploadDragOver,setUploadDragOver]=useState(false);
  const [processing,setProcessing]=useState(false);
  const [photoError,setPhotoError]=useState<string|null>(null);
  const touchFrom=useRef<number|null>(null);

  function move(from:number,to:number){
    if(from===to || from<0 || to<0 || from>=images.length || to>=images.length) return;
    const next=[...images]; const [item]=next.splice(from,1); next.splice(to,0,item); onChange(next);
  }
  function main(i:number){ if(i===0) return; onChange([images[i],...images.filter((_,j)=>j!==i)]); }
  function remove(i:number){ onChange(images.filter((_,j)=>j!==i)); }
  function left(i:number){ if(i>0) move(i,i-1); }
  function right(i:number){ if(i<images.length-1) move(i,i+1); }

  async function addFiles(files: FileList | null) {
    if (!files?.length || !onAddFiles || uploading || processing) return;
    setPhotoError(null);
    setProcessing(true);
    try {
      const normalized = await normalizePhotoFiles(files);
      onAddFiles(normalized);
    } catch (error) {
      console.error("Photo conversion failed", error);
      setPhotoError("Nie udało się odczytać zdjęcia HEIC. Spróbuj ponownie lub wybierz JPG/PNG.");
    } finally {
      setProcessing(false);
    }
  }

  const busy = Boolean(uploading || processing);

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
      onDrop={async e=>{
        e.preventDefault();
        e.stopPropagation();
        setUploadDragOver(false);
        await addFiles(e.dataTransfer.files);
      }}
    >
      <span className="font-semibold">{busy?"Przygotowuję zdjęcia…":uploadDragOver?"Puść zdjęcia tutaj":"Przeciągnij zdjęcia tutaj"}</span>
      {!busy&&!uploadDragOver&&<span className="mt-1 text-xs" style={{color:"var(--mut)"}}>albo kliknij, żeby wybrać pliki · HEIC z iPhone’a zamienimy automatycznie na JPG</span>}
      <input className="hidden" type="file" multiple accept="image/*,.heic,.heif" disabled={busy} onChange={async e=>{await addFiles(e.target.files); e.currentTarget.value="";}}/>
    </label>}
    {photoError&&<div className="mt-2 rounded-lg px-3 py-2 text-xs" style={{background:"rgba(220,70,70,.10)",border:"1px solid rgba(220,70,70,.25)",color:"#d66"}}>{photoError}</div>}
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
