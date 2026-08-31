import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { zl } from "../lib/money";

type ChangeRequest = {
  id: string;
  booking_id: string;
  request_type: "cancel" | "reschedule";
  requested_starts_at: string | null;
  message: string | null;
  status: string;
  created_at: string;
  title: string;
  buyer_name: string | null;
  buyer_email: string | null;
  booking_type: string;
  starts_at: string;
  ends_at: string;
  amount_gross: number;
};

type Props = {
  onChanged?: () => Promise<void> | void;
  onMessage?: (message: string) => void;
};

const dt = (iso: string, withTime = true) => new Date(iso).toLocaleString("pl-PL", withTime
  ? { dateStyle: "medium", timeStyle: "short" }
  : { dateStyle: "medium" });

export default function SellerBookingChangeRequests({ onChanged, onMessage }: Props = {}) {
  const [rows, setRows] = useState<ChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [notice, setNotice] = useState("");

  function emit(message: string) {
    setNotice(message);
    onMessage?.(message);
  }

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.schema("market").rpc("seller_booking_change_requests");
    if (error) emit("Nie udało się pobrać próśb klientów: " + error.message);
    else setRows((data || []) as ChangeRequest[]);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function refreshAfter(message: string) {
    await load();
    if (onChanged) await onChanged();
    emit(message);
    if (!onChanged) window.setTimeout(() => window.location.reload(), 350);
  }

  async function accept(request: ChangeRequest) {
    if (request.request_type === "reschedule" && !request.requested_starts_at) {
      emit("Klient nie podał nowego terminu.");
      return;
    }
    if (request.request_type === "cancel" && !window.confirm("Zaakceptować prośbę klienta i anulować tę rezerwację?")) return;

    setBusyId(request.id);
    emit("");
    const response = request.request_type === "reschedule"
      ? await supabase.rpc("seller_booking_reschedule", { p_booking: request.booking_id, p_starts_at: request.requested_starts_at })
      : await supabase.rpc("seller_booking_set_status", { p_booking: request.booking_id, p_status: "cancelled" });

    if (response.error) {
      emit("Nie udało się zaakceptować prośby: " + response.error.message);
    } else {
      await refreshAfter(request.request_type === "reschedule"
        ? "Prośba zaakceptowana ✅ Termin został zmieniony, a klient otrzyma powiadomienie."
        : "Prośba zaakceptowana ✅ Rezerwacja została anulowana, a klient otrzyma powiadomienie.");
    }
    setBusyId(null);
  }

  async function reject(request: ChangeRequest) {
    setBusyId(request.id);
    emit("");
    const { error } = await supabase.schema("market").rpc("seller_booking_change_request_reject", {
      p_request: request.id,
      p_note: rejectNote.trim() || null,
    });
    if (error) {
      emit("Nie udało się odrzucić prośby: " + error.message);
    } else {
      setRejectId(null);
      setRejectNote("");
      await refreshAfter("Prośba została odrzucona. Klient otrzyma powiadomienie w aplikacji.");
    }
    setBusyId(null);
  }

  if (!loading && rows.length === 0) return null;

  return <section className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid rgba(200,150,90,.28)" }}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="text-xs font-semibold tracking-[.14em]" style={{ color: "var(--gold)" }}>DO OBSŁUGI</div>
        <h2 className="mt-1 text-lg font-semibold">Prośby klientów</h2>
        <p className="mt-1 text-xs leading-5" style={{ color: "var(--mut)" }}>Zmiana terminu przechodzi przez ten sam silnik dostępności i kolizji co kalendarz.</p>
      </div>
      <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: "rgba(200,150,90,.14)", color: "var(--gold)", border: "1px solid rgba(200,150,90,.25)" }}>{loading ? "…" : `${rows.length} oczekuje`}</span>
    </div>

    {notice && <div className="mt-3 rounded-xl px-3 py-2 text-xs" style={{ background: "var(--header)", border: "1px solid var(--line)", color: notice.includes("Nie udało") ? "#fca5a5" : "var(--green)" }}>{notice}</div>}

    {loading ? <div className="mt-4 text-sm" style={{ color: "var(--mut)" }}>Ładowanie próśb…</div> : <div className="mt-4 grid gap-3">
      {rows.map((request) => <article key={request.id} className="rounded-2xl p-4" style={{ background: "var(--header)", border: "1px solid var(--line)" }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="font-semibold">{request.title}</div>
            <div className="mt-1 text-xs" style={{ color: "var(--mut)" }}>{request.buyer_name || request.buyer_email || "Klient"}</div>
          </div>
          <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: request.request_type === "cancel" ? "rgba(239,68,68,.10)" : "rgba(200,150,90,.12)", color: request.request_type === "cancel" ? "#fca5a5" : "var(--gold)", border: "1px solid var(--line)" }}>{request.request_type === "cancel" ? "Anulowanie" : "Zmiana terminu"}</span>
        </div>

        <div className="mt-3 space-y-2 text-xs">
          <div><span style={{ color: "var(--mut)" }}>Obecnie: </span>{request.booking_type === "daily" ? `${dt(request.starts_at, false)} – ${dt(request.ends_at, false)}` : dt(request.starts_at, true)}</div>
          <div><span style={{ color: "var(--mut)" }}>{request.request_type === "reschedule" ? "Klient proponuje: " : "Klient prosi o: "}</span><b style={{ color: request.request_type === "reschedule" ? "var(--gold)" : "#fca5a5" }}>{request.request_type === "reschedule" && request.requested_starts_at ? dt(request.requested_starts_at, true) : "anulowanie rezerwacji"}</b></div>
          <div><span style={{ color: "var(--mut)" }}>Kwota: </span><b>{zl(Number(request.amount_gross || 0))}</b></div>
        </div>

        {request.message && <div className="mt-3 rounded-xl px-3 py-2.5 text-xs" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}><span style={{ color: "var(--mut)" }}>Wiadomość: </span>{request.message}</div>}

        <div className="mt-3 grid gap-2">
          <button disabled={busyId === request.id} onClick={() => void accept(request)} className="rounded-xl px-3 py-2 text-xs font-semibold text-black disabled:opacity-50" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>{busyId === request.id ? "Obsługuję…" : request.request_type === "reschedule" ? "✓ Akceptuj nowy termin" : "✓ Zaakceptuj anulowanie"}</button>
          <button disabled={busyId === request.id} onClick={() => { setRejectId(rejectId === request.id ? null : request.id); setRejectNote(""); }} className="rounded-xl px-3 py-2 text-xs font-semibold" style={{ border: "1px solid var(--line)" }}>Odrzuć prośbę</button>
        </div>

        {rejectId === request.id && <div className="mt-3 rounded-xl p-3" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
          <label className="block text-xs"><span className="mb-1 block" style={{ color: "var(--mut)" }}>Odpowiedź dla klienta (opcjonalnie)</span><textarea rows={2} maxLength={1000} value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="Np. ten termin jest już niedostępny." className="w-full rounded-xl px-3 py-2.5" style={{ background: "var(--bg)", border: "1px solid var(--line)" }} /></label>
          <div className="mt-2 flex gap-2"><button disabled={busyId === request.id} onClick={() => void reject(request)} className="rounded-xl px-3 py-2 text-xs font-semibold" style={{ border: "1px solid rgba(239,68,68,.35)", color: "#fca5a5" }}>Potwierdź odrzucenie</button><button disabled={busyId === request.id} onClick={() => setRejectId(null)} className="rounded-xl px-3 py-2 text-xs" style={{ border: "1px solid var(--line)" }}>Wróć</button></div>
        </div>}
      </article>)}
    </div>}
  </section>;
}
