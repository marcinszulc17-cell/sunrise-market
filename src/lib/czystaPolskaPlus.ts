// Czysta Polska Plus w Sunrise Market — jedno miejsce prawdy dla oznaczenia w UI.
//
// TO JEST PROMOCJA GREEN ECO WORLD, NIE DOTACJA. Słowo „dofinansowanie” ma w Polsce
// jedno znaczenie — pieniądze publiczne z programu typu „Czyste Powietrze” — i klient,
// który je przeczyta, zacznie pytać o wniosek, urząd i termin naboru. Dlatego w treści
// jest „rabat lub zwrot na portfel MySunrise” i ani razu „dofinansowanie”, „dotacja”
// czy „program rządowy”. Ta sama zasada obowiązuje w MySunrise — patrz
// src/components/shop/CzystaPolskaPlusBadge.tsx w repo mysunrise-source.
//
// Źródło: offers.attributes.cpp = { eligible: true, note?: string }
// (przenoszone z MySunrise.shop_products.cpp_eligible / cpp_note przez mysunrise-sync).

export const CPP_TEKST_DOMYSLNY =
  "Objęte programem Czysta Polska Plus — do 5 000 zł rabatu lub zwrotu na portfel MySunrise. Warunki w regulaminie.";

export type CzystaPolskaPlusInfo = {
  /** Krótka plakietka na karcie w katalogu. */
  badge: string;
  /** Pełne zdanie na stronie produktu. */
  note: string;
};

export function czystaPolskaPlusInfo(attributes?: Record<string, unknown> | null): CzystaPolskaPlusInfo | null {
  const cpp = (attributes as { cpp?: { eligible?: boolean; note?: string } } | null | undefined)?.cpp;
  if (!cpp?.eligible) return null;
  const note = (typeof cpp.note === "string" && cpp.note.trim()) || CPP_TEKST_DOMYSLNY;
  return { badge: "Czysta Polska Plus", note };
}
