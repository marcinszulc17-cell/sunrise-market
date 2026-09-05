import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getOffer, countOfferView } from "../lib/api";
import Product from "./Product";
import PrivateProduct from "./PrivateProduct";
import SpecializedProduct from "./SpecializedProduct";
import VerifyOfferButton from "../components/VerifyOfferButton";
import BuyerOfferActions from "../components/BuyerOfferActions";
import ProductPageExtras from "../components/ProductPageExtras";
import MarketFooter from "../components/MarketFooter";
import { useProductJsonLd, useSeo } from "../lib/seo";

type SeoOffer={offer_id:string;title:string;description?:string|null;price_gross:number;image_url?:string|null;rating?:number;reviews?:number;category?:string};
type PurchaseMode="purchase"|"appointment"|"daily";
type ProductKind="generic"|"special"|"private";

export default function ProductRouter() {
  const { id } = useParams();
  const [kind, setKind] = useState<ProductKind | null>(null);
  const [verifyKind,setVerifyKind]=useState<"vehicle"|"property"|null>(null);
  const [categorySlug,setCategorySlug]=useState("");
  const [priceGross,setPriceGross]=useState<number|null>(null);
  const [purchaseMode,setPurchaseMode]=useState<PurchaseMode>("purchase");
  const [seoOffer,setSeoOffer]=useState<SeoOffer|null>(null);
  const [isSubscription,setIsSubscription]=useState(false);

  useEffect(() => {
    if (!id) return;
    countOfferView(id);
    getOffer(id).then((o: any) => {
      const slug = String(o?.category_slug || "");
      const rawMode=String(o?.attributes?.purchase_mode||"purchase");
      const mode:PurchaseMode=rawMode==="appointment"||rawMode==="daily"?rawMode:"purchase";
      const isPrivateListing = o?.attributes?.private_listing === true;
      const isPrivateBuyNow = mode === "purchase" && (isPrivateListing || o?.attributes?.buy_now_only === true);
      // Produkt z katalogu MySunrise (marka własna, stała cena, subskrypcja) jest zawsze kupowalny — nawet gdy
      // siedzi w kategorii usługowej. Bez tego Protect Plus lądował na szablonie „zapytaj sprzedawcę” bez koszyka.
      const catalogItem = !!o?.attributes?.subscription || o?.attributes?.source === "mysunrise" || o?.attributes?.own_brand === true;
      const special = !catalogItem && (slug.includes("motoryzacja-samochody-osobowe") || slug.startsWith("nieruchomosci-") || slug.startsWith("uslugi-") || slug.startsWith("ogloszenia-lokalne-"));
      setPurchaseMode(mode);
      setIsSubscription(!!o?.attributes?.subscription);
      setCategorySlug(slug);
      const p=Number(o?.price_gross ?? o?.price ?? 0); setPriceGross(Number.isFinite(p)&&p>0?p:null);
      setSeoOffer(o as SeoOffer);
      setKind(isPrivateBuyNow ? "private" : special ? "special" : "generic");
      setVerifyKind(isPrivateListing?null:slug.includes("motoryzacja-samochody-osobowe")?"vehicle":slug.startsWith("nieruchomosci-")?"property":null);
    }).catch(() => setKind("generic"));
  }, [id]);

  const seoDescription=(seoOffer?.description||`${seoOffer?.title||"Oferta"} w Sunrise Market`).replace(/[#*_`\[\]]/g,"").replace(/\s+/g," ").trim().slice(0,160);
  useSeo(seoOffer?.title||"Oferta Sunrise Market",seoDescription,id?`/produkt/${id}`:"");
  useProductJsonLd(seoOffer&&id?{id,name:seoOffer.title,price:Number(seoOffer.price_gross||0),image:seoOffer.image_url||null,rating:Number(seoOffer.rating||0),reviews:Number(seoOffer.reviews||0)}:null);

  if (kind === null) return <main className="min-h-screen px-4 py-10" style={{ background: "var(--bg)", color: "var(--mut)" }}>Ładowanie…</main>;
  if (kind === "private") return <><PrivateProduct /><MarketFooter /></>;
  return <>
    {kind === "special" ? <SpecializedProduct /> : <Product />}
    {id && <ProductPageExtras offerId={id} verifyKind={verifyKind} />}
    <MarketFooter />
    {id && !isSubscription && <BuyerOfferActions offerId={id} categorySlug={categorySlug} priceGross={priceGross} purchaseMode={purchaseMode} />}
    {id&&verifyKind&&<VerifyOfferButton offerId={id} kind={verifyKind}/>} 
  </>;
}