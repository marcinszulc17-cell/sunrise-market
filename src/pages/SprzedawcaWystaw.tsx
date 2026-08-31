import { Link, useSearchParams } from "react-router-dom";
import SprzedawcaV2 from "./SprzedawcaV2";
import DedicatedOfferWizard from "./DedicatedOfferWizard";

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
    description: "Klient wybiera dzień i godzinę, a potem płaci. Dla usług, wizyt, sprzętu i rezerwacji godzinowych.",
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
  const type = sp.get("typ");
  const requestedMode = sp.get("mode") as PurchaseMode | null;

  if (requestedMode === "purchase" || requestedMode === "appointment" || requestedMode === "daily") {
    return <SprzedawcaV2 />;
  }

  // Zachowujemy stare bezpośrednie linki do specjalistycznych kreatorów.
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
              <div className="mt-5 rounded-xl px-4 py-3 text-center text-sm font-semibold text-black" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>
                {item.cta} →
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-6 rounded-2xl p-4 text-sm" style={{ background: "rgba(122,184,154,.08)", border: "1px solid rgba(122,184,154,.22)", color: "var(--mut)" }}>
          Nie musisz wybierać osobno „samochód”, „nieruchomość” czy „sprzęt”. Po wyborze trybu kreator pokaże wszystkie kategorie i dopasuje właściwe pola oraz booking.
        </div>
      </div>
    </main>
  );
}
