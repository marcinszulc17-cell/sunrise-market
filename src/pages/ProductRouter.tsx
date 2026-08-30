import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getOffer } from "../lib/api";
import Product from "./Product";
import SpecializedProduct from "./SpecializedProduct";
import VerifyOfferButton from "../components/VerifyOfferButton";
import BuyerOfferActions from "../components/BuyerOfferActions";
import ProductPageExtras from "../components/ProductPageExtras";
import MarketFooter from "../components/MarketFooter";
import { useProductJsonLd, useSeo } from "../lib/seo";

type SeoOffer={offer_id:string;title:string;description?:string|null;price_gross:number;image_url?:string|null;rating?:number;reviews?:number;category?:string};
type PurchaseMode="purchase"|"appointment"|"daily";

export default function ProductRouter() {
  const { id } = useParams();
  const [kind, setKind] = useState<"generic" | "special" | null>(null);
  const [verifyKind,setVerifyKind]=useState<"vehicle"|"property"|null>(null);
  const [categorySlug,setCategorySlug]=useState("");
  const [priceGross,setPriceGross]=useState<number|null>(null);
  const [purchaseMode,setPurchaseMode]=useState<PurchaseMode>("purchase");
  const [seoOffer,setSeoOffer]=useState<SeoOffer|null>(null);

  useEffect(() => {
    if (!id) return;
    getOffer(id).then((o: any) => {
      const slug = String(o?.category_slug || "");
      const special = slug.includes("motoryzacja-samochody-osobowe") || slug.startsWith("nieruchomosci-") || slug.startsWith("uslugi-") || slug.startsWith("ogloszenia-lokalne-");
      const rawMode=String(o?.attributes?.purchase_mode||"purchase");
      setPurchaseMode(rawMode==="appointment"||rawMode==="daily"?rawMode:"purchase");
      setCategorySlug(slug);
      const p=Number(o?.price_gross ?? o?.price ?? 0); setPriceGross(Number.isFinite(p)&&p>0?p:null);
      setSeoOffer(o as SeoOffer);
      setKind(special ? "special" : "generic");
      setVerifyKind(slug.includes("motoryzacja-samochody-osobowe")?"vehicle":slug.startsWith("nieruchomosci-")?"property":null);
    }).catch(() => setKind("generic"));
  }, [id]);

  const seoDescription=(seoOffer?.description||`${seoOffer?.title||"Oferta"} w Sunrise Market`).replace(/[#*_`\[\]]/g,"").replace(/\s+/g," ").trim().slice(0,160);
  useSeo(seoOffer?.title||"Oferta Sunrise Market",seoDescription,id?`/produkt/${id}`:"");
  useProductJsonLd(seoOffer&&id?{id,name:seoOffer.title,price:Number(seoOffer.price_gross||0),image:seoOffer.image_url||null,rating:Number(seoOffer.rating||0),reviews:Number(seoOffer.reviews||0)}:null);

  if (kind === null) return <main className="min-h-screen px-4 py-10" style={{ background: "var(--bg)", color: "var(--mut)" }}>Ładowanie…</main>;
  return <>
    {kind === "special" ? <SpecializedProduct /> : <Product />}
    {id && <ProductPageExtras offerId={id} verifyKind={verifyKind} />}
    <MarketFooter />
    {id && <BuyerOfferActions offerId={id} categorySlug={categorySlug} priceGross={priceGross} purchaseMode={purchaseMode} />}
    {id&&verifyKind&&<VerifyOfferButton offerId={id} kind={verifyKind}/>} 
  </>;
}
