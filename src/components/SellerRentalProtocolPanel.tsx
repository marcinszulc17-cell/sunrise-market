import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type Booking = {
  id: string;
  title: string;
  buyer_name: string | null;
  buyer_email: string | null;
  booking_type: string;
  starts_at: string;
  ends_at: string;
  status: string;
  paid_at: string | null;
  resource_name?: string | null;
  resource_kind?: string | null;
  deposit_gross?: number;
  deposit_status?: string | null;
  deposit_retained_gross?: number;
};
type Protocol = {
  id: string;
  status: "draft" | "issued" | "returned" | "closed";
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
};
type Photo = { id: string; phase: "handover" | "return"; file_name: string; mime_type: string; created_at: string };
type FormState = {
  handover_odometer: string;
  handover_fuel_percent: string;
  handover_condition: string;
  handover_notes: string;
  handover_kit_complete: boolean;
  return_odometer: string;
  return_fuel_percent: string;
  return_condition: string;
  return_notes: string;
  return_kit_complete: boolean;
  damage_found: boolean;
  damage_note: string;
};

const emptyForm: FormState = {
  handover_odometer: "", handover_fuel_percent: "", handover_condition: "", handover_notes: "", handover_kit_complete: true,
  return_odometer: "", return_fuel_percent: "", return_condition: "", return_notes: "", return_kit_complete: true, damage_found: false, damage_note: "",
};
const pln = (value: number) => Number(value || 0).toLocaleString("pl-PL", { style: "currency", currency: "PLN" });
const dt = (iso: string) => new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
const input = "w-full rounded-xl px-3 py-2.5 text-sm outline-none";
const style: React.CSSProperties = { background: "var(--bg)", border: "1px solid var(--line)", color: "var(--ink)" };

