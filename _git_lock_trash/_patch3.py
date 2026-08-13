#!/usr/bin/env python3
import io, sys, os
ROOT = sys.argv[1]
def patch(path, edits):
    p = os.path.join(ROOT, path)
    s = io.open(p, encoding="utf-8").read()
    for old, new in edits:
        assert s.count(old) == 1, f"{path}: expected 1 of <<{old[:60]}>> got {s.count(old)}"
        s = s.replace(old, new)
    io.open(p, "w", encoding="utf-8").write(s)
    print("patched", path)

# ---- api.ts: generic slot fetch ----
patch("src/lib/api.ts", [(
'''export async function activeHomeBanners() {
  const { data, error } = await supabase.rpc("active_home_banners"); if (error) throw error; return (data as any[]) ?? [];
}''',
'''export async function activeHomeBanners() {
  const { data, error } = await supabase.rpc("active_home_banners"); if (error) throw error; return (data as any[]) ?? [];
}
export async function activeBanners(slot: string) {
  const { data, error } = await supabase.rpc("active_banners", { p_slot: slot }); if (error) throw error; return (data as any[]) ?? [];
}''')])

M = []
# import
M.append((
'import { searchOffers, homePromoted, activeHomeBanners, categoryCounts, recommendedOffers, toggleWatch, watchedIds, myWatchlist } from "../lib/api";',
'import { searchOffers, homePromoted, activeHomeBanners, activeBanners, categoryCounts, recommendedOffers, toggleWatch, watchedIds, myWatchlist } from "../lib/api";'))
# states
M.append((
'  const [bi, setBi] = useState(0); // aktywny baner (rotacja)',
'''  const [bi, setBi] = useState(0); // aktywny baner (rotacja)
  const [tiles, setTiles] = useState<Banner[]>([]);   // kafle kategorii OZE (640x360)
  const [strips, setStrips] = useState<Banner[]>([]); // paski promo (1300x220)'''))
# effect fetches
M.append((
'    activeHomeBanners().then((b) => setBanners((b as Banner[]) ?? [])).catch(() => {});',
'''    activeHomeBanners().then((b) => setBanners((b as Banner[]) ?? [])).catch(() => {});
    activeBanners("category_tile").then((b) => setTiles((b as Banner[]) ?? [])).catch(() => {});
    activeBanners("home_strip").then((b) => setStrips((b as Banner[]) ?? [])).catch(() => {});'''))
# category tiles section (after HERO </section>, before DLA CIEBIE)
M.append((
'''      </section>

      {/* ── DLA CIEBIE (rekomendacje wg preferencji) ── */}''',
'''      </section>

      {/* ── STREFA ENERGII SUNRISE (kafle kategorii 640x360) ── */}
      {!activeDept && tiles.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-6 pt-2">
          <h2 className="font-display text-2xl font-semibold mb-5">⚡ Strefa Energii Sunrise</h2>
          <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))" }}>
            {tiles.map((t, i) => (
              <a key={i} href={t.link_url || "/"} className="block rounded-2xl overflow-hidden transition-transform hover:-translate-y-0.5"
                 style={{ border: "1px solid var(--line)", boxShadow: "0 10px 30px -18px rgba(0,0,0,.6)" }}>
                <img src={t.image_url!} alt={t.headline} loading="lazy" width={640} height={360} className="block w-full h-auto" />
              </a>
            ))}
          </div>
        </section>
      )}

      {/* ── DLA CIEBIE (rekomendacje wg preferencji) ── */}'''))
# strip band (before OFERTY section)
M.append((
'''      {/* ── OFERTY ── */}
      <section className="mx-auto max-w-6xl px-4 pb-20">''',
'''      {/* ── PASEK PROMOCYJNY (strip 1300x220, rotacja) ── */}
      {!activeDept && strips.length > 0 && (() => {
        const sB = strips[bi % strips.length];
        return (
          <div className="mx-auto max-w-6xl px-4 pb-8">
            <a href={sB.link_url || "/"} className="block rounded-2xl overflow-hidden" style={{ border: "1px solid var(--line)" }}>
              <img src={sB.image_url!} alt={sB.headline} loading="lazy" width={1300} height={220} className="block w-full h-auto" />
            </a>
          </div>
        );
      })()}

      {/* ── OFERTY ── */}
      <section className="mx-auto max-w-6xl px-4 pb-20">'''))
patch("src/pages/Market.tsx", M)
print("ALL OK")
