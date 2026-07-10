import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { checkout, walletBalance, listShippingLanes, cartLanes, type ShipMethod, type CartLane } from "../lib/api";
import { useCart, setQty, removeItem, clearCart, cartTotal } from "../lib/cart";

const zl = (v: number) => Math.round(v).toLocaleString("pl-PL") + " zł";
const FREE_SHIP = 149;

const laneMeta: Record<string, { title: string; icon: string; note: string }> = {
  ours: { title: "Sunrise — magazyn / dropship", icon: "☀", note: "Wysyłamy my (Sunrise). Kurier do Ciebie." },
  seller: { title: "Sprzedawcy Sunrise Market", icon: "📦", note: "Wysyłka od partnera — Paczkomat lub kurier." },
};

export default function Koszyk() {
  const cart = useCart();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState<{ order: string; paid: number; cashback: number; balance: number | null } | null>(null);

  const [methods, setMethods] = useState<ShipMethod[]>([]);
  const [lanes, setLanes] = useState<Record<string, CartLane>>({}); // offer_id -> lane info
  const [selected, setSelected] = useState<Record<string, string>>({}); // lane -> shipping code
  const [addr, setAddr] = useState({ name: "", phone: "", street: "", city: "", postal: "" });
  const addrOk = !!(addr.name && addr.street && addr.city && addr.postal);
  const [balance, setBalance] = useState<number | null>(null);
  const [linked, setLinked] = useState(true);
  const [currency, setCurrency] = useState<"SUNRISE_PAY" | "GOLD_PAY">("SUNRISE_PAY"); // Gold Pay: wkrótce

  const ids = cart.map((i) => i.offer_id);
  const idsKey = ids.join(",");

  async function refreshWallet() {
    try { const w = await walletBalance(); setBalance(w.balance); setLinked(w.linked); } catch { setBalance(null); }
  }
  useEffect(() => {
    listShippingLanes().then(setMethods).catch(() => {});
    supabase.auth.getUser().then(({ data }) => { if (data.user) refreshWallet(); });
  }, []);
  // pobierz tory dla ofert w koszyku
  useEffect(() => {
    if (!ids.length) { setLanes({}); return; }
    cartLanes(ids).then((rows) => {
      const map: Record<string, CartLane> = {};
      for (const r of rows) map[r.offer_id] = r;
      setLanes(map);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  // które tory są obecne w koszyku
  const presentLanes = useMemo(() => {
    const s = new Set<string>();
    for (const i of cart) s.add(lanes[i.offer_id]?.lane ?? "seller");
    return Array.from(s);
  }, [cart, lanes]);

  // domyślne metody per tor (najtańsza pasująca)
  useEffect(() => {
    setSelected((prev) => {
      const next = { ...prev };
      for (const lane of presentLanes) {
        if (next[lane] && methods.some((m) => m.code === next[lane] && m.lanes.includes(lane))) continue;
        const opt = methods.filter((m) => m.lanes.includes(lane));
        if (opt[0]) next[lane] = opt[0].code;
      }
      // usuń tory już nieobecne
      for (const k of Object.keys(next)) if (!presentLanes.includes(k)) delete next[k];
      return next;
    });
  }, [presentLanes, methods]);

  const total = cartTotal();
  const freeShip = total >= FREE_SHIP;
  const selectedCodes = presentLanes.map((l) => selected[l]).filter(Boolean) as string[];
  const rawShip = selectedCodes.reduce((a, c) => a + Number(methods.find((m) => m.code === c)?.price_gross ?? 0), 0);
  const shipCost = freeShip ? 0 : rawShip;
  const grand = total + shipCost;
  const cashback = Math.round(total * 0.03);
  const shortfall = balance != null ? Math.max(0, grand - balance) : 0;
  const enoughFunds = balance != null && balance >= grand;

  // pozycje pogrupowane po torze
  const groups = useMemo(() => {
    const g: Record<string, typeof cart> = {};
    for (const i of cart) { const l = lanes[i.offer_id]?.lane ?? "seller"; (g[l] ||= []).push(i); }
    return g;
  }, [cart, lanes]);

  async function pay() {
    setMsg(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = "/login"; return; }
    if (!addrOk) { setMsg("Uzupełnij adres dostawy (imię i nazwisko, ulica, miasto, kod)."); return; }
    if (balance != null && balance < grand) { setMsg("Za mało środków w portfelu — najpierw doładuj Sunrise Pay."); return; }
    setBusy(true);
    try {
      const res = await checkout(cart.map((i) => ({ offer_id: i.offer_id, qty: i.qty })), selectedCodes, addr);
      clearCart();
      setDone({ order: res.order_id, paid: res.paid, cashback: res.cashback, balance: res.balance });
    } catch (e: any) {
      let m = e?.message ?? String(e);
      try { const b = await e.context.json(); if (b?.error) m = b.error; } catch { /* ignore */ }
      setMsg(m);
      refreshWallet();
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 backdrop-blur" style={{ background: "rgba(7,7,15,.72)", borderBottom: "1px solid var(--line)" }}>
        <div className="mx-auto max-w-4xl px-4 py-3 flex items-center gap-3">
          <a href="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl grid place-items-center text-lg" style={{ background: "linear-gradient(135deg,#F2731D,#E0A21B)" }}>☀</div>
            <span className="font-display text-xl font-semibold">Sunrise Market</span>
          </a>
          <div className="flex-1" />
          <a href="/" className="text-sm text-zinc-300 hover:text-white">← Sklep</a>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="font-display text-3xl font-semibold mb-6">Koszyk</h1>

        {done ? (
          <div className="rounded-2xl p-6" style={{ background: "var(--glass)", border: "1px solid rgba(52,227,160,.4)" }}>
            <div className="text-2xl font-display font-semibold mb-2" style={{ color: "var(--green)" }}>Zamówienie opłacone ✅</div>
            <p className="text-sm" style={{ color: "var(--ink)" }}>
              Zapłacono <b>{zl(done.paid)}</b> z portfela Sunrise Pay. Cashback <b style={{ color: "var(--green)" }}>+{Math.round(done.cashback).toLocaleString("pl-PL")} pkt</b> trafił na portfel
              {done.balance != null && <> — nowe saldo: <b>{zl(done.balance)}</b></>}.
            </p>
            <p className="text-xs mt-2" style={{ color: "var(--mut)" }}>Nr zamówienia: {done.order}</p>
            <div className="flex gap-3 mt-4">
              <a href="/" className="rounded-xl px-5 py-2 font-semibold text-black" style={{ background: "linear-gradient(135deg,#F2731D,#E0A21B)" }}>Kupuj dalej</a>
              <a href="/zamowienia" className="rounded-xl px-5 py-2 text-sm" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>Moje zamówienia</a>
              <a href="/portfel" className="rounded-xl px-5 py-2 text-sm" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>Portfel</a>
            </div>
          </div>
        ) : cart.length === 0 ? (
          <p style={{ color: "var(--mut)" }}>Koszyk jest pusty. <a href="/" className="text-amber-400 underline">Przejdź do sklepu</a>.</p>
        ) : (
          <div className="grid gap-6 md:grid-cols-3">
            {/* pozycje pogrupowane po torze realizacji */}
            <div className="md:col-span-2 flex flex-col gap-5">
              {presentLanes.map((lane) => {
                const meta = laneMeta[lane] ?? laneMeta.seller;
                const opt = methods.filter((m) => m.lanes.includes(lane));
                const etaSample = (groups[lane] ?? []).map((i) => lanes[i.offer_id]?.eta).find(Boolean);
                return (
                  <div key={lane} className="rounded-2xl p-4" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="font-semibold flex items-center gap-2">{meta.icon} {meta.title}</div>
                      {etaSample && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(242,115,29,.12)", color: "var(--gold)" }}>⏱ {etaSample}</span>}
                    </div>
                    <div className="text-xs mb-3" style={{ color: "var(--mut)" }}>{meta.note}</div>
                    <div className="flex flex-col gap-2">
                      {(groups[lane] ?? []).map((i) => (
                        <div key={i.offer_id} className="flex items-center gap-3">
                          <div className="flex-1">
                            <a href={`/produkt/${i.offer_id}`} className="font-medium hover:text-amber-300">{i.title}</a>
                            {i.variant && <div className="text-xs" style={{ color: "var(--gold)" }}>{i.variant}</div>}
                            <div className="text-xs" style={{ color: "var(--mut)" }}>{zl(i.price)} / szt.</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => setQty(i.offer_id, i.qty - 1)} className="w-8 h-8 rounded-lg" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>−</button>
                            <span className="w-8 text-center">{i.qty}</span>
                            <button onClick={() => setQty(i.offer_id, i.qty + 1)} className="w-8 h-8 rounded-lg" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>+</button>
                          </div>
                          <div className="w-24 text-right font-display text-lg font-semibold">{zl(i.price * i.qty)}</div>
                          <button onClick={() => removeItem(i.offer_id)} className="text-zinc-500 hover:text-rose-400">✕</button>
                        </div>
                      ))}
                    </div>
                    {/* wybór dostawy dla tego toru */}
                    <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--line)" }}>
                      <div className="text-xs mb-2" style={{ color: "var(--mut)" }}>Dostawa dla tej części</div>
                      <div className="flex flex-wrap gap-2">
                        {opt.map((m) => (
                          <label key={m.code} className="flex items-center gap-2 text-sm cursor-pointer rounded-lg px-3 py-1.5"
                                 style={{ border: selected[lane] === m.code ? "1px solid rgba(242,115,29,.6)" : "1px solid var(--line)" }}>
                            <input type="radio" name={`ship-${lane}`} checked={selected[lane] === m.code} onChange={() => setSelected({ ...selected, [lane]: m.code })} />
                            {m.name}
                            <span style={{ color: freeShip && Number(m.price_gross) > 0 ? "var(--green)" : "var(--mut)" }}>
                              {freeShip ? (Number(m.price_gross) === 0 ? "0 zł" : <><s style={{ opacity: .5 }}>{zl(m.price_gross)}</s> 0 zł</>) : (Number(m.price_gross) === 0 ? "0 zł" : zl(m.price_gross))}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* podsumowanie */}
            <div className="rounded-2xl p-5 h-fit" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
              <div className="mb-4">
                <div className="text-sm mb-2" style={{ color: "var(--mut)" }}>Adres dostawy</div>
                <div className="flex flex-col gap-2">
                  {([["name", "Imię i nazwisko"], ["street", "Ulica i nr"], ["city", "Miasto"], ["postal", "Kod pocztowy"], ["phone", "Telefon (opcjonalnie)"]] as const).map(([k, ph]) => (
                    <input key={k} value={(addr as any)[k]} onChange={(e) => setAddr({ ...addr, [k]: e.target.value })}
                           placeholder={ph} className="rounded-lg px-3 py-2 text-sm outline-none"
                           style={{ background: "var(--glass)", border: "1px solid var(--line)" }} />
                  ))}
                </div>
              </div>

              <div className="flex justify-between text-sm mb-1">
                <span style={{ color: "var(--mut)" }}>Produkty</span><span>{zl(total)}</span>
              </div>
              <div className="flex justify-between text-sm mb-1">
                <span style={{ color: "var(--mut)" }}>Dostawa {presentLanes.length > 1 && <>({presentLanes.length} przesyłki)</>}</span>
                <span>{freeShip ? <span style={{ color: "var(--green)" }}>0 zł 🎉</span> : zl(shipCost)}</span>
              </div>
              {!freeShip && <div className="text-xs mb-2" style={{ color: "var(--gold)" }}>Do darmowej dostawy: {zl(FREE_SHIP - total)}</div>}
              <div className="flex justify-between mb-2 mt-1"><span style={{ color: "var(--mut)" }}>Razem</span><span className="font-display text-2xl font-semibold">{zl(grand)}</span></div>
              <div className="flex justify-between text-sm mb-2"><span style={{ color: "var(--mut)" }}>Cashback 3% (punkty)</span><span style={{ color: "var(--green)" }}>+{Math.round(cashback).toLocaleString("pl-PL")} pkt</span></div>

              {/* wybór waluty portfela — Gold Pay „wkrótce" (czeka na kurs pay-fx w MySunrise) */}
              <div className="mt-4 pt-3" style={{ borderTop: "1px solid var(--line)" }}>
                <div className="text-xs mb-2" style={{ color: "var(--mut)" }}>Płatność portfelem</div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setCurrency("SUNRISE_PAY")}
                          className="text-sm rounded-lg px-3 py-2 text-left"
                          style={{ border: currency === "SUNRISE_PAY" ? "1px solid rgba(242,115,29,.6)" : "1px solid var(--line)", background: "var(--glass)" }}>
                    ☀ Sunrise Pay <span style={{ color: "var(--mut)" }}>(zł)</span>
                  </button>
                  <button disabled title="Gold Pay ruszy po uruchomieniu kursu Gold w MySunrise"
                          className="text-sm rounded-lg px-3 py-2 text-left opacity-55 cursor-not-allowed"
                          style={{ border: "1px solid var(--line)", background: "var(--glass)" }}>
                    🟡 Gold Pay <span style={{ color: "var(--mut)" }}>· wkrótce</span>
                  </button>
                </div>
              </div>

              {balance != null && (
                <div className="flex justify-between text-sm mb-4 pt-2 mt-2" style={{ borderTop: "1px solid var(--line)" }}>
                  <span style={{ color: "var(--mut)" }}>Saldo Sunrise Pay</span>
                  <span style={{ color: enoughFunds ? "var(--green)" : "#F8A8D2" }}>{zl(balance)}</span>
                </div>
              )}

              {!linked && (
                <div className="mb-3 rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(56,224,240,.12)", color: "#8fe3ef" }}>
                  Twoje konto nie jest połączone z portfelem MySunrise. Aktywuj Sunrise Pay w aplikacji MySunrise na ten sam e‑mail.
                </div>
              )}
              {msg && <div className="mb-3 rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(242,92,176,.12)", color: "#F8A8D2" }}>{msg}</div>}

              {balance != null && !enoughFunds ? (
                <>
                  <div className="mb-3 rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(242,115,29,.12)", color: "var(--gold)" }}>
                    Za mało środków. Brakuje <b>{zl(shortfall)}</b> — doładuj Sunrise Pay.
                  </div>
                  <a href="/portfel" className="block text-center rounded-xl py-3 font-semibold text-black"
                     style={{ background: "linear-gradient(135deg,#F2731D,#E0A21B)" }}>Doładuj brakujące {zl(shortfall)} →</a>
                </>
              ) : (
                <button onClick={pay} disabled={busy || !addrOk || (balance != null && !enoughFunds)}
                        className="w-full rounded-xl py-3 font-semibold text-black disabled:opacity-50"
                        style={{ background: "linear-gradient(135deg,#F2731D,#D9560C)" }}>
                  {busy ? "Płacę…" : "Zapłać saldem (Sunrise Pay)"}
                </button>
              )}
              <p className="text-xs mt-3" style={{ color: "var(--mut)" }}>
                Płatność wyłącznie z portfela Sunrise Pay. Po zakupie 3% wraca jako punkty na portfel.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
