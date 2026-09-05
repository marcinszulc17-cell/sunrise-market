import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

type DashboardData = {
  seller: { id: string; type: string; status: string } | null;
  membership?: { partner_since?: string | null; free_until?: string | null; billing_starts?: string | null; annual_fee_gross?: number; renewal_due?: boolean; can_sell?: boolean; paid_until?: string | null } | null;
  offers?: { active: number; total: number };
  sales?: { count: number; earned_all: number; earned_month: number };
  ambassador?: {
    snapshot?: {
      wallet_balance_grosz?: number;
      wallet_pending_grosz?: number;
      ambassador_active?: boolean;
      ambassador_tier?: string;
      direct_referrals?: number;
      gen1_count?: number;
      gen2_count?: number;
      gen3_count?: number;
      total_network_size?: number;
      sfc_referral_code?: string | null;
    } | null;
    ambassador?: {
      tier?: string;
      status?: string;
      referral_code?: string;
      total_referrals?: number;
      total_revenue_generated_pln?: number;
      total_commissions_earned_pln?: number;
    } | null;
  } | null;
};

type Attention = { pending_fulfillment: number; unread_new_sales: number };

const pln = (n: number | undefined) => `${Number(n || 0).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
const date = (s?: string | null) => s ? new Date(`${s}T00:00:00`).toLocaleDateString("pl-PL") : "—";

export default function PartnerDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [attention, setAttention] = useState<Attention>({ pending_fulfillment: 0, unread_new_sales: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [{ data: result, error: e }, attentionResult] = await Promise.all([
          supabase.functions.invoke("partner-dashboard", { body: {} }),
          supabase.rpc("private_partner_dashboard_attention"),
        ]);
        if (e) throw e;
        if (result?.error) throw new Error(result.error);
        setData(result as DashboardData);
        const a = (attentionResult.data as Attention[] | null)?.[0];
        if (!attentionResult.error && a) setAttention(a);
      } catch (e) {
        setError((e as Error).message || "Nie udało się wczytać centrum sprzedawcy");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <Shell><div className="rounded-2xl p-6" style={{ background: "var(--glass)", border: "1px solid var(--line)", color: "var(--mut)" }}>Ładowanie centrum sprzedawcy…</div></Shell>;
  if (error) return <Shell><div className="rounded-2xl p-6" style={{ background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)" }}>{error}</div></Shell>;
  if (!data?.seller) return <Navigate to="/sprzedawca/dolacz" replace />;

  const membership = data.membership;
  const amb = data.ambassador?.ambassador;
  const snap = data.ambassador?.snapshot;
  const referralEarnings = Number(amb?.total_commissions_earned_pln || 0);
  const walletBalance = Number(snap?.wallet_balance_grosz || 0) / 100;
  const walletPending = Number(snap?.wallet_pending_grosz || 0) / 100;
  const own = Number(data.sales?.earned_all || 0);
  const totalIncome = own + referralEarnings;
  const network = Number(snap?.total_network_size || 0);
  const partnerActive = membership?.can_sell === true;
  const hasAttention = attention.pending_fulfillment > 0 || attention.unread_new_sales > 0;

  return <Shell>
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="text-sm font-semibold" style={{ color: "var(--gold)" }}>MYSUNRISE · SPRZEDAWCA</div>
        <h1 className="mt-1 font-display text-3xl font-semibold sm:text-4xl">Twoje centrum zarabiania</h1>
        <p className="mt-2 max-w-2xl text-sm sm:text-base" style={{ color: "var(--mut)" }}>Własna sprzedaż i polecenia w jednym miejscu. Dane poleceń pochodzą bezpośrednio z Sunrise Ambassador Club.</p>
      </div>
      <Link to="/sprzedawca/wystaw" className="rounded-2xl px-5 py-3 font-semibold text-black" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>+ Wystaw ofertę</Link>
    </div>

    {hasAttention && <Link to="/sprzedawca/zamowienia" className="mb-5 block rounded-2xl p-4 sm:p-5" style={{ background: "linear-gradient(135deg,rgba(200,150,90,.22),rgba(200,150,90,.08))", border: "1px solid rgba(200,150,90,.42)" }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl text-2xl" style={{ background: "rgba(200,150,90,.18)" }}>🔔</div>
          <div>
            <div className="font-semibold">{attention.unread_new_sales > 0 ? `Masz ${attention.unread_new_sales} ${attention.unread_new_sales === 1 ? "nową sprzedaż" : "nowe sprzedaże"}` : "Masz sprzedaże do realizacji"}</div>
            <div className="mt-0.5 text-sm" style={{ color: "var(--mut)" }}>{attention.pending_fulfillment > 0 ? `${attention.pending_fulfillment} ${attention.pending_fulfillment === 1 ? "pozycja czeka" : "pozycji czeka"} na wysyłkę lub przekazanie.` : "Sprawdź najnowsze sprzedaże."}</div>
          </div>
        </div>
        <div className="rounded-xl px-4 py-2 text-sm font-semibold text-black" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>Otwórz Moje sprzedaże →</div>
      </div>
    </Link>}

    <section className="mb-5 rounded-3xl p-6 sm:p-7" style={{ background: "linear-gradient(135deg,rgba(200,150,90,.18),rgba(56,224,240,.08))", border: "1px solid rgba(200,150,90,.3)" }}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[.15em]" style={{ color: "var(--mut)" }}>Łącznie zarobione</div>
          <div className="mt-1 text-4xl font-bold sm:text-5xl">{pln(totalIncome)}</div>
          <div className="mt-2 text-sm" style={{ color: "var(--mut)" }}>Sprzedaż własna {pln(own)} + prowizje z poleceń {pln(referralEarnings)}</div>
        </div>
        <div className="rounded-2xl px-4 py-3 text-sm" style={{ background: "var(--header)", border: "1px solid var(--line)" }}>
          <div style={{ color: "var(--mut)" }}>Status sprzedaży</div>
          <div className="mt-1 font-semibold" style={{ color: partnerActive ? "var(--green)" : "#fca5a5" }}>{partnerActive ? "● Aktywny" : "● Wymaga odnowienia"}</div>
        </div>
      </div>
    </section>

    <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Kpi icon="🛍️" label="Z własnej sprzedaży" value={pln(data.sales?.earned_all)} sub={`Ten miesiąc: ${pln(data.sales?.earned_month)}`} />
      <Kpi icon="🤝" label="Z poleceń" value={pln(referralEarnings)} sub={amb?.tier ? `Ambassador Club · ${amb.tier}` : "Sunrise Ambassador Club"} />
      <Kpi icon="💳" label="Sunrise Wallet" value={pln(walletBalance)} sub={walletPending > 0 ? `Oczekujące: ${pln(walletPending)}` : "Dostępne saldo"} />
      <Kpi icon="🌐" label="Twoja sieć" value={String(network)} sub={`Bezpośrednio: ${Number(snap?.direct_referrals || 0)}`} />
    </div>

    <div className="mb-5 grid gap-4 lg:grid-cols-3">
      <Card title="Sprzedaż w Market" icon="📦">
        <Stat label="Aktywne oferty" value={String(data.offers?.active || 0)} />
        <Stat label="Wszystkie oferty" value={String(data.offers?.total || 0)} />
        <Stat label="Opłacone sprzedaże" value={String(data.sales?.count || 0)} />
        <Stat label="Do realizacji" value={String(attention.pending_fulfillment || 0)} />
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
          <Link to="/sprzedawca/oferty" className="rounded-xl px-4 py-2.5 text-center text-sm font-semibold" style={{ background: "var(--header)", border: "1px solid var(--line)" }}>Zarządzaj ofertami</Link>
          <Link to="/sprzedawca/zamowienia" className="relative rounded-xl px-4 py-2.5 text-center text-sm font-semibold" style={{ background: attention.pending_fulfillment > 0 ? "linear-gradient(135deg,#C8965A,#E8C896)" : "var(--header)", color: attention.pending_fulfillment > 0 ? "#000" : "var(--ink)", border: attention.pending_fulfillment > 0 ? "none" : "1px solid var(--line)" }}>
            Moje sprzedaże{attention.unread_new_sales > 0 ? ` · ${attention.unread_new_sales} nowe` : ""}
          </Link>
        </div>
      </Card>

      <Card title="Partner Handlowy" icon="🏅">
        <Stat label="Aktywny od" value={date(membership?.partner_since)} />
        <Stat label="Bezpłatnie do" value={date(membership?.free_until)} />
        <Stat label="Odnowienie" value={`${Number(membership?.annual_fee_gross || 499).toFixed(0)} zł / rok`} />
        {membership?.paid_until && <Stat label="Opłacone do" value={date(membership.paid_until)} />}
        <Link to="/sprzedawca/partner" className="mt-4 block rounded-xl px-4 py-2.5 text-center text-sm font-semibold" style={{ background: membership?.renewal_due ? "linear-gradient(135deg,#C8965A,#E8C896)" : "var(--header)", color: membership?.renewal_due ? "#000" : "var(--ink)", border: membership?.renewal_due ? "none" : "1px solid var(--line)" }}>{membership?.renewal_due ? "Odnow Partnera Handlowego" : "Status członkostwa"}</Link>
      </Card>

      <Card title="Ambassador Club" icon="💸">
        <Stat label="Status" value={snap?.ambassador_active ? "Aktywny" : "Nieaktywny"} />
        <Stat label="Poziom" value={String(snap?.ambassador_tier || amb?.tier || "—")} />
        <Stat label="Wygenerowany obrót" value={pln(Number(amb?.total_revenue_generated_pln || 0))} />
        <a href="https://mysunrise.pl/mme" className="mt-4 block rounded-xl px-4 py-2.5 text-center text-sm font-semibold" style={{ background: "var(--header)", border: "1px solid var(--line)" }}>Otwórz Sunrise Ambassador Club →</a>
      </Card>
    </div>

    <section className="rounded-3xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
      <div className="font-semibold">Szybkie akcje</div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
        <Quick to="/sprzedawca/wystaw" icon="➕" title="Wystaw ofertę" text="Sprzedaż, usługa lub wynajem" />
        <Quick to="/sprzedawca/oferty" icon="🖼️" title="Moje oferty" text="Zdjęcia, ceny i ustawienia" />
        <Quick to="/sprzedawca/zamowienia" icon="🛍️" title="Moje sprzedaże" text={attention.pending_fulfillment > 0 ? `${attention.pending_fulfillment} do realizacji` : "Sprzedaże i realizacja"} />
        <Quick to="/sprzedawca/rezerwacje" icon="📅" title="Moje rezerwacje" text="Terminy usług i wynajmu" />
        <Quick to="/sprzedawca/opinie" icon="⭐" title="Opinie" text="Oceny kupujących i odpowiedzi" />
        <Quick to="/sprzedawca/odbior" icon="🏪" title="Odbiór osobisty" text="Punkt odbioru dla klientów" />
        <a href="https://mysunrise.pl/mme/linki" className="rounded-2xl p-4" style={{ background: "var(--header)", border: "1px solid var(--line)" }}><div className="text-2xl">🔗</div><div className="mt-2 font-semibold">Linki polecające</div><div className="mt-1 text-xs" style={{ color: "var(--mut)" }}>Promuj i zarabiaj prowizje</div></a>
      </div>
    </section>
  </Shell>;
}

function Kpi({ icon, label, value, sub }: { icon: string; label: string; value: string; sub: string }) {
  return <div className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}><div className="text-2xl">{icon}</div><div className="mt-2 text-xs" style={{ color: "var(--mut)" }}>{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div><div className="mt-1 text-xs" style={{ color: "var(--mut)" }}>{sub}</div></div>;
}
function Card({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return <div className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}><div className="flex items-center gap-2 text-lg font-semibold"><span>{icon}</span>{title}</div><div className="mt-4 space-y-2">{children}</div></div>;
}
function Stat({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3 text-sm"><span style={{ color: "var(--mut)" }}>{label}</span><b className="text-right">{value}</b></div>;
}
function Quick({ to, icon, title, text }: { to: string; icon: string; title: string; text: string }) {
  return <Link to={to} className="rounded-2xl p-4" style={{ background: "var(--header)", border: "1px solid var(--line)" }}><div className="text-2xl">{icon}</div><div className="mt-2 font-semibold">{title}</div><div className="mt-1 text-xs" style={{ color: "var(--mut)" }}>{text}</div></Link>;
}
function Shell({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen px-4 py-8 sm:px-6" style={{ background: "var(--bg)", color: "var(--ink)" }}><div className="mx-auto max-w-6xl">{children}</div></main>;
}