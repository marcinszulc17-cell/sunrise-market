import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { zl } from "../lib/money";

type BuyerStatus = "pending" | "acknowledged" | "disputed";
type Protocol = {
  id: string;
  status: "draft" | "issued" | "returned" | "closed";
  resource_kind: string | null;
  handover_at: string | null;
  handover_odometer: number | null;
  handover_fuel_percent: number | null;
  handover_condition: string | null;
  handover_notes: string | null;
  handover_kit_complete: boolean | null;
  return_at: string | null;
  return_odometer: number | null;
  return_fuel_percent: number | null;
  return_condition: string | null;
  return_notes: string | null;
  return_kit_complete: boolean | null;
  damage_found: boolean;
  damage_note: string | null;
  deposit_decision: "pending" | "refund" | "partial" | "retain";
  deposit_retained_requested_gross: number;
  deposit_decision_note: string | null;
  handover_buyer_status: BuyerStatus;
  handover_buyer_responded_at: string | null;
  handover_buyer_note: string | null;
  return_buyer_status: BuyerStatus;
  return_buyer_responded_at: string | null;
  return_buyer_note: string | null;
};
type Photo = { id: string; phase: "handover" | "return"; file_name: string; mime_type: string; created_at: string };
type Props = { bookingId: string; depositGross?: number; depositStatus?: string; depositRetainedGross?: number };

const dt = (iso: string) => new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
const responseLabel = (status: BuyerStatus) => status === "acknowledged" ? "Potwierdzono" : status === "disputed" ? "Zgłoszono zastrzeżenie" : "Czeka na Twoją odpowiedź";
const decisionLabel = (decision: Protocol["deposit_decision"]) => decision === "refund" ? "Zwrot całej kaucji" : decision === "partial" ? "Częściowe potrącenie" : decision === "retain" ? "Zatrzymanie kaucji" : "Do rozliczenia";
const errorLabels: Record<string, string> = {
  already_responded: "Odpowiedź do tego etapu została już zapisana.",
  dispute_note_required: "Opisz krótko, czego dotyczy zastrzeżenie.",
  protocol_not_ready: "Protokół nie jest jeszcze gotowy.",
  phase_not_ready: "Ten etap protokołu nie jest jeszcze gotowy.",
  buyer_only: "Tylko klient tej rezerwacji może odpowiedzieć na protokół.",
  rental_only: "Potwierdzenie protokołu dotyczy wynajmu.",
};
const errorLabel = (code: string) => errorLabels[code] || code;

