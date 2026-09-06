// Zdjęcia protokołu wydania/zwrotu (decyzja właściciela 2026-09-06): tylko z aparatu, tylko „teraz”.
// Serwer (edge fn booking-protocol) stempluje każde zdjęcie: czas przyjęcia, sha256, EXIF, rola, GPS.
// Wspólne dla panelu sprzedawcy i karty klienta.
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

export type ProtocolPhoto = {
  id: string; phase: "handover" | "return"; file_name: string; mime_type: string; created_at: string;
  sha256?: string | null; size_bytes?: number | null; exif_taken_at?: string | null;
  capture_source?: "camera" | "file"; uploaded_role?: "seller" | "buyer"; lat?: number | null; lon?: number | null;
};
export type PhotoWindow = { from: string; to: string };

export const PHOTO_ERRORS: Record<string, string> = {
  outside_window: "Zdjęcia można dodać tylko w oknie czasowym rezerwacji (wydanie: od 24 h przed startem do końca najmu; zwrot: od startu do 72 h po końcu).",
  photo_too_old: "To zdjęcie zostało zrobione wcześniej. Protokół przyjmuje tylko zdjęcia zrobione teraz — zrób nowe aparatem.",
  photo_clock_ahead: "Zegar telefonu jest przestawiony do przodu. Ustaw automatyczną datę i czas, a potem zrób zdjęcie ponownie.",
  buyer_confirmed_locked: "Ten etap został już potwierdzony przez klienta i jest zamrożony.",
  buyer_photo_locked: "Zdjęć klienta nie można usuwać.",
  photos_required: "Najpierw zrób co najmniej jedno zdjęcie z tego etapu — protokół bez zdjęć nie zostanie zapisany.",
  invalid_file_type: "Dozwolone są tylko zdjęcia (JPG, PNG, WebP, HEIC).",
  file_too_large: "Zdjęcie jest za duże (maks. 10 MB).",
  rental_only: "Protokół dotyczy tylko wynajmu na dni.",
  code_no_code: "Najpierw wyślij kod do klienta.",
  code_expired: "Kod wygasł (ważny 15 min). Wyślij nowy.",
  code_too_many_attempts: "Za dużo błędnych prób. Wyślij nowy kod.",
  code_wrong_code: "Nieprawidłowy kod — poproś klienta o odczytanie go z aplikacji lub e-maila.",
};

const dt = (iso: string) => new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "medium" });
const inWindow = (w?: PhotoWindow) => { if (!w) return true; const n = Date.now(); return n >= Number(new Date(w.from)) && n <= Number(new Date(w.to)); };

async function getPosition(): Promise<{ lat: number; lon: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), 4000);
    navigator.geolocation.getCurrentPosition(
      (p) => { clearTimeout(t); resolve({ lat: p.coords.latitude, lon: p.coords.longitude }); },
      () => { clearTimeout(t); resolve(null); },
      { enableHighAccuracy: true, timeout: 3500, maximumAge: 0 },
    );
  });
}

/** Wysyła zdjęcia z aparatu do protokołu; zwraca komunikat błędu albo null. */
export async function uploadProtocolPhotos(bookingId: string, phase: "handover" | "return", files: FileList | File[]) {
  const pos = await getPosition();
  for (const file of Array.from(files).slice(0, 8)) {
    const body = new FormData();
    body.append("action", "upload_photo"); body.append("booking_id", bookingId); body.append("phase", phase); body.append("file", file);
    body.append("capture_source", "camera"); body.append("client_time", new Date().toISOString());
    if (pos) { body.append("lat", String(pos.lat)); body.append("lon", String(pos.lon)); }
    const { data, error } = await supabase.functions.invoke("booking-protocol", { body });
    if (error || !data?.ok) {
      const code = String(data?.error || error?.message || "");
      return PHOTO_ERRORS[code] || code || "Nie udało się dodać zdjęcia";
    }
  }
  return null;
}

