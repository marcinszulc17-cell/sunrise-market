#!/usr/bin/env python3
import io, sys, os
ROOT = sys.argv[1]
p = os.path.join(ROOT, "src/pages/Portfel.tsx")
s = io.open(p, encoding="utf-8").read()

edits = [
# 1) guard bez nawigacji -> z powrotem do sklepu
('''  if (!userId) return <div className="p-6 text-zinc-300">Zaloguj się, aby zobaczyć portfel. <a href="/login" className="text-amber-400 underline">Przejdź do logowania</a>.</div>;''',
'''  if (!userId) return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <a href="/" className="navlink text-sm">← Sklep</a>
      <p className="mt-4" style={{ color: "var(--mut)" }}>Zaloguj się, aby zobaczyć portfel. <a href="/login" className="underline" style={{ color: "var(--gold)" }}>Przejdź do logowania</a>.</p>
    </div>
  );'''),
# 2) nagłówek/nawigacja na górze portfela
('''  return (
    <div className="mx-auto max-w-2xl p-6 text-zinc-100">
      <h1 className="text-2xl font-bold mb-1">Portfel Sunrise Pay</h1>''',
'''  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex items-center gap-2 mb-6">
        <a href="/" className="flex items-center gap-2"><div className="w-8 h-8 rounded-lg grid place-items-center" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)", color: "#241606" }}>☀</div><span className="font-display text-lg font-semibold">Sunrise Market</span></a>
        <div className="flex-1" />
        <a href="/koszyk" className="navlink text-sm">🛒 Koszyk</a>
        <a href="/zamowienia" className="navlink text-sm">Zamówienia</a>
        <a href="/" className="navlink text-sm">← Sklep</a>
      </div>
      <h1 className="font-display text-2xl font-semibold mb-1">Portfel Sunrise Pay</h1>'''),
]
for old, new in edits:
    assert s.count(old) == 1, f"expected 1 of <<{old[:48]}>> got {s.count(old)}"
    s = s.replace(old, new)
io.open(p, "w", encoding="utf-8").write(s)
print("patched Portfel.tsx")
