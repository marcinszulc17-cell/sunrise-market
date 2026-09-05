import { useEffect, useState } from "react";
import { pricingList } from "../lib/api";

const zl = (v: number) => Number(v).toLocaleString("pl-PL", { minimumFractionDigits: 2 }) + " zł";
const pct = (v: number) => (v * 100).toLocaleString("pl-PL") + "%";

export default function Cennik() {
  const [p, setP] = useState<any>(null);
  useEffect(() => { pricingList().then(setP).catch(() => {}); }, []);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 backdrop-blur" style={{ background: "var(--header)", borderBottom: "1px solid var(--line)" }}>
        <div className="mx-auto max-w-4xl px-4 py-3 flex items-center gap-3">
          <a href="/" className="flex items-center gap-2">
            <img src="/logo-sunrise-market.png" alt="Sunrise Market" className="h-12 w-auto rounded-xl bg-white p-1.5" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          </a>
          <div className="flex-1" />
          <a href="/sprzedawca" className="text-sm navlink">Zostań sprzedawcą →</a>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="font-display text-4xl font-semibold mb-2">Cennik</h1>
        <p className="mb-8" style={{ color: "var(--mut)" }}>Przejrzyste zasady. Portfel Sunrise Pay z cashbackiem albo karta/BLIK/P24 przez Stripe.</p>

        {p && (
          <div className="grid gap-5 md:grid-cols-2">
            <Card title="Sprzedaż" highlight>
              <Row k="Prowizja — płatność Sunrise Pay" v={pct(p.commission_rate)} note="cashback 3% dla kupującego zawarty" />
              <Row k="Prowizja — karta / BLIK / P24 (Stripe)" v={pct(p.stripe_commission_rate ?? 0.129)} note="cashback zawarty" />
              <Row k="Cashback dla kupującego" v={pct(p.cashback_rate)} note="wraca na portfel Sunrise Pay" />
              <Row k="Wypłata dla sprzedawcy" v="na portfel Sunrise Pay" />
            </Card>
            <Card title="Sprzedawca (osoba prywatna)">
              <Row k="Aktywacja" v="0 zł" note="bez NIP" />
              <Row k="Pierwszy rok" v={`${p.pay_free_months} mc GRATIS`} note="od aktywacji" />
              <Row k="Po roku" v={`${zl(p.trade_partner_annual_fee ?? 299)}/rok`} note="płatne z góry" />
              <Row k="Wypłaty" v="prywatny portfel Sunrise Pay" />
            </Card>
            <Card title="Partner Handlowy (firma)">
              <Row k="Rejestracja" v={Number(p.pay_activation_fee) === 0 ? "0 zł" : zl(p.pay_activation_fee)} note="wymagany NIP" />
              <Row k="Pierwszy rok" v={`${p.pay_free_months} mc GRATIS`} note="od rejestracji" />
              <Row k="Po roku" v={`${zl(p.pay_annual_fee ?? 499)}/rok`} note="płatne z góry" />
              <Row k="Wypłaty" v="saldo firmowe Sunrise Pay + Stripe Connect" />
            </Card>
            <Card title="Promowanie produktów">
              <Row k="Promowanie (za kliknięcie)" v={`${zl(p.promote_cpc)}/klik`} />
              <Row k="Wyróżnienie produktu" v={`${zl(p.highlight_day)}/dzień`} note="wyższa pozycja + sekcja Wyróżnione" />
            </Card>
            <Card title="Banery reklamowe">
              {(p.banners ?? []).map((b: any, i: number) => (
                <Row key={i} k={b.name} v={`${zl(b.rate)}/dzień`} />
              ))}
            </Card>
          </div>
        )}

        <div className="mt-8 rounded-2xl p-5 text-sm" style={{ background: "var(--glass)", border: "1px solid var(--line)", color: "var(--mut)" }}>
          7 strumieni przychodu platformy: prowizja od sprzedaży, subskrypcja sprzedawcy, promowanie (CPC), wyróżnienia, banery, marża dostawy, usługi dodatkowe.
        </div>
      </main>
    </div>
  );
}

function Card({ title, children, highlight }: { title: string; children: React.ReactNode; highlight?: boolean }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: "var(--glass)", border: highlight ? "1px solid rgba(200,150,90,.4)" : "1px solid var(--line)" }}>
      <h2 className="font-display text-xl font-semibold mb-3">{title}</h2>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}
function Row({ k, v, note }: { k: string; v: string; note?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm">{k}{note && <span className="block text-xs" style={{ color: "var(--mut)" }}>{note}</span>}</span>
      <span className="font-semibold whitespace-nowrap" style={{ color: "var(--gold)" }}>{v}</span>
    </div>
  );
}