export async function openProtocolPhoto(bookingId: string, photo: ProtocolPhoto) {
  const { data, error } = await supabase.functions.invoke("booking-protocol", { body: { action: "photo_url", booking_id: bookingId, photo_id: photo.id } });
  if (error || !data?.ok || !data.url) return PHOTO_ERRORS[String(data?.error)] || data?.error || error?.message || "Nie udało się otworzyć zdjęcia";
  window.open(String(data.url), "_blank", "noopener,noreferrer");
  return null;
}

/** Przycisk „Zrób zdjęcie” — otwiera aparat (capture), nie galerię. */
export function CameraButton({ bookingId, phase, label, window: win, disabled, onDone }: { bookingId: string; phase: "handover" | "return"; label: string; window?: PhotoWindow; disabled?: boolean; onDone: (error: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const open = inWindow(win);
  return <>
    <button type="button" disabled={disabled || busy || !open} onClick={() => ref.current?.click()} className="mt-3 w-full rounded-xl px-3 py-2.5 text-center text-xs font-semibold disabled:opacity-50" style={{ border: "1px dashed var(--gold)", color: "var(--gold)" }}>
      {busy ? "Wysyłanie…" : `📷 ${label}`}
    </button>
    {!open && win && <div className="mt-1 text-[11px]" style={{ color: "var(--mut)" }}>Okno na zdjęcia: {dt(win.from)} → {dt(win.to)}.</div>}
    <input ref={ref} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={async (e) => {
      const files = e.target.files; e.target.value = "";
      if (!files?.length) return;
      setBusy(true); const err = await uploadProtocolPhotos(bookingId, phase, files); setBusy(false); onDone(err);
    }} />
  </>;
}

/** Lista zdjęć z pieczęcią serwera. */
export function PhotoProofList({ bookingId, photos, onError, onDelete }: { bookingId: string; photos: ProtocolPhoto[]; onError: (m: string) => void; onDelete?: (photo: ProtocolPhoto) => void }) {
  if (!photos.length) return <div className="mt-3 text-[11px]" style={{ color: "var(--mut)" }}>Brak zdjęć — zrób je aparatem w chwili wydania/zwrotu.</div>;
  return <div className="mt-3 grid gap-1.5">
    {photos.map((p, i) => <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-[11px]" style={{ border: "1px solid var(--line)", background: "var(--bg)" }}>
      <button type="button" onClick={async () => { const e = await openProtocolPhoto(bookingId, p); if (e) onError(e); }} className="text-left font-semibold">📷 {i + 1}. {p.uploaded_role === "buyer" ? "klient" : "sprzedawca"} · {dt(p.created_at)}</button>
      <span style={{ color: "var(--mut)" }} title={p.sha256 || ""}>
        {p.capture_source === "camera" ? "aparat" : "plik"}{p.exif_taken_at ? ` · EXIF ${new Date(p.exif_taken_at).toLocaleTimeString("pl-PL", { timeStyle: "short" })}` : ""}{p.lat != null ? " · GPS" : ""}{p.sha256 ? ` · #${p.sha256.slice(0, 8)}` : ""}
      </span>
      {onDelete && p.uploaded_role !== "buyer" && <button type="button" onClick={() => onDelete(p)} className="text-[11px]" style={{ color: "#fca5a5" }}>usuń</button>}
    </div>)}
    <div className="text-[10px] leading-4" style={{ color: "var(--mut)" }}>Czas i odcisk (#) nadaje serwer Sunrise w chwili przyjęcia zdjęcia — nie zależą od zegara telefonu i nie da się ich zmienić po fakcie.</div>
  </div>;
}

/** Zapis akceptacji umowy najmu (market.my_rental_agreement) — dla klienta i sprzedawcy. */
export function RentalAgreementBadge({ bookingId, showRenter }: { bookingId: string; showRenter?: boolean }) {
  const [row, setRow] = useState<{ version: string; text_sha256: string; renter: Record<string, string>; accepted_at: string; agreement_text?: string | null } | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    supabase.rpc("my_rental_agreement", { p_booking: bookingId }).then(({ data }) => setRow((data && data[0]) || null));
  }, [bookingId]);
  if (row === undefined) return null;
  if (!row) return <div className="mt-3 rounded-xl px-3 py-2 text-[11px]" style={{ border: "1px solid rgba(239,68,68,.3)", color: "#fca5a5" }}>Brak zaakceptowanej umowy najmu dla tej rezerwacji (rezerwacja sprzed wprowadzenia umów).</div>;
  const r = row.renter || {};
  return <div className="mt-3 rounded-xl px-3 py-2 text-[11px]" style={{ border: "1px solid rgba(34,197,94,.3)", background: "rgba(34,197,94,.06)" }}>
    <b>Umowa najmu zaakceptowana</b> {dt(row.accepted_at)} · wersja {row.version} · odcisk #{row.text_sha256.slice(0, 10)}
    {row.agreement_text && <button type="button" onClick={() => setOpen((v) => !v)} className="ml-2 underline" style={{ color: "var(--gold)" }}>{open ? "zwiń" : "pokaż treść"}</button>}
    {open && row.agreement_text && <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg p-2 text-[11px] leading-4" style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--mut)" }}>{row.agreement_text}</pre>}
    {showRenter && <div className="mt-1" style={{ color: "var(--mut)" }}>Najemca: {r.full_name || "—"} · tel. {r.phone || "—"} · {r.doc_type || "dokument"} {r.doc_number || "—"}{r.license_number ? ` · prawo jazdy ${r.license_number} (od ${r.license_since_year || "—"})` : ""}{r.address ? ` · ${r.address}` : ""}</div>}
  </div>;
}

