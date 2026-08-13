#!/usr/bin/env python3
import io, sys, os
ROOT = sys.argv[1]
def patch(path, edits):
    p = os.path.join(ROOT, path)
    s = io.open(p, encoding="utf-8").read()
    for old, new, n in edits:
        c = s.count(old)
        assert c == n, f"{path}: expected {n} of <<{old[:50]}...>> got {c}"
        s = s.replace(old, new)
    io.open(p, "w", encoding="utf-8").write(s)
    print("patched", path)

# ---- api.ts ----
patch("src/lib/api.ts", [(
"""export async function activeHomeBanner() {
  const { data, error } = await supabase.rpc("active_home_banner"); if (error) throw error; return (data && data[0]) ?? null;
}""",
"""export async function activeHomeBanner() {
  const { data, error } = await supabase.rpc("active_home_banner"); if (error) throw error; return (data && data[0]) ?? null;
}
export async function activeHomeBanners() {
  const { data, error } = await supabase.rpc("active_home_banners"); if (error) throw error; return (data as any[]) ?? [];
}""", 1)])

# ---- Market.tsx ----
market_edits = []
market_edits.append((
'import { searchOffers, homePromoted, activeHomeBanner, categoryCounts, recommendedOffers, toggleWatch, watchedIds, myWatchlist } from "../lib/api";',
'import { searchOffers, homePromoted, activeHomeBanners, categoryCounts, recommendedOffers, toggleWatch, watchedIds, myWatchlist } from "../lib/api";',
1))
market_edits.append((
'  const [banner, setBanner] = useState<{ headline: string; link_url: string; image_url: string | null; seller: string } | null>(null);',
'''  type Banner = { headline: string; link_url: string; image_url: string | null; seller: string };
  const [banners, setBanners] = useState<Banner[]>([]);
  const [bi, setBi] = useState(0); // aktywny baner (rotacja)''',
1))
market_edits.append((
'    activeHomeBanner().then((b) => setBanner(b as any)).catch(() => {});',
'    activeHomeBanners().then((b) => setBanners((b as Banner[]) ?? [])).catch(() => {});',
1))
market_edits.append((
'''    const urlQ = new URLSearchParams(window.location.search).get("q");
    if (urlQ) { setQ(urlQ); load(urlQ); }
  }, []);''',
'''    const urlQ = new URLSearchParams(window.location.search).get("q");
    if (urlQ) { setQ(urlQ); load(urlQ); }
  }, []);

  // rotacja banerow hero co 6 s
  useEffect(() => {
    if (banners.length < 2) return;
    const t = setInterval(() => setBi((i) => (i + 1) % banners.length), 6000);
    return () => clearInterval(t);
  }, [banners.length]);''',
1))
market_edits.append((
'''      {/* ── BANER REKLAMOWY (hero slot) ── */}
      {banner && (
        <a href={banner.link_url || "/"} className="block mx-auto max-w-6xl px-4 pt-5">
          <div className="rounded-2xl overflow-hidden relative flex items-center px-8 py-10"
               style={{ background: banner.image_url ? `url(${banner.image_url}) center/cover` : "linear-gradient(135deg, rgba(242,115,29,.25), rgba(124,58,237,.25))", border: "1px solid rgba(242,115,29,.35)" }}>
            <div>
              <div className="text-[11px] font-semibold tracking-wider mb-2" style={{ color: "var(--gold)" }}>SPONSOROWANE · {banner.seller}</div>
              <div className="font-display text-2xl sm:text-3xl font-semibold max-w-xl">{banner.headline}</div>
            </div>
          </div>
        </a>
      )}''',
'''      {/* ── BANER REKLAMOWY (hero slot, rotacja) ── */}
      {banners.length > 0 && (() => {
        const b = banners[bi] ?? banners[0];
        return (
          <div className="mx-auto max-w-6xl px-4 pt-5">
            <a href={b.link_url || "/"} className="block rounded-2xl overflow-hidden relative"
               style={{ border: "1px solid rgba(242,115,29,.28)", boxShadow: "0 18px 50px -22px rgba(242,115,29,.4)" }}>
              {b.image_url ? (
                <img src={b.image_url} alt={b.headline} loading="eager"
                     className="block w-full h-auto" style={{ aspectRatio: "1600 / 460", objectFit: "cover" }} />
              ) : (
                <div className="flex items-center px-8 py-10"
                     style={{ background: "linear-gradient(135deg, rgba(242,115,29,.25), rgba(124,58,237,.25))" }}>
                  <div>
                    <div className="text-[11px] font-semibold tracking-wider mb-2" style={{ color: "var(--gold)" }}>SPONSOROWANE · {b.seller}</div>
                    <div className="font-display text-2xl sm:text-3xl font-semibold max-w-xl">{b.headline}</div>
                  </div>
                </div>
              )}
              {banners.length > 1 && (
                <div className="absolute bottom-3 right-4 flex items-center gap-1.5">
                  {banners.map((_, i) => (
                    <button key={i} aria-label={`Baner ${i + 1}`} onClick={(e) => { e.preventDefault(); setBi(i); }}
                      className="rounded-full transition-all"
                      style={{ width: i === bi ? 20 : 7, height: 7, background: i === bi ? "var(--gold)" : "rgba(255,255,255,.45)" }} />
                  ))}
                </div>
              )}
            </a>
          </div>
        );
      })()}''',
1))
patch("src/pages/Market.tsx", market_edits)
print("ALL OK")
