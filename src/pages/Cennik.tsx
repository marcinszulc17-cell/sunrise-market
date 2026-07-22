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
            <div className="w-9 h-9 rounded-xl grid place-items-center text-lg" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>☀</div>
            <span className="font-display text-xl font-semibold">Sunrise Market</span>
          </a>
          <div className="flex-1" />
          <a href="/sprzedawca" className="text-sm navlink">Zostań sprzedawcą →</a>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="font-display text-4xl font-semibold mb-2">Cennik</h1>
        <p className="mb-8" style={{ color: "var(--mut)" }}>Przejrzyste zasady. Płatności wyłącznie przez portfel Sunrise Pay.</p>

        {p && (
          <div className="grid gap-5 md:grid-cols-2">
            <Card title="Sprzedaż" highlight>
              <Row k="Prowizja od sprzedaży" v={pct(p.commission_rate)} />
              <Row k="Cashback dla kupującego" v={pct(p.cashback_rate)} note="wraca na portfel" />
              <Row k="Wypłata dla sprzedawcy" v="na portfel Sunrise Pay" />
            </Card>
            <Card title="Konto sprzedawcy (Sunrise Pay)">
              <Row k="Rejestracja" v={Number(p.pay_activation_fee) === 0 ? "0 zł" : zl(p.pay_activation_fee)} />
              <Row k="Pierwszy rok" v={`${p.pay_free_months} mc GRATIS`} note="od rejestracji" />
              <Row k="Po roku" v={`${zl(p.pay_monthly_fee)}/mc`} />
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
