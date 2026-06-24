import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { topupWallet, getWalletBalance, getWalletOps } from "../lib/payments";

// Strona Portfel: saldo Sunrise Pay + doładowanie przez Stripe + historia.
// Trasa proponowana: /portfel  (success_url/cancel_url edge funkcji wskazują tutaj).
export default function Portfel() {
  const [userId, setUserId] = useState<string | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [ops, setOps] = useState<{ type: string; amount: number; balance_after: number; created_at: string }[]>([]);
  const [amount, setAmount] = useState<number>(50);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (uid) {
        setBalance(await getWalletBalance(uid));
        setOps(await getWalletOps(uid));
      }
    });
    // informacja zwrotna po powrocie ze Stripe
    const p = new URLSearchParams(window.location.search).get("topup");
    if (p === "success") setMsg("Doładowanie przyjęte — saldo zaktualizuje się po potwierdzeniu płatności.");
    if (p === "cancel") setMsg("Doładowanie anulowane.");
  }, []);

  async function handleTopup() {
    setBusy(true); setMsg(null);
    try { await topupWallet(amount); }
    catch (e) { setMsg((e as Error).message); setBusy(false); }
  }

  if (!userId) return <div className="p-6 text-zinc-300">Zaloguj się, aby zobaczyć portfel. <a href="/login" className="text-amber-400 underline">Przejdź do logowania</a>.</div>;

  return (
    <div className="mx-auto max-w-2xl p-6 text-zinc-100">
      <h1 className="text-2xl font-bold mb-1">Portfel Sunrise Pay</h1>
      <p className="text-zinc-400 mb-6">Saldem płacisz za zakupy. Saldo doładujesz przez Stripe (BLIK / Przelewy24 / karta).</p>

      <div className="rounded-2xl bg-zinc-900/70 p-6 mb-6 ring-1 ring-amber-500/20">
        <div className="text-sm text-zinc-400">Dostępne saldo</div>
        <div className="text-4xl font-extrabold text-amber-400">{balance.toFixed(2)} zł</div>
      </div>

      {msg && <div className="mb-4 rounded-lg bg-amber-500/10 px-4 py-2 text-amber-300 text-sm">{msg}</div>}

      <div className="flex items-center gap-3 mb-8">
        <input
          type="number" min={10} max={5000} value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          className="w-32 rounded-lg bg-zinc-800 px-3 py-2 text-right"
        />
        <span className="text-zinc-400">zł</span>
        <button
          onClick={handleTopup} disabled={busy}
          className="rounded-xl bg-amber-500 px-5 py-2 font-semibold text-zinc-900 disabled:opacity-50"
        >
          {busy ? "Przekierowuję…" : "Doładuj"}
        </button>
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
