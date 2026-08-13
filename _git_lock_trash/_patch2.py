#!/usr/bin/env python3
import io, sys, os
ROOT = sys.argv[1]
p = os.path.join(ROOT, "src/pages/Market.tsx")
s = io.open(p, encoding="utf-8").read()
old = '''              {b.image_url ? (
                <img src={b.image_url} alt={b.headline} loading="eager"
                     className="block w-full h-auto" style={{ aspectRatio: "1600 / 460", objectFit: "cover" }} />
              ) : ('''
new = '''              {b.image_url ? (
                <picture>
                  <source media="(max-width: 640px)" srcSet={b.image_url.replace(/(\\.\\w+)$/, "_m$1")} />
                  <img src={b.image_url} alt={b.headline} loading="eager" width={1300} height={360}
                       className="block w-full h-auto" />
                </picture>
              ) : ('''
c = s.count(old)
assert c == 1, f"expected 1 got {c}"
s = s.replace(old, new)
io.open(p, "w", encoding="utf-8").write(s)
print("patched Market.tsx hero (picture + 1300x360)")
