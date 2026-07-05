import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { checkout, listShipping, myBalance } from "../lib/api";
import { useCart, setQty, removeItem, clearCart, cartTotal } from "../lib/cart";

const zl = (v: number) => Math.round(v).toLocaleString("pl-PL") + " zł";
type Ship = { code: string; name: string; carrier: string | null; price_gross: number };

export default function Koszyk() {
  const cart = useCart();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState<{ order: string; paid: number; cashback: number; balance: number | null } | null>(null);

  const [ship, setShip] = useState<Ship[]>([]);
  const [shipCode, setShipCode] = useState<string>("");
  const [addr, setAddr] = useState({ name: "", phone: "", street: "", city: "", postal: "" });
  const addrOk = !!(addr.name && addr.street && addr.city && addr.postal);
  const [balance, setBalance] = useState<number | null>(null);
  async function refreshBalance() { try { setBalance(await myBalance()); } catch { setBalance(null); } }
  useEffect(() => {
    listShipping().then((d) => { const s = d as Ship[]; setShip(s); if (s[0]) setShipCode(s[0].code); }).catch(() => {});
    supabase.auth.getUser().then(({ data }) => { if (data.user) refreshBalance(); });
  }, []);

  const total = cartTotal();
  const FREE_SHIP = 149;
  const freeShip = total >= FREE_SHIP;
  const shipCost = freeShip ? 0 : Number(ship.find((s) => s.code === shipCode)?.price_gross ?? 0);
  const grand = total + shipCost;
  const cashback = Math.round(total * 0.03);
  // Inwariant Sunrise Pay: płacisz wyłącznie z portfela; musisz mieć saldo >= kwota.
  const shortfall = balance != null ? Math.max(0, grand - balance) : 0;
  const enoughFunds = balance != null && balance >= grand;

  async function pay() {
    setMsg(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = "/login"; return; }
    if (!addrOk) { setMsg("Uzupełnij adres dostawy (imię i nazwisko, ulica, miasto, kod)."); return; }
    if (balance != null && balance < grand) { setMsg("Za mało środków w portfelu — najpierw doładuj Sunrise Pay."); return; }
    setBusy(true);
    try {
      const res = await checkout(cart.map((i) => ({ offer_id: i.offer_id, qty: i.qty })), shipCode, addr);
      clearCart();
      setDone({ order: res.order_id, paid: res.paid, cashback: res.cashback, balance: res.balance });
    } catch (e: any) {
      let m = e?.message ?? String(e);
      try { const b = await e.context.json(); if (b?.error) m = b.error; } catch { /* ignore */ }
      setMsg(m);
      refreshBalance();
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
              Zapłacono <b>{zl(done.paid)}</b> z portfela. Cashback <b style={{ color: "var(--green)" }}>+{zl(done.cashback)}</b> wrócił na saldo
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
            {/* pozycje */}
            <div className="md:col-span-2 flex flex-col gap-3">
              {cart.map((i) => (
                <div key={i.offer_id} className="flex items-center gap-4 rounded-2xl p-4" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
                  <div className="flex-1">
                    <a href={`/produkt/${i.offer_id}`} className="font-semibold hover:text-amber-300">{i.title}</a>
                    <div className="text-sm" style={{ color: "var(--mut)" }}>{zl(i.price)} / szt.</div>
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

              <div className="mb-4">
                <div className="text-sm mb-2 flex items-center justify-between">
                  <span style={{ color: "var(--mut)" }}>Dostawa</span>
                  {freeShip
                    ? <span style={{ color: "var(--green)" }}>🎉 Darmowa dostawa!</span>
                    : <span style={{ color: "var(--gold)" }}>Do darmowej: {zl(FREE_SHIP - total)}</span>}
                </div>
                <div className="flex flex-col gap-1">
                  {ship.map((s) => (
                    <label key={s.code} className="flex items-center justify-between text-sm cursor-pointer rounded-lg px-2 py-1.5"
                           style={{ border: shipCode === s.code ? "1px solid rgba(242,115,29,.5)" : "1px solid var(--line)" }}>
                      <span className="flex items-center gap-2"><input type="radio" checked={shipCode === s.code} onChange={() => setShipCode(s.code)} />{s.name}</span>
                      <span style={{ color: freeShip && Number(s.price_gross) > 0 ? "var(--green)" : "var(--mut)" }}>
                        {freeShip ? (Number(s.price_gross) === 0 ? "0 zł" : <><s style={{ opacity: .5 }}>{zl(s.price_gross)}</s> 0 zł</>) : (Number(s.price_gross) === 0 ? "0 zł" : zl(s.price_gross))}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex justify-between text-sm"><span style={{ color: "var(--mut)" }}>Produkty</span><span>{zl(total)}</span></div>
              <div className="flex justify-between text-sm"><span style={{ color: "var(--mut)" }}>Dostawa</span><span>{zl(Number(shipCost))}</span></div>
              <div className="flex justify-between mb-2 mt-1"><span style={{ color: "var(--mut)" }}>Razem</span><span className="font-display text-2xl font-semibold">{zl(grand)}</span></div>
              <div className="flex justify-between text-sm mb-2"><span style={{ color: "var(--mut)" }}>Cashback 3%</span><span style={{ color: "var(--green)" }}>+{zl(cashback)}</span></div>

              {balance != null && (
                <div className="flex justify-between text-sm mb-4 pt-2" style={{ borderTop: "1px solid var(--line)" }}>
                  <span style={{ color: "var(--mut)" }}>Saldo portfela</span>
                  <span style={{ color: enoughFunds ? "var(--green)" : "#F8A8D2" }}>{zl(balance)}</span>
                </div>
              )}

              {msg && <div className="mb-3 rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(242,92,176,.12)", color: "#F8A8D2" }}>{msg}</div>}

              {/* Inwariant Sunrise Pay: bez wystarczającego salda nie można zapłacić — najpierw doładowanie. */}
              {balance != null && !enoughFunds ? (
                <>
                  <div className="mb-3 rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(242,115,29,.12)", color: "var(--gold)" }}>
                    Za mało środków w portfelu. Brakuje <b>{zl(shortfall)}</b> — najpierw doładuj Sunrise Pay.
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
                Płatność wyłącznie z portfela Sunrise Pay. Po zakupie cashback 3% wraca na saldo.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
