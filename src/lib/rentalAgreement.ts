// Umowa najmu (rygorystyczna, ale odporna na zarzut klauzul abuzywnych) — decyzja właściciela 2026-09-06:
// akceptowana na początku, w momencie zapłaty z góry razem z kaucją. Treść wersjonowana; przy akceptacji zapisujemy
// wersję + sha256 pełnego tekstu (market.booking_agreements) i wysyłamy e-mailem obu stronom.
//
// Przegląd prawny (Suri, 2026-09-06) — zmiany względem wersji 2026-09-06 (wzór roboczy):
//  • kara za opóźnienie: 100% stawki dobowej za każdą rozpoczętą dobę (zamiast 150%) + udokumentowane koszty; bez zarzutu
//    „rażąco wygórowanej kary” (art. 385³ pkt 17 k.c.), z prawem do odszkodowania uzupełniającego (art. 484 §1 k.c.);
//  • brak fikcji „milczenie = potwierdzenie” (art. 385³ pkt 9 k.c.) — zastrzeżenia można zgłosić w 24 h, potem w trybie sporu;
//  • odpowiedzialność najemcy na zasadzie winy (art. 471 k.c.), także za osoby, którym powierzył przedmiot (art. 474);
//    normalne zużycie wyłączone; utracone korzyści ograniczone do czasu naprawy, maks. 14 dni; prawo do niezależnej wyceny;
//  • kaucja: termin zwrotu 7 dni od protokołu zwrotu (brak terminu = klauzula niedozwolona), spór → wstrzymanie tylko spornej części;
//  • informacja o braku prawa odstąpienia (art. 38 pkt 12 ustawy o prawach konsumenta — najem samochodu na oznaczony termin)
//    i o pozasądowym rozwiązywaniu sporów (ODR/rzecznik konsumentów); sąd właściwy wg przepisów ogólnych (bez narzucania sądu);
//  • RODO: administratorzy (Wynajmujący; Operator Sunrise Market — Green Eco World Sp. z o.o.), cel, podstawa (art. 6 ust. 1 lit. b, c, f);
//  • obowiązki Wynajmującego (sprawny, ubezpieczony OC pojazd, dokumenty), forma dokumentowa (art. 77² k.c.);
//  • 2026-09-06.3 (decyzja właściciela): minimalny staż prawa jazdy (rental_operations.min_license_years, domyślnie 2 lata) — w umowie i walidacji.
export const RENTAL_AGREEMENT_VERSION = "2026-09-06.3";

export type RenterData = { full_name: string; phone: string; doc_type: "dowód osobisty" | "paszport"; doc_number: string; license_number: string; license_since_year: string; address: string };
export const EMPTY_RENTER: RenterData = { full_name: "", phone: "", doc_type: "dowód osobisty", doc_number: "", license_number: "", license_since_year: "", address: "" };

export type AgreementFacts = {
  item: string; sellerName: string; from: string; to: string; units: number; rent: number; deposit: number; fees: number;
  isVehicle: boolean; kmLimitPerDay?: number | null; extraKmRate?: number | null; minDriverAge?: number | null; minLicenseYears?: number | null; pickupLocation?: string | null;
};