/** Sprzedawca: „podpis kodem” — wysyła kod klientowi i wpisuje go z jego ust. */
export function HandoverCodePanel({ bookingId, phase, verifiedAt, disabled, onChange }: { bookingId: string; phase: "handover" | "return"; verifiedAt?: string | null; disabled?: boolean; onChange: (msg: string) => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const label = phase === "handover" ? "wydania" : "zwrotu";
  async function call(action: "issue_code" | "verify_code") {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("booking-protocol", { body: { action, booking_id: bookingId, phase, payload: { code } } });
    setBusy(false);
    if (error || !data?.ok) { onChange(PHOTO_ERRORS[String(data?.error)] || data?.error || error?.message || "Błąd kodu"); return; }
    if (action === "issue_code") { setSent(true); onChange("Kod wysłany do klienta (aplikacja + e-mail). Poproś o odczytanie 6 cyfr."); }
    else { setCode(""); onChange(`Tożsamość klienta przy ${label} potwierdzona kodem ✅`); }
  }
  if (verifiedAt) return <div className="mt-3 rounded-lg px-3 py-2 text-[11px]" style={{ border: "1px solid rgba(34,197,94,.3)", background: "rgba(34,197,94,.06)" }}>✓ Klient potwierdził {label} kodem {dt(verifiedAt)}</div>;
  return <div className="mt-3 rounded-lg p-2.5" style={{ border: "1px solid var(--line)" }}>
    <div className="text-[11px] font-semibold">Podpis kodem — klient stoi obok?</div>
    <div className="mt-2 grid grid-cols-[auto_1fr_auto] gap-2">
      <button type="button" disabled={disabled || busy} onClick={() => void call("issue_code")} className="rounded-lg px-3 py-2 text-[11px] font-semibold disabled:opacity-50" style={{ border: "1px solid var(--gold)", color: "var(--gold)" }}>{sent ? "Wyślij ponownie" : "Wyślij kod klientowi"}</button>
      <input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6 cyfr od klienta" className="rounded-lg px-3 py-2 text-sm outline-none" style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--ink)" }} />
      <button type="button" disabled={disabled || busy || code.length !== 6} onClick={() => void call("verify_code")} className="rounded-lg px-3 py-2 text-[11px] font-semibold text-black disabled:opacity-50" style={{ background: "linear-gradient(135deg,#E8891A,#F5A623)" }}>Potwierdź</button>
    </div>
    <div className="mt-1 text-[10px]" style={{ color: "var(--mut)" }}>Klient dostaje kod w aplikacji i e-mailem (SMS po podłączeniu bramki). Ważny 15 min, 5 prób.</div>
  </div>;
}

