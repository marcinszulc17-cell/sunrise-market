// Galeria oferty „jak w aplikacji” (decyzja właściciela 2026-09-06): na telefonie przesuwanie palcem (scroll-snap), licznik,
// kropki, dotknięcie → pełny ekran z przesuwaniem i podwójnym dotknięciem do powiększenia. Na dużym ekranie strzałki + miniatury.
import { useEffect, useRef, useState } from "react";

type Props = { images: string[]; alt: string; fallback?: React.ReactNode; className?: string; aspect?: string; thumb?: (u: string) => string; full?: (u: string) => string };

export default function SwipeGallery({ images, alt, fallback, className = "", aspect = "aspect-[4/3]", thumb = (u) => u, full = (u) => u }: Props) {
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(false);
  const track = useRef<HTMLDivElement>(null);
  const n = images.length;

  function scrollTo(idx: number, smooth = true) {
    const el = track.current; if (!el) return;
    const k = ((idx % n) + n) % n;
    el.scrollTo({ left: k * el.clientWidth, behavior: smooth ? "smooth" : "auto" });
    setI(k);
  }
  function onScroll() { const el = track.current; if (!el || !el.clientWidth) return; const k = Math.round(el.scrollLeft / el.clientWidth); if (k !== i) setI(k); }

  if (!n) return <div className={`grid ${aspect} place-items-center overflow-hidden rounded-2xl text-8xl ${className}`} style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>{fallback ?? "🌅"}</div>;

  return <div className={className}>
    <div className="group relative overflow-hidden rounded-2xl" style={{ border: "1px solid var(--line)", background: "rgba(0,0,0,.16)" }}>
      <div ref={track} onScroll={onScroll} className={`flex ${aspect} snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`} style={{ scrollBehavior: "smooth" }}>
        {images.map((u, k) => <button type="button" key={u} onClick={() => setOpen(true)} className="h-full w-full shrink-0 snap-center" aria-label={`Zdjęcie ${k + 1} — powiększ`}>
          <img src={thumb(u)} alt={k === 0 ? alt : ""} loading={k === 0 ? "eager" : "lazy"} decoding="async" className="h-full w-full object-cover" draggable={false} />
        </button>)}
      </div>
      {n > 1 && <>
        <button type="button" aria-label="Poprzednie zdjęcie" onClick={() => scrollTo(i - 1)} className="absolute left-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full text-2xl text-white backdrop-blur transition sm:grid sm:opacity-0 sm:group-hover:opacity-100" style={{ background: "rgba(11,11,13,.7)" }}>‹</button>
        <button type="button" aria-label="Następne zdjęcie" onClick={() => scrollTo(i + 1)} className="absolute right-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full text-2xl text-white backdrop-blur transition sm:grid sm:opacity-0 sm:group-hover:opacity-100" style={{ background: "rgba(11,11,13,.7)" }}>›</button>
        <div className="pointer-events-none absolute bottom-3 right-3 rounded-full px-2.5 py-1 text-xs font-semibold text-white" style={{ background: "rgba(11,11,13,.65)" }}>{i + 1}/{n}</div>
        <div className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5 sm:hidden">{images.map((_, k) => <span key={k} className="h-1.5 rounded-full transition-all" style={{ width: k === i ? 16 : 6, background: k === i ? "#F5A623" : "rgba(255,255,255,.55)" }} />)}</div>
      </>}
    </div>
    {n > 1 && <div className="mt-3 hidden gap-2 overflow-x-auto pb-1 sm:flex">{images.map((u, k) => <button key={u} type="button" onClick={() => scrollTo(k)} aria-label={`Zdjęcie ${k + 1}`} className="h-20 w-24 shrink-0 overflow-hidden rounded-xl" style={{ border: i === k ? "2px solid var(--gold)" : "1px solid var(--line)" }}><img src={thumb(u)} alt="" loading="lazy" className="h-full w-full object-cover" /></button>)}</div>}
    {open && <Lightbox images={images} start={i} alt={alt} full={full} onClose={(k) => { setOpen(false); scrollTo(k, false); }} />}
  </div>;
}

function Lightbox({ images, start, alt, full, onClose }: { images: string[]; start: number; alt: string; full: (u: string) => string; onClose: (i: number) => void }) {
  const [i, setI] = useState(start);
  const [zoomed, setZoomed] = useState(false);
  const track = useRef<HTMLDivElement>(null);
  const n = images.length;
  useEffect(() => {
    const el = track.current; if (el) el.scrollLeft = start * el.clientWidth;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(i); if (e.key === "ArrowRight") go(i + 1); if (e.key === "ArrowLeft") go(i - 1); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    try { window.history.pushState({ smLightbox: true }, ""); } catch { /* ignoruj */ }
    const onPop = () => onClose(i);
    window.addEventListener("popstate", onPop);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("popstate", onPop); document.body.style.overflow = ""; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  function go(k: number) { const el = track.current; if (!el) return; const j = ((k % n) + n) % n; el.scrollTo({ left: j * el.clientWidth, behavior: "smooth" }); setI(j); setZoomed(false); }
  function close() { if (window.history.state?.smLightbox) window.history.back(); else onClose(i); }
  return <div className="fixed inset-0 z-[80] bg-black" role="dialog" aria-label="Galeria">
    <button type="button" onClick={close} className="absolute right-3 top-[calc(12px+env(safe-area-inset-top))] z-20 grid h-11 w-11 place-items-center rounded-full text-2xl text-white" style={{ background: "rgba(255,255,255,.12)" }} aria-label="Zamknij">×</button>
    {n > 1 && <div className="absolute left-1/2 top-[calc(20px+env(safe-area-inset-top))] z-20 -translate-x-1/2 rounded-full px-3 py-1 text-sm text-white" style={{ background: "rgba(255,255,255,.12)" }}>{i + 1} / {n}</div>}
    <div ref={track} onScroll={() => { const el = track.current; if (!el) return; const k = Math.round(el.scrollLeft / el.clientWidth); if (k !== i) { setI(k); setZoomed(false); } }}
      className={`flex h-full w-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${zoomed ? "snap-none" : ""}`}>
      {images.map((u, k) => <div key={u} className="grid h-full w-full shrink-0 snap-center place-items-center overflow-auto" onDoubleClick={() => setZoomed((z) => !z)}>
        <img src={full(u)} alt={k === i ? alt : ""} draggable={false} className="max-h-full max-w-full select-none object-contain transition-transform duration-200" style={{ transform: zoomed && k === i ? "scale(2.2)" : "none", touchAction: "pinch-zoom" }} />
      </div>)}
    </div>
    {n > 1 && <><button type="button" onClick={() => go(i - 1)} className="absolute left-3 top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 place-items-center rounded-full text-3xl text-white sm:grid" style={{ background: "rgba(255,255,255,.12)" }} aria-label="Poprzednie">‹</button><button type="button" onClick={() => go(i + 1)} className="absolute right-3 top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 place-items-center rounded-full text-3xl text-white sm:grid" style={{ background: "rgba(255,255,255,.12)" }} aria-label="Następne">›</button></>}
    <div className="pointer-events-none absolute bottom-[calc(16px+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 text-xs text-white/60">Podwójne dotknięcie — powiększ · przesuń — następne</div>
  </div>;
}