const zl = (n: number) => `${Number(n || 0).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;

export function rentalAgreementText(f: AgreementFacts, r: RenterData): string {
  const veh = f.isVehicle;
  const daily = f.units > 0 ? f.rent / f.units : f.rent;
  const L: string[] = [];
  let n = 0; const par = (t: string) => { n += 1; L.push(`§${n} ${t}`); };
  L.push(`UMOWA NAJMU ${veh ? "POJAZDU" : "RZECZY"} — wersja ${RENTAL_AGREEMENT_VERSION}`);
  L.push(`zawierana w formie dokumentowej za pośrednictwem platformy Sunrise Market (sunrisemarket.pl, Operator: Green Eco World Sp. z o.o., ul. Kolejowa 20, 64-300 Nowy Tomyśl, NIP 7882038912) w chwili opłacenia rezerwacji.`);
  L.push("");
  par(`Strony. Wynajmujący: ${f.sellerName}. Najemca: ${r.full_name || "—"}, tel. ${r.phone || "—"}, ${r.doc_type} nr ${r.doc_number || "—"}${veh ? `, prawo jazdy nr ${r.license_number || "—"} (od roku ${r.license_since_year || "—"})` : ""}${r.address ? `, adres: ${r.address}` : ""}. Najemca oświadcza, że podane dane są prawdziwe i że okaże dokumenty przy wydaniu.`);
  par(`Przedmiot i okres. ${f.item}. Okres najmu: od ${f.from} do ${f.to} (${f.units} ${f.units === 1 ? "doba" : "dób"}).${f.pickupLocation ? ` Miejsce wydania i zwrotu: ${f.pickupLocation}.` : ""} Wynajmujący oświadcza, że przedmiot jest sprawny, kompletny${veh ? ", zarejestrowany, z ważnym badaniem technicznym i ubezpieczeniem OC" : ""} i nadaje się do umówionego użytku.`);
  par(`Czynsz i kaucja. Czynsz za cały okres: ${zl(f.rent)}${f.fees > 0 ? ` + opłata dodatkowa ${zl(f.fees)}` : ""} (stawka dobowa ${zl(daily)}), płatny z góry przez Sunrise Market. Kaucja zwrotna: ${zl(f.deposit)}, pobierana razem z czynszem i przechowywana przez Operatora do rozliczenia najmu. Kaucja nie jest zaliczką na czynsz i nie podlega oprocentowaniu.`);
  par(`Wydanie i zwrot — protokół. Wydanie i zwrot dokumentuje w aplikacji protokół ze zdjęciami wykonanymi aparatem w chwili wydania/zwrotu; każde zdjęcie otrzymuje znacznik czasu i odcisk (SHA-256) nadany przez serwer Sunrise. Najemca ma prawo wykonać własne zdjęcia w tym samym czasie i potwierdzić tożsamość kodem wysłanym przez aplikację. Najemca potwierdza protokół w aplikacji albo zgłasza zastrzeżenia — najpóźniej w ciągu 24 godzin od zapisania protokołu; zastrzeżenia zgłoszone później rozpatrywane są w trybie sporu (§${veh ? 8 : 7}), z uwzględnieniem zdjęć obu stron. Protokoły i zdjęcia są podstawą rozliczenia kaucji.`);
  par(`Obowiązki Najemcy. Najemca: (a) używa przedmiotu zgodnie z przeznaczeniem i instrukcją, z należytą starannością; (b) nie oddaje go osobom trzecim ani w podnajem; (c) nie dokonuje przeróbek ani napraw bez zgody Wynajmującego; (d) zwraca przedmiot w terminie i miejscu z §2, w stanie niepogorszonym ponad normalne zużycie, kompletny i czysty; (e) niezwłocznie (nie później niż w ciągu 1 godziny) zgłasza Wynajmującemu uszkodzenie, awarię, kradzież lub kolizję.`);
  if (veh) {
    par(`Pojazd — zasady szczególne. Pojazd może prowadzić wyłącznie Najemca (lub kierowca wskazany w §1), posiadający ważne prawo jazdy kat. B${f.minLicenseYears ? ` od co najmniej ${f.minLicenseYears} lat` : ""}${f.minDriverAge ? ` i mający co najmniej ${f.minDriverAge} lat` : ""}. Zakazane są: prowadzenie pod wpływem alkoholu lub środków odurzających, holowanie, udział w rajdach i wyścigach, nauka jazdy, przewóz osób lub ładunków za wynagrodzeniem, wyjazd poza granice Polski bez pisemnej (także e-mail) zgody Wynajmującego, palenie w pojeździe, przewóz zwierząt bez zgody. Paliwo: zwrot z takim samym poziomem jak przy wydaniu; brakujące paliwo rozliczane według ceny zakupu (paragon) + 30 zł opłaty za tankowanie.${f.kmLimitPerDay ? ` Limit przebiegu: ${f.kmLimitPerDay} km na dobę, sumowany za cały okres; każdy kilometr ponad limit: ${zl(f.extraKmRate ?? 0.5)}.` : ""} Mandaty, opłaty parkingowe i drogowe oraz inne kary za zdarzenia z okresu najmu obciążają Najemcę; Wynajmujący, jako właściciel pojazdu, wskazuje uprawnionym organom dane Najemcy zgodnie z art. 78 ust. 4 Prawa o ruchu drogowym. Przy kolizji, kradzieży lub uszkodzeniu przez osoby trzecie Najemca wzywa Policję i uzyskuje notatkę ze zdarzenia.`);
  }
  par(`Odpowiedzialność za szkody. Najemca odpowiada za uszkodzenie, zniszczenie, utratę i braki w wyposażeniu przedmiotu powstałe w okresie najmu z przyczyn, za które ponosi odpowiedzialność (art. 471 k.c.), w tym za działania osób, którym powierzył przedmiot (art. 474 k.c.). Nie odpowiada za normalne zużycie ani za wady istniejące przy wydaniu i ujęte w protokole. Wysokość szkody ustala się według kosztów naprawy (kosztorys serwisu lub rzeczoznawcy) albo wartości odtworzeniowej; Najemca może przedstawić własną, niezależną wycenę. Jeżeli szkoda uniemożliwia dalszy najem, Najemca pokrywa także utracony czynsz za czas naprawy, nie dłużej niż za 14 dni, według stawki dobowej z §3.${veh ? " Jeżeli szkoda jest objęta ubezpieczeniem AC Wynajmującego, odpowiedzialność Najemcy ogranicza się do udziału własnego i kosztów nieobjętych polisą, chyba że szkoda powstała z naruszeniem §6." : ""}`);
  par(`Rozliczenie kaucji i spory. Wynajmujący rozlicza kaucję w ciągu 7 dni od zapisania protokołu zwrotu: zwraca ją w całości, jeżeli nie stwierdzono szkód i braków, albo potrąca uzasadnioną i udokumentowaną kwotę, opisując powód w aplikacji. Sporna część kaucji pozostaje u Operatora do wyjaśnienia sporu; część bezsporna jest zwracana w powyższym terminie. Jeżeli szkoda przekracza kaucję, Najemca dopłaca różnicę w terminie 14 dni od otrzymania wezwania z dokumentacją. Spory strony zgłaszają w aplikacji Sunrise Market; Operator może pośredniczyć w ich rozwiązaniu. Najemca będący konsumentem może skorzystać z pozasądowych sposobów rozpatrywania reklamacji (powiatowy/miejski rzecznik konsumentów, platforma ODR: ec.europa.eu/consumers/odr). Sądem właściwym jest sąd według przepisów ogólnych.`);
  par(`Opóźnienie zwrotu. Za każdą rozpoczętą dobę opóźnienia zwrotu bez zgody Wynajmującego Najemca płaci opłatę równą stawce dobowej z §3 oraz udokumentowane koszty wynikłe z opóźnienia (np. odwołany najem kolejnego klienta), przy czym Wynajmujący może dochodzić odszkodowania przewyższającego te kwoty na zasadach ogólnych. Brak zwrotu i brak kontaktu przez 24 godziny po terminie uprawnia Wynajmującego do zgłoszenia sprawy organom ścigania${veh ? " i ustalenia położenia pojazdu" : ""}.`);
  par(`Odstąpienie i anulowanie. Umowa najmu${veh ? " samochodu" : ""} na oznaczony okres jest wyłączona z 14-dniowego prawa odstąpienia (art. 38 pkt 12 ustawy o prawach konsumenta). Anulowanie opłaconej rezerwacji następuje na zasadach określonych w ofercie i Regulaminie Sunrise Market. Wynajmujący może odmówić wydania przedmiotu osobie, której tożsamość lub uprawnienia nie zgadzają się z §1, albo która jest pod wpływem alkoholu lub środków odurzających — w takim wypadku czynsz nie podlega zwrotowi, a kaucja jest zwracana.`);
  par(`Dane osobowe i dowody. Administratorami danych Najemcy są Wynajmujący (wykonanie umowy) oraz Operator (obsługa platformy, płatności, kaucji i sporów). Dane są przetwarzane w celu zawarcia i wykonania umowy, wypełnienia obowiązków prawnych (np. wskazanie kierowcy organom) oraz ustalenia i dochodzenia roszczeń (art. 6 ust. 1 lit. b, c i f RODO); szczegóły w Polityce prywatności Sunrise Market. Strony zgadzają się, że zapisy w aplikacji (rezerwacja, płatność, akceptacja umowy, protokoły, zdjęcia ze znacznikiem czasu i odciskiem, kody potwierdzenia, wiadomości) stanowią dowód treści umowy i stanu przedmiotu.`);
  par(`Postanowienia końcowe. W sprawach nieuregulowanych stosuje się Kodeks cywilny, ustawę o prawach konsumenta i Regulamin Sunrise Market. Umowa jest zawierana w formie dokumentowej (art. 77² k.c.): przez zaznaczenie pola „Akceptuję umowę najmu” i opłacenie rezerwacji; data i godzina akceptacji, wersja umowy oraz odcisk treści są zapisywane w systemie, a treść umowy jest wysyłana obu stronom e-mailem.`);
  return L.join("\n");
}

export async function sha256Text(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
