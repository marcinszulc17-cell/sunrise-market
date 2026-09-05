import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { pricingList } from "../lib/api";

// Wybór poziomu sprzedaży (decyzja właściciela 2026-09-05 — dwa poziomy):
//  • Sprzedawca (seller_type private_partner): uproszczone centrum, bez NIP, wypłaty na PRYWATNY portfel
//    Sunrise Pay. Aktywacja: /sprzedawca/partner. 12 mies. gratis, potem 299 zł/rok.
//  • Partner Handlowy (seller_type business): firma z NIP, rozbudowane centrum (faktury, statystyki,
//    reklamy, Stripe Connect), wypłaty na saldo FIRMOWE Sunrise Pay. Rejestracja: /sprzedawca-klasyczny.
//    12 mies. gratis, potem 499 zł/rok.
// Ceny czytane z market.pricing_list(); liczby poniżej to tylko wartości zapasowe.

type Prices = { trade_partner_annual_fee?: number; pay_annual_fee?: number; pay_free_months?: number };

const zl = (v: number) => `${Number(v).toLocaleString("pl-PL")} zł`;

export default function SellerJoin() {
  const navigate = useNavigate();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [p, setP] = useState<Prices>({});

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthed(Boolean(data.user)));
    pricingList().then((x) => setP((x ?? {}) as Prices)).catch(() => {});
  }, []);

  const freeMonths = Number(p.pay_free_months ?? 12);
  const sellerFee = Number(p.trade_partner_annual_fee ?? 299);
  const partnerFee = Number(p.pay_annual_fee ?? 499);
  const go = (to: string) => () => navigate(authed ? to : `/login?next=${encodeURIComponent(to)}`);

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6" style={{ background: "var(--bg)", color: "var(--ink)" }}>
      <div className="mx-auto max-w-5xl">
        <Link to="/" className="text-sm" style={{ color: "var(--mut)" }}>← Sklep</Link>
        <div className="mt-4 text-center">
          <div className="text-sm font-semibold" style={{ color: "var(--gold)" }}>SUNRISE MARKET</div>
          <h1 className="mt-1 font-display text-3xl font-semibold sm:text-4xl">Zostań sprzedawcą</h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm sm:text-base" style={{ color: "var(--mut)" }}>
            Sprzedaż działa na Twoim koncie MySunrise. Wybierz poziom — <b>pierwszy rok jest gratis</b> w obu wariantach,
            a opłata roczna pojawia się dopiero po {freeMonths} miesiącach.
          </p>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <Tier
            badge="SPRZEDAWCA"
            title="Sprzedawaj prosto"
            fee={sellerFee}
            freeMonths={freeMonths}
            lead="Dla osób prywatnych i małych sprzedawców. Bez NIP-u, bez papierologii."
            features={[
              "Uproszczone centrum: oferty, zamówienia, rezerwacje",
              "Sprzedaż produktów, usług na termin i wynajem",
              "Wypłaty na Twój prywatny portfel Sunrise Pay",
              "Cashback 3% dla kupujących, ochrona płatności",
            ]}
            cta="Aktywuj konto Sprzedawcy →"
            onClick={go("/sprzedawca/partner")}
          />
          <Tier
            badge="PARTNER HANDLOWY"
            title="Sprzedawaj jako firma"
            fee={partnerFee}
            freeMonths={freeMonths}
            lead="Dla firm z NIP. Pełne centrum sprzedaży i rozliczenia firmowe."
            features={[
              "Wszystko z poziomu Sprzedawcy + rozbudowane centrum",
              "Wypłaty na saldo firmowe Sunrise Pay i Stripe Connect",
              "Faktury do zamówień, statystyki, promowanie i reklamy",
              "Program partnerski Sunrise Ambassador Club",
            ]}
            cta="Zarejestruj firmę jako Partnera →"
            onClick={go("/sprzedawca-klasyczny")}
            highlight
          />
        </div>

        <p className="mt-6 text-center text-xs" style={{ color: "var(--mut)" }}>
          Prowizja od sprzedaży: 7,9% przy płatności Sunrise Pay (cashback dla klienta zawarty), 12,9% przy płatności kartą/BLIK/P24 (Stripe). Szczegóły w <Link to="/cennik" className="underline">cenniku</Link>.
        </p>
      </div>
    </main>
  );
}

function Tier({ badge, title, fee, freeMonths, lead, features, cta, onClick, highlight }: {
  badge: string; title: string; fee: number; freeMonths: number; lead: string; features: string[]; cta: string; onClick: () => void; highlight?: boolean;
}) {
  return (
    <section className="flex flex-col rounded-3xl p-6 sm:p-7" style={{ background: "var(--glass)", border: highlight ? "1px solid rgba(232,137,26,.45)" : "1px solid var(--line)" }}>
      <div className="text-xs font-semibold tracking-[.15em]" style={{ color: "var(--gold)" }}>{badge}</div>
      <h2 className="mt-2 font-display text-2xl font-semibold">{title}</h2>
      <p className="mt-2 text-sm" style={{ color: "var(--mut)" }}>{lead}</p>
      <div className="mt-5 rounded-2xl p-4" style={{ background: "var(--header)", border: "1px solid var(--line)" }}>
        <div className="text-3xl font-bold">0 zł <span className="text-base font-medium" style={{ color: "var(--mut)" }}>przez pierwsze {freeMonths} miesięcy</span></div>
        <div className="mt-1 text-sm" style={{ color: "var(--mut)" }}>potem <b style={{ color: "var(--ink)" }}>{zl(fee)} / rok</b>, płatne z góry za rok</div>
      </div>
      <ul className="mt-5 flex flex-1 flex-col gap-2 text-sm">
        {features.map((f) => <li key={f} className="flex gap-2"><span style={{ color: "var(--green)" }}>✓</span><span>{f}</span></li>)}
      </ul>
      <button type="button" onClick={onClick} className="mt-6 w-full rounded-2xl py-3 font-semibold text-black" style={{ background: "linear-gradient(135deg,#E8891A,#F5A623)" }}>{cta}</button>
    </section>
  );
}
