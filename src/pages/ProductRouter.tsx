import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getOffer } from "../lib/api";
import Product from "./Product";
import SpecializedProduct from "./SpecializedProduct";
import VerifyOfferButton from "../components/VerifyOfferButton";
import BuyerOfferActions from "../components/BuyerOfferActions";

export default function ProductRouter() {
  const { id } = useParams();
  const [kind, setKind] = useState<"generic" | "special" | null>(null);
  const [verifyKind,setVerifyKind]=useState<"vehicle"|"property"|null>(null);

  useEffect(() => {
    if (!id) return;
    getOffer(id).then((o: any) => {
      const slug = String(o?.category_slug || "");
      const special = slug.includes("motoryzacja-samochody-osobowe") || slug.startsWith("nieruchomosci-") || slug.startsWith("uslugi-") || slug.startsWith("ogloszenia-lokalne-");
      setKind(special ? "special" : "generic");
      setVerifyKind(slug.includes("motoryzacja-samochody-osobowe")?"vehicle":slug.startsWith("nieruchomosci-")?"property":null);
    }).catch(() => setKind("generic"));
  }, [id]);

  if (kind === null) return <main className="min-h-screen px-4 py-10" style={{ background: "var(--bg)", color: "var(--mut)" }}>Ładowanie…</main>;
  return <>
    {kind === "special" ? <SpecializedProduct /> : <Product />}
    {id && <BuyerOfferActions offerId={id} allowViewing={!!verifyKind} />}
    {id&&verifyKind&&<VerifyOfferButton offerId={id} kind={verifyKind}/>} 
  </>;
}
