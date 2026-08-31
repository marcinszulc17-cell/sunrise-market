import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import SellerBookingCalendar from "../components/SellerBookingCalendar";
import BookingChangeHistory from "../components/BookingChangeHistory";
import SellerBookingOpsSidebar from "../components/SellerBookingOpsSidebar";

const statusLabel: Record<string, string> = {
  held: "Termin zablokowany",
  pending_payment: "Oczekuje na płatność",
  confirmed: "Potwierdzona",
  completed: "Zakończona",
  cancelled: "Anulowana",
  expired: "Wygasła",
};

type Booking = {
  id: string;
  offer_id: string;
  title: string;
  buyer_name: string | null;
  buyer_email: string | null;
  booking_type: string;
  starts_at: string;
  ends_at: string;
  units: number;
  amount_gross: number;
  status: string;
  payment_provider: string | null;
  paid_at: string | null;
  service_id?: string | null;
  resource_id?: string | null;
  resource_name?: string | null;
  resource_kind?: string | null;
};
type Block = { id: string; offer_id: string; title: string; starts_at: string; ends_at: string; reason: string | null };
type Offer = { offer_id: string; title: string; status: string };
type Resource = { id: string; name: string; kind: string; description: string | null; active: boolean };
type EligibleResource = { id: string; name: string; kind: string; description: string | null };
type ReschedulePricePreview = {
  booking_id: string;
  price_locked: boolean;
  paid: boolean;
  locked_base_amount_gross: number;
  locked_fees_gross: number;
  locked_deposit_gross: number;
  locked_amount_gross: number;
  reference_base_amount_gross: number;
  reference_fees_gross: number;
  reference_deposit_gross: number;
  reference_amount_gross: number;
  difference_gross: number;
  policy: string;
};

