import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import SprzedawcaV2 from "./SprzedawcaV2";
import DedicatedOfferWizard, { TYPY_OFERT } from "./DedicatedOfferWizard";
import PrivateOfferWizard from "./PrivateOfferWizard";

type PurchaseMode = "purchase" | "appointment" | "daily";

const MODES: Array<{ mode: PurchaseMode; icon: string; title: string; description: string; cta: string }> = [
  {
    mode: "purchase",
    icon: "🛒",
    title: "Sprzedaż",
    description: "Produkt, samochód, nieruchomość lub dowolna inna oferta kupowana bez wybierania terminu.",
    cta: "Wystaw na sprzedaż",
  },
  {
    mode: "appointment",
    icon: "📅",
    title: "Usługa na termin",
    description: "Klient wybiera dzień i godzinę, a potem płaci. Dla usług, wizyt i rezerwacji godzinowych.",
    cta: "Wystaw z kalendarzem",
  },
  {
    mode: "daily",
    icon: "🗓️",
    title: "Wynajem",
    description: "Klient wybiera termin od–do i płaci za okres. Dla aut, nieruchomości, noclegów, maszyn i sprzętu.",
    cta: "Wystaw na wynajem",
  },
];

const EXTRA: Array<{ to: string; icon: string; title: string; description: string; cta: string }> = [
  {
    to: "/sprzedawca/wystaw?typ=nocleg",
    icon: "🏡",
    title: "Nocleg",
    description: "Domek, apartament, pokój albo kwatera. Doba hotelowa, liczba gości, udogodnienia i kalendarz — jak na portalach noclegowych.",
    cta: "Wystaw obiekt noclegowy",
  },
];

