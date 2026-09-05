// Centrum sprzedaży → Odbiór osobisty: sprzedawca włącza punkt odbioru (adres, godziny, uwagi).
// Po włączeniu jego oferty dostają w koszyku bezpłatną opcję „Odbiór osobisty u sprzedawcy” obok wysyłki
// (RPC my_pickup_settings / set_pickup_settings; tor koszyka seller_pickup w cart_lanes).
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

type Settings = { enabled: boolean; address: string | null; hours: string | null; note: string | null; seller_type?: string };

export default function SellerPickup() {
  const [s, setS] = useState<Settings | null>(null);
  const [enabled, setEnabled] = useState(false); const [address, setAddress] = useState(""); const [hours, setHours] = useState(""); const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Kontakt w ogłoszeniach: numer telefonu widoczny po „Pokaż numer” (tylko zalogowani) — sellers.phone_public
  const [phone, setPhone] = useState(""); const [phonePublic, setPhonePublic] = useState(false); const [cBusy, setCBusy] = useState(false); const [cMsg, setCMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    supabase.schema("market").rpc("my_contact_settings").then(({ data }) => { const d = (data ?? {}) as { phone?: string | null; phone_public?: boolean }; setPhone(d.phone ?? ""); setPhonePublic(!!d.phone_public); });
    supabase.schema("market").rpc("my_pickup_settings").then(({ data }) => {
      const d = (data ?? null) as Settings | null; setS(d);
      if (d) { setEnabled(!!d.enabled); setAddress(d.address ?? ""); setHours(d.hours ?? ""); setNote(d.note ?? ""); }
    });
  }, []);

  async function save(next?: boolean) {
    const en = next ?? enabled; setBusy(true); setMsg(null);
    const { data, error } = await supabase.schema("market").rpc("set_pickup_settings", { p_enabled: en, p_address: address, p_hours: hours, p_note: note });
    setBusy(false);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    const d = data as Settings; setS(d); setEnabled(!!d.enabled);
    setMsg({ ok: true, text: d.enabled ? "Odbiór osobisty włączony — klienci widzą go w koszyku przy Twoich ofertach." : "Odbiór osobisty wyłączony." });
  }

  async function saveContact(next?: boolean) {
    const pub = next ?? phonePublic; setCBusy(true); setCMsg(null);
    const { data, error } = await supabase.schema("market").rpc("set_contact_settings", { p_phone: phone, p_public: pub });
    setCBusy(false);
    if (error) { setCMsg({ ok: false, text: error.message }); return; }
    const d = (data ?? {}) as { phone?: string | null; phone_public?: boolean }; setPhone(d.phone ?? ""); setPhonePublic(!!d.phone_public);
    setCMsg({ ok: true, text: d.phone_public ? "Numer jest widoczny w Twoich ogłoszeniach po kliknięciu „Pokaż numer” (tylko dla zalogowanych)." : "Numer ukryty — klienci piszą przez Wiadomości." });
  }

  return <main className="min-h-screen px-4 py-8 sm:px-6" style={{ background: "var(--bg)", color: "var(--ink)" }}><div className="mx-auto max-w-3xl">
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div><div className="text-sm font-semibold" style={{ color: "var(--gold)" }}>Centrum sprzedaży</div><h1 className="text-2xl font-semibold">Odbiór i kontakt</h1><p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Klient kupuje i płaci w aplikacji (z cashbackiem), a odbiera u Ciebie — bez kosztów wysyłki. Ty oznaczasz „Gotowe do odbioru” i „Przekazane klientowi” w Zamówieniach.</p></div>
      <Link to="/sprzedawca" className="rounded-xl px-4 py-2 text-sm font-semibold" style={{ background: "var(--header)", border: "1px solid var(--line)" }}>← Panel</Link>
    </div>

    <div className="mb-4 rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><div className="font-semibold">📞 Telefon w ogłoszeniach</div><div className="text-xs" style={{ color: "var(--mut)" }}>{phonePublic ? "Zalogowani klienci widzą Twój numer po kliknięciu „Pokaż numer”." : "Numer ukryty — klienci kontaktują się przez Wiadomości i „Zapytaj o ofertę”."}</div></div>
        <button type="button" disabled={cBusy} onClick={() => saveContact(!phonePublic)} className="rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50" style={phonePublic ? { background: "var(--header)", border: "1px solid var(--line)" } : { background: "linear-gradient(135deg,#E8891A,#F5A623)", color: "#101012" }}>{phonePublic ? "Ukryj numer" : "Pokazuj numer"}</button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+48 600 000 000" inputMode="tel" className="min-h-[44px] w-full max-w-xs rounded-xl px-3 text-sm outline-none" style={{ background: "var(--header)", border: "1px solid var(--line)", color: "var(--ink)" }} aria-label="Numer telefonu" />
        <button type="button" disabled={cBusy} onClick={() => saveContact()} className="min-h-[44px] rounded-xl px-4 text-sm font-semibold disabled:opacity-50" style={{ background: "var(--header)", border: "1px solid var(--line)" }}>{cBusy ? "Zapisuję…" : "Zapisz numer"}</button>
        {cMsg && <span className="text-sm" style={{ color: cMsg.ok ? "var(--green)" : "#f87171" }}>{cMsg.text}</span>}
      </div>
      <p className="mt-2 text-xs" style={{ color: "var(--mut)" }}>Publikując numer, zgadzasz się na kontakt telefoniczny od zalogowanych użytkowników Sunrise Market w sprawie Twoich ogłoszeń. Numer nie jest widoczny dla gości ani w wyszukiwarkach.</p>
    </div>

    {s === null ? <div className="rounded-2xl p-5 text-sm" style={{ background: "var(--glass)", border: "1px solid var(--line)", color: "var(--mut)" }}>Wczytuję…</div> : <div className="grid gap-4">
      <div className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><div className="font-semibold">{enabled ? "🏪 Odbiór osobisty włączony" : "Odbiór osobisty wyłączony"}</div><div className="text-xs" style={{ color: "var(--mut)" }}>{enabled ? "Twoje oferty mają w koszyku opcję „Odbiór osobisty u sprzedawcy” (0 zł)." : "Klienci widzą przy Twoich ofertach tylko wysyłkę."}</div></div>
          <button type="button" disabled={busy || (!enabled && address.trim().length < 8)} onClick={() => save(!enabled)} className="rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50" style={enabled ? { background: "var(--header)", border: "1px solid var(--line)" } : { background: "linear-gradient(135deg,#E8891A,#F5A623)", color: "#101012" }}>{enabled ? "Wyłącz" : "Włącz odbiór"}</button>
        </div>
      </div>

      <div className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
        <label className="block text-sm"><span style={{ color: "var(--mut)" }}>Adres punktu odbioru *</span>
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="np. ul. Poznańska 12, 64-300 Nowy Tomyśl (wejście od podwórza)" className="mt-1 w-full rounded-xl px-3 py-2 text-sm outline-none" style={{ background: "var(--header)", border: "1px solid var(--line)", color: "var(--ink)" }} /></label>
        <label className="mt-3 block text-sm"><span style={{ color: "var(--mut)" }}>Godziny odbioru</span>
          <input value={hours} onChange={(e) => setHours(e.target.value)} placeholder="np. pon.–pt. 8:00–18:00, sob. 8:00–14:00" className="mt-1 w-full rounded-xl px-3 py-2 text-sm outline-none" style={{ background: "var(--header)", border: "1px solid var(--line)", color: "var(--ink)" }} /></label>
        <label className="mt-3 block text-sm"><span style={{ color: "var(--mut)" }}>Uwagi dla klienta (opcjonalnie)</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} placeholder="np. Zamówienie czeka przy kasie — wystarczy podać numer zamówienia." className="mt-1 w-full rounded-xl px-3 py-2 text-sm outline-none" style={{ background: "var(--header)", border: "1px solid var(--line)", color: "var(--ink)" }} /></label>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy} onClick={() => save()} className="rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: "linear-gradient(135deg,#E8891A,#F5A623)", color: "#101012" }}>{busy ? "Zapisuję…" : "Zapisz"}</button>
          {msg && <span className="text-sm" style={{ color: msg.ok ? "var(--green)" : "#f87171" }}>{msg.text}</span>}
        </div>
      </div>

      <div className="rounded-2xl p-5 text-sm leading-6" style={{ background: "rgba(245,166,35,.06)", border: "1px solid rgba(245,166,35,.25)", color: "var(--mut)" }}>
        <b style={{ color: "var(--ink)" }}>Jak to działa</b><br />
        1. Klient wybiera w koszyku „Odbiór osobisty u sprzedawcy” i płaci (portfel Sunrise Pay albo karta/BLIK) — pieniądze są u Sunrise.<br />
        2. W Zamówieniach klikasz <b style={{ color: "var(--ink)" }}>Gotowe do odbioru</b> — klient dostaje powiadomienie z Twoim adresem i godzinami.<br />
        3. Przy odbiorze klient podaje numer zamówienia; klikasz <b style={{ color: "var(--ink)" }}>Przekazane klientowi</b>.<br />
        4. Wypłata na Twój portfel po potwierdzeniu odbioru przez klienta albo automatycznie po 14 dniach (Ochrona Kupujących).
      </div>
    </div>}
  </div></main>;
}