/** Klient: pokazuje aktywny kod do podania sprzedawcy. */
export function BuyerHandoverCode({ bookingId, phase }: { bookingId: string; phase: "handover" | "return" }) {
  const [row, setRow] = useState<{ code: string; expires_at: string } | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => supabase.rpc("active_handover_code", { p_booking: bookingId, p_phase: phase }).then(({ data }) => { if (alive) setRow((data && data[0]) || null); });
    void load(); const t = setInterval(load, 20000);
    return () => { alive = false; clearInterval(t); };
  }, [bookingId, phase]);
  if (!row) return null;
  return <div className="mt-3 rounded-xl p-3 text-center" style={{ border: "1px solid var(--gold)", background: "rgba(232,137,26,.08)" }}>
    <div className="text-[11px]" style={{ color: "var(--mut)" }}>Twój kod potwierdzenia {phase === "handover" ? "odbioru" : "zwrotu"} — podaj sprzedawcy</div>
    <div className="mt-1 font-mono text-3xl font-bold tracking-[.3em]" style={{ color: "var(--gold)" }}>{row.code}</div>
    <div className="text-[10px]" style={{ color: "var(--mut)" }}>ważny do {new Date(row.expires_at).toLocaleTimeString("pl-PL", { timeStyle: "short" })}</div>
  </div>;
}

/** Sprzedawca: kod QR do zeskanowania przez klienta (decyzja właściciela 2026-09-06 — „jak w wypożyczalni hulajnóg”).
 *  Skan → /odbior/<token> → tożsamość potwierdzona + protokół klienta (zdjęcia, potwierdzenie). Token ważny 15 min. */
export function HandoverQr({ bookingId, phase, disabled }: { bookingId: string; phase: "handover" | "return"; disabled?: boolean }) {
  const [png, setPng] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function show() {
    setBusy(true); setErr("");
    try {
      const { data, error } = await supabase.rpc("issue_handover_link", { p_booking: bookingId, p_phase: phase });
      if (error) throw error;
      const link = `${window.location.origin}/odbior/${data}`;
      const QR = await import("qrcode");
      setPng(await QR.toDataURL(link, { width: 480, margin: 1, color: { dark: "#101012", light: "#ffffff" } }));
      setUrl(link);
    } catch (e: any) { setErr(e?.message || "Nie udało się wygenerować kodu QR"); }
    finally { setBusy(false); }
  }
  return <div className="mt-2">
    {!png ? <button type="button" disabled={disabled || busy} onClick={show} className="w-full rounded-lg px-3 py-2 text-[11px] font-semibold disabled:opacity-50" style={{ border: "1px solid var(--line)" }}>{busy ? "…" : "▦ Pokaż klientowi kod QR (zamiast kodu SMS)"}</button>
      : <div className="rounded-xl bg-white p-3 text-center text-black"><img src={png} alt="Kod QR do zeskanowania przez klienta" className="mx-auto w-full max-w-[260px]" /><div className="mt-1 text-[11px] font-semibold">Klient skanuje aparatem telefonu</div><div className="text-[10px] text-neutral-500">Ważny 15 min · {phase === "handover" ? "wydanie" : "zwrot"}</div><button type="button" onClick={show} className="mt-1 text-[10px] underline">odśwież</button><input readOnly value={url} className="sr-only" aria-hidden="true" /></div>}
    {err && <div className="mt-1 text-[11px]" style={{ color: "#f87171" }}>{err}</div>}
  </div>;
}
