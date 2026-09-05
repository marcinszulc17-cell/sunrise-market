import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { SideNav } from "../components/home/SiteChrome";
import { Ico, TINTS, type Tint, GOLD_GRAD, CARD } from "../components/home/HomeShared";

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

  return <Shell attention={attention}>
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold">Witaj, Partnerze! 👋</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Tu znajdziesz najważniejsze informacje o swoich ogłoszeniach i sprzedaży. Dane poleceń pochodzą z Sunrise Ambassador Club.</p>
      </div>
      <div className="flex items-center gap-3 rounded-2xl px-3 py-2" style={CARD}><div className="grid h-10 w-10 place-items-center rounded-full text-sm font-bold" style={{ background: "rgba(245,166,35,.16)", color: "var(--gold)" }}>PH</div><div className="text-sm"><div className="font-bold">Partner Handlowy</div><div className="text-xs" style={{ color: partnerActive ? "var(--green)" : "#fca5a5" }}>{partnerActive ? "● Aktywny" : "● Wymaga odnowienia"}</div></div></div>
    </div>

    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile to="/sprzedawca/oferty" tint="amber" icon="bag" value={String(data.offers?.active || 0)} label="Aktywne ogłoszenia" sub={`Wszystkie: ${data.offers?.total || 0}`} />
      <StatTile to="/sprzedawca/zamowienia" tint="blue" icon="cart" value={String(data.sales?.count || 0)} label="Opłacone sprzedaże" sub={attention.pending_fulfillment > 0 ? `${attention.pending_fulfillment} do realizacji` : "Wszystko zrealizowane"} />
      <StatTile to="/sprzedawca/rezerwacje" tint="violet" icon="calendar" value="→" label="Rezerwacje" sub="Terminy usług i wynajmu" />
      <StatTile to="/sprzedawca/rozliczenia" tint="green" icon="sun" value={pln(totalIncome)} label="Łącznie zarobione" sub={`Ten miesiąc: ${pln(data.sales?.earned_month)}`} />
    </div>

    {hasAttention && <Link to="/sprzedawca/zamowienia" className="mb-5 block rounded-2xl p-4 sm:p-5" style={{ background: "linear-gradient(135deg,rgba(232,137,26,.22),rgba(232,137,26,.08))", border: "1px solid rgba(232,137,26,.42)" }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl text-2xl" style={{ background: "rgba(232,137,26,.18)" }}>🔔</div>
          <div>
            <div className="font-semibold">{attention.unread_new_sales > 0 ? `Masz ${attention.unread_new_sales} ${attention.unread_new_sales === 1 ? "nową sprzedaż" : "nowe sprzedaże"}` : "Masz sprzedaże do realizacji"}</div>
            <div className="mt-0.5 text-sm" style={{ color: "var(--mut)" }}>{attention.pending_fulfillment > 0 ? `${attention.pending_fulfillment} ${attention.pending_fulfillment === 1 ? "pozycja czeka" : "pozycji czeka"} na wysyłkę lub przekazanie.` : "Sprawdź najnowsze sprzedaże."}</div>
          </div>
        </div>
        <div className="rounded-xl px-4 py-2 text-sm font-semibold text-black" style={{ background: "linear-gradient(135deg,#E8891A,#F5A623)" }}>Otwórz Moje sprzedaże →</div>
      </div>
    </Link>}

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
          <Link to="/sprzedawca/zamowienia" className="relative rounded-xl px-4 py-2.5 text-center text-sm font-semibold" style={{ background: attention.pending_fulfillment > 0 ? "linear-gradient(135deg,#E8891A,#F5A623)" : "var(--header)", color: attention.pending_fulfillment > 0 ? "#000" : "var(--ink)", border: attention.pending_fulfillment > 0 ? "none" : "1px solid var(--line)" }}>
            Moje sprzedaże{attention.unread_new_sales > 0 ? ` · ${attention.unread_new_sales} nowe` : ""}
          </Link>
        </div>
      </Card>

      <Card title="Partner Handlowy" icon="🏅">
        <Stat label="Aktywny od" value={date(membership?.partner_since)} />
        <Stat label="Bezpłatnie do" value={date(membership?.free_until)} />
        <Stat label="Odnowienie" value={`${Number(membership?.annual_fee_gross || 499).toFixed(0)} zł / rok`} />
        {membership?.paid_until && <Stat label="Opłacone do" value={date(membership.paid_until)} />}
        <Link to="/sprzedawca/partner" className="mt-4 block rounded-xl px-4 py-2.5 text-center text-sm font-semibold" style={{ background: membership?.renewal_due ? "linear-gradient(135deg,#E8891A,#F5A623)" : "var(--header)", color: membership?.renewal_due ? "#000" : "var(--ink)", border: membership?.renewal_due ? "none" : "1px solid var(--line)" }}>{membership?.renewal_due ? "Odnow Partnera Handlowego" : "Status członkostwa"}</Link>
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
  return <div className="rounded-2xl p-5" style={CARD}><div className="text-2xl">{icon}</div><div className="mt-2 text-xs" style={{ color: "var(--mut)" }}>{label}</div><div className="mt-1 text-2xl font-bold" style={{ color: "var(--gold)" }}>{value}</div><div className="mt-1 text-xs" style={{ color: "var(--mut)" }}>{sub}</div></div>;
}
function Card({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return <div className="rounded-2xl p-5" style={CARD}><div className="flex items-center gap-2 border-l-4 pl-3 text-lg font-bold" style={{ borderColor: "var(--gold)" }}><span>{icon}</span>{title}</div><div className="mt-4 space-y-2">{children}</div></div>;
}
function Stat({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3 text-sm"><span style={{ color: "var(--mut)" }}>{label}</span><b className="text-right">{value}</b></div>;
}
function Quick({ to, icon, title, text }: { to: string; icon: string; title: string; text: string }) {
  return <Link to={to} className="rounded-2xl p-4" style={{ background: "var(--header)", border: "1px solid var(--line)" }}><div className="text-2xl">{icon}</div><div className="mt-2 font-semibold">{title}</div><div className="mt-1 text-xs" style={{ color: "var(--mut)" }}>{text}</div></Link>;
}
const SELLER_NAV = (a: Attention) => [
  { to: "/sprzedawca/partner/pulpit", label: "Panel główny", icon: <Ico name="home" size={18} /> },
  { to: "/sprzedawca/oferty", label: "Moje ogłoszenia", icon: <Ico name="bag" size={18} /> },
  { to: "/sprzedawca/zamowienia", label: "Zamówienia", icon: <Ico name="cart" size={18} />, badge: a.pending_fulfillment || undefined },
  { to: "/sprzedawca/rezerwacje", label: "Rezerwacje", icon: <Ico name="calendar" size={18} /> },
  { to: "/sprzedawca/zapytania", label: "Zapytania", icon: <Ico name="user" size={18} /> },
  { to: "/sprzedawca/opinie", label: "Opinie", icon: <Ico name="heart" size={18} /> },
  { to: "/sprzedawca/odbior", label: "Odbiór osobisty", icon: <Ico name="house" size={18} /> },
  { to: "/sprzedawca/rozliczenia", label: "Rozliczenia", icon: <Ico name="sun" size={18} /> },
  { to: "/sprzedawca/partner", label: "Ustawienia partnera", icon: <Ico name="wrench" size={18} /> },
];
function StatTile({ to, tint, icon, value, label, sub }: { to: string; tint: Tint; icon: "bag" | "cart" | "calendar" | "sun"; value: string; label: string; sub: string }) {
  const t = TINTS[tint];
  return <Link to={to} className="group flex items-center gap-4 rounded-2xl p-5 transition hover:-translate-y-0.5" style={{ background: `linear-gradient(135deg, ${t.bg} 0%, rgba(24,24,27,.85) 70%)`, border: `1px solid ${t.bd}` }}>
    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl" style={{ background: t.bg, color: t.c }}><Ico name={icon} size={24} /></div>
    <div className="min-w-0 flex-1"><div className={`truncate font-bold ${value.length > 9 ? "text-xl" : "text-2xl"}`}>{value}</div><div className="text-sm font-semibold">{label}</div><div className="text-xs" style={{ color: "var(--mut)" }}>{sub}</div></div>
    <span aria-hidden="true" className="text-xl transition group-hover:translate-x-0.5" style={{ color: "var(--mut)" }}>›</span>
  </Link>;
}
function Shell({ children, attention }: { children: React.ReactNode; attention?: Attention }) {
  return <main className="min-h-screen px-4 py-6 sm:px-6 xl:px-10" style={{ background: "var(--bg)", color: "var(--ink)" }}>
    <div className="mx-auto grid max-w-[1440px] gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="hidden h-fit rounded-2xl p-4 lg:sticky lg:top-24 lg:block" style={CARD}>
        <div className="mb-4 flex items-center gap-3 border-b pb-4" style={{ borderColor: "var(--line)" }}><div className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: "rgba(245,166,35,.16)", color: "var(--gold)" }}><Ico name="bag" size={20} /></div><div><div className="font-bold leading-tight">Panel Partnera</div><div className="text-xs" style={{ color: "var(--mut)" }}>Sunrise Market</div></div></div>
        <SideNav items={SELLER_NAV(attention || { pending_fulfillment: 0, unread_new_sales: 0 })} current="/sprzedawca/partner/pulpit" />
        <Link to="/sprzedawca/wystaw" className="mt-4 flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-bold" style={{ background: GOLD_GRAD, color: "#101012" }}><Ico name="plus" size={16} strokeWidth={2.4} />Dodaj ogłoszenie</Link>
        <div className="mt-4 rounded-xl p-3 text-xs" style={{ background: "rgba(255,255,255,.04)", border: "1px solid var(--line)", color: "var(--mut)" }}><div className="font-semibold" style={{ color: "var(--ink)" }}>Potrzebujesz pomocy?</div><div className="mt-1">Nasz zespół jest do Twojej dyspozycji.</div><a href="/legal/kontakt.html" className="mt-2 inline-block font-semibold" style={{ color: "var(--gold)" }}>Skontaktuj się →</a></div>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  </main>;
}
