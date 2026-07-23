import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { checkout, validateCoupon, walletBalance, listShippingLanes, cartLanes, recommendedOffers, similarOffers, smartStatus, smartSubscribe, type ShipMethod, type CartLane, type ShipAddress, type CouponCheck } from "../lib/api";
import { useCart, setQty, removeItem, clearCart, cartTotal, addToCart } from "../lib/cart";
import { topupWallet, redeemPoints } from "../lib/payments";
import { saveIntent, loadIntent, clearIntent } from "../lib/checkoutIntent";

import { zl, pkt } from "../lib/money";
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
  const [points, setPoints] = useState<number>(0); // saldo punktów (cashback) do wymiany
  const [linked, setLinked] = useState(true);
  const [currency, setCurrency] = useState<"SUNRISE_PAY" | "GOLD_PAY">("SUNRISE_PAY"); // Gold Pay: wkrótce
  const [recs, setRecs] = useState<any[]>([]); // cross-sell „Może Cię zainteresować"
  const [resuming, setResuming] = useState(false); // wznawianie płatności po powrocie ze Stripe
  const [topupAmount, setTopupAmount] = useState<string>(""); // kwota w polu inline doładowania
  const [coupon, setCoupon] = useState("");
  const [couponRes, setCouponRes] = useState<CouponCheck | null>(null);

  const ids = cart.map((i) => i.offer_id);
  const idsKey = ids.join(",");

  async function refreshWallet() {
    try { const w = await walletBalance(); setBalance(w.balance); setLinked(w.linked); setPoints(w.points); } catch { setBalance(null); }
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

  // cross-sell: podobne do pierwszej pozycji, w razie czego „dla Ciebie"
  useEffect(() => {
    if (!ids.length) { setRecs([]); return; }
    (async () => {
      let list: any[] = [];
      try { list = await similarOffers(ids[0], 12); } catch { /* ignore */ }
      if (!list.length) { try { list = await recommendedOffers(12); } catch { /* ignore */ } }
      const inCart = new Set(ids);
      setRecs(list.filter((r) => r && !inCart.has(r.offer_id)).slice(0, 4));
    })();
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
  const discount = couponRes?.valid ? Math.min(Number(couponRes.discount || 0), total) : 0;
  const grand = Math.max(0, total + shipCost - discount);
  const cashback = Math.round(total * 0.03 * 100) / 100;
  const shortfall = balance != null ? Math.max(0, grand - balance) : 0;
  const enoughFunds = balance != null && balance >= grand;
  // kwota w polu doładowania: domyślnie zaokrąglony w górę brakujący shortfall
  const topupDisplay = topupAmount !== "" ? topupAmount : (shortfall > 0 ? String(Math.ceil(shortfall)) : "");
  const effectiveTopup = Math.max(shortfall, Math.ceil(Number(topupDisplay) || 0));
  // szybkie kwoty doładowania — zachęta do większego, rzadszego zasilenia (mniej opłat Stripe)
  const ceilShort = Math.ceil(shortfall);
  const round50 = Math.max(50, Math.ceil(shortfall / 50) * 50);
  const topupSuggestions = Array.from(new Set([ceilShort, round50, round50 + 50, round50 + 150])).filter((v) => v >= ceilShort).slice(0, 4);

  // pozycje pogrupowane po torze
  const groups = useMemo(() => {
    const g: Record<string, typeof cart> = {};
    for (const i of cart) { const l = lanes[i.offer_id]?.lane ?? "seller"; (g[l] ||= []).push(i); }
    return g;
  }, [cart, lanes]);

  // Wspólna realizacja zakupu — używana przez „Zapłać" i przez auto-wznowienie po doładowaniu.
  async function applyCoupon() {
    const code = coupon.trim();
    if (!code) { setCouponRes(null); return; }
    setCouponRes(await validateCoupon(code, total));
  }

  async function runCheckout(useAddr: ShipAddress, useCodes: string[], useCoupon?: string) {
    setBusy(true); setMsg(null);
    try {
      const cCode = useCoupon ?? (couponRes?.valid ? couponRes.code : undefined);
      const res = await checkout(cart.map((i) => ({ offer_id: i.offer_id, qty: i.qty })), useCodes, useAddr, cCode);
      clearIntent();
      clearCart();
      setDone({ order: res.order_id, paid: res.paid, cashback: res.cashback, balance: res.balance });
    } catch (e: any) {
      let m = e?.message ?? String(e);
      try { const b = await e.context.json(); if (b?.error) m = b.error; } catch { /* ignore */ }
      setMsg(m);
      refreshWallet();
    } finally { setBusy(false); setResuming(false); }
  }

  async function pay() {
    setMsg(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = "/login"; return; }
    if (!addrOk) { setMsg("Uzupełnij adres dostawy (imię i nazwisko, ulica, miasto, kod)."); return; }
    if (balance != null && balance < grand) { setMsg("Za mało środków w portfelu — doładuj brakującą kwotę poniżej."); return; }
    await runCheckout(addr, selectedCodes);
  }

  // Auto-doładowanie w checkoutcie: dopłać brakującą kwotę przez Stripe, wróć do koszyka
  // i dokończ płatność z portfela. Adres + wybór dostawy zapisujemy jako „zamiar".
  async function topupAndPay(amt: number) {
    setMsg(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = "/login"; return; }
    if (!addrOk) { setMsg("Uzupełnij adres dostawy przed doładowaniem."); return; }
    const amount = Math.max(shortfall, Math.ceil(amt) || 0);
    if (amount <= 0) { setMsg("Podaj kwotę doładowania."); return; }
    saveIntent({ addr, shippingCodes: selectedCodes, grand, topup: amount, coupon: couponRes?.valid ? couponRes.code : undefined });
    setBusy(true);
    try {
      await topupWallet(amount, "/koszyk?topup=success"); // redirect na Stripe następuje w środku
    } catch (e: any) {
      setBusy(false);
      clearIntent();
      setMsg(e?.message ?? "Nie udało się rozpocząć doładowania.");
    }
  }

  // Synergia z punktami: zamień punkty (cashback) na saldo i od razu zapłać.
  // Pokazujemy tylko, gdy punkty pokrywają cały brakujący shortfall.
  async function redeemAndPay() {
    setMsg(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = "/login"; return; }
    if (!addrOk) { setMsg("Uzupełnij adres dostawy przed zapłatą."); return; }
    const use = Math.ceil(shortfall);
    if (use <= 0 || points < use) return;
    setBusy(true);
    try {
      const r = await redeemPoints(use);
      if (!r.available) { setBusy(false); setMsg("Zamiana punktów ruszy wkrótce — na razie doładuj kartą poniżej lub w MySunrise."); return; }
      if (r.error) { setBusy(false); setMsg(r.error); return; }
      if (typeof r.points === "number") setPoints(r.points);
      let bal: number | null = typeof r.balance === "number" ? r.balance : null;
      if (bal == null) { const w = await walletBalance().catch(() => null); if (w) { bal = w.balance; setLinked(w.linked); } }
      if (bal != null) setBalance(bal);
      if (bal != null && bal >= grand) {
        await runCheckout(addr, selectedCodes);
      } else {
        setBusy(false);
        setMsg("Zamieniono punkty, ale saldo wciąż nie wystarcza — dopłać brakującą kwotę poniżej.");
      }
    } catch (e: any) {
      setBusy(false);
      setMsg(e?.message ?? "Nie udało się zamienić punktów.");
    }
  }

  // Powrót ze Stripe (?topup=success): odśwież saldo i — jeśli środki wystarczą — dokończ płatność.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("topup");
    if (!p) return;
    const clean = () => { try { window.history.replaceState({}, "", "/koszyk"); } catch { /* ignore */ } };
    const intent = loadIntent();
    if (intent) setAddr(intent.addr);
    if (p === "cancel") {
      setMsg("Doładowanie anulowane. Możesz spróbować ponownie.");
      clean();
      return;
    }
    if (p === "success") {
      setResuming(true);
      (async () => {
        const w = await walletBalance().catch(() => null);
        if (w) { setBalance(w.balance); setLinked(w.linked); setPoints(w.points); }
        const need = intent?.grand ?? grand;
        if (w && intent && w.balance >= need) {
          await runCheckout(intent.addr, intent.shippingCodes, intent.coupon);
        } else {
          setResuming(false);
          setMsg("Doładowanie w toku — środki zaksięgują się w portfelu za chwilę. Kliknij „Zapłać saldem”, gdy saldo wystarczy.");
        }
        clean();
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 backdrop-blur" style={{ background: "var(--header)", borderBottom: "1px solid var(--line)" }}>
        <div className="mx-auto max-w-4xl px-4 py-3 flex items-center gap-3">
          <a href="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl grid place-items-center text-lg" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>☀</div>
            <span className="font-display text-xl font-semibold">Sunrise Market</span>
          </a>
          <div className="flex-1" />
          <a href="/" className="text-sm navlink">← Sklep</a>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="font-display text-3xl font-semibold mb-6">Koszyk</h1>

        {done ? (
          <div className="rounded-2xl p-6" style={{ background: "var(--glass)", border: "1px solid rgba(122,184,154,.4)" }}>
            <div className="text-2xl font-display font-semibold mb-2" style={{ color: "var(--green)" }}>Zamówienie opłacone ✅</div>
            <p className="text-sm" style={{ color: "var(--ink)" }}>
              Zapłacono <b>{zl(done.paid)}</b> z portfela Sunrise Pay. Cashback <b style={{ color: "var(--green)" }}>+{pkt(done.cashback)} pkt</b> trafił na portfel
              {done.balance != null && <> — nowe saldo: <b>{zl(done.balance)}</b></>}.
            </p>
            <p className="text-xs mt-2" style={{ color: "var(--mut)" }}>Nr zamówienia: {done.order}</p>
            <div className="flex gap-3 mt-4">
              <a href="/" className="rounded-xl px-5 py-2 font-semibold text-black" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>Kupuj dalej</a>
              <a href="/zamowienia" className="rounded-xl px-5 py-2 text-sm" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>Moje zamówienia</a>
              <a href="/portfel" className="rounded-xl px-5 py-2 text-sm" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>Portfel</a>
            </div>
          </div>
        ) : cart.length === 0 ? (
          <p style={{ color: "var(--mut)" }}>Koszyk jest pusty. <a href="/" className="text-amber-400 underline">Przejdź do sklepu</a>.</p>
        ) : (
          <>
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
                      {etaSample && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(200,150,90,.12)", color: "var(--gold)" }}>⏱ {etaSample}</span>}
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
                                 style={{ border: selected[lane] === m.code ? "1px solid rgba(200,150,90,.6)" : "1px solid var(--line)" }}>
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
              {!freeShip ? (
                <div className="mb-3">
                  <div className="text-xs mb-1" style={{ color: "var(--gold)" }}>Do darmowej dostawy brakuje: <b>{zl(FREE_SHIP - total)}</b></div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.round(total / FREE_SHIP * 100))}%`, background: "linear-gradient(90deg,#C8965A,#E8C896)", transition: "width .3s" }} />
                  </div>
                </div>
              ) : (
                <div className="text-xs mb-2" style={{ color: "var(--green)" }}>🎉 Masz darmową dostawę!</div>
              )}
              {discount > 0 && (
                <div className="flex justify-between text-sm mb-1" style={{ color: "var(--green)" }}>
                  <span>Rabat ({couponRes?.code})</span><span>−{zl(discount)}</span>
                </div>
              )}
              <div className="flex gap-2 my-2">
                <input value={coupon} onChange={(e) => setCoupon(e.target.value)} onKeyDown={(e) => e.key === "Enter" && applyCoupon()} placeholder="Kod rabatowy"
                       className="flex-1 rounded-lg px-3 py-2 text-sm outline-none" style={{ background: "var(--glass)", border: "1px solid var(--line)", color: "var(--ink)" }} />
                <button onClick={applyCoupon} className="px-3 py-2 rounded-lg text-sm font-semibold" style={{ background: "var(--glass)", border: "1px solid var(--line)", color: "var(--ink)" }}>Zastosuj</button>
              </div>
              {couponRes && !couponRes.valid && <div className="text-xs mb-2" style={{ color: "#F25CB0" }}>{couponRes.message}</div>}
              <div className="flex justify-between mb-2 mt-1"><span style={{ color: "var(--mut)" }}>Razem</span><span className="font-display text-2xl font-semibold">{zl(grand)}</span></div>
              <div className="flex justify-between text-sm mb-2"><span style={{ color: "var(--mut)" }}>Cashback 3% (punkty)</span><span style={{ color: "var(--green)" }}>+{pkt(cashback)} pkt</span></div>
              <SmartCard />

              {/* wybór waluty portfela — Gold Pay „wkrótce" (czeka na kurs pay-fx w MySunrise) */}
              <div className="mt-4 pt-3" style={{ borderTop: "1px solid var(--line)" }}>
                <div className="text-xs mb-2" style={{ color: "var(--mut)" }}>Płatność portfelem</div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setCurrency("SUNRISE_PAY")}
                          className="text-sm rounded-lg px-3 py-2 text-left"
                          style={{ border: currency === "SUNRISE_PAY" ? "1px solid rgba(200,150,90,.6)" : "1px solid var(--line)", background: "var(--glass)" }}>
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
                <div className="flex flex-col gap-2">
                  <div className="rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(200,150,90,.12)", color: "var(--gold)" }}>
                    Brakuje <b>{zl(shortfall)}</b> w portfelu. Zapłać punktami albo doładuj — bez wychodzenia z koszyka:
                  </div>
                  {points >= Math.ceil(shortfall) && (
                    <>
                      <button onClick={redeemAndPay} disabled={busy || resuming || !addrOk}
                              className="w-full rounded-xl py-3 font-semibold text-black disabled:opacity-50"
                              style={{ background: "linear-gradient(135deg,#7AB89A,#12b981)" }}>
                        Wymień {pkt(Math.ceil(shortfall))} pkt i zapłać →
                      </button>
                      <div className="text-center text-xs" style={{ color: "var(--mut)" }}>masz {pkt(points)} pkt · albo doładuj kartą:</div>
                    </>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    {topupSuggestions.map((v) => (
                      <button key={v} onClick={() => setTopupAmount(String(v))}
                              className="rounded-lg px-3 py-1.5 text-sm"
                              style={{ border: topupDisplay === String(v) ? "1px solid rgba(200,150,90,.6)" : "1px solid var(--line)", background: "var(--glass)" }}>
                        {zl(v)}
                      </button>
                    ))}
                    <input type="number" min={ceilShort} step={1} inputMode="numeric"
                           value={topupDisplay} onChange={(e) => setTopupAmount(e.target.value)}
                           className="w-24 rounded-lg px-3 py-2 text-sm outline-none"
                           style={{ background: "var(--glass)", border: "1px solid var(--line)" }} />
                    <span className="text-xs" style={{ color: "var(--mut)" }}>min {zl(shortfall)}</span>
                  </div>
                  <div className="text-xs" style={{ color: "var(--mut)" }}>Większe doładowanie = mniej opłat i zapas w portfelu na kolejne zakupy.</div>
                  <button onClick={() => topupAndPay(effectiveTopup)} disabled={busy || resuming || !addrOk}
                          className="w-full rounded-xl py-3 font-semibold text-black disabled:opacity-50"
                          style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>
                    {busy ? "Przekierowuję do płatności…" : `Doładuj ${zl(effectiveTopup)} i zapłać →`}
                  </button>
                  {!addrOk && <div className="text-xs" style={{ color: "var(--gold)" }}>Najpierw uzupełnij adres dostawy powyżej.</div>}
                  <a href="/portfel" className="text-center text-xs underline" style={{ color: "var(--mut)" }}>albo doładuj w aplikacji MySunrise</a>
                </div>
              ) : (
                <button onClick={pay} disabled={busy || resuming || !addrOk || (balance != null && !enoughFunds)}
                        className="w-full rounded-xl py-3 font-semibold text-black disabled:opacity-50"
                        style={{ background: "linear-gradient(135deg,#C8965A,#A97B42)" }}>
                  {resuming ? "Dokańczam zamówienie…" : busy ? "Płacę…" : "Zapłać saldem (Sunrise Pay)"}
                </button>
              )}
              <p className="text-xs mt-3" style={{ color: "var(--mut)" }}>
                Płatność wyłącznie z portfela Sunrise Pay. Doładowanie kartą (Stripe) zasila portfel; po zakupie 3% wraca jako punkty.
              </p>
            </div>
          </div>
          {recs.length > 0 && (
            <section className="mt-8">
              <h2 className="font-display text-xl font-semibold mb-4">Może Cię zainteresować</h2>
              <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))" }}>
                {recs.map((r) => (
                  <div key={r.offer_id} className="rounded-2xl p-3 flex flex-col" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
                    <a href={`/produkt/${r.offer_id}`} className="font-medium text-sm hover:text-amber-300 flex-1">{r.title}</a>
                    <div className="flex items-center justify-between mt-2">
                      <span className="font-display text-lg font-semibold">{zl(r.price_gross)}</span>
                      <button onClick={() => addToCart({ offer_id: r.offer_id, title: r.title, price: Number(r.price_gross) })}
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg text-black" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>+ Dodaj</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
          </>
        )}
      </main>
    </div>
  );
}

function SmartCard() {
  const [member, setMember] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { smartStatus().then(setMember).catch(() => setMember(false)); }, []);
  if (member === null) return null;
  if (member) return <div className="mt-3 rounded-xl px-3 py-2 text-xs" style={{ background: "rgba(122,184,154,.10)", border: "1px solid rgba(122,184,154,.4)", color: "var(--green)" }}>⚡ Sunrise Smart aktywny — darmowa dostawa InPost od 49 zł</div>;
  async function buy() {
    setBusy(true); setMsg(null);
    try { const r: any = await smartSubscribe(); if (r?.need_topup) setMsg("Za mało środków w portfelu — doładuj Sunrise Pay."); else setMember(true); }
    catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="mt-3 rounded-xl p-3" style={{ background: "linear-gradient(140deg,#061434,#123a86)", border: "1px solid rgba(232,200,150,.4)" }}>
      <div className="text-sm font-semibold" style={{ color: "#E8C896" }}>⚡ Sunrise Smart — darmowe wysyłki</div>
      <div className="text-xs mt-1" style={{ color: "rgba(255,255,255,.75)" }}>Darmowa dostawa InPost na wszystkie zamówienia od 49 zł. 59 zł/rok.</div>
      <button onClick={buy} disabled={busy} className="mt-2 text-sm font-semibold px-3 py-1.5 rounded-lg text-black disabled:opacity-50" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>{busy ? "Kupuję…" : "Kup Sunrise Smart (59 zł/rok)"}</button>
      {msg && <div className="text-xs mt-1" style={{ color: "#F8A8D2" }}>{msg}</div>}
    </div>
  );
}
