// Kanały powiadomień — Moje konto → Ustawienia.
//
// ZASADA: dzwonek w serwisie zostaje zawsze. Tu decydujesz tylko o tym, co ma
// dodatkowo zawibrować w telefonie, co wpaść na skrzynkę i za co zapłacimy SMS-em.
// Sprzedaż domyślnie idzie pushem i mailem — o sprzedaży nie wolno dowiedzieć się
// po tygodniu, bo klient już czeka.
//
// DLACZEGO SMS TYLKO PRZY SPRZEDAŻY I ZAPYTANIU
// Każdy SMS kosztuje. Przy sprzedaży i zapytaniu cisza kosztuje więcej niż SMS.
// Przy każdej wiadomości w rozmowie byłby to koszt bez pokrycia i szybka droga do
// tego, żeby sprzedawca wyłączył wszystko naraz.
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Prefs = {
  sale_push: boolean; sale_mail: boolean; sale_sms: boolean;
  message_push: boolean; message_mail: boolean; message_sms: boolean;
  lead_push: boolean; lead_mail: boolean; lead_sms: boolean;
  phone: string | null;
};

const GRUPY: { klucz: "sale" | "lead" | "message"; ikona: string; tytul: string; opis: string; sms: boolean }[] = [
  { klucz: "sale", ikona: "💰", tytul: "Sprzedaż", opis: "Ktoś kupił Twoją ofertę i trzeba ją zrealizować.", sms: true },
  { klucz: "lead", ikona: "📩", tytul: "Zapytania o oferty", opis: "Klient pyta o cenę, termin albo szczegóły.", sms: true },
  { klucz: "message", ikona: "💬", tytul: "Wiadomości", opis: "Nowa wiadomość w rozmowie o ofercie.", sms: false },
];

export default function NotificationPrefs() {
  const [p, setP] = useState<Prefs | null>(null);
  const [tel, setTel] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    supabase.schema("market").rpc("moje_powiadomienia").then(({ data, error }) => {
      if (error) { setErr(error.message); return; }
      setP(data as Prefs); setTel((data as Prefs)?.phone ?? "");
    });
  }, []);

  async function zapisz(zmiana: Record<string, unknown>, poprzednie: Prefs) {
    setErr(null); setInfo(null);
    const { data, error } = await supabase.schema("market").rpc("zapisz_powiadomienia", { p: zmiana });
    if (error) { setP(poprzednie); setTel(poprzednie.phone ?? ""); setErr(error.message); return; }
    setP(data as Prefs); setTel((data as Prefs)?.phone ?? ""); setInfo("Zapisane.");
  }

  function przelacz(pole: keyof Prefs) {
    if (!p) return;
    const poprzednie = p;
    const next = { ...p, [pole]: !p[pole] } as Prefs;
    setP(next);
    zapisz({ [pole]: next[pole] }, poprzednie);
  }

  const box = { background: "var(--glass)", border: "1px solid var(--line)" } as const;
  const pole = "mt-1 w-full rounded-xl px-3 py-2 text-sm outline-none";

  return <div className="rounded-2xl p-5" style={box}>
    <div className="font-semibold">🔔 Jak Cię powiadamiać</div>
    <p className="mt-1 text-xs leading-5" style={{ color: "var(--mut)" }}>
      Dzwonek w serwisie dostajesz zawsze. Poniżej wybierasz, co ma dodatkowo trafić
      na telefon (push), na e-mail i SMS-em.
    </p>

    {!p && !err && <div className="mt-4 text-sm" style={{ color: "var(--mut)" }}>Wczytuję ustawienia…</div>}
    {err && <div className="mt-3 rounded-xl px-3 py-2 text-sm" style={{ background: "rgba(239,68,68,.10)", color: "#fca5a5" }}>{err}</div>}

    {p && <div className="mt-4 space-y-3">
      {GRUPY.map(g => <div key={g.klucz} className="rounded-xl p-4" style={{ border: "1px solid var(--line)" }}>
        <div className="font-medium">{g.ikona} {g.tytul}</div>
        <div className="mt-0.5 text-xs" style={{ color: "var(--mut)" }}>{g.opis}</div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={Boolean(p[`${g.klucz}_push` as keyof Prefs])} onChange={() => przelacz(`${g.klucz}_push` as keyof Prefs)} />
            Push na telefon
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={Boolean(p[`${g.klucz}_mail` as keyof Prefs])} onChange={() => przelacz(`${g.klucz}_mail` as keyof Prefs)} />
            E-mail
          </label>
          {g.sms
            ? <label className="flex items-center gap-2">
                <input type="checkbox" checked={Boolean(p[`${g.klucz}_sms` as keyof Prefs])} onChange={() => przelacz(`${g.klucz}_sms` as keyof Prefs)} />
                SMS
              </label>
            : <span className="text-xs" style={{ color: "var(--mut)" }} title="SMS przy każdej wiadomości to koszt bez pokrycia.">SMS — nie przy wiadomościach</span>}
        </div>
      </div>)}

      <div className="rounded-xl p-4" style={{ border: "1px solid var(--line)" }}>
        <label className="block text-sm font-medium">📱 Numer do SMS-ów</label>
        <div className="mt-0.5 text-xs" style={{ color: "var(--mut)" }}>
          Polska komórka, 9 cyfr. Używamy go wyłącznie do powiadomień, które sam włączyłeś —
          nie trafia do ogłoszeń ani do klientów.
        </div>
        <div className="flex gap-2">
          <input value={tel} onChange={e => setTel(e.target.value)} placeholder="512 345 678"
            className={pole} style={box} inputMode="tel" />
          <button type="button" onClick={() => p && zapisz({ phone: tel }, p)}
            className="mt-1 shrink-0 rounded-xl px-4 text-sm font-semibold"
            style={{ background: "linear-gradient(135deg,#E8891A,#F5A623)", color: "#101012" }}>
            Zapisz numer
          </button>
        </div>
      </div>

      <div className="text-xs" style={{ color: "var(--mut)" }}>
        {info ?? "Zmiany zapisują się od razu."} Push działa po włączeniu powiadomień wyżej —
        na iPhonie dopiero po dodaniu Sunrise Market do ekranu początkowego.
      </div>
    </div>}
  </div>;
}
