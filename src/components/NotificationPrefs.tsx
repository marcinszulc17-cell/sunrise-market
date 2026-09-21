// Kanały powiadomień — Moje konto → Ustawienia.
//
// ZASADA: dzwonek w serwisie zostaje zawsze. Tu decydujesz tylko o tym, co ma
// dodatkowo zawibrować w telefonie i co ma wpaść na skrzynkę. Sprzedaż domyślnie
// idzie obydwoma kanałami — o sprzedaży nie wolno się dowiedzieć po tygodniu.
//
// SMS-y są wypisane, ale wyłączone, bo Sunrise Market nie ma jeszcze podpiętej
// bramki SMS (market.sms_log jest pusty od zawsze). Przełącznik, który udaje, że
// coś wysyła, jest gorszy niż jego brak — sprzedawca by na nim polegał.
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Prefs = {
  sale_push: boolean; sale_mail: boolean; sale_sms: boolean;
  message_push: boolean; message_mail: boolean; message_sms: boolean;
  lead_push: boolean; lead_mail: boolean; lead_sms: boolean;
};

const GRUPY: { klucz: "sale" | "message" | "lead"; ikona: string; tytul: string; opis: string }[] = [
  { klucz: "sale", ikona: "💰", tytul: "Sprzedaż", opis: "Ktoś kupił Twoją ofertę i trzeba ją zrealizować." },
  { klucz: "lead", ikona: "📩", tytul: "Zapytania o oferty", opis: "Klient pyta o cenę, termin albo szczegóły." },
  { klucz: "message", ikona: "💬", tytul: "Wiadomości", opis: "Nowa wiadomość w rozmowie o ofercie." },
];

export default function NotificationPrefs() {
  const [p, setP] = useState<Prefs | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [zapisano, setZapisano] = useState(false);

  useEffect(() => {
    supabase.schema("market").rpc("moje_powiadomienia")
      .then(({ data, error }) => { if (error) setErr(error.message); else setP(data as Prefs); });
  }, []);

  async function przelacz(pole: keyof Prefs) {
    if (!p) return;
    const next = { ...p, [pole]: !p[pole] };
    setP(next); setErr(null); setZapisano(false);
    const { data, error } = await supabase.schema("market").rpc("zapisz_powiadomienia", { p: { [pole]: next[pole] } });
    if (error) { setP(p); setErr(error.message); return; }   // nie udajemy, że zapisane
    setP(data as Prefs); setZapisano(true);
  }

  const box = { background: "var(--glass)", border: "1px solid var(--line)" } as const;

  return <div className="rounded-2xl p-5" style={box}>
    <div className="font-semibold">🔔 Jak Cię powiadamiać</div>
    <p className="mt-1 text-xs leading-5" style={{ color: "var(--mut)" }}>
      Dzwonek w serwisie dostajesz zawsze. Poniżej wybierasz, co ma dodatkowo trafić
      na telefon (push) i na e-mail.
    </p>

    {!p && !err && <div className="mt-4 text-sm" style={{ color: "var(--mut)" }}>Wczytuję ustawienia…</div>}
    {err && <div className="mt-3 rounded-xl px-3 py-2 text-sm" style={{ background: "rgba(239,68,68,.10)", color: "#fca5a5" }}>{err}</div>}

    {p && <div className="mt-4 space-y-3">
      {GRUPY.map(g => <div key={g.klucz} className="rounded-xl p-4" style={{ border: "1px solid var(--line)" }}>
        <div className="font-medium">{g.ikona} {g.tytul}</div>
        <div className="mt-0.5 text-xs" style={{ color: "var(--mut)" }}>{g.opis}</div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={p[`${g.klucz}_push` as keyof Prefs]} onChange={() => przelacz(`${g.klucz}_push` as keyof Prefs)} />
            Push na telefon
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={p[`${g.klucz}_mail` as keyof Prefs]} onChange={() => przelacz(`${g.klucz}_mail` as keyof Prefs)} />
            E-mail
          </label>
          <label className="flex items-center gap-2 opacity-50" title="SMS-y uruchomimy po podpięciu bramki SMS.">
            <input type="checkbox" disabled checked={false} readOnly />
            SMS <span className="text-xs">(wkrótce)</span>
          </label>
        </div>
      </div>)}
      <div className="text-xs" style={{ color: "var(--mut)" }}>
        {zapisano ? "Zapisane." : "Zmiany zapisują się od razu."} Push działa po włączeniu powiadomień wyżej —
        na iPhonie dopiero po dodaniu Sunrise Market do ekranu początkowego.
      </div>
    </div>}
  </div>;
}
