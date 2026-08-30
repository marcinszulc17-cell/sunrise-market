import { useRef, useState } from "react";
import { supabase } from "../lib/supabase";

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

declare global {
  interface Window {
    heic2any?: (opts: { blob: Blob; toType: string; quality?: number }) => Promise<Blob | Blob[]>;
  }
}

let heicLoader: Promise<typeof window.heic2any> | null = null;

function isHeic(file: File) {
  const name = file.name.toLowerCase();
  return file.type === "image/heic" || file.type === "image/heif" || name.endsWith(".heic") || name.endsWith(".heif");
}

function isHeicUrl(url: string) {
  return /\.(heic|heif)(?:\?|$)/i.test(url);
}

function getHeicConverter(): Promise<NonNullable<typeof window.heic2any>> {
  if (window.heic2any) return Promise.resolve(window.heic2any);
  if (heicLoader) return heicLoader as Promise<NonNullable<typeof window.heic2any>>;

  heicLoader = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-heic2any="1"]');
    if (existing) {
      existing.addEventListener("load", () => window.heic2any ? resolve(window.heic2any) : reject(new Error("HEIC converter unavailable")), { once: true });
      existing.addEventListener("error", () => reject(new Error("HEIC converter load failed")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js";
    script.async = true;
    script.dataset.heic2any = "1";
    script.onload = () => window.heic2any ? resolve(window.heic2any) : reject(new Error("HEIC converter unavailable"));
    script.onerror = () => reject(new Error("HEIC converter load failed"));
    document.head.appendChild(script);
  });

  return heicLoader as Promise<NonNullable<typeof window.heic2any>>;
}

async function convertHeicFile(file: File): Promise<File> {
  const converter = await getHeicConverter();
  const converted = await converter({ blob: file, toType: "image/jpeg", quality: 0.9 });
  const blob = Array.isArray(converted) ? converted[0] : converted;
  const baseName = file.name.replace(/\.(heic|heif)$/i, "") || `photo-${Date.now()}`;
  return new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
}

async function normalizePhotoFiles(files: FileList): Promise<FileList> {
  const output = new DataTransfer();
  for (const file of Array.from(files)) {
    output.items.add(isHeic(file) ? await convertHeicFile(file) : file);
  }
  return output.files;
}

async function detailedFunctionError(error: unknown): Promise<string> {
  try {
    const context = (error as { context?: Response })?.context;
    if (context && typeof context.clone === "function") {
      const response = context.clone();
      const payload = await response.json().catch(() => null) as { stage?: string; message?: string; error?: string } | null;
      if (payload) {
        const stage = payload.stage ? ` [${payload.stage}]` : "";
        return `${payload.message || payload.error || "Błąd funkcji"}${stage}`;
      }
    }
  } catch { /* fallback below */ }
  return error instanceof Error ? error.message : String(error ?? "nieznany błąd");
}

export default function OfferPhotoManager({ images, onChange, onAddFiles, uploading, maxImages=12, baseLimit=12, onBuyMore, onEnhanceAi, aiBusyIndex }: Props) {
  const [dragIndex,setDragIndex]=useState<number|null>(null);
  const [overIndex,setOverIndex]=useState<number|null>(null);
  const [uploadDragOver,setUploadDragOver]=useState(false);
  const [processing,setProcessing]=useState(false);
  const [repairing,setRepairing]=useState(false);
  const [photoError,setPhotoError]=useState<string|null>(null);
  const [photoInfo,setPhotoInfo]=useState<string|null>(null);
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
    if (!files?.length || !onAddFiles || uploading || processing || repairing) return;
    setPhotoError(null);
    setPhotoInfo(null);
    setProcessing(true);
    try {
      const normalized = await normalizePhotoFiles(files);
      onAddFiles(normalized);
    } catch (error) {
      console.error("Photo conversion failed", error);
      setPhotoError("Nie udało się przetworzyć zdjęcia HEIC. Spróbuj ponownie za chwilę lub wybierz JPG/PNG.");
    } finally {
      setProcessing(false);
    }
  }

  async function repairLegacyHeic() {
    const legacyCount = images.filter(isHeicUrl).length;
    if (!legacyCount || repairing || uploading || processing) return;
    setRepairing(true);
    setPhotoError(null);
    setPhotoInfo(`Naprawiam ${legacyCount} zdjęć HEIC na serwerze…`);
    try {
      const { data, error } = await supabase.functions.invoke("repair-offer-images", { body: { image_urls: images } });
      if (error) throw new Error(await detailedFunctionError(error));
      if (!data?.ok) {
        const stage = data?.stage ? ` [${data.stage}]` : "";
        throw new Error(`${data?.message || data?.error || "Nieznany błąd backendu"}${stage}`);
      }
      const repairedUrls = Array.isArray(data.image_urls) ? data.image_urls.filter((x: unknown) => typeof x === "string") as string[] : [];
      if (!repairedUrls.length) throw new Error("Backend nie zwrócił poprawionej galerii");
      onChange(repairedUrls);
      setPhotoInfo(`Naprawiono ${Number(data.repaired_count ?? 0)} zdjęć HEIC ✅`);
    } catch (error) {
      console.error("Backend HEIC repair failed", error);
      const message = error instanceof Error ? error.message : "nieznany błąd";
      setPhotoError(`Nie udało się naprawić zdjęć HEIC: ${message}`);
      setPhotoInfo(null);
    } finally {
      setRepairing(false);
    }
  }

  const legacyCount = images.filter(isHeicUrl).length;
  const busy = Boolean(uploading || processing || repairing);

  return <div>
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
      <b>Zdjęcia ({images.length}/{maxImages})</b>
      <span style={{color:"var(--mut)"}}>Przeciągnij, aby zmienić kolejność · pierwsze = główne</span>
    </div>
    {legacyCount>0&&<div className="mb-3 rounded-xl p-3" style={{border:"1px solid rgba(200,150,90,.35)",background:"rgba(200,150,90,.08)"}}>
      <div className="text-sm font-semibold">Wykryto {legacyCount} starych zdjęć HEIC</div>
      <div className="mt-1 text-xs" style={{color:"var(--mut)"}}>Naprawa odbywa się teraz po stronie serwera, więc nie zależy od przeglądarki telefonu.</div>
      <button type="button" disabled={busy} onClick={repairLegacyHeic} className="mt-2 rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-50" style={{border:"1px solid var(--gold)",color:"var(--gold)"}}>{repairing?"Naprawiam na serwerze…":"Napraw stare zdjęcia HEIC"}</button>
    </div>}
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
    {photoInfo&&<div className="mt-2 rounded-lg px-3 py-2 text-xs" style={{background:"rgba(80,170,110,.10)",border:"1px solid rgba(80,170,110,.25)"}}>{photoInfo}</div>}
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
          {isHeicUrl(url)?<div className="flex aspect-square w-full items-center justify-center rounded-lg text-center text-xs" style={{background:"rgba(255,255,255,.04)",color:"var(--mut)"}}>HEIC<br/>do naprawy</div>:<img src={url} className="aspect-square w-full rounded-lg object-cover" alt="" draggable={false}/>} 
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
