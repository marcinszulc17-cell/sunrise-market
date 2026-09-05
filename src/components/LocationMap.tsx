// Mapa lokalizacji ogłoszenia (decyzja właściciela 2026-09-06) — bez kluczy API: geokodowanie Nominatim (OpenStreetMap)
// w przeglądarce z pamięcią podręczną w localStorage, osadzenie mapy OSM (iframe) i link „Zobacz na mapie”.
// Pokazujemy tylko miejscowość/okolicę z attributes.location — nigdy dokładnego adresu sprzedawcy.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Ico, CARD } from "./home/HomeShared";
import { SERVICE_REGIONS } from "../lib/cities";

type Geo = { lat: number; lon: number };
const KEY = "sm:geo:";
async function geocode(q: string): Promise<Geo | null> {
  const k = KEY + q.toLowerCase().trim();
  try { const c = localStorage.getItem(k); if (c) return JSON.parse(c); } catch { /* brak cache */ }
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=pl&q=${encodeURIComponent(q)}`, { headers: { Accept: "application/json" } });
    const j = (await r.json()) as { lat: string; lon: string }[];
    if (!j?.[0]) return null;
    const g = { lat: Number(j[0].lat), lon: Number(j[0].lon) };
    try { localStorage.setItem(k, JSON.stringify(g)); } catch { /* prywatny tryb */ }
    return g;
  } catch { return null; }
}

export default function LocationMap({ location, radiusKm, className = "" }: { location?: string | null; radiusKm?: number | null; className?: string }) {
  const [geo, setGeo] = useState<Geo | null | undefined>(undefined);
  useEffect(() => { let alive = true; if (!location?.trim()) { setGeo(null); return; } geocode(location).then((g) => { if (alive) setGeo(g); }); return () => { alive = false; }; }, [location]);
  if (!location?.trim()) return null;
  const d = radiusKm ? Math.min(2.2, radiusKm / 90) : 0.04; // zasięg 200 km → szeroki kadr; inaczej ~4 km okolicy
  const bbox = geo ? `${geo.lon - d},${geo.lat - d},${geo.lon + d},${geo.lat + d}` : null;
  const link = geo ? `https://www.openstreetmap.org/?mlat=${geo.lat}&mlon=${geo.lon}#map=13/${geo.lat}/${geo.lon}` : `https://www.openstreetmap.org/search?query=${encodeURIComponent(location)}`;
  return <section className={`rounded-2xl p-5 ${className}`} style={CARD}>
    <div className="flex items-center gap-2 border-l-4 pl-3 text-lg font-bold" style={{ borderColor: "var(--gold)" }}>Lokalizacja</div>
    <div className="mt-3 flex items-center gap-2 text-sm"><Ico name="pin" size={18} stroke="var(--gold)" /><span>{location}</span></div>
    {radiusKm ? <div className="mt-2 rounded-xl px-3 py-2 text-xs leading-5" style={{ background: "rgba(245,166,35,.08)", border: "1px solid rgba(245,166,35,.25)" }}><b style={{ color: "var(--gold)" }}>Dojazd i montaż w promieniu {radiusKm} km</b> — {SERVICE_REGIONS.join(", ")}. <Link to="/oze" style={{ color: "var(--gold)" }}>Sprawdź swoje miasto ›</Link></div> : null}
    {bbox && <div className="mt-3 overflow-hidden rounded-xl" style={{ border: "1px solid var(--line)", background: "var(--header)" }}><iframe title={`Mapa: ${location}`} src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${geo!.lat},${geo!.lon}`} className="h-56 w-full" loading="lazy" style={{ border: 0, filter: "invert(.92) hue-rotate(180deg) saturate(.7)" }} /></div>}
    {geo === null && <div className="mt-2 text-xs" style={{ color: "var(--mut)" }}>Nie udało się pokazać mapy dla tej miejscowości.</div>}
    <a href={link} target="_blank" rel="noopener noreferrer" className="mt-3 flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold" style={{ background: "rgba(255,255,255,.05)", border: "1px solid var(--line)" }}>Zobacz na mapie ↗</a>
  </section>;
}