export default function SprzedawcaWystaw() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const [access, setAccess] = useState<"loading" | "ok" | "renewal" | "activate">("loading");
  const [sellerType, setSellerType] = useState<string | null>(null);
  const type = sp.get("typ");
  const requestedMode = sp.get("mode") as PurchaseMode | null;
  // Ogloszenia lokalne (Sprzedam, Oddam, Oferty pracy, Szukam pracy...) sa bezplatne
  // i nie wymagaja konta Partnera Handlowego — konto ogloszeniodawcy zaklada baza
  // przy pierwszym ogloszeniu (market.create_offer_v2).
  const isOgloszenie = type === "lokalne";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        navigate(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`, { replace: true });
        return;
      }
      const { data, error } = await supabase.schema("market").rpc("my_trade_partner_status");
      if (cancelled) return;
      if (error) {
        setAccess("activate");
        return;
      }
      const row = Array.isArray(data) ? data[0] : null;
      setSellerType(row?.seller_type ? String(row.seller_type) : null);
      if (!row?.seller_id) setAccess("activate");
      else if (row.can_sell) setAccess("ok");
      else if (row.renewal_due) setAccess("renewal");
      else setAccess("activate");
    })();
    return () => { cancelled = true; };
  }, [navigate]);

  if (access === "loading") return <GateCard title="Sprawdzam dostęp sprzedażowy…" />;
  // Ogloszenie lokalne przepuszczamy przed bramka Partnera Handlowego — jest bezplatne dla kazdego.
  if (isOgloszenie) return <DedicatedOfferWizard />;
  if (access === "activate") return <GateCard title="Aktywuj sprzedaż" body="Wybierz prostą ścieżkę: sprzedajesz prywatnie albo jako firma. Konto MySunrise zostaje to samo, a kreator poprowadzi Cię dalej." cta="Wybierz sposób sprzedaży" to="/sprzedawca/dolacz" free />;
  if (access === "renewal") return <GateCard title="Odnowienie dostępu sprzedażowego" body="Twój okres startowy minął. Odnów właściwy plan, aby dalej wystawiać nowe oferty. Konto MySunrise pozostaje aktywne." cta="Przejdź do odnowienia" to={sellerType === "business" ? "/sprzedawca-klasyczny" : "/sprzedawca/partner"} free />;

  // Nocleg ma osobny kreator (dział `noclegi`, wyłącznie wynajem na dni) — bez niego
  // „Wystaw swój obiekt” kończyło się na formularzu samochodu.
  if (type === "nocleg") return <DedicatedOfferWizard />;

  if (sellerType === "private_partner" && (requestedMode === "purchase" || requestedMode === "appointment" || requestedMode === "daily")) {
    return <PrivateOfferWizard />;
  }

  if (sellerType === "private_partner" && (!requestedMode || requestedMode === "purchase") && (!type || type === "produkt")) {
    return <PrivateOfferWizard />;
  }

  if (requestedMode === "purchase" || requestedMode === "appointment" || requestedMode === "daily") {
    return <SprzedawcaV2 />;
  }

  // Tylko znany ?typ= trafia do kreatora dedykowanego. Wcześniej dowolna literówka w adresie
  // lądowała na „Dodaj samochód”, bo TYPE_CONFIG miało takie fallbackowe ustawienie.
  if (type && type !== "produkt" && TYPY_OFERT.includes(type)) return <DedicatedOfferWizard />;

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6" style={{ background: "var(--bg)", color: "var(--ink)" }}>
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold" style={{ color: "var(--gold)" }}>SUNRISE MARKET</div>
            <h1 className="mt-1 font-display text-3xl font-semibold sm:text-4xl">Dodaj ofertę</h1>
            <p className="mt-2 max-w-2xl text-sm sm:text-base" style={{ color: "var(--mut)" }}>
              Wybierz, co chcesz dodać. Resztę przeprowadzimy krok po kroku.
            </p>
          </div>
          <Link to="/sprzedawca" className="text-sm font-semibold underline" style={{ color: "var(--mut)" }}>← Centrum sprzedawcy</Link>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {MODES.map((item) => (
            <Link
              key={item.mode}
              to={`/sprzedawca/wystaw?typ=produkt&mode=${item.mode}`}
              className="group rounded-3xl p-6 transition-transform hover:-translate-y-1"
              style={{ background: "var(--glass)", border: "1px solid var(--line)" }}
            >
              <div className="text-5xl">{item.icon}</div>
              <h2 className="mt-5 text-2xl font-semibold">{item.title}</h2>
              <p className="mt-3 min-h-[96px] text-sm leading-6" style={{ color: "var(--mut)" }}>{item.description}</p>
              <div className="mt-5 rounded-xl px-4 py-3 text-center text-sm font-semibold text-black" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>
                {item.cta} →
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {EXTRA.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="group rounded-3xl p-6 transition-transform hover:-translate-y-1"
              style={{ background: "var(--glass)", border: "1px solid var(--line)" }}
            >
              <div className="text-5xl">{item.icon}</div>
              <h2 className="mt-5 text-2xl font-semibold">{item.title}</h2>
              <p className="mt-3 min-h-[96px] text-sm leading-6" style={{ color: "var(--mut)" }}>{item.description}</p>
              <div className="mt-5 rounded-xl px-4 py-3 text-center text-sm font-semibold text-black" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>
                {item.cta} →
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-4 rounded-3xl p-6" style={{ background: "rgba(122,184,154,.08)", border: "1px solid rgba(122,184,154,.22)" }}>
          <h2 className="text-lg font-semibold">📍 Dodaj bezpłatne ogłoszenie</h2>
          <p className="mt-2 text-sm leading-6" style={{ color: "var(--mut)" }}>Sprzedam, oddam, zamienię, usługi, <strong>oferta pracy</strong> i <strong>szukam pracy</strong>. Bez ceny, bez VAT-u, bez prowizji — zainteresowani odpisują Ci bezpośrednio.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/sprzedawca/wystaw?typ=lokalne" className="rounded-xl px-4 py-2.5 text-sm font-semibold text-black" style={{ background: "linear-gradient(135deg,#E8891A,#F5A623)" }}>+ Dodaj ogłoszenie</Link>
            <Link to="/sprzedawca/wystaw?typ=lokalne&kategoria=ogloszenia-lokalne-praca" className="rounded-xl px-4 py-2.5 text-sm font-semibold" style={{ border: "1px solid var(--line)" }}>💼 Dodaj ofertę pracy</Link>
            <Link to="/sprzedawca/wystaw?typ=lokalne&kategoria=ogloszenia-lokalne-szukam-pracy" className="rounded-xl px-4 py-2.5 text-sm font-semibold" style={{ border: "1px solid var(--line)" }}>🙋 Szukam pracy</Link>
          </div>
        </div>

        <div className="mt-6 rounded-2xl p-4 text-sm" style={{ background: "rgba(122,184,154,.08)", border: "1px solid rgba(122,184,154,.22)", color: "var(--mut)" }}>
          Nie musisz znać nazw kategorii ani ustawień technicznych. Wybierz jedną z opcji powyżej, a Market poprowadzi Cię dalej.
        </div>
      </div>
    </main>
  );
}

function GateCard({ title, body, cta, to, free }: { title: string; body?: string; cta?: string; to?: string; free?: boolean }) {
  return <main className="min-h-screen px-4 py-8 sm:px-6" style={{ background: "var(--bg)", color: "var(--ink)" }}><div className="mx-auto max-w-2xl"><div className="rounded-3xl p-6 sm:p-8" style={{ background: "var(--glass)", border: "1px solid rgba(200,150,90,.28)" }}><div className="text-xs font-semibold tracking-[.15em]" style={{ color: "var(--gold)" }}>SUNRISE MARKET</div><h1 className="mt-2 text-3xl font-semibold">{title}</h1>{body && <p className="mt-3 text-sm leading-6" style={{ color: "var(--mut)" }}>{body}</p>}{cta && to && <Link to={to} className="mt-5 inline-flex rounded-xl px-5 py-3 font-semibold text-black" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>{cta} →</Link>}</div>
    {free && <div className="mt-4 rounded-3xl p-6" style={{ background: "rgba(122,184,154,.08)", border: "1px solid rgba(122,184,154,.22)" }}>
      <h2 className="text-lg font-semibold">Ogłoszenia lokalne i praca — bezpłatnie, bez aktywacji sprzedaży</h2>
      <p className="mt-2 text-sm leading-6" style={{ color: "var(--mut)" }}>Sprzedam, oddam, zamienię, usługi, a także <strong>ofertę pracy</strong> i <strong>szukam pracy</strong> dodasz od razu na zwykłym koncie. Publikacja nic nie kosztuje, a zainteresowani odpisują Ci bezpośrednio.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link to="/sprzedawca/wystaw?typ=lokalne" className="rounded-xl px-4 py-2.5 text-sm font-semibold text-black" style={{ background: "linear-gradient(135deg,#E8891A,#F5A623)" }}>+ Dodaj ogłoszenie</Link>
        <Link to="/sprzedawca/wystaw?typ=lokalne&kategoria=ogloszenia-lokalne-praca" className="rounded-xl px-4 py-2.5 text-sm font-semibold" style={{ border: "1px solid var(--line)" }}>💼 Dodaj ofertę pracy</Link>
        <Link to="/sprzedawca/wystaw?typ=lokalne&kategoria=ogloszenia-lokalne-szukam-pracy" className="rounded-xl px-4 py-2.5 text-sm font-semibold" style={{ border: "1px solid var(--line)" }}>🙋 Szukam pracy</Link>
      </div>
    </div>}
  </div></main>;
}
