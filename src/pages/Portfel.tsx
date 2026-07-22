import { pkt } from "../lib/money";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { getWalletOps, redeemPoints } from "../lib/payments";
import { walletBalance } from "../lib/api";
import { hasIntent } from "../lib/checkoutIntent";

// Strona Portfel: saldo Sunrise Pay + doładowanie przez Stripe + historia.
// Trasa proponowana: /portfel  (success_url/cancel_url edge funkcji wskazują tutaj).
export default function Portfel() {
  const [userId, setUserId] = useState<string | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [points, setPoints] = useState<number>(0);
  const [gold, setGold] = useState<number | null>(null);
  const [linked, setLinked] = useState<boolean>(true);
  const [ops, setOps] = useState<{ type: string; amount: number; balance_after: number; created_at: string }[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [redeemAmt, setRedeemAmt] = useState<string>("");
  const [redeeming, setRedeeming] = useState<boolean>(false);
  const [redeemAvailable, setRedeemAvailable] = useState<boolean>(true);

  async function doRedeem() {
    const amt = Math.min(Math.floor(points), Math.floor(Number(redeemAmt) || 0));
    if (amt <= 0) { setMsg("Podaj liczbę punktów do wymiany."); return; }
    setRedeeming(true); setMsg(null);
    try {
      const r = await redeemPoints(amt);
      if (!r.available) {
        setRedeemAvailable(false);
        setMsg("Zamiana punktów w Markecie ruszy wkrótce — na razie zrób to w aplikacji MySunrise.");
        return;
      }
      if (r.error) { setMsg(r.error); return; }
      if (typeof r.balance === "number") setBalance(r.balance);
      if (typeof r.points === "number") setPoints(r.points);
      setRedeemAmt("");
      setMsg(`Zamieniono ${pkt(r.converted ?? amt)} pkt na saldo Sunrise Pay.`);
    } catch (e: any) {
      setMsg(e?.message ?? "Nie udało się zamienić punktów.");
    } finally { setRedeeming(false); }
  }

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (uid) {
        const w = await walletBalance(); // żywe saldo Sunrise Pay z MySunrise
        setBalance(w.balance); setPoints(w.points); setGold(w.gold); setLinked(w.linked);
        setOps(await getWalletOps(uid));
      }
    });
    // informacja zwrotna po powrocie ze Stripe
    const p = new URLSearchParams(window.location.search).get("topup");
    if (p === "success") setMsg("Doładowanie przyjęte — saldo zaktualizuje się po potwierdzeniu płatności.");
    if (p === "cancel") setMsg("Doładowanie anulowane.");
  }, []);

  if (!userId) return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <a href="/" className="navlink text-sm">← Sklep</a>
      <p className="mt-4" style={{ color: "var(--mut)" }}>Zaloguj się, aby zobaczyć portfel. <a href="/login" className="underline" style={{ color: "var(--gold)" }}>Przejdź do logowania</a>.</p>
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex items-center gap-2 mb-6">
        <a href="/" className="flex items-center gap-2"><div className="w-8 h-8 rounded-lg grid place-items-center" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)", color: "#241606" }}>☀</div><span className="font-display text-lg font-semibold">Sunrise Market</span></a>
        <div className="flex-1" />
        <a href="/koszyk" className="navlink text-sm">🛒 Koszyk</a>
        <a href="/zamowienia" className="navlink text-sm">Zamówienia</a>
        <a href="/" className="navlink text-sm">← Sklep</a>
      </div>
      <h1 className="font-display text-2xl font-semibold mb-1">Portfel Sunrise Pay</h1>
      <p className="text-zinc-400 mb-6">Saldem płacisz za zakupy. Portfel doładujesz w aplikacji MySunrise — to ten sam portfel Sunrise Pay.</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="rounded-2xl bg-zinc-900/70 p-6 ring-1 ring-amber-500/20">
          <div className="text-sm text-zinc-400">Saldo Sunrise Pay</div>
          <div className="text-4xl font-extrabold text-amber-400">{balance.toFixed(2)} zł</div>
        </div>
        <div className="rounded-2xl bg-zinc-900/70 p-6 ring-1 ring-emerald-500/20">
          <div className="text-sm text-zinc-400">Punkty (cashback)</div>
          <div className="text-4xl font-extrabold text-emerald-400">{pkt(points)} <span className="text-lg">pkt</span></div>
        </div>
        {gold != null && (
          <div className="rounded-2xl bg-zinc-900/70 p-6 ring-1 ring-yellow-500/20">
            <div className="text-sm text-zinc-400">Gold Pay</div>
            <div className="text-4xl font-extrabold text-yellow-300">{gold.toLocaleString("pl-PL")} <span className="text-lg">g</span></div>
          </div>
        )}
      </div>

      {!linked && (
        <div className="mb-4 rounded-lg bg-sky-500/10 px-4 py-2 text-sky-300 text-sm">
          Twoje konto nie jest jeszcze połączone z portfelem MySunrise. Załóż/aktywuj portfel Sunrise Pay w aplikacji MySunrise na ten sam e‑mail, aby płacić za zakupy.
        </div>
      )}
      {msg && <div className="mb-4 rounded-lg bg-amber-500/10 px-4 py-2 text-amber-300 text-sm">{msg}</div>}

      {hasIntent() && (
        <div className="mb-4 rounded-lg bg-amber-500/15 px-4 py-3 text-amber-200 text-sm flex items-center justify-between gap-3 ring-1 ring-amber-500/30">
          <span>Masz zamówienie w toku — wróć do koszyka i dokończ płatność z portfela.</span>
          <a href="/koszyk?topup=success" className="whitespace-nowrap rounded-lg bg-amber-500 px-3 py-1.5 font-semibold text-zinc-900">Dokończ →</a>
        </div>
      )}

      {points > 0 && (
        <div className="rounded-2xl bg-zinc-900/70 p-5 mb-6 ring-1 ring-emerald-500/15">
          <div className="text-sm text-zinc-200 mb-1 font-semibold">Zamień punkty na saldo</div>
          <div className="text-xs text-zinc-500 mb-3">1 pkt = 1 zł. Punkty przechodzą na saldo Sunrise Pay, którym płacisz za zakupy.</div>
          <div className="flex items-center gap-2 flex-wrap">
            <input type="number" min={1} max={Math.floor(points)} step={1} inputMode="numeric"
                   value={redeemAmt} onChange={(e) => setRedeemAmt(e.target.value)} placeholder={String(Math.floor(points))}
                   className="w-28 rounded-lg bg-zinc-800 px-3 py-2 text-sm outline-none ring-1 ring-zinc-700" />
            <span className="text-xs text-zinc-500">z {pkt(points)} pkt dostępnych</span>
            <button onClick={doRedeem} disabled={redeeming}
                    className="ml-auto rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-zinc-900 disabled:opacity-50">
              {redeeming ? "Zamieniam…" : "Zamień na zł →"}
            </button>
          </div>
          {!redeemAvailable && (
            <a href="https://mysunrise.com.pl" target="_blank" rel="noopener" className="mt-3 inline-block text-xs text-amber-400 underline">Zamień punkty w aplikacji MySunrise →</a>
          )}
        </div>
      )}

      <div className="rounded-2xl bg-zinc-900/70 p-5 mb-8 ring-1 ring-amber-500/10">
        <div className="text-sm text-zinc-300 mb-3">Doładowanie robisz w MySunrise — środki od razu są dostępne tu, w Markecie (to jedno saldo Sunrise Pay).</div>
        <a href="https://mysunrise.com.pl" target="_blank" rel="noopener"
           className="inline-block rounded-xl bg-amber-500 px-5 py-2.5 font-semibold text-zinc-900">Doładuj w MySunrise →</a>
        <p className="text-xs text-zinc-500 mt-3">Wkrótce doładujesz też bezpośrednio tutaj (przelew z unikalnym tytułem) — gdy MySunrise uruchomi tę opcję.</p>
      </div>

      <h2 className="text-lg font-semibold mb-3">Historia</h2>
      <ul className="divide-y divide-zinc-800">
        {ops.map((o, i) => (
          <li key={i} className="flex justify-between py-2 text-sm">
            <span className="text-zinc-400">{labelOp(o.type)} · {new Date(o.created_at).toLocaleString("pl-PL")}</span>
            <span className={o.amount >= 0 ? "text-emerald-400" : "text-rose-400"}>
              {o.amount >= 0 ? "+" : ""}{o.amount.toFixed(2)} zł
            </span>
          </li>
        ))}
        {ops.length === 0 && <li className="py-2 text-zinc-500 text-sm">Brak operacji.</li>}
      </ul>
    </div>
  );
}

function labelOp(t: string) {
  return { topup: "Doładowanie", payment: "Zakup", cashback: "Cashback", refund: "Zwrot" }[t] ?? t;
}
