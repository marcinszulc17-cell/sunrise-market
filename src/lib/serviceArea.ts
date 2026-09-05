// Obszar dojazdu sprzedawcy (każdy sprzedawca — nie tylko marki Sunrise). Zapis w attributes:
//  service_radius_km (0 = tylko lokalnie), service_lat / service_lon (geokod miejscowości).
// search_offers_v2 → market.offer_serves() dopasowuje ofertę do szukanego miasta/województwa, gdy leży w promieniu.
import { CITIES } from "./cities";

export const RADIUS_OPTIONS = [0, 25, 50, 100, 200, 300, 500] as const;
export function radiusLabel(km: number) { return km <= 0 ? "Tylko w mojej miejscowości" : `Dojazd do ${km} km${km >= 500 ? " (cała Polska)" : ""}`; }

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").trim();

/** Geokodowanie miejscowości: najpierw lista miast serwisu (bez sieci), potem Nominatim (OpenStreetMap). */
export async function geocodeCity(location: string): Promise<{ lat: number; lon: number } | null> {
  const first = norm(location.split(",")[0] || "");
  if (!first) return null;
  const local = CITIES.find((c) => norm(c.name) === first);
  if (local) return { lat: local.lat, lon: local.lon };
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=pl&q=${encodeURIComponent(location)}`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    const rows = (await r.json()) as Array<{ lat: string; lon: string }>;
    if (!rows?.[0]) return null;
    return { lat: Number(rows[0].lat), lon: Number(rows[0].lon) };
  } catch { return null; }
}

/** Atrybuty obszaru dojazdu do zapisania w ofercie (pusty obiekt, gdy brak promienia lub nie udało się zgeokodować). */
export async function serviceAreaAttrs(location: string, radiusKm: number): Promise<Record<string, number>> {
  if (!radiusKm || radiusKm <= 0 || !location.trim()) return {};
  const geo = await geocodeCity(location);
  if (!geo) return {};
  return { service_radius_km: radiusKm, service_lat: geo.lat, service_lon: geo.lon };
}
