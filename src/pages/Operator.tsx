import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { operatorConsole } from "../lib/api";

const zl = (v: number) => Math.round(Number(v || 0)).toLocaleString("pl-PL") + " zł";
const n = (v: number) => Number(v || 0).toLocaleString("pl-PL");

export default function Operator() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [k, setK] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setAuthed(false); return; }
      setAuthed(true);
      try { setK(await operatorConsole()); } catch (e) { setErr((e as Error).message); }
    });
  }, []);

  const revenue = k ? Number(k.przychod_prowizje || 0) + Number(k.przychod_banery || 0) + Number(k.przychod_promowanie || 0) : 0;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 backdrop-blur" style={{ background: "rgba(7,7,15,.72)", borderBottom: "1px solid var(--line)" }}>
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center gap-3">
          <a href="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl grid place-items-center text-lg" style={{ background: "linear-gradient(135deg,#F2731D,#E0A21B)" }}>☀</div>
            <span className="font-display text-xl font-semibold">Sunrise Market</span>
          </a>
          <div className="flex-1" />
          <span className="text-sm" style={{ color: "var(--mut)" }}>Konsola operatora</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="font-display text-3xl font-semibold mb-6">Pulpit operatora</h1>
        {authed === false && <p style={{ color: "var(--mut)" }}>Zaloguj się. <a href="/login" className="text-amber-400 underline">Logowanie</a>.</p>}
        {err && <p className="text-rose-400">Błąd: {err}</p>}
        {k && (
          <>
            <div className="rounded-2xl p-6 mb-6" style={{ background: "linear-gradient(135deg, rgba(242,115,29,.14), rgba(124,58,237,.12))", border: "1px solid rgba(242,115,29,.3)" }}>
              <div className="text-sm" style={{ color: "var(--mut)" }}>Przychód platformy (prowizje + promowanie + banery)</div>
              <div className="font-display text-4xl font-bold" style={{ color: "var(--gold)" }}>{zl(revenue)}</div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Kpi label="GMV (obrót)" value={zl(k.gmv)} />
              <Kpi label="Przychód: prowizje 7,9%" value={zl(k.przychod_prowizje)} color="var(--green)" />
              <Kpi label="Cashback wypłacony" value={zl(k.cashback_wyplacony)} />
              <Kpi label="Przychód: promowanie" value={zl(k.przychod_promowanie)} color="var(--green)" />
              <Kpi label="Przychód: banery" value={zl(k.przychod_banery)} color="var(--green)" />
              <Kpi label="Subskrypcje aktywne" value={n(k.subskrypcje_aktywne)} />
              <Kpi label="Zamówienia" value={n(k.zamowienia)} />
              <Kpi label="Sprzedawcy aktywni" value={n(k.sprzedawcy_aktywni)} />
              <Kpi label="KYC do weryfikacji" value={n(k.kyc_do_weryfikacji)} />
              <Kpi label="Spory otwarte" value={n(k.spory_otwarte)} color={Number(k.spory_otwarte) ? "#F25CB0" : undefined} />
              <Kpi label="Moderacja: kolejka" value={n(k.moderacja_kolejka)} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
      <div className="text-xs mb-1" style={{ color: "var(--mut)" }}>{label}</div>
      <div className="font-display text-2xl font-semibold" style={{ color: color ?? "var(--ink)" }}>{value}</div>
    </div>
  );
}
