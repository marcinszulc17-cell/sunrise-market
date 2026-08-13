// Ostatnio oglądane produkty — trzymane lokalnie w przeglądarce (bez backendu).
// Defensywne: gdy localStorage niedostępny, po prostu nic nie robi.
export type RecentItem = { offer_id: string; title: string; price_gross: number; image_url: string | null };
const KEY = "sunrise_recent";

export function getRecent(): RecentItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => x && x.offer_id) : [];
  } catch { return []; }
}

export function pushRecent(it: RecentItem) {
  try {
    if (!it || !it.offer_id) return;
    const clean: RecentItem = { offer_id: it.offer_id, title: it.title, price_gross: Number(it.price_gross) || 0, image_url: it.image_url ?? null };
    const next = [clean, ...getRecent().filter((x) => x.offer_id !== it.offer_id)].slice(0, 12);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch { /* localStorage niedostępny — pomiń */ }
}