const pln = (v: number) => Number(v || 0).toLocaleString("pl-PL", { style: "currency", currency: "PLN" });
const dt = (iso: string, time = true) => new Date(iso).toLocaleString("pl-PL", time ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" });
const localInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const localDate = (d: Date) => localInput(d).slice(0, 10);
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const resourceKindLabel: Record<string, string> = {
  staff: "Pracownik",
  vehicle: "Pojazd",
  property: "Nieruchomość",
  room: "Pomieszczenie",
  equipment: "Sprzęt",
  other: "Zasób",
};

export default function SellerBookingsManage() {
  const [rows, setRows] = useState<Booking[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [filter, setFilter] = useState("active");
  const [offerId, setOfferId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [rescheduleValue, setRescheduleValue] = useState("");
  const [moveResourceId, setMoveResourceId] = useState("");
  const [rescheduleBusy, setRescheduleBusy] = useState(false);
  const [eligibleResources, setEligibleResources] = useState<EligibleResource[]>([]);
  const [eligibleResourcesLoading, setEligibleResourcesLoading] = useState(false);
  const [pricePreview, setPricePreview] = useState<ReschedulePricePreview | null>(null);
  const [pricePreviewLoading, setPricePreviewLoading] = useState(false);
  const [pricePreviewError, setPricePreviewError] = useState("");

  async function load() {
    setLoading(true);
    const [b, bl, o, rs] = await Promise.all([
      supabase.rpc("seller_booking_dashboard_v2"),
      supabase.rpc("seller_booking_blocks"),
      supabase.rpc("my_offers"),
      supabase.rpc("seller_booking_resources_dashboard"),
    ]);
    if (b.error) setMsg(b.error.message); else setRows((b.data || []) as Booking[]);
    if (!bl.error) setBlocks((bl.data || []) as Block[]);
    if (!o.error) setOffers((o.data || []) as Offer[]);
    if (!rs.error) setResources((rs.data || []) as Resource[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const visible = useMemo(
    () => rows.filter((r) => filter === "all" ? true : filter === "active" ? ["held", "pending_payment", "confirmed"].includes(r.status) : r.status === filter),
    [rows, filter],
  );
  const activeBlocks = useMemo(
    () => blocks.filter((block) => new Date(block.ends_at).getTime() >= Date.now()),
    [blocks],
  );
  const stats = useMemo(() => ({
    active: rows.filter((r) => ["held", "pending_payment", "confirmed"].includes(r.status)).length,
    confirmed: rows.filter((r) => r.status === "confirmed").length,
    paid: rows.filter((r) => !!r.paid_at).reduce((a, r) => a + Number(r.amount_gross || 0), 0),
  }), [rows]);

  async function setStatus(id: string, status: "confirmed" | "cancelled" | "completed") {
    setBusy(true); setMsg("");
    const { error } = await supabase.rpc("seller_booking_set_status", { p_booking: id, p_status: status });
    if (error) setMsg(error.message);
    else { setMsg("Status rezerwacji zaktualizowany. Powiadomienie e-mail zostało dodane do wysyłki."); await load(); }
    setBusy(false);
  }

  function previewStartIso(r: Booking, value: string) {
    if (!value) return null;
    const date = r.booking_type === "daily" ? new Date(`${value}T12:00:00`) : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
  }

  async function loadPricePreview(r: Booking, value: string) {
    const startsAt = previewStartIso(r, value);
    if (!startsAt) { setPricePreview(null); setPricePreviewError(""); return; }
    setPricePreviewLoading(true);
    setPricePreviewError("");
    const { data, error } = await supabase.rpc("seller_booking_reschedule_price_preview", {
      p_booking: r.id,
      p_starts_at: startsAt,
    });
    if (error) {
      setPricePreview(null);
      setPricePreviewError(error.message);
    } else {
      setPricePreview(((data || []) as ReschedulePricePreview[])[0] || null);
    }
    setPricePreviewLoading(false);
  }

  async function openReschedule(r: Booking) {
    const initialValue = r.booking_type === "daily" ? localDate(new Date(r.starts_at)) : localInput(new Date(r.starts_at));
    setRescheduleId(r.id);
    setRescheduleValue(initialValue);
    setMoveResourceId("");
    setEligibleResources([]);
    setPricePreview(null);
    setPricePreviewError("");
    setMsg("");
    void loadPricePreview(r, initialValue);
    if (r.booking_type !== "appointment") return;

    setEligibleResourcesLoading(true);
    const { data, error } = await supabase.rpc("seller_booking_eligible_resources", { p_booking: r.id });
    if (error) {
      setMsg("Nie udało się pobrać zasobów dla tej rezerwacji: " + error.message);
    } else {
      const eligible = (data || []) as EligibleResource[];
      setEligibleResources(eligible);
      if (r.resource_id && eligible.some((resource) => resource.id === r.resource_id)) setMoveResourceId(r.resource_id);
    }
    setEligibleResourcesLoading(false);
  }

  function closeReschedule() {
    setRescheduleId(null);
    setRescheduleValue("");
    setMoveResourceId("");
    setEligibleResources([]);
    setPricePreview(null);
    setPricePreviewError("");
  }

  async function runReschedule(r: Booking, startValue: string) {
    setRescheduleBusy(true); setMsg("");
    try {
      const { error } = await supabase.rpc("seller_booking_reschedule", { p_booking: r.id, p_starts_at: startValue });
      if (error) throw error;
      closeReschedule();
      setMsg("Termin zmieniony ✅ System sprawdził kolizje, a klient otrzyma powiadomienie w aplikacji/push i e-mail.");
      await load();
      return true;
    } catch (e) {
      setMsg("Nie udało się zmienić terminu: " + (e as Error).message);
      return false;
    } finally { setRescheduleBusy(false); }
  }

  async function moveToResource(bookingId: string, targetTime: Date, resourceId: string) {
    const r = rows.find((x) => x.id === bookingId);
    if (!r || r.status !== "confirmed") { setMsg("Przenosić można tylko potwierdzone rezerwacje."); return false; }
    if (r.booking_type !== "appointment") { setMsg("Między zasobami można przenosić tylko wizyty godzinowe."); return false; }
    setRescheduleBusy(true); setMsg("");
    try {
      const { error } = await supabase.rpc("seller_booking_move", {
        p_booking: r.id,
        p_starts_at: new Date(targetTime).toISOString(),
        p_resource: resourceId,
      });
      if (error) throw error;
      const target = eligibleResources.find((x) => x.id === resourceId) || resources.find((x) => x.id === resourceId);
      closeReschedule();
      setMsg(`Wizyta przeniesiona ✅ ${target ? `Nowy zasób: ${target.name}. ` : ""}System sprawdził usługę, grafik, dostępność i kolizje. Klient otrzyma powiadomienie także e-mailem.`);
      await load();
      return true;
    } catch (e) {
      setMsg("Nie udało się przenieść wizyty: " + (e as Error).message);
      return false;
    } finally { setRescheduleBusy(false); }
  }

  async function reschedule(r: Booking) {
    if (!rescheduleValue) { setMsg("Wybierz nowy termin rezerwacji."); return; }
    if (r.booking_type === "appointment" && moveResourceId) {
      await moveToResource(r.id, new Date(rescheduleValue), moveResourceId);
      return;
    }
    const startValue = r.booking_type === "daily"
      ? new Date(`${rescheduleValue}T12:00:00`).toISOString()
      : new Date(rescheduleValue).toISOString();
    await runReschedule(r, startValue);
  }

  async function rescheduleFromCalendar(bookingId: string, targetDay: Date) {
    const r = rows.find((x) => x.id === bookingId);
    if (!r || r.status !== "confirmed") { setMsg("Przeciągać można tylko potwierdzone rezerwacje."); return false; }
    const current = new Date(r.starts_at), target = new Date(targetDay);
    if (r.booking_type === "daily") return runReschedule(r, new Date(target.getFullYear(), target.getMonth(), target.getDate(), 12).toISOString());
    target.setHours(current.getHours(), current.getMinutes(), current.getSeconds(), 0);
    return runReschedule(r, target.toISOString());
  }

  async function rescheduleAtExactTime(bookingId: string, targetTime: Date) {
    const r = rows.find((x) => x.id === bookingId);
    if (!r || r.status !== "confirmed") { setMsg("Przeciągać można tylko potwierdzone rezerwacje."); return false; }
    if (r.booking_type !== "appointment") { setMsg("Na osi godzin można przesuwać tylko wizyty i usługi godzinowe."); return false; }
    return runReschedule(r, new Date(targetTime).toISOString());
  }

  async function addBlock() {
    if (!offerId || !start || !end) { setMsg("Wybierz ofertę i zakres blokady."); return; }
    const from = new Date(start), to = new Date(end);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to.getTime() <= from.getTime()) {
      setMsg("Koniec blokady musi być później niż jej początek.");
      return;
    }
    setBusy(true); setMsg("");
    const { error } = await supabase.rpc("seller_booking_block_add", {
      p_offer: offerId,
      p_starts_at: from.toISOString(),
      p_ends_at: to.toISOString(),
      p_reason: reason || null,
    });
    if (error) setMsg(error.message);
    else { setStart(""); setEnd(""); setReason(""); setMsg("Termin został zablokowany i nie będzie dostępny dla klientów."); await load(); }
    setBusy(false);
  }

  async function deleteBlock(id: string) {
    setBusy(true); setMsg("");
    const { error } = await supabase.rpc("seller_booking_block_delete", { p_block: id });
    if (error) setMsg(error.message); else { setMsg("Blokada usunięta. Termin znów może być dostępny dla klientów."); await load(); }
    setBusy(false);
  }

  function pickCalendarDate(from: Date, to: Date) {
    setStart(localInput(from)); setEnd(localInput(to));
    document.getElementById("block-editor")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return <main className="min-h-screen px-4 py-8 sm:px-6" style={{ background: "var(--bg)", color: "var(--ink)" }}>
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/sprzedawca" className="text-sm underline" style={{ color: "var(--mut)" }}>← Centrum sprzedawcy</Link>
          <h1 className="mt-2 font-display text-3xl font-semibold">Rezerwacje i kalendarz</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Jeden kalendarz dla usług, samochodów, nieruchomości, produktów, sprzętu i pracowników.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/sprzedawca/rezerwacje/grafiki" className="rounded-xl px-4 py-2 text-sm font-semibold" style={{ border: "1px solid var(--gold)", color: "var(--gold)" }}>🗓 Grafiki zasobów</Link>
          <Link to="/sprzedawca/oferty" className="rounded-xl px-4 py-2 text-sm font-semibold" style={{ border: "1px solid var(--line)" }}>Zarządzaj ofertami</Link>
        </div>
      </div>

      {msg && <div className="mb-5 rounded-2xl p-4 text-sm" style={{ background: "rgba(200,150,90,.12)", border: "1px solid rgba(200,150,90,.25)" }}>{msg}</div>}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Aktywne rezerwacje" value={String(stats.active)} />
        <Stat label="Potwierdzone" value={String(stats.confirmed)} />
        <Stat label="Blokady terminów" value={String(activeBlocks.length)} />
        <Stat label="Aktywne zasoby" value={String(resources.length)} />
        <Stat label="Wartość opłaconych" value={pln(stats.paid)} />
      </div>

      <SellerBookingCalendar
        bookings={rows}
        blocks={blocks}
        resources={resources}
        onPickDate={pickCalendarDate}
        onRescheduleDrop={rescheduleFromCalendar}
        onRescheduleTimeDrop={rescheduleAtExactTime}
        onResourceTimeDrop={moveToResource}
        rescheduleBusy={rescheduleBusy}
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Lista rezerwacji</h2>
              <p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Na komputerze możesz przeciągać wizyty. Na telefonie użyj „Przenieś” i wybierz zasób oraz termin.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {[['active','Aktywne'],['confirmed','Potwierdzone'],['pending_payment','Do opłacenia'],['completed','Zakończone'],['cancelled','Anulowane'],['all','Wszystkie']].map(([k, l]) =>
                <button key={k} onClick={() => setFilter(k)} className="rounded-full px-3 py-1.5 text-sm" style={{ background: filter === k ? "rgba(200,150,90,.18)" : "var(--glass)", border: "1px solid var(--line)", color: filter === k ? "var(--gold)" : "var(--ink)" }}>{l}</button>
              )}
            </div>
          </div>

          {loading && <p style={{ color: "var(--mut)" }}>Ładowanie…</p>}
          {!loading && visible.length === 0 && <div className="rounded-2xl p-6" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>Brak rezerwacji w tym widoku.</div>}

          <div className="space-y-3">
            {visible.map((r) => {
              const durationMinutes = Math.max(1, Math.round((new Date(r.ends_at).getTime() - new Date(r.starts_at).getTime()) / 60000));
              const previewEnd = r.booking_type === "daily" && rescheduleId === r.id && rescheduleValue ? addDays(new Date(`${rescheduleValue}T12:00:00`), r.units) : null;
              const priceDifference = Number(pricePreview?.difference_gross || 0);
              return <article id={`booking-${r.id}`} key={r.id} className="scroll-mt-24 rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <Link to={`/produkt/${r.offer_id}`} className="font-semibold hover:underline">{r.title}</Link>
                    <div className="mt-1 text-sm" style={{ color: "var(--mut)" }}>{r.booking_type === "daily" ? `${dt(r.starts_at, false)} – ${dt(r.ends_at, false)} · ${r.units} dni` : dt(r.starts_at, true)}</div>
                    {r.resource_name && (r.resource_id ? <Link to={`/sprzedawca/rezerwacje/grafiki?resource=${encodeURIComponent(r.resource_id)}`} className="mt-1 inline-block text-xs hover:underline" style={{ color: "var(--gold)" }}>{resourceKindLabel[r.resource_kind || ""] || "Zasób"}: {r.resource_name} · otwórz grafik</Link> : <div className="mt-1 text-xs" style={{ color: "var(--gold)" }}>{resourceKindLabel[r.resource_kind || ""] || "Zasób"}: {r.resource_name}</div>)}
                  </div>
                  <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: r.status === "confirmed" ? "rgba(34,197,94,.12)" : "var(--header)", border: "1px solid var(--line)" }}>{statusLabel[r.status] || r.status}</span>
                </div>

                <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
                  <div><span style={{ color: "var(--mut)" }}>Klient</span><div>{r.buyer_name || r.buyer_email || "—"}</div></div>
                  <div><span style={{ color: "var(--mut)" }}>Płatność</span><div>{r.paid_at ? `Opłacono · ${r.payment_provider || ""}` : "Nieopłacona"}</div></div>
                  <div><span style={{ color: "var(--mut)" }}>Kwota</span><div className="font-semibold">{pln(r.amount_gross)}</div></div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link to={`/sprzedawca/rezerwacje/ustawienia/${r.offer_id}`} className="rounded-xl px-3 py-2 text-sm font-semibold" style={{ border: "1px solid var(--line)" }}>⚙ Ustawienia bookingu</Link>
                  {r.status === "confirmed" && <button disabled={busy || rescheduleBusy} onClick={() => openReschedule(r)} className="rounded-xl px-3 py-2 text-sm font-semibold" style={{ border: "1px solid var(--gold)", color: "var(--gold)" }}>↔ Przenieś / zmień termin</button>}
                  {r.status === "confirmed" && <button disabled={busy || rescheduleBusy} onClick={() => setStatus(r.id, "completed")} className="rounded-xl px-3 py-2 text-sm font-semibold" style={{ border: "1px solid var(--line)" }}>✓ Zakończ</button>}
                  {["held", "pending_payment"].includes(r.status) && r.paid_at && <button disabled={busy || rescheduleBusy} onClick={() => setStatus(r.id, "confirmed")} className="rounded-xl px-3 py-2 text-sm font-semibold text-black" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>Potwierdź</button>}
                  {["held", "pending_payment", "confirmed"].includes(r.status) && <button disabled={busy || rescheduleBusy} onClick={() => setStatus(r.id, "cancelled")} className="rounded-xl px-3 py-2 text-sm" style={{ border: "1px solid rgba(239,68,68,.35)" }}>Anuluj</button>}
                  {r.buyer_email && <a href={`mailto:${r.buyer_email}`} className="rounded-xl px-3 py-2 text-sm" style={{ border: "1px solid var(--line)" }}>✉️ Napisz do klienta</a>}
                  <BookingChangeHistory bookingId={r.id} />
                </div>

                {r.status === "confirmed" && rescheduleId === r.id && <div className="mt-4 rounded-2xl p-4" style={{ background: "rgba(200,150,90,.07)", border: "1px solid rgba(200,150,90,.25)" }}>
                  <div className="font-semibold">Przenieś rezerwację</div>
                  <div className="mt-1 text-xs" style={{ color: "var(--mut)" }}>{r.booking_type === "daily" ? `Okres: ${r.units} dni.` : `Czas: ${durationMinutes} min.`} Cena rezerwacji {pln(r.amount_gross)} jest zablokowana od momentu zakupu.</div>

                  {r.booking_type === "appointment" && <div className="mt-3">
                    <div className="mb-1.5 text-sm" style={{ color: "var(--mut)" }}>Pracownik / zasób</div>
                    {eligibleResourcesLoading ? <div className="rounded-xl px-3 py-2.5 text-sm" style={{ border: "1px solid var(--line)", color: "var(--mut)" }}>Sprawdzam zasoby dla tej usługi…</div> : eligibleResources.length > 0 ? <select value={moveResourceId} onChange={(e) => setMoveResourceId(e.target.value)} className="w-full rounded-xl px-3 py-2.5" style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--ink)" }}>
                      <option value="">Bez zmiany zasobu</option>
                      {eligibleResources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name} · {resourceKindLabel[resource.kind] || resource.kind}</option>)}
                    </select> : <div className="rounded-xl px-3 py-2.5 text-sm" style={{ border: "1px solid rgba(239,68,68,.25)", color: "var(--mut)" }}>Brak aktywnych zasobów przypisanych do tej oferty/usługi. Możesz zmienić tylko termin bez zmiany zasobu.</div>}
                  </div>}

                  <label className="mt-3 block text-sm">
                    <span className="mb-1.5 block" style={{ color: "var(--mut)" }}>{r.booking_type === "daily" ? "Nowa data rozpoczęcia" : "Nowa data i godzina"}</span>
                    <input type={r.booking_type === "daily" ? "date" : "datetime-local"} value={rescheduleValue} onChange={(e) => { const value = e.target.value; setRescheduleValue(value); void loadPricePreview(r, value); }} className="w-full rounded-xl px-3 py-2.5" style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--ink)" }} />
                  </label>

                  {previewEnd && <div className="mt-2 text-xs" style={{ color: "var(--mut)" }}>Nowy okres do {previewEnd.toLocaleDateString("pl-PL")}</div>}
                  {r.booking_type === "appointment" && <div className="mt-2 text-xs" style={{ color: "var(--mut)" }}>Lista pokazuje tylko zasoby przypisane do tej oferty i — jeśli usługa ma własne przypisania — tylko zasoby, które ją wykonują. System przed zapisem dodatkowo sprawdzi grafik, przerwy, nieobecności i kolizje.</div>}

                  <div className="mt-3 rounded-2xl p-4" style={{ background: "var(--header)", border: "1px solid var(--line)" }}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-semibold">🔒 Cena rezerwacji pozostaje zablokowana</div>
                      <div className="font-semibold" style={{ color: "var(--gold)" }}>{pln(r.amount_gross)}</div>
                    </div>
                    {pricePreviewLoading && <div className="mt-2 text-xs" style={{ color: "var(--mut)" }}>Sprawdzam aktualną cenę nowego terminu…</div>}
                    {!pricePreviewLoading && pricePreview && <div className="mt-3 space-y-2 text-sm">
                      <div className="flex justify-between gap-3"><span style={{ color: "var(--mut)" }}>Aktualna cena wg cennika dla nowego terminu</span><b>{pln(pricePreview.reference_amount_gross)}</b></div>
                      <div className="flex justify-between gap-3"><span style={{ color: "var(--mut)" }}>Różnica informacyjna</span><b style={{ color: priceDifference > 0 ? "#f59e0b" : priceDifference < 0 ? "var(--green)" : "var(--mut)" }}>{priceDifference > 0 ? "+" : ""}{pln(priceDifference)}</b></div>
                      {r.booking_type === "daily" && Number(pricePreview.reference_deposit_gross || 0) !== Number(pricePreview.locked_deposit_gross || 0) && <div className="flex justify-between gap-3 text-xs"><span style={{ color: "var(--mut)" }}>Kaucja: w rezerwacji {pln(pricePreview.locked_deposit_gross)}, obecnie wg ustawień {pln(pricePreview.reference_deposit_gross)}</span><span>bez zmiany</span></div>}
                      <div className="rounded-xl px-3 py-2.5 text-xs leading-5" style={{ background: "rgba(122,184,154,.08)", border: "1px solid rgba(122,184,154,.20)", color: "var(--mut)" }}>
                        {pricePreview.paid ? "Rezerwacja jest opłacona. Zmiana terminu nie pobierze dopłaty i nie wykona zwrotu automatycznie — klient zachowuje warunki finansowe z momentu zakupu." : "Ta rezerwacja zachowuje warunki finansowe z momentu utworzenia. Aktualny cennik jest pokazany wyłącznie informacyjnie."}
                      </div>
                    </div>}
                    {!pricePreviewLoading && pricePreviewError && <div className="mt-2 text-xs" style={{ color: "#fca5a5" }}>Nie udało się pobrać ceny referencyjnej: {pricePreviewError}. Nadal możesz zmienić termin — cena rezerwacji pozostanie bez zmian.</div>}
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <button disabled={rescheduleBusy || eligibleResourcesLoading || !rescheduleValue} onClick={() => reschedule(r)} className="rounded-xl py-2.5 font-semibold text-black disabled:opacity-50" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>{rescheduleBusy ? "Sprawdzam termin…" : "Sprawdź i przenieś"}</button>
                    <button disabled={rescheduleBusy} onClick={closeReschedule} className="rounded-xl py-2.5 text-sm font-semibold" style={{ border: "1px solid var(--line)" }}>Anuluj zmianę</button>
                  </div>
                </div>}
              </article>;
            })}
          </div>
        </section>

        <SellerBookingOpsSidebar
          blocks={blocks}
          offers={offers}
          resources={resources}
          offerId={offerId}
          start={start}
          end={end}
          reason={reason}
          busy={busy}
          onOfferIdChange={setOfferId}
          onStartChange={setStart}
          onEndChange={setEnd}
          onReasonChange={setReason}
          onAddBlock={addBlock}
          onDeleteBlock={deleteBlock}
        />
      </div>
    </div>
  </main>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}><div className="text-sm" style={{ color: "var(--mut)" }}>{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div></div>;
}
