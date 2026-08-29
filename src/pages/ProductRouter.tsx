import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getOffer } from "../lib/api";
import Product from "./Product";
import SpecializedProduct from "./SpecializedProduct";

export default function ProductRouter() {
  const { id } = useParams();
  const [kind, setKind] = useState<"generic" | "special" | null>(null);

  useEffect(() => {
    if (!id) return;
    getOffer(id).then((o: any) => {
      const slug = String(o?.category_slug || "");
      const special = slug.includes("motoryzacja-samochody-osobowe") || slug.startsWith("nieruchomosci-") || slug.startsWith("uslugi-") || slug.startsWith("ogloszenia-lokalne-");
      setKind(special ? "special" : "generic");
    }).catch(() => setKind("generic"));
  }, [id]);

  if (kind === null) return <main className="min-h-screen px-4 py-10" style={{ background: "var(--bg)", color: "var(--mut)" }}>Ładowanie…</main>;
  return kind === "special" ? <SpecializedProduct /> : <Product />;
}
