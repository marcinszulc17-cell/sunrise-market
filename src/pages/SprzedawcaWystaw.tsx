import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import SprzedawcaV2 from "./SprzedawcaV2";
import DedicatedOfferWizard from "./DedicatedOfferWizard";
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

export default function SprzedawcaWystaw() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const [access, setAccess] = useState<"loading" | "ok" | "renewal" | "activate">("loading");
  const [sellerType, setSellerType] = useState<string | null>(null);
  const type = sp.get("typ");
  const requestedMode = sp.get("mode") as PurchaseMode | null;

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
  if (access === "activate") return <GateCard title="Aktywuj konto sprzedawcy" body="Aby wystawiać własne produkty, usługi lub wynajem, aktywuj dostęp sprzedażowy na swoim koncie MySunrise. Pierwsze 12 miesięcy są bez opłaty rocznej." cta="Aktywuj Partnera Handlowego" to="/sprzedawca/partner" />;
  if (access === "renewal") return <GateCard title="Odnowienie konta sprzedawcy" body="Twój 12-miesięczny okres startowy minął. Odnów członkostwo, aby dalej wystawiać nowe oferty. Zwykłe konto MySunrise pozostaje aktywne." cta="Przejdź do odnowienia" to="/sprzedawca/partner" />;

  if (sellerType === "private_partner" && (requestedMode === "purchase" || requestedMode === "appointment" || requestedMode === "daily")) {
    return <PrivateOfferWizard />;
  }

  if (sellerType === "private_partner" && (!requestedMode || requestedMode === "purchase") && (!type || type === "produkt")) {
    return <PrivateOfferWizard />;
  }

  if (requestedMode === "purchase" || requestedMode === "appointment" || requestedMode === "daily") {
    return <SprzedawcaV2 />;
  }

  if (type && type !== "produkt") return <DedicatedOfferWizard />;

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6" style={{ background: "var(--bg)", color: "var(--ink)" }}>
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold" style={{ color: "var(--gold)" }}>SUNRISE MARKET</div>
            <h1 className="mt-1 font-display text-3xl font-semibold sm:text-4xl">Co chcesz zrobić?</h1>
            <p className="mt-2 max-w-2xl text-sm sm:text-base" style={{ color: "var(--mut)" }}>
              Najpierw wybierz sposób sprzedaży. Kategorię i szczegóły podasz dopiero w następnym kroku.
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
              <div className="mt-5 rounded-xl px-4 py-3 text-center text-sm font-semibold text-black" style={{ background: "linear-gradient(135deg,#E8891A,#F5A623)" }}>
                {item.cta} →
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-6 rounded-2xl p-4 text-sm" style={{ background: "rgba(122,184,154,.08)", border: "1px solid rgba(122,184,154,.22)", color: "var(--mut)" }}>
          Nie musisz wybierać osobno „samochód”, „nieruchomość” czy „sprzęt” na starcie. Po wyborze trybu kreator dopasuje kategorię i właściwy booking.
        </div>
      </div>
    </main>
  );
}

function GateCard({ title, body, cta, to }: { title: string; body?: string; cta?: string; to?: string }) {
  return <main className="min-h-screen px-4 py-8 sm:px-6" style={{ background: "var(--bg)", color: "var(--ink)" }}><div className="mx-auto max-w-2xl rounded-3xl p-6 sm:p-8" style={{ background: "var(--glass)", border: "1px solid rgba(232,137,26,.28)" }}><div className="text-xs font-semibold tracking-[.15em]" style={{ color: "var(--gold)" }}>SUNRISE MARKET</div><h1 className="mt-2 text-3xl font-semibold">{title}</h1>{body && <p className="mt-3 text-sm leading-6" style={{ color: "var(--mut)" }}>{body}</p>}{cta && to && <Link to={to} className="mt-5 inline-flex rounded-xl px-5 py-3 font-semibold text-black" style={{ background: "linear-gradient(135deg,#E8891A,#F5A623)" }}>{cta} →</Link>}</div></main>;
}
