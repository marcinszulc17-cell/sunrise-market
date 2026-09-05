import { pkt } from "../lib/money";
import { SiteHeader } from "../components/home/SiteChrome";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { getWalletOps, redeemPoints } from "../lib/payments";
import { walletBalance } from "../lib/api";
import { hasIntent } from "../lib/checkoutIntent";

const MYSUNRISE_URL = "https://mysunrise.com.pl";

type MarketWalletOp = { type: string; amount: number; balance_after: number; created_at: string };

export default function Portfel() {
  const [userId, setUserId] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);
  const [points, setPoints] = useState(0);
  const [gold, setGold] = useState<number | null>(null);
  const [linked, setLinked] = useState(true);
  const [ops, setOps] = useState<MarketWalletOp[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [redeemAmt, setRedeemAmt] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [redeemAvailable, setRedeemAvailable] = useState(true);

  async function refresh() {
    const w = await walletBalance();
    setBalance(w.balance);
    setPoints(w.points);
    setGold(w.gold);
    setLinked(w.linked);
  }

  async function doRedeem() {
    const amt = Math.min(Math.floor(points), Math.floor(Number(redeemAmt) || 0));
    if (amt <= 0) { setMsg("Podaj liczbę punktów do wymiany."); return; }
    setRedeeming(true); setMsg(null);
    try {
      const r = await redeemPoints(amt);
      if (!r.available) {
        setRedeemAvailable(false);
        setMsg("Tę operację wykonaj w MySunrise — tam znajduje się Twój właściwy portfel i pełna historia środków.");
        return;
      }
      if (r.error) { setMsg(r.error); return; }
      if (typeof r.balance === "number") setBalance(r.balance);
      if (typeof r.points === "number") setPoints(r.points);
      setRedeemAmt("");
      setMsg(`Zamieniono ${pkt(r.converted ?? amt)} pkt w portfelu MySunrise.`);
    } catch (e: any) {
      setMsg(e?.message ?? "Nie udało się zamienić punktów.");
    } finally { setRedeeming(false); }
  }

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (!uid) return;
      try { await refresh(); } catch { setLinked(false); }
      try { setOps(await getWalletOps(uid)); } catch { setOps([]); }
    });
  }, []);

  if (!userId) return (<>
    <SiteHeader compact />
    <div className="mx-auto max-w-2xl px-4 py-10">
      <p className="mt-4" style={{ color: "var(--mut)" }}>Zaloguj się, aby zobaczyć dane portfela MySunrise. <a href="/login" className="underline" style={{ color: "var(--gold)" }}>Przejdź do logowania</a>.</p>
    </div>
  </>);

  return (<>
    <SiteHeader compact />
    <div className="mx-auto max-w-3xl px-4 py-8">

      <div className="rounded-2xl p-5 mb-6" style={{ background: "linear-gradient(140deg,#0b1a34,#123a86)", border: "1px solid rgba(245,166,35,.28)" }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-xs font-semibold tracking-[.16em]" style={{ color: "#F5A623" }}>MYSUNRISE • ŹRÓDŁO ŚRODKÓW</div>
            <h1 className="font-display text-3xl font-semibold mt-1">Twój portfel MySunrise</h1>
            <p className="text-sm mt-2 max-w-xl" style={{ color: "rgba(255,255,255,.7)" }}>
              Sunrise Market nie tworzy osobnego portfela. Saldo Sunrise Pay, punkty cashback, Gold i rozliczenia użytkownika należą do MySunrise. Market tylko pokazuje te dane i wykorzystuje je przy zakupach.
            </p>
          </div>
          <a href={MYSUNRISE_URL} target="_blank" rel="noopener" className="rounded-xl px-4 py-2 text-sm font-semibold text-black" style={{ background: "linear-gradient(135deg,#F5A623,#E8891A)" }}>Otwórz MySunrise →</a>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <div className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
          <div className="text-xs" style={{ color: "var(--mut)" }}>Sunrise Pay • MySunrise</div>
          <div className="text-3xl font-extrabold" style={{ color: "var(--gold)" }}>{balance.toFixed(2)} zł</div>
        </div>
        <div className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
          <div className="text-xs" style={{ color: "var(--mut)" }}>Cashback • MySunrise</div>
          <div className="text-3xl font-extrabold" style={{ color: "var(--green)" }}>{pkt(points)} <span className="text-base">pkt</span></div>
        </div>
        <div className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
          <div className="text-xs" style={{ color: "var(--mut)" }}>Gold • MySunrise</div>
          <div className="text-3xl font-extrabold" style={{ color: "#F5A623" }}>{gold == null ? "—" : gold.toLocaleString("pl-PL")} {gold != null && <span className="text-base">g</span>}</div>
        </div>
      </div>

      {!linked && (
        <div className="mb-4 rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(56,224,240,.1)", color: "#8fe3ef", border: "1px solid rgba(56,224,240,.22)" }}>
          <div className="font-semibold">Portfel nie jest jeszcze połączony z tym kontem.</div>
          <div className="mt-1">Wyloguj się z Sunrise Market i zaloguj ponownie tym samym adresem e-mail. Przy logowaniu konto MySunrise zostanie automatycznie dopięte. Jeśli komunikat pozostanie, otwórz MySunrise i sprawdź ten sam adres e-mail.</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href="/login" className="rounded-lg px-3 py-1.5 font-semibold text-black" style={{ background: "linear-gradient(135deg,#F5A623,#E8891A)" }}>Przejdź do logowania</a>
            <a href={MYSUNRISE_URL} target="_blank" rel="noopener" className="rounded-lg px-3 py-1.5" style={{ border: "1px solid rgba(56,224,240,.3)" }}>Otwórz MySunrise</a>
          </div>
        </div>
      )}
      {msg && <div className="mb-4 rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(232,137,26,.12)", color: "var(--gold)" }}>{msg}</div>}

      {hasIntent() && (
        <div className="mb-5 rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-3" style={{ background: "rgba(232,137,26,.12)", border: "1px solid rgba(232,137,26,.3)" }}>
          <span>Masz zamówienie w toku. Płatność zostanie pobrana z Sunrise Pay w MySunrise.</span>
          <a href="/koszyk?topup=success" className="whitespace-nowrap rounded-lg px-3 py-1.5 font-semibold text-black" style={{ background: "var(--gold)" }}>Dokończ →</a>
        </div>
      )}

      {points > 0 && (
        <div className="rounded-2xl p-5 mb-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
          <div className="font-semibold">Wykorzystaj cashback</div>
          <div className="text-xs mt-1 mb-3" style={{ color: "var(--mut)" }}>Punkty są częścią portfela MySunrise. Jeśli integracja pozwala, możesz zlecić wymianę tutaj; w przeciwnym razie przeniesiemy Cię do MySunrise.</div>
          <div className="flex items-center gap-2 flex-wrap">
            <input type="number" min={1} max={Math.floor(points)} step={1} value={redeemAmt} onChange={(e) => setRedeemAmt(e.target.value)} className="w-28 rounded-lg px-3 py-2 text-sm outline-none" style={{ background: "var(--glass)", border: "1px solid var(--line)" }} />
            <span className="text-xs" style={{ color: "var(--mut)" }}>z {pkt(points)} pkt</span>
            <button onClick={doRedeem} disabled={redeeming} className="ml-auto rounded-lg px-4 py-2 font-semibold text-black disabled:opacity-50" style={{ background: "linear-gradient(135deg,#7AB89A,#38E0F0)" }}>{redeeming ? "Przetwarzam…" : "Zamień punkty →"}</button>
          </div>
          {!redeemAvailable && <a href={MYSUNRISE_URL} target="_blank" rel="noopener" className="mt-3 inline-block text-xs underline" style={{ color: "var(--gold)" }}>Przejdź do portfela w MySunrise →</a>}
        </div>
      )}

      <div className="rounded-2xl p-5 mb-7" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
        <div className="font-semibold mb-1">Zarządzanie portfelem</div>
        <p className="text-sm mb-3" style={{ color: "var(--mut)" }}>Doładowanie, pełna historia środków, cashback, prowizje i pozostałe operacje finansowe są zarządzane w MySunrise.</p>
        <a href={MYSUNRISE_URL} target="_blank" rel="noopener" className="inline-block rounded-xl px-5 py-2.5 font-semibold text-black" style={{ background: "linear-gradient(135deg,#E8891A,#F5A623)" }}>Zarządzaj portfelem w MySunrise →</a>
      </div>

      <div className="flex items-end justify-between gap-3 mb-3">
        <div>
          <h2 className="text-lg font-semibold">Operacje z Sunrise Market</h2>
          <p className="text-xs" style={{ color: "var(--mut)" }}>To nie jest pełna historia portfela — pokazujemy tylko operacje powstałe w Sunrise Market. Pełna historia jest w MySunrise.</p>
        </div>
        <a href={MYSUNRISE_URL} target="_blank" rel="noopener" className="text-xs underline whitespace-nowrap" style={{ color: "var(--gold)" }}>Pełna historia →</a>
      </div>
      <ul className="divide-y" style={{ borderColor: "var(--line)" }}>
        {ops.map((o, i) => (
          <li key={i} className="flex justify-between py-3 text-sm gap-3">
            <span style={{ color: "var(--mut)" }}>{labelOp(o.type)} · {new Date(o.created_at).toLocaleString("pl-PL")}</span>
            <span style={{ color: o.amount >= 0 ? "var(--green)" : "#F8A8D2" }}>{o.amount >= 0 ? "+" : ""}{o.amount.toFixed(2)} zł</span>
          </li>
        ))}
        {ops.length === 0 && <li className="py-3 text-sm" style={{ color: "var(--mut)" }}>Brak operacji z Sunrise Market.</li>}
      </ul>
    </div>
  </>);
}

function labelOp(t: string) {
  return ({ topup: "Doładowanie", payment: "Zakup", cashback: "Cashback", refund: "Zwrot", payout: "Wypłata" } as Record<string, string>)[t] ?? t;
}