import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { getMySeller, getPayouts, startSellerOnboarding } from "../lib/payments";

type Seller = {
  id: string; legal_name: string; status: string;
  connect_status: string; payouts_enabled: boolean; stripe_account_id: string | null;
};
type Payout = {
  id: string; period_start: string; period_end: string;
  gross_sales: number; commission_total: number; net_payout: number;
  status: string; paid_at: string | null;
};

// Panel rozliczeń sprzedawcy. Trasa: /sprzedawca/rozliczenia
// (return_url/refresh_url z connect-onboard wskazują tutaj).
export default function Rozliczenia() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [seller, setSeller] = useState<Seller | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { setAuthed(false); return; }
      setAuthed(true);
      try {
        const s = await getMySeller();
        setSeller(s);
        if (s) setPayouts(await getPayouts(s.id));
      } catch (e) { setMsg((e as Error).message); }
    })();
    const p = new URLSearchParams(window.location.search).get("connect");
    if (p === "done") setMsg("Dziękujemy — dane do wypłat zapisane. Status zaktualizuje się po weryfikacji Stripe.");
    if (p === "refresh") setMsg("Onboarding przerwany — kliknij ponownie, aby dokończyć.");
  }, []);

  async function onboard() {
    if (!seller) return;
    setBusy(true); setMsg(null);
    try { await startSellerOnboarding(seller.id); }
    catch (e) { setMsg((e as Error).message); setBusy(false); }
  }

  if (authed === false) return <div className="p-6 text-zinc-300">Zaloguj się jako sprzedawca. <a href="/login" className="text-amber-400 underline">Przejdź do logowania</a>.</div>;
  if (authed === null) return <div className="p-6 text-zinc-400">Ładowanie…</div>;
  if (!seller) return <div className="p-6 text-zinc-300">To konto nie ma profilu sprzedawcy.</div>;

  const zl = (v: number) => Number(v).toLocaleString("pl-PL", { minimumFractionDigits: 2 }) + " zł";
  const active = seller.connect_status === "active" && seller.payouts_enabled;

  return (
    <div className="mx-auto max-w-3xl p-6 text-zinc-100">
      <h1 className="text-2xl font-bold mb-1">Rozliczenia — {seller.legal_name}</h1>
      <p className="text-zinc-400 mb-6">Wypłaty netto (sprzedaż − prowizja 7,9%) trafiają na Twoje konto co tydzień przez Stripe.</p>

      <div className="rounded-2xl bg-zinc-900/70 p-5 mb-6 ring-1 ring-amber-500/20">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-zinc-400">Status wypłat (Stripe Connect)</div>
            <div className={"text-lg font-semibold " + (active ? "text-emerald-400" : "text-amber-400")}>
              {active ? "Aktywne" : statusLabel(seller.connect_status)}
            </div>
          </div>
          {!active && (
            <button onClick={onboard} disabled={busy}
              className="rounded-xl bg-amber-500 px-5 py-2 font-semibold text-zinc-900 disabled:opacity-50">
              {busy ? "Przekierowuję…" : seller.stripe_account_id ? "Dokończ konfigurację" : "Połącz wypłaty"}
            </button>
          )}
        </div>
      </div>

      {msg && <div className="mb-4 rounded-lg bg-amber-500/10 px-4 py-2 text-amber-300 text-sm">{msg}</div>}

      <h2 className="text-lg font-semibold mb-3">Historia wypłat</h2>
      <div className="overflow-hidden rounded-xl ring-1 ring-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/80 text-zinc-400">
            <tr>
              <th className="text-left px-3 py-2">Okres</th>
              <th className="text-right px-3 py-2">Sprzedaż</th>
              <th className="text-right px-3 py-2">Prowizja</th>
              <th className="text-right px-3 py-2">Do wypłaty</th>
              <th className="text-left px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {payouts.map((p) => (
              <tr key={p.id} className="border-t border-zinc-800">
                <td className="px-3 py-2">{p.period_start} – {p.period_end}</td>
                <td className="px-3 py-2 text-right">{zl(p.gross_sales)}</td>
                <td className="px-3 py-2 text-right text-zinc-400">−{zl(p.commission_total)}</td>
                <td className="px-3 py-2 text-right font-semibold text-amber-400">{zl(p.net_payout)}</td>
                <td className="px-3 py-2">{payoutStatus(p.status)}</td>
              </tr>
            ))}
            {payouts.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-4 text-zinc-500">Brak rozliczeń.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function statusLabel(s: string) {
  return ({ none: "Niepołączone", onboarding: "W trakcie weryfikacji", restricted: "Wymaga uzupełnienia",
            disabled: "Zablokowane", active: "Aktywne" } as Record<string, string>)[s] ?? s;
}
function payoutStatus(s: string) {
  return ({ pending: "Oczekuje", processing: "W realizacji", paid: "Wypłacone", failed: "Błąd" } as Record<string, string>)[s] ?? s;
}
