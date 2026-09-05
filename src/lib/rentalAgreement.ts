// Umowa najmu (rygorystyczna) — decyzja właściciela 2026-09-06: akceptowana na początku, w momencie zapłaty z góry razem z kaucją.
// Treść jest wersjonowana; przy akceptacji zapisujemy wersję + sha256 pełnego tekstu (market.booking_agreements).
// UWAGA: to wzór przygotowany bez udziału prawnika — właściciel ma dać go do sprawdzenia przed pierwszym najmem.
export const RENTAL_AGREEMENT_VERSION = "2026-09-06";

export type RenterData = { full_name: string; phone: string; doc_type: "dowód osobisty" | "paszport"; doc_number: string; license_number: string; license_since_year: string; address: string };
export const EMPTY_RENTER: RenterData = { full_name: "", phone: "", doc_type: "dowód osobisty", doc_number: "", license_number: "", license_since_year: "", address: "" };

export type AgreementFacts = {
  item: string; sellerName: string; from: string; to: string; units: number; rent: number; deposit: number; fees: number;
  isVehicle: boolean; kmLimitPerDay?: number | null; extraKmRate?: number | null; minDriverAge?: number | null; pickupLocation?: string | null;
};

const zl = (n: number) => `${Number(n || 0).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;

export function rentalAgreementText(f: AgreementFacts, r: RenterData): string {
  const veh = f.isVehicle;
  const L: string[] = [];
  L.push(`UMOWA NAJMU ${veh ? "POJAZDU" : "RZECZY"} — wersja ${RENTAL_AGREEMENT_VERSION}`);
  L.push(`zawierana za pośrednictwem platformy Sunrise Market (sunrisemarket.pl) w chwili opłacenia rezerwacji.`);
  L.push("");
  L.push(`§1 Strony. Wynajmujący: ${f.sellerName}. Najemca: ${r.full_name || "—"}, tel. ${r.phone || "—"}, ${r.doc_type} nr ${r.doc_number || "—"}${veh ? `, prawo jazdy nr ${r.license_number || "—"} (od roku ${r.license_since_year || "—"})` : ""}${r.address ? `, adres: ${r.address}` : ""}.`);
  L.push(`§2 Przedmiot. ${f.item}. Okres najmu: od ${f.from} do ${f.to} (${f.units} ${f.units === 1 ? "doba" : "dób"}).${f.pickupLocation ? ` Miejsce wydania i zwrotu: ${f.pickupLocation}.` : ""}`);
  L.push(`§3 Czynsz i kaucja. Czynsz za cały okres: ${zl(f.rent)}${f.fees > 0 ? ` + opłata dodatkowa ${zl(f.fees)}` : ""}, płatny z góry przez Sunrise Market. Kaucja zwrotna: ${zl(f.deposit)}, pobierana razem z czynszem i przechowywana przez Sunrise Market do rozliczenia najmu. Kaucja nie jest zaliczką na czynsz.`);
  L.push(`§4 Wydanie i zwrot — protokół. Wydanie i zwrot są dokumentowane w aplikacji protokołem ze zdjęciami wykonanymi aparatem w chwili wydania/zwrotu; każde zdjęcie otrzymuje znacznik czasu i odcisk serwera Sunrise. Najemca ma prawo wykonać własne zdjęcia w tym samym czasie. Najemca potwierdza protokół w aplikacji albo zgłasza zastrzeżenie; brak odpowiedzi w ciągu 24 godzin od zapisania protokołu uznaje się za potwierdzenie stanu. Protokoły są podstawą rozliczenia kaucji.`);
  L.push(`§5 Obowiązki Najemcy. Najemca: (a) używa przedmiotu zgodnie z przeznaczeniem i instrukcją, z należytą starannością; (b) nie oddaje go osobom trzecim ani w podnajem; (c) nie dokonuje przeróbek i napraw bez zgody Wynajmującego; (d) zwraca przedmiot w stanie niepogorszonym ponad normalne zużycie, kompletny i czysty, w terminie i miejscu określonym w §2.`);
  if (veh) {
    L.push(`§6 Pojazd — zasady szczególne. Pojazd może prowadzić wyłącznie Najemca (lub kierowca wskazany w §1), posiadający ważne prawo jazdy${f.minDriverAge ? ` i mający co najmniej ${f.minDriverAge} lat` : ""}. Zakazane są: jazda pod wpływem alkoholu lub środków odurzających, holowanie, udział w rajdach i wyścigach, nauka jazdy, przewóz osób/ładunków za wynagrodzeniem, wyjazd poza granice Polski bez pisemnej zgody Wynajmującego, palenie w pojeździe, przewóz zwierząt bez zgody. Paliwo: zwrot z takim samym poziomem jak przy wydaniu; brakujące paliwo rozliczane według ceny zakupu + 30 zł opłaty za tankowanie.${f.kmLimitPerDay ? ` Limit przebiegu: ${f.kmLimitPerDay} km/doba; każdy kilometr ponad limit: ${zl(f.extraKmRate ?? 0.4)}.` : ""} Mandaty, opłaty parkingowe, opłaty drogowe i inne kary powstałe w okresie najmu obciążają Najemcę; Wynajmujący może przekazać organom dane Najemcy. Najemca niezwłocznie (do 1 godziny) zgłasza Wynajmującemu każdą kolizję, kradzież, uszkodzenie lub awarię oraz wzywa Policję przy kolizji, kradzieży i uszkodzeniu przez osoby trzecie.`);
  }
  L.push(`§${veh ? 7 : 6} Odpowiedzialność i rozliczenie kaucji. Najemca odpowiada za uszkodzenie, zniszczenie, utratę i braki w wyposażeniu przedmiotu w okresie najmu do pełnej wysokości szkody (koszt naprawy według kosztorysu serwisu/wyceny lub wartość odtworzeniowa), a także za utracone przez Wynajmującego korzyści za czas naprawy (w wysokości czynszu dobowego za każdy dzień). Wynajmujący rozlicza kaucję po protokole zwrotu: zwraca ją w całości, jeżeli nie stwierdzono szkód i braków, albo potrąca uzasadnioną kwotę, opisując powód w aplikacji. Jeżeli szkoda przekracza kaucję, Najemca dopłaca różnicę w terminie 7 dni od wezwania. Spór o rozliczenie strony zgłaszają w aplikacji Sunrise Market; Sunrise Market może wstrzymać wypłatę kaucji do wyjaśnienia.`);
  L.push(`§${veh ? 8 : 7} Opóźnienie zwrotu. Za każdą rozpoczętą dobę opóźnienia zwrotu bez zgody Wynajmującego Najemca płaci 150% czynszu dobowego. Brak zwrotu w ciągu 24 godzin po terminie bez kontaktu uprawnia Wynajmującego do zgłoszenia przywłaszczenia organom ścigania${veh ? " i lokalizacji pojazdu" : ""}.`);
  L.push(`§${veh ? 9 : 8} Odstąpienie i anulowanie. Rezerwacja opłacona z góry może być anulowana na zasadach określonych w ofercie i Regulaminie Sunrise Market. Wynajmujący może odmówić wydania przedmiotu osobie, której tożsamość lub uprawnienia nie zgadzają się z §1, albo która jest pod wpływem alkoholu lub środków odurzających — czynsz nie podlega wówczas zwrotowi.`);
  L.push(`§${veh ? 10 : 9} Dane i dowody. Strony zgadzają się, że zapisy w aplikacji Sunrise Market (rezerwacja, płatność, akceptacja umowy, protokoły, zdjęcia ze znacznikiem czasu i odciskiem serwera, wiadomości) stanowią dowód treści umowy i stanu przedmiotu. Dane Najemcy są przetwarzane w celu wykonania umowy i dochodzenia roszczeń (Polityka prywatności Sunrise Market).`);
  L.push(`§${veh ? 11 : 10} Postanowienia końcowe. W sprawach nieuregulowanych stosuje się Kodeks cywilny i Regulamin Sunrise Market. Akceptacja umowy następuje przez zaznaczenie pola „Akceptuję umowę najmu” i opłacenie rezerwacji; data i godzina akceptacji oraz odcisk treści są zapisywane w systemie.`);
  return L.join("\n");
}

export async function sha256Text(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
