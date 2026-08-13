#!/usr/bin/env python3
import io, sys, os
ROOT = sys.argv[1]
p = os.path.join(ROOT, "src/pages/Market.tsx")
s = io.open(p, encoding="utf-8").read()
edits = [
('import { useEffect, useState, type MouseEvent } from "react";',
 'import { useEffect, useRef, useState, type MouseEvent } from "react";'),
('  const [bi, setBi] = useState(0); // aktywny baner (rotacja)',
 '''  const [bi, setBi] = useState(0); // aktywny baner (rotacja)
  const [sugg, setSugg] = useState<Offer[]>([]);        // podpowiedzi wyszukiwarki
  const [sOpen, setSOpen] = useState(false);
  const sT = useRef<ReturnType<typeof setTimeout> | null>(null);'''),
('  async function load(query: string | null, slug: string | null = null, sortOverride?: string, lim = 24) {',
 '''  function onSearchChange(val: string) {
    setQ(val);
    if (sT.current) clearTimeout(sT.current);
    if (val.trim().length < 2) { setSugg([]); setSOpen(false); return; }
    setSOpen(true);
    sT.current = setTimeout(() => {
      searchOffers(val, null, { limit: 6 }).then((d) => setSugg(d as Offer[])).catch(() => setSugg([]));
    }, 220);
  }

  async function load(query: string | null, slug: string | null = null, sortOverride?: string, lim = 24) {'''),
('''          <div className="flex-1 flex items-center rounded-xl overflow-hidden"
               style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
            <input value={q} onChange={(e) => setQ(e.target.value)}
                   onKeyDown={(e) => e.key === "Enter" && load(q)}
                   placeholder="Szukaj produktów…"
                   className="flex-1 bg-transparent px-4 py-2 text-sm outline-none placeholder:text-zinc-500" />
            <button onClick={() => load(q)} className="px-5 py-2 text-sm font-semibold text-black"
                    style={{ background: "linear-gradient(135deg,#C8965A,#A97B42)" }}>Szukaj</button>
          </div>''',
 '''          <div className="flex-1 relative">
            <div className="flex items-center rounded-xl overflow-hidden"
                 style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
              <input value={q} onChange={(e) => onSearchChange(e.target.value)}
                     onKeyDown={(e) => { if (e.key === "Enter") { setSOpen(false); load(q); } if (e.key === "Escape") setSOpen(false); }}
                     onFocus={() => { if (q.trim().length >= 2) setSOpen(true); }}
                     onBlur={() => setTimeout(() => setSOpen(false), 150)}
                     placeholder="Szukaj produktów…"
                     className="flex-1 bg-transparent px-4 py-2 text-sm outline-none placeholder:text-zinc-500" />
              <button onClick={() => { setSOpen(false); load(q); }} className="px-5 py-2 text-sm font-semibold text-black"
                      style={{ background: "linear-gradient(135deg,#C8965A,#A97B42)" }}>Szukaj</button>
            </div>
            {sOpen && q.trim().length >= 2 && (sugg.length > 0 || depts.some((d) => d.name.toLowerCase().includes(q.trim().toLowerCase()))) && (
              <div className="absolute left-0 right-0 top-full mt-2 z-30 rounded-xl overflow-hidden py-1"
                   style={{ background: "var(--glass)", border: "1px solid var(--line)", backdropFilter: "blur(14px)", boxShadow: "0 18px 44px -14px rgba(0,0,0,.65)" }}>
                {depts.filter((d) => d.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 3).map((d) => (
                  <button key={"c" + d.slug} onMouseDown={(e) => { e.preventDefault(); setSOpen(false); pickDept(d); }}
                          className="w-full text-left px-4 py-2 text-sm hover:opacity-80" style={{ color: "var(--ink)" }}>📂 {d.name}</button>
                ))}
                {sugg.map((o) => (
                  <a key={o.offer_id} href={`/produkt/${o.offer_id}`} className="flex items-center gap-3 px-4 py-2 hover:opacity-80">
                    <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0" style={{ background: "var(--line)" }}>
                      {o.image_url ? <img src={o.image_url} alt="" className="w-full h-full object-cover" /> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm truncate" style={{ color: "var(--ink)" }}>{o.title}</div>
                      <div className="text-xs" style={{ color: "var(--mut)" }}>{zl(o.price_gross)}</div>
                    </div>
                  </a>
                ))}
                <button onMouseDown={(e) => { e.preventDefault(); setSOpen(false); load(q); }}
                        className="w-full text-left px-4 py-2 text-sm hover:opacity-80" style={{ color: "var(--gold)" }}>🔎 Szukaj „{q}" w całym sklepie</button>
              </div>
            )}
          </div>'''),
]
for old, new in edits:
    assert s.count(old) == 1, (old[:44], s.count(old))
    s = s.replace(old, new)
io.open(p, "w", encoding="utf-8").write(s)
print("autocomplete wired")
