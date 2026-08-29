import { useSearchParams } from "react-router-dom";
import SprzedawcaV2 from "./SprzedawcaV2";
import DedicatedOfferWizard from "./DedicatedOfferWizard";

export default function SprzedawcaWystaw() {
  const [sp] = useSearchParams();
  const type = sp.get("typ") || "produkt";
  if (type === "produkt") return <SprzedawcaV2 />;
  return <DedicatedOfferWizard />;
}