export default function SellerRentalProtocolPanel() {
  const [rows, setRows] = useState<Booking[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [protocol, setProtocol] = useState<Protocol | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [partialAmount, setPartialAmount] = useState("");
  const [depositNote, setDepositNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function loadRows() {
    const { data, error } = await supabase.rpc("seller_booking_dashboard_v2");
    if (!error) {
      const rentals = ((data || []) as Booking[]).filter((r) => r.booking_type === "daily" && !!r.paid_at && !["cancelled", "expired"].includes(r.status));
      setRows(rentals);
      setSelectedId((current) => current || rentals[0]?.id || "");
    }
    setLoading(false);
  }

  async function loadProtocol(bookingId: string) {
    if (!bookingId) { setProtocol(null); setPhotos([]); setForm(emptyForm); return; }
    const { data, error } = await supabase.functions.invoke("booking-protocol", { body: { action: "get", booking_id: bookingId } });
    if (error || !data?.ok) { setMsg(data?.error || error?.message || "Nie udało się pobrać protokołu"); return; }
    const p = (data.protocol || null) as Protocol | null;
    setProtocol(p);
    setPhotos((data.photos || []) as Photo[]);
    setForm({
      handover_odometer: p?.handover_odometer == null ? "" : String(p.handover_odometer),
      handover_fuel_percent: p?.handover_fuel_percent == null ? "" : String(p.handover_fuel_percent),
      handover_condition: p?.handover_condition || "",
      handover_notes: p?.handover_notes || "",
      handover_kit_complete: p?.handover_kit_complete ?? true,
      return_odometer: p?.return_odometer == null ? "" : String(p.return_odometer),
      return_fuel_percent: p?.return_fuel_percent == null ? "" : String(p.return_fuel_percent),
      return_condition: p?.return_condition || "",
      return_notes: p?.return_notes || "",
      return_kit_complete: p?.return_kit_complete ?? true,
      damage_found: p?.damage_found ?? false,
      damage_note: p?.damage_note || "",
    });
    setPartialAmount(p?.deposit_retained_requested_gross ? String(p.deposit_retained_requested_gross) : "");
    setDepositNote(p?.deposit_decision_note || "");
  }

  useEffect(() => { void loadRows(); }, []);
  useEffect(() => { if (selectedId) void loadProtocol(selectedId); }, [selectedId]);

  const selected = rows.find((r) => r.id === selectedId) || null;
  const isVehicle = selected?.resource_kind === "vehicle";
  const isEquipment = selected?.resource_kind === "equipment";
  const handoverPhotos = useMemo(() => photos.filter((p) => p.phase === "handover"), [photos]);
  const returnPhotos = useMemo(() => photos.filter((p) => p.phase === "return"), [photos]);
  const returned = Boolean(protocol?.return_at);
  const deposit = Number(selected?.deposit_gross || 0);
  const depositReady = deposit > 0 && ["held", "failed"].includes(selected?.deposit_status || "") && ["completed", "no_show"].includes(selected?.status || "") && returned;

  async function savePhase(phase: "handover" | "return") {
    if (!selected) return;
    setBusy(true); setMsg("");
    try {
      const payload = phase === "handover" ? {
        handover_odometer: form.handover_odometer || null,
        handover_fuel_percent: form.handover_fuel_percent || null,
        handover_condition: form.handover_condition,
        handover_notes: form.handover_notes,
        handover_kit_complete: form.handover_kit_complete,
      } : {
        return_odometer: form.return_odometer || null,
        return_fuel_percent: form.return_fuel_percent || null,
        return_condition: form.return_condition,
        return_notes: form.return_notes,
        return_kit_complete: form.return_kit_complete,
        damage_found: form.damage_found,
        damage_note: form.damage_note,
      };
      const { data, error } = await supabase.functions.invoke("booking-protocol", { body: { action: phase === "handover" ? "save_handover" : "save_return", booking_id: selected.id, payload } });
      if (error || !data?.ok) throw new Error(data?.error || error?.message || "Nie udało się zapisać protokołu");
      if (phase === "return" && selected.status === "confirmed") {
        const { error: statusError } = await supabase.rpc("seller_booking_set_status", { p_booking: selected.id, p_status: "completed" });
        if (statusError) throw statusError;
      }
      await Promise.all([loadRows(), loadProtocol(selected.id)]);
      setMsg(phase === "handover" ? "Protokół wydania zapisany ✅" : "Protokół zwrotu zapisany, a najem zakończony ✅");
    } catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  }

  async function uploadPhoto(phase: "handover" | "return", files: FileList | null) {
    if (!selected || !files?.length) return;
    setBusy(true); setMsg("");
    try {
      for (const file of Array.from(files).slice(0, 8)) {
        const body = new FormData();
        body.append("action", "upload_photo"); body.append("booking_id", selected.id); body.append("phase", phase); body.append("file", file);
        const { data, error } = await supabase.functions.invoke("booking-protocol", { body });
        if (error || !data?.ok) throw new Error(data?.error || error?.message || "Nie udało się dodać zdjęcia");
      }
      await loadProtocol(selected.id); setMsg("Zdjęcia dodane ✅");
    } catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  }

  async function openPhoto(photo: Photo) {
    if (!selected) return;
    const { data, error } = await supabase.functions.invoke("booking-protocol", { body: { action: "photo_url", booking_id: selected.id, photo_id: photo.id } });
    if (error || !data?.ok || !data.url) { setMsg(data?.error || error?.message || "Nie udało się otworzyć zdjęcia"); return; }
    window.open(String(data.url), "_blank", "noopener,noreferrer");
  }

  async function settleDeposit(action: "refund" | "partial" | "retain") {
    if (!selected || !depositReady) return;
    const retain = action === "partial" ? Number(partialAmount || 0) : action === "retain" ? deposit : 0;
    if (action === "partial" && (retain <= 0 || retain >= deposit)) { setMsg("Potrącenie częściowe musi być większe od 0 zł i mniejsze od całej kaucji."); return; }
    const refunded = Math.max(0, deposit - retain);
    if (!window.confirm(action === "refund" ? `Zwrócić klientowi całą kaucję ${pln(deposit)}?` : action === "retain" ? `Zatrzymać całą kaucję ${pln(deposit)}?` : `Potrącić ${pln(retain)} i zwrócić klientowi ${pln(refunded)}?`)) return;
    setBusy(true); setMsg("");
    try {
      const { data: decisionData, error: decisionError } = await supabase.functions.invoke("booking-protocol", { body: { action: "save_deposit_decision", booking_id: selected.id, payload: { deposit_decision: action, deposit_retained_requested_gross: retain, deposit_decision_note: depositNote } } });
      if (decisionError || !decisionData?.ok) throw new Error(decisionData?.error || decisionError?.message || "Nie udało się zapisać decyzji");
      const { data, error } = await supabase.functions.invoke("booking-deposit-action", { body: { booking_id: selected.id, action, retain_gross: action === "partial" ? retain : null, note: depositNote.trim() || null } });
      if (error || !data?.ok) throw new Error(data?.error || error?.message || "Nie udało się rozliczyć kaucji");
      await Promise.all([loadRows(), loadProtocol(selected.id)]);
      setMsg(action === "refund" ? `Kaucja ${pln(deposit)} zwrócona ✅` : action === "retain" ? `Kaucja ${pln(deposit)} zatrzymana ✅` : `Potrącono ${pln(retain)}, zwrócono ${pln(refunded)} ✅`);
    } catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="rounded-2xl p-5 text-sm" style={{ background: "var(--glass)", border: "1px solid var(--line)", color: "var(--mut)" }}>Ładowanie wydań i zwrotów…</div>;
  if (!rows.length) return <div className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}><div className="text-[10px] font-semibold tracking-[.14em]" style={{ color: "var(--gold)" }}>WYNAJEM</div><h2 className="mt-1 text-lg font-semibold">Wydania i zwroty</h2><p className="mt-2 text-sm" style={{ color: "var(--mut)" }}>Brak opłaconych wynajmów wymagających obsługi.</p></div>;

  return <div className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid rgba(200,150,90,.28)" }}>
    <div className="text-[10px] font-semibold tracking-[.14em]" style={{ color: "var(--gold)" }}>WYNAJEM · OPERACJE</div>
    <h2 className="mt-1 text-lg font-semibold">Wydania i zwroty</h2>
    <p className="mt-1 text-xs leading-5" style={{ color: "var(--mut)" }}>Protokół, zdjęcia, stan auta/sprzętu i rozliczenie kaucji w jednym miejscu.</p>
    {msg && <div className="mt-3 rounded-xl p-3 text-xs" style={{ background: "var(--header)", border: "1px solid var(--line)" }}>{msg}</div>}

    <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className="mt-4 w-full rounded-xl px-3 py-2.5 text-sm" style={style}>
      {rows.map((r) => <option key={r.id} value={r.id}>{r.title} · {dt(r.starts_at)}</option>)}
    </select>

    {selected && <div className="mt-4 space-y-4">
      <div className="rounded-xl p-3 text-xs" style={{ background: "var(--header)", border: "1px solid var(--line)" }}><b>{selected.resource_name || selected.title}</b><div className="mt-1" style={{ color: "var(--mut)" }}>{selected.buyer_name || selected.buyer_email || "Klient"} · {dt(selected.starts_at)} → {dt(selected.ends_at)}</div>{deposit > 0 && <div className="mt-1">Kaucja: <b>{pln(deposit)}</b> · {selected.deposit_status || "—"}</div>}</div>

      <section className="rounded-xl p-3" style={{ border: "1px solid var(--line)" }}>
        <div className="flex items-center justify-between gap-2"><b>1. Wydanie</b><span className="text-xs" style={{ color: protocol?.handover_at ? "var(--green)" : "var(--mut)" }}>{protocol?.handover_at ? "✓ zapisane" : "do uzupełnienia"}</span></div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {isVehicle && <><input type="number" min="0" className={input} style={style} placeholder="Przebieg przy wydaniu" value={form.handover_odometer} onChange={(e) => setForm({ ...form, handover_odometer: e.target.value })}/><input type="number" min="0" max="100" className={input} style={style} placeholder="Paliwo / bateria %" value={form.handover_fuel_percent} onChange={(e) => setForm({ ...form, handover_fuel_percent: e.target.value })}/></>}
          <textarea rows={2} className={`${input} sm:col-span-2`} style={style} placeholder="Stan przy wydaniu, istniejące rysy/uszkodzenia…" value={form.handover_condition} onChange={(e) => setForm({ ...form, handover_condition: e.target.value })}/>
          <textarea rows={2} className={`${input} sm:col-span-2`} style={style} placeholder="Uwagi do wydania" value={form.handover_notes} onChange={(e) => setForm({ ...form, handover_notes: e.target.value })}/>
          {isEquipment && <label className="sm:col-span-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={form.handover_kit_complete} onChange={(e) => setForm({ ...form, handover_kit_complete: e.target.checked })}/> Zestaw kompletny przy wydaniu</label>}
        </div>
        <PhotoStrip photos={handoverPhotos} onOpen={openPhoto}/>
        <label className="mt-3 block cursor-pointer rounded-xl px-3 py-2 text-center text-xs font-semibold" style={{ border: "1px dashed var(--line)" }}>+ Zdjęcia przy wydaniu<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple className="hidden" onChange={(e) => void uploadPhoto("handover", e.target.files)}/></label>
        <button disabled={busy} onClick={() => void savePhase("handover")} className="mt-2 w-full rounded-xl py-2.5 text-sm font-semibold text-black disabled:opacity-50" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>Zapisz wydanie</button>
      </section>

      <section className="rounded-xl p-3" style={{ border: "1px solid var(--line)" }}>
        <div className="flex items-center justify-between gap-2"><b>2. Zwrot</b><span className="text-xs" style={{ color: returned ? "var(--green)" : "var(--mut)" }}>{returned ? "✓ zapisany" : "do uzupełnienia"}</span></div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {isVehicle && <><input type="number" min="0" className={input} style={style} placeholder="Przebieg przy zwrocie" value={form.return_odometer} onChange={(e) => setForm({ ...form, return_odometer: e.target.value })}/><input type="number" min="0" max="100" className={input} style={style} placeholder="Paliwo / bateria %" value={form.return_fuel_percent} onChange={(e) => setForm({ ...form, return_fuel_percent: e.target.value })}/></>}
          <textarea rows={2} className={`${input} sm:col-span-2`} style={style} placeholder="Stan przy zwrocie" value={form.return_condition} onChange={(e) => setForm({ ...form, return_condition: e.target.value })}/>
          <textarea rows={2} className={`${input} sm:col-span-2`} style={style} placeholder="Uwagi do zwrotu" value={form.return_notes} onChange={(e) => setForm({ ...form, return_notes: e.target.value })}/>
          {isEquipment && <label className="sm:col-span-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={form.return_kit_complete} onChange={(e) => setForm({ ...form, return_kit_complete: e.target.checked })}/> Zestaw kompletny przy zwrocie</label>}
          <label className="sm:col-span-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={form.damage_found} onChange={(e) => setForm({ ...form, damage_found: e.target.checked })}/> Stwierdzono nowe uszkodzenie / brak</label>
          {form.damage_found && <textarea rows={2} className={`${input} sm:col-span-2`} style={style} placeholder="Opisz uszkodzenie lub brak" value={form.damage_note} onChange={(e) => setForm({ ...form, damage_note: e.target.value })}/>} 
        </div>
        <PhotoStrip photos={returnPhotos} onOpen={openPhoto}/>
        <label className="mt-3 block cursor-pointer rounded-xl px-3 py-2 text-center text-xs font-semibold" style={{ border: "1px dashed var(--line)" }}>+ Zdjęcia przy zwrocie<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple className="hidden" onChange={(e) => void uploadPhoto("return", e.target.files)}/></label>
        <button disabled={busy} onClick={() => void savePhase("return")} className="mt-2 w-full rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50" style={{ border: "1px solid var(--gold)", color: "var(--gold)" }}>Zapisz zwrot i zakończ najem</button>
      </section>

      {deposit > 0 && <section className="rounded-xl p-3" style={{ border: "1px solid rgba(200,150,90,.28)" }}>
        <b>3. Rozliczenie kaucji</b>
        <p className="mt-1 text-xs leading-5" style={{ color: "var(--mut)" }}>{returned ? "Protokół zwrotu jest zapisany. Możesz rozliczyć kaucję." : "Najpierw zapisz protokół zwrotu. Potrącenie kaucji bez protokołu jest zablokowane."}</p>
        <textarea rows={2} className={`${input} mt-3`} style={style} placeholder="Powód / notatka do rozliczenia" value={depositNote} onChange={(e) => setDepositNote(e.target.value)}/>
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]"><input type="number" min="0" max={deposit} step="0.01" className={input} style={style} placeholder="Kwota potrącenia" value={partialAmount} onChange={(e) => setPartialAmount(e.target.value)}/><button disabled={busy || !depositReady} onClick={() => void settleDeposit("partial")} className="rounded-xl px-3 py-2 text-xs font-semibold disabled:opacity-40" style={{ border: "1px solid rgba(245,158,11,.45)", color: "#f59e0b" }}>Potrąć część</button></div>
        <div className="mt-2 grid grid-cols-2 gap-2"><button disabled={busy || !depositReady} onClick={() => void settleDeposit("refund")} className="rounded-xl px-3 py-2 text-xs font-semibold disabled:opacity-40" style={{ border: "1px solid rgba(34,197,94,.35)", color: "var(--green)" }}>Zwróć całość</button><button disabled={busy || !depositReady} onClick={() => void settleDeposit("retain")} className="rounded-xl px-3 py-2 text-xs font-semibold disabled:opacity-40" style={{ border: "1px solid rgba(239,68,68,.35)", color: "#fca5a5" }}>Zatrzymaj całość</button></div>
        {Number(selected.deposit_retained_gross || 0) > 0 && <div className="mt-2 text-xs" style={{ color: "var(--mut)" }}>Zatrzymano: {pln(Number(selected.deposit_retained_gross || 0))}</div>}
      </section>}
    </div>}
  </div>;
}

function PhotoStrip({ photos, onOpen }: { photos: Photo[]; onOpen: (photo: Photo) => void }) {
  if (!photos.length) return <div className="mt-3 text-[11px]" style={{ color: "var(--mut)" }}>Brak zdjęć.</div>;
  return <div className="mt-3 flex flex-wrap gap-2">{photos.map((photo, i) => <button key={photo.id} type="button" onClick={() => onOpen(photo)} className="rounded-lg px-2.5 py-1.5 text-[11px]" style={{ border: "1px solid var(--line)" }}>📷 {i + 1}. {photo.file_name.slice(0, 18)}</button>)}</div>;
}