export default function BuyerRentalProtocolCard({ bookingId, depositGross = 0, depositStatus, depositRetainedGross = 0 }: Props) {
  const [protocol, setProtocol] = useState<Protocol | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [disputePhase, setDisputePhase] = useState<"handover" | "return" | null>(null);
  const [note, setNote] = useState("");

  async function load() {
    const { data, error } = await supabase.functions.invoke("booking-protocol", { body: { action: "get", booking_id: bookingId } });
    if (error || !data?.ok) {
      setMsg(errorLabel(data?.error || error?.message || "Nie udało się pobrać protokołu"));
      setLoading(false);
      return;
    }
    setProtocol((data.protocol || null) as Protocol | null);
    setPhotos((data.photos || []) as Photo[]);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [bookingId]);

  const handoverPhotos = useMemo(() => photos.filter((p) => p.phase === "handover"), [photos]);
  const returnPhotos = useMemo(() => photos.filter((p) => p.phase === "return"), [photos]);
  const hasVehicleData = protocol?.resource_kind === "vehicle" || protocol?.handover_odometer != null || protocol?.return_odometer != null || protocol?.handover_fuel_percent != null || protocol?.return_fuel_percent != null;
  const hasKitData = protocol?.resource_kind === "equipment" || protocol?.handover_kit_complete != null || protocol?.return_kit_complete != null;

  async function respond(phase: "handover" | "return", status: "acknowledged" | "disputed") {
    if (status === "disputed" && note.trim().length < 3) { setMsg("Opisz krótko, czego dotyczy zastrzeżenie."); return; }
    if (!window.confirm(status === "acknowledged" ? "Potwierdzić stan zapisany w protokole?" : "Wysłać zastrzeżenie do tego protokołu?")) return;
    setBusy(true); setMsg("");
    const { data, error } = await supabase.functions.invoke("booking-protocol", {
      body: { action: "buyer_respond", booking_id: bookingId, phase, payload: { status, note: status === "disputed" ? note.trim() : null } },
    });
    if (error || !data?.ok) {
      setMsg(errorLabel(data?.error || error?.message || "Nie udało się zapisać odpowiedzi"));
    } else {
      setProtocol(data.protocol as Protocol);
      setDisputePhase(null); setNote("");
      setMsg(status === "acknowledged" ? "Stan potwierdzony ✅" : "Zastrzeżenie zapisane ✅");
    }
    setBusy(false);
  }

  async function openPhoto(photo: Photo) {
    const { data, error } = await supabase.functions.invoke("booking-protocol", { body: { action: "photo_url", booking_id: bookingId, photo_id: photo.id } });
    if (error || !data?.ok || !data.url) { setMsg(errorLabel(data?.error || error?.message || "Nie udało się otworzyć zdjęcia")); return; }
    window.open(String(data.url), "_blank", "noopener,noreferrer");
  }

  const phase = (kind: "handover" | "return") => {
    if (!protocol) return null;
    const isHandover = kind === "handover";
    const at = isHandover ? protocol.handover_at : protocol.return_at;
    if (!at) return null;
    const status = isHandover ? protocol.handover_buyer_status : protocol.return_buyer_status;
    const respondedAt = isHandover ? protocol.handover_buyer_responded_at : protocol.return_buyer_responded_at;
    const buyerNote = isHandover ? protocol.handover_buyer_note : protocol.return_buyer_note;
    const odometer = isHandover ? protocol.handover_odometer : protocol.return_odometer;
    const fuel = isHandover ? protocol.handover_fuel_percent : protocol.return_fuel_percent;
    const condition = isHandover ? protocol.handover_condition : protocol.return_condition;
    const notes = isHandover ? protocol.handover_notes : protocol.return_notes;
    const kit = isHandover ? protocol.handover_kit_complete : protocol.return_kit_complete;
    const phasePhotos = isHandover ? handoverPhotos : returnPhotos;
    return <section className="rounded-xl p-3" style={{ background: "var(--header)", border: "1px solid var(--line)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <b>{isHandover ? "Protokół wydania" : "Protokół zwrotu"}</b>
        <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ border: "1px solid var(--line)", color: status === "acknowledged" ? "var(--green)" : status === "disputed" ? "#fca5a5" : "var(--gold)" }}>{responseLabel(status)}</span>
      </div>
      <div className="mt-2 text-xs" style={{ color: "var(--mut)" }}>Zapisano: {dt(at)}</div>
      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        {hasVehicleData && odometer != null && <div><span style={{ color: "var(--mut)" }}>Przebieg: </span><b>{odometer.toLocaleString("pl-PL")} km</b></div>}
        {hasVehicleData && fuel != null && <div><span style={{ color: "var(--mut)" }}>Paliwo / bateria: </span><b>{fuel}%</b></div>}
        {hasKitData && kit != null && <div><span style={{ color: "var(--mut)" }}>Komplet wyposażenia: </span><b>{kit ? "tak" : "nie"}</b></div>}
        {condition && <div className="sm:col-span-2"><span style={{ color: "var(--mut)" }}>Stan: </span>{condition}</div>}
        {notes && <div className="sm:col-span-2"><span style={{ color: "var(--mut)" }}>Uwagi: </span>{notes}</div>}
        {!isHandover && protocol.damage_found && <div className="sm:col-span-2 rounded-lg p-2" style={{ background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)" }}><b>Zapisano uszkodzenie / brak</b>{protocol.damage_note && <div className="mt-1">{protocol.damage_note}</div>}</div>}
      </div>
      {phasePhotos.length > 0 && <div className="mt-3"><div className="text-xs font-semibold">Zdjęcia protokołu</div><div className="mt-2 flex flex-wrap gap-2">{phasePhotos.map((photo) => <button key={photo.id} onClick={() => void openPhoto(photo)} className="rounded-lg px-3 py-2 text-xs" style={{ border: "1px solid var(--line)" }}>📷 {photo.file_name}</button>)}</div></div>}
      {status === "pending" && <div className="mt-3">
        <div className="grid gap-2 sm:grid-cols-2"><button disabled={busy} onClick={() => void respond(kind, "acknowledged")} className="rounded-xl px-3 py-2.5 text-sm font-semibold text-black disabled:opacity-50" style={{ background: "linear-gradient(135deg,#E8891A,#F5A623)" }}>Potwierdzam stan</button><button disabled={busy} onClick={() => { setDisputePhase(kind); setNote(""); }} className="rounded-xl px-3 py-2.5 text-sm font-semibold disabled:opacity-50" style={{ border: "1px solid var(--line)" }}>Mam zastrzeżenie</button></div>
        {disputePhase === kind && <div className="mt-3 rounded-xl p-3" style={{ border: "1px solid rgba(239,68,68,.24)" }}><textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 2000))} rows={3} className="w-full rounded-xl px-3 py-2.5 text-sm" style={{ background: "var(--bg)", border: "1px solid var(--line)" }} placeholder="Opisz różnicę, uszkodzenie albo brakujący element…"/><div className="mt-2 flex gap-2"><button disabled={busy || note.trim().length < 3} onClick={() => void respond(kind, "disputed")} className="rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50" style={{ border: "1px solid rgba(239,68,68,.35)" }}>Wyślij zastrzeżenie</button><button disabled={busy} onClick={() => { setDisputePhase(null); setNote(""); }} className="rounded-lg px-3 py-2 text-xs" style={{ border: "1px solid var(--line)" }}>Anuluj</button></div></div>}
      </div>}
      {status !== "pending" && <div className="mt-3 rounded-lg px-3 py-2 text-xs" style={{ background: status === "acknowledged" ? "rgba(34,197,94,.08)" : "rgba(239,68,68,.08)", border: "1px solid var(--line)" }}>{respondedAt && <span>{dt(respondedAt)} · </span>}{responseLabel(status)}{buyerNote && <div className="mt-1">Twoja uwaga: {buyerNote}</div>}</div>}
    </section>;
  };

  if (loading) return <div className="mt-4 rounded-xl p-3 text-xs" style={{ border: "1px solid var(--line)", color: "var(--mut)" }}>Ładowanie protokołu najmu…</div>;

  return <div className="mt-4 rounded-2xl p-4" style={{ background: "rgba(232,137,26,.05)", border: "1px solid rgba(232,137,26,.22)" }}>
    <div className="text-[10px] font-semibold tracking-[.14em]" style={{ color: "var(--gold)" }}>WYNAJEM · PROTOKÓŁ</div>
    <div className="mt-1 font-semibold">Wydanie, zwrot i stan przedmiotu</div>
    {msg && <div className="mt-3 rounded-xl p-3 text-xs" style={{ background: "var(--header)", border: "1px solid var(--line)" }}>{msg}</div>}
    {!protocol && <p className="mt-2 text-xs leading-5" style={{ color: "var(--mut)" }}>Protokół wydania pojawi się tutaj po przekazaniu auta, sprzętu lub innego przedmiotu najmu.</p>}
    {protocol && <div className="mt-3 grid gap-3">{phase("handover")}{phase("return")}{!protocol.handover_at && <p className="text-xs" style={{ color: "var(--mut)" }}>Sprzedawca nie zapisał jeszcze protokołu wydania.</p>}
      {depositGross > 0 && <div className="rounded-xl p-3 text-xs" style={{ background: "var(--header)", border: "1px solid var(--line)" }}><div className="flex items-center justify-between gap-3"><span>Kaucja zwrotna</span><b>{zl(depositGross)}</b></div><div className="mt-1" style={{ color: "var(--mut)" }}>Status: {depositStatus || "—"}</div>{protocol.deposit_decision !== "pending" && <div className="mt-2"><b>{decisionLabel(protocol.deposit_decision)}</b>{protocol.deposit_decision === "partial" && <span> · planowane potrącenie {zl(Number(protocol.deposit_retained_requested_gross || 0))}</span>}{protocol.deposit_decision_note && <div className="mt-1" style={{ color: "var(--mut)" }}>Uzasadnienie: {protocol.deposit_decision_note}</div>}</div>}{depositRetainedGross > 0 && <div className="mt-1">Faktycznie zatrzymano: <b>{zl(depositRetainedGross)}</b></div>}</div>}
    </div>}
  </div>;
}
