import { useEffect, useState } from "react";
import { myBookingsV2, type BuyerBooking } from "../lib/buyerBookings";
import { supabase } from "../lib/supabase";
import { zl } from "../lib/money";
import { useSeo } from "../lib/seo";

const labels: Record<string, string> = {
  held: "Termin zablokowany", pending_payment: "Oczekuje na płatność",
  confirmed: "Potwierdzona", completed: "Zakończona", cancelled: "Anulowana", expired: "Wygasła",
};
const requestLabels: Record<string, string> = { pending: "Czeka na sprzedawcę", accepted: "Zaakceptowana", rejected: "Odrzucona", withdrawn: "Wycofana" };
const bookingLabel = (r: BuyerBooking) => r.status === "pending_payment" && r.paid_at
  ? "Opłacona — czeka na akceptację"
  : labels[r.status] ?? r.status;
const date = (iso: string, withTime: boolean) => new Date(iso).toLocaleString("pl-PL", withTime
  ? { weekday: "short", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }
  : { day: "numeric", month: "long", year: "numeric" });
const localInput = (iso: string) => {
  const d = new Date(iso); const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

type ChangeRequest = { id:string; booking_id:string; request_type:"cancel"|"reschedule"; requested_starts_at:string|null; message:string|null; status:string; seller_note:string|null; created_at:string; handled_at:string|null };

export default function Rezerwacje() {
  useSeo("Moje rezerwacje", "Opłacone usługi i wynajem w Sunrise Market.", "/rezerwacje");
  const [rows, setRows] = useState<BuyerBooking[]>([]);
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [requestType, setRequestType] = useState<"reschedule"|"cancel">("reschedule");
  const [requestedAt, setRequestedAt] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const params = new URLSearchParams(window.location.search);
  const paid = params.get("paid") === "success" || params.get("card") === "success";
  const cancelled = params.get("card") === "cancel";

  async function load() {
    const [bookings, changeRequests] = await Promise.all([
      myBookingsV2(),
      supabase.schema("market").rpc("buyer_booking_change_requests"),
    ]);
    setRows(bookings);
    if (!changeRequests.error) setRequests((changeRequests.data || []) as ChangeRequest[]);
  }

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setAuthed(false); setLoading(false); return; }
      try { await load(); } finally { setLoading(false); }
    });
  }, []);

  function openRequest(r:BuyerBooking, existing?:ChangeRequest) {
    setEditing(r.id);
    setRequestType(existing?.request_type || "reschedule");
    setRequestedAt(existing?.requested_starts_at ? localInput(existing.requested_starts_at) : localInput(r.starts_at));
    setMessage(existing?.message || "");
    setNotice("");
  }

  async function submitRequest(r:BuyerBooking) {
    if (requestType === "reschedule" && !requestedAt) { setNotice("Wybierz proponowany nowy termin."); return; }
    setBusy(true); setNotice("");
    const { error } = await supabase.schema("market").rpc("buyer_booking_change_request_submit", {
      p_booking: r.id,
      p_type: requestType,
      p_requested_starts_at: requestType === "reschedule" ? new Date(requestedAt).toISOString() : null,
      p_message: message || null,
    });
    if (error) setNotice(error.message);
    else { setNotice("Prośba wysłana. Sprzedawca zobaczy ją w panelu rezerwacji."); setEditing(null); await load(); }
    setBusy(false);
  }

  async function withdrawRequest(id:string) {
    setBusy(true); setNotice("");
    const { error } = await supabase.schema("market").rpc("buyer_booking_change_request_withdraw", { p_request: id });
    if (error) setNotice(error.message);
    else { setNotice("Prośba została wycofana."); await load(); }
    setBusy(false);
  }

  return <main className="min-h-screen px-4 py-8" style={{ background: "var(--bg)", color: "var(--ink)" }}>
    <div className="mx-auto max-w-4xl">
      <div className="mb-7 flex items-center justify-between gap-3"><div><a href="/konto" className="text-sm" style={{ color: "var(--mut)" }}>← Moje konto</a><h1 className="mt-2 font-display text-3xl font-semibold">Moje rezerwacje</h1></div><a href="/" className="rounded-xl px-4 py-2 text-sm" style={{ border: "1px solid var(--line)" }}>Sklep</a></div>
      {paid && <p className="mb-5 rounded-2xl p-4" style={{ background: "rgba(34,197,94,.12)", border: "1px solid rgba(34,197,94,.35)", color: "var(--green)" }}>Płatność przyjęta. Jeśli oferta ma automatyczne potwierdzanie, rezerwacja zostanie potwierdzona od razu. W przeciwnym razie termin pozostaje zablokowany i czeka na akceptację sprzedawcy.</p>}
      {cancelled && <p className="mb-5 rounded-2xl p-4" style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.3)" }}>Płatność przerwana. Termin pozostaje zablokowany tylko do końca czasu płatności.</p>}
      {notice && <p className="mb-5 rounded-2xl p-4 text-sm" style={{ background: "rgba(200,150,90,.10)", border: "1px solid rgba(200,150,90,.25)", color: "var(--gold)" }}>{notice}</p>}
      {!authed && <p>Zaloguj się, aby zobaczyć rezerwacje. <a className="underline" href={`/login?next=${encodeURIComponent("/rezerwacje")}`}>Logowanie</a></p>}
      {loading && <p style={{ color: "var(--mut)" }}>Ładowanie rezerwacji…</p>}
      {!loading && authed && rows.length === 0 && <div className="rounded-2xl p-6" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}><p className="font-semibold">Nie masz jeszcze rezerwacji.</p><p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>W ofertach z bookingiem wybierzesz usługę lub okres wynajmu i zapłacisz od razu.</p></div>}
      <div className="grid gap-3">{rows.map((r) => {
        const request = requests.find((x) => x.booking_id === r.id && x.status === "pending") || requests.find((x) => x.booking_id === r.id);
        const canRequest = r.status === "confirmed" && new Date(r.starts_at).getTime() > Date.now();
        return <article key={r.id} className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><a href={`/produkt/${r.offer_id}`} className="font-semibold hover:underline">{r.title}</a><p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>{r.booking_type === "appointment" ? date(r.starts_at, true) : `${date(r.starts_at, false)} – ${date(r.ends_at, false)} · ${r.units} dni`}</p></div><span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: r.status === "confirmed" ? "rgba(34,197,94,.14)" : r.status === "pending_payment" && r.paid_at ? "rgba(200,150,90,.14)" : "var(--header)", border: "1px solid var(--line)" }}>{bookingLabel(r)}</span></div>
          {r.status === "pending_payment" && r.paid_at && <p className="mt-3 rounded-xl px-3 py-2 text-xs" style={{ background: "rgba(200,150,90,.08)", border: "1px solid rgba(200,150,90,.2)", color: "var(--mut)" }}>Płatność jest zaksięgowana, a termin nadal zarezerwowany dla Ciebie. Sprzedawca musi tylko zaakceptować rezerwację.</p>}
          <div className="mt-4 flex items-center justify-between text-sm"><span style={{ color: "var(--mut)" }}>{r.payment_provider === "stripe" ? "Karta / BLIK / P24" : r.payment_provider === "sunrise_pay" ? "Sunrise Pay" : ""}</span><strong>{zl(Number(r.amount_gross))}</strong></div>
          {Number(r.deposit_gross) > 0 && <div className="mt-2 text-xs" style={{ color: "var(--mut)" }}>Kaucja zabezpieczająca: {zl(Number(r.deposit_gross))} · rozliczana osobno, poza ceną rezerwacji.</div>}

          {request && <div className="mt-4 rounded-2xl p-4 text-sm" style={{ background:"var(--header)", border:"1px solid var(--line)" }}>
            <div className="flex flex-wrap items-center justify-between gap-2"><b>{request.request_type === "cancel" ? "Prośba o anulowanie" : "Prośba o zmianę terminu"}</b><span className="rounded-full px-2.5 py-1 text-xs" style={{ border:"1px solid var(--line)", color: request.status === "accepted" ? "var(--green)" : request.status === "rejected" ? "#fca5a5" : "var(--gold)" }}>{requestLabels[request.status] || request.status}</span></div>
            {request.requested_starts_at && <div className="mt-2" style={{ color:"var(--mut)" }}>Proponowany termin: {date(request.requested_starts_at, true)}</div>}
            {request.message && <div className="mt-1" style={{ color:"var(--mut)" }}>Wiadomość: {request.message}</div>}
            {request.seller_note && <div className="mt-2">Odpowiedź sprzedawcy: {request.seller_note}</div>}
            {request.status === "pending" && <div className="mt-3 flex flex-wrap gap-2"><button disabled={busy} onClick={() => openRequest(r, request)} className="rounded-xl px-3 py-2 text-xs font-semibold" style={{ border:"1px solid var(--line)" }}>Edytuj prośbę</button><button disabled={busy} onClick={() => withdrawRequest(request.id)} className="rounded-xl px-3 py-2 text-xs" style={{ border:"1px solid rgba(239,68,68,.3)" }}>Wycofaj</button></div>}
          </div>}

          {canRequest && (!request || request.status !== "pending") && <button onClick={() => openRequest(r)} className="mt-4 rounded-xl px-3 py-2 text-sm font-semibold" style={{ border:"1px solid var(--gold)", color:"var(--gold)" }}>Poproś o zmianę / anulowanie</button>}

          {editing === r.id && <div className="mt-4 rounded-2xl p-4" style={{ background:"rgba(200,150,90,.07)", border:"1px solid rgba(200,150,90,.24)" }}>
            <div className="font-semibold">Prośba do sprzedawcy</div>
            <div className="mt-3 grid grid-cols-2 gap-2"><button onClick={() => setRequestType("reschedule")} className="rounded-xl py-2 text-sm font-semibold" style={{ border: requestType === "reschedule" ? "1px solid var(--gold)" : "1px solid var(--line)", color: requestType === "reschedule" ? "var(--gold)" : "var(--ink)" }}>Zmień termin</button><button onClick={() => setRequestType("cancel")} className="rounded-xl py-2 text-sm font-semibold" style={{ border: requestType === "cancel" ? "1px solid var(--gold)" : "1px solid var(--line)", color: requestType === "cancel" ? "var(--gold)" : "var(--ink)" }}>Anuluj rezerwację</button></div>
            {requestType === "reschedule" && <label className="mt-3 block text-sm"><span className="mb-1 block" style={{ color:"var(--mut)" }}>Proponowany nowy termin</span><input type="datetime-local" value={requestedAt} onChange={(e)=>setRequestedAt(e.target.value)} min={localInput(new Date(Date.now()+60000).toISOString())} className="w-full rounded-xl px-3 py-2.5" style={{ background:"var(--bg)", border:"1px solid var(--line)" }}/></label>}
            <label className="mt-3 block text-sm"><span className="mb-1 block" style={{ color:"var(--mut)" }}>Wiadomość do sprzedawcy (opcjonalnie)</span><textarea value={message} onChange={(e)=>setMessage(e.target.value.slice(0,1000))} rows={3} className="w-full rounded-xl px-3 py-2.5" style={{ background:"var(--bg)", border:"1px solid var(--line)" }} placeholder="Np. proszę o późniejszą godzinę…"/></label>
            <div className="mt-3 grid gap-2 sm:grid-cols-2"><button disabled={busy || (requestType === "reschedule" && !requestedAt)} onClick={() => submitRequest(r)} className="rounded-xl py-2.5 font-semibold text-black disabled:opacity-50" style={{ background:"linear-gradient(135deg,#C8965A,#E8C896)" }}>{busy ? "Wysyłam…" : "Wyślij prośbę"}</button><button disabled={busy} onClick={() => setEditing(null)} className="rounded-xl py-2.5 text-sm font-semibold" style={{ border:"1px solid var(--line)" }}>Zamknij</button></div>
          </div>}
        </article>;
      })}</div>
    </div>
  </main>;
}