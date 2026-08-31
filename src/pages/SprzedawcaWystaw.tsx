import { useSearchParams } from "react-router-dom";
import SprzedawcaV2 from "./SprzedawcaV2";
import DedicatedOfferWizard from "./DedicatedOfferWizard";

type PurchaseMode = "purchase" | "appointment" | "daily";

export default function SprzedawcaWystaw() {
  const [sp] = useSearchParams();
  const type = sp.get("typ") || "produkt";
  const requestedMode = sp.get("mode") as PurchaseMode | null;

  // Główna ścieżka sprzedawcy jest uniwersalna: Sprzedaż / Usługa na termin / Wynajem.
  // Dedykowany kreator zostaje tylko dla bezpośrednich linków do specjalistycznych ofert.
  if (type === "produkt" || requestedMode === "purchase" || requestedMode === "appointment" || requestedMode === "daily") {
    return <SprzedawcaV2 />;
  }
  return <DedicatedOfferWizard />;
}
