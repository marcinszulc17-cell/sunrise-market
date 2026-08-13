#!/usr/bin/env python3
import io, sys, os
ROOT = sys.argv[1]
def patch(path, edits):
    p = os.path.join(ROOT, path)
    s = io.open(p, encoding="utf-8").read()
    for old, new in edits:
        assert s.count(old) == 1, f"{path}: expected 1 of <<{old[:52]}>> got {s.count(old)}"
        s = s.replace(old, new)
    io.open(p, "w", encoding="utf-8").write(s)
    print("patched", path)

# ---- Market.tsx ----
patch("src/pages/Market.tsx", [
 ('import { zl, pkt } from "../lib/money";',
  'import { zl, pkt } from "../lib/money";\nimport { getRecent } from "../lib/recent";'),
 ('  const [strips, setStrips] = useState<Banner[]>([]); // paski promo (1300x220)',
  '  const [strips, setStrips] = useState<Banner[]>([]); // paski promo (1300x220)\n  const [recent, setRecent] = useState<{ offer_id: string; title: string; price_gross: number; image_url: string | null }[]>([]);'),
 ('    activeBanners("home_strip").then((b) => setStrips((b as Banner[]) ?? [])).catch(() => {});',
  '    activeBanners("home_strip").then((b) => setStrips((b as Banner[]) ?? [])).catch(() => {});\n    setRecent(getRecent());'),
 ('      {/* ── OFERTY ── */}',
  '''      {/* ── OSTATNIO OGLĄDANE ── */}
      {!activeDept && recent.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-4">
          <h2 className="font-display text-2xl font-semibold mb-5">🕘 Ostatnio oglądane</h2>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {recent.map((r) => (
              <a key={r.offer_id} href={`/produkt/${r.offer_id}`} className="shrink-0 w-40 rounded-2xl overflow-hidden card-glow"
                 style={{ border: "1px solid var(--line)", background: "var(--glass)" }}>
                <div className="h-28">
                  {r.image_url
                    ? <img src={r.image_url} alt={r.title} className="w-full h-full object-cover" loading="lazy" />
                    : <div className="w-full h-full grid place-items-center text-2xl">🌅</div>}
                </div>
                <div className="p-2">
                  <div className="text-xs leading-snug" style={{ minHeight: 32, color: "var(--ink)" }}>{r.title.slice(0, 46)}</div>
                  <div className="font-display font-semibold text-sm mt-1">{zl(r.price_gross)}</div>
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* ── OFERTY ── */}'''),
])

# ---- Product.tsx ----
patch("src/pages/Product.tsx", [
 ('import { getOffer, offerReviews, addReview, offerImages, trackView, similarOffers } from "../lib/api";',
  'import { getOffer, offerReviews, addReview, offerImages, trackView, similarOffers } from "../lib/api";\nimport { pushRecent } from "../lib/recent";'),
 ('    getOffer(id).then((d) => setO(d as Offer)).catch((e) => setErr(String((e as Error).message))).finally(() => setLoading(false));',
  '    getOffer(id).then((d) => { const oo = d as Offer; setO(oo); pushRecent({ offer_id: oo.offer_id, title: oo.title, price_gross: oo.price_gross, image_url: oo.image_url }); }).catch((e) => setErr(String((e as Error).message))).finally(() => setLoading(false));'),
])

# ---- Koszyk.tsx: pasek postępu do darmowej dostawy ----
patch("src/pages/Koszyk.tsx", [
 ('              {!freeShip && <div className="text-xs mb-2" style={{ color: "var(--gold)" }}>Do darmowej dostawy brakuje: {zl(FREE_SHIP - total)}</div>}',
  '''              {!freeShip ? (
                <div className="mb-3">
                  <div className="text-xs mb-1" style={{ color: "var(--gold)" }}>Do darmowej dostawy brakuje: <b>{zl(FREE_SHIP - total)}</b></div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.round(total / FREE_SHIP * 100))}%`, background: "linear-gradient(90deg,#C8965A,#E8C896)", transition: "width .3s" }} />
                  </div>
                </div>
              ) : (
                <div className="text-xs mb-2" style={{ color: "var(--green)" }}>🎉 Masz darmową dostawę!</div>
              )}'''),
])
print("ALL OK")
