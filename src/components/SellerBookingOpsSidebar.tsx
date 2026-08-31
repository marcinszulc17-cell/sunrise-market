import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import SellerBookingChangeRequests from "./SellerBookingChangeRequests";

type Block = { id: string; offer_id: string; title: string; starts_at: string; ends_at: string; reason: string | null };
type Offer = { offer_id: string; title: string; status: string };
type Resource = { id: string; name: string; kind: string; description: string | null; active: boolean };
type PaidBooking = { id: string; title: string; buyer_name: string | null; buyer_email: string | null; amount_gross: number; deposit_gross?: number; paid_at: string | null; status: string; payment_provider: string | null };
type RefundIssue = { booking_id: string; order_id: string; title: string; buyer_email: string | null; refund_status: string; amount_gross: number; payment_provider: string; last_error: string | null; updated_at: string };

type Props = {
  blocks: Block[]; offers: Offer[]; resources: Resource[]; offerId: string; start: string; end: string; reason: string; busy: boolean;
  onOfferIdChange: (value: string) => void; onStartChange: (value: string) => void; onEndChange: (value: string) => void; onReasonChange: (value: string) => void;
  onAddBlock: () => void; onDeleteBlock: (id: string) => void;
};

const resourceKindLabel: Record<string, string> = { staff: "Pracownik", vehicle: "Pojazd", property: "Nieruchomość", room: "Pomieszczenie", equipment: "Sprzęt", other: "Zasób" };
const refundStatusLabel: Record<string, string> = { preparing: "Zwrot rozpoczęty", blocked_bonus: "Wymaga operatora — bonusy wykorzystane", payment_failed: "Błąd zwrotu płatności", finalize_failed: "Płatność zwrócona — finalizacja statusów" };
const dt = (iso: string) => new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
const pln = (value: number) => Number(value || 0).toLocaleString("pl-PL", { style: "currency", currency: "PLN" });

export default function SellerBookingOpsSidebar({ blocks, offers, resources, offerId, start, end, reason, busy, onOfferIdChange, onStartChange, onEndChange, onReasonChange, onAddBlock, onDeleteBlock }: Props) {
  const [paidBookings, setPaidBookings] = useState<PaidBooking[]>([]);
  const [refundIssues, setRefundIssues] = useState<RefundIssue[]>([]);
  const [refundBusyId, setRefundBusyId] = useState<string | null>(null);
  const [refundMsg, setRefundMsg] = useState("");

  async function loadPaidBookings() {
    const { data, error } = await supabase.rpc("seller_booking_dashboard_v2");
    if (!error) setPaidBookings(((data || []) as PaidBooking[]).filter((r) => !!r.paid_at && ["held", "pending_payment", "confirmed"].includes(r.status)));
  }

  async function loadRefundIssues() {
    const { data, error } = await supabase.rpc("seller_booking_refund_status_dashboard");
    if (!error) setRefundIssues((data || []) as RefundIssue[]);
  }

  useEffect(() => { void Promise.all([loadPaidBookings(), loadRefundIssues()]); }, []);

  async function cancelAndRefund(r: PaidBooking) {
    const total = Number(r.amount_gross || 0) + Number(r.deposit_gross || 0);
    if (!window.confirm(`Anulować opłaconą rezerwację „${r.title}” i zwrócić ${pln(total)}?\n\nSystem najpierw cofnie cashback i prowizje, potem wykona zwrot płatności.`)) return;
    setRefundBusyId(r.id); setRefundMsg("");
    try {
      const { data, error } = await supabase.functions.invoke("booking-cancel-refund", { body: { booking_id: r.id } });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message || data?.error || "Nie udało się wykonać zwrotu");
      setRefundMsg(`Zwrot ${pln(Number(data.refunded ?? total))} wykonany. Rezerwacja została anulowana. ✅`);
      await Promise.all([loadPaidBookings(), loadRefundIssues()]);
      window.setTimeout(() => window.location.reload(), 700);
    } catch (e) {
      setRefundMsg("Zwrot nie został wykonany: " + (e as Error).message);
      await loadRefundIssues();
    } finally { setRefundBusyId(null); }
  }

  const activeBlocks = [...blocks].filter((block) => new Date(block.ends_at).getTime() >= Date.now()).sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  const selectedOffer = offers.find((offer) => offer.offer_id === offerId) ?? null;

  return <aside className="space-y-5">
    <SellerBookingChangeRequests />

    {refundIssues.length > 0 && <div className="rounded-2xl p-5" style={{ background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.45)" }}>
      <div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-semibold tracking-[.14em]" style={{ color: "#fca5a5" }}>WYMAGA UWAGI</div><h2 className="mt-1 text-lg font-semibold">Niedokończone zwroty</h2></div><span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: "rgba(239,68,68,.15)", color: "#fca5a5" }}>{refundIssues.length}</span></div>
      <p className="mt-2 text-xs leading-5" style={{ color: "var(--mut)" }}>Te przypadki nie znikają po odświeżeniu. Nie wykonuj drugiego ręcznego zwrotu, jeśli system informuje, że płatność została już oddana.</p>
      <div className="mt-3 space-y-2">
        {refundIssues.map((issue) => <div key={issue.booking_id} className="rounded-xl p-3 text-sm" style={{ background: "var(--header)", border: "1px solid var(--line)" }}>
          <div className="font-semibold">{issue.title}</div>
          <div className="mt-1 text-xs font-semibold" style={{ color: issue.refund_status === "finalize_failed" ? "#f59e0b" : "#fca5a5" }}>{refundStatusLabel[issue.refund_status] || issue.refund_status}</div>
          <div className="mt-1 text-xs" style={{ color: "var(--mut)" }}>{issue.buyer_email || "Klient"} · {pln(issue.amount_gross)} · {issue.payment_provider} · {dt(issue.updated_at)}</div>
          {issue.last_error && <div className="mt-2 break-words rounded-lg px-2.5 py-2 text-xs" style={{ background: "rgba(239,68,68,.07)", color: "var(--mut)" }}>{issue.last_error}</div>}
          <Link to={`/sprzedawca/rezerwacje#booking-${issue.booking_id}`} className="mt-2 inline-block text-xs font-semibold" style={{ color: "var(--gold)" }}>Otwórz rezerwację →</Link>
        </div>)}
      </div>
    </div>}

    <div className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid rgba(239,68,68,.25)" }}>
      <div className="text-[10px] font-semibold tracking-[.14em]" style={{ color: "#fca5a5" }}>ZWROTY OPŁACONYCH</div>
      <h2 className="mt-1 text-lg font-semibold">Anuluj i zwróć płatność</h2>
      <p className="mt-2 text-xs leading-5" style={{ color: "var(--mut)" }}>Proces cofa cashback i prowizje, zwraca pełną płatność wraz z nierozliczoną kaucją i zatrzymuje wypłatę sprzedawcy.</p>
      {refundMsg && <div className="mt-3 rounded-xl p-3 text-xs" style={{ background: "var(--header)", border: "1px solid var(--line)" }}>{refundMsg}</div>}
      <div className="mt-3 max-h-[320px] space-y-2 overflow-y-auto pr-1">
        {paidBookings.map((r) => { const total = Number(r.amount_gross || 0) + Number(r.deposit_gross || 0); return <div key={r.id} className="rounded-xl p-3 text-sm" style={{ background: "var(--header)", border: "1px solid var(--line)" }}><div className="font-semibold">{r.title}</div><div className="mt-1 text-xs" style={{ color: "var(--mut)" }}>{r.buyer_name || r.buyer_email || "Klient"} · {pln(total)}</div><div className="mt-1 text-xs" style={{ color: r.status === "pending_payment" ? "var(--gold)" : "var(--green)" }}>{r.status === "pending_payment" ? "Opłacona — do akceptacji" : "Opłacona i potwierdzona"} · {r.payment_provider || "płatność"}</div><button disabled={refundBusyId === r.id} onClick={() => cancelAndRefund(r)} className="mt-2 w-full rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50" style={{ border: "1px solid rgba(239,68,68,.45)", color: "#fca5a5" }}>{refundBusyId === r.id ? "Wykonuję bezpieczny zwrot…" : `Anuluj i zwróć ${pln(total)}`}</button></div>; })}
        {paidBookings.length === 0 && <div className="rounded-xl p-3 text-sm" style={{ background: "var(--header)", color: "var(--mut)" }}>Brak aktywnych opłaconych rezerwacji wymagających zwrotu.</div>}
      </div>
    </div>

    <div id="block-editor" className="scroll-mt-24 rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
      <div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-semibold tracking-[.14em]" style={{ color: "var(--gold)" }}>DOSTĘPNOŚĆ</div><h2 className="mt-1 text-lg font-semibold">Zablokuj termin</h2></div><span className="rounded-full px-2 py-1 text-[10px]" style={{ background: "var(--header)", color: "var(--mut)" }}>{activeBlocks.length} aktywnych</span></div>
      <p className="mt-2 text-xs leading-5" style={{ color: "var(--mut)" }}>Użyj blokady na urlop, serwis, odbiór auta, sprzątanie albo inną niedostępność całej oferty.</p>
      <select value={offerId} onChange={(e) => onOfferIdChange(e.target.value)} className="mt-4 w-full rounded-xl px-3 py-2.5" style={{ background: "var(--bg)", border: "1px solid var(--line)" }}><option value="">Wybierz ofertę</option>{offers.map((o) => <option key={o.offer_id} value={o.offer_id}>{o.title}</option>)}</select>
      {selectedOffer && <Link to={`/sprzedawca/rezerwacje/ustawienia/${selectedOffer.offer_id}`} className="mt-2 block text-xs font-semibold" style={{ color: "var(--gold)" }}>⚙ Ustaw booking dla „{selectedOffer.title}” →</Link>}
      <div className="mt-3 grid gap-2"><label className="text-xs" style={{ color: "var(--mut)" }}>Od<input type="datetime-local" value={start} onChange={(e) => onStartChange(e.target.value)} className="mt-1 w-full rounded-xl px-3 py-2.5 text-sm" style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--ink)" }} /></label><label className="text-xs" style={{ color: "var(--mut)" }}>Do<input type="datetime-local" value={end} onChange={(e) => onEndChange(e.target.value)} className="mt-1 w-full rounded-xl px-3 py-2.5 text-sm" style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--ink)" }} /></label></div>
      <input value={reason} onChange={(e) => onReasonChange(e.target.value)} placeholder="Powód, np. urlop / serwis" className="mt-3 w-full rounded-xl px-3 py-2.5" style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--ink)" }} />
      <button disabled={busy || !offerId || !start || !end} onClick={onAddBlock} className="mt-3 w-full rounded-xl px-4 py-2.5 font-semibold text-black disabled:opacity-50" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>{busy ? "Zapisuję…" : "Zablokuj termin"}</button>
    </div>

    <div className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Aktywne blokady</h2><span className="text-xs" style={{ color: "var(--mut)" }}>{activeBlocks.length}</span></div><div className="mt-3 max-h-[360px] space-y-2 overflow-y-auto pr-1">{activeBlocks.map((block) => <div key={block.id} className="rounded-xl p-3 text-sm" style={{ background: "var(--header)", border: "1px solid var(--line)" }}><div className="font-semibold">{block.title || offers.find((o) => o.offer_id === block.offer_id)?.title || "Oferta"}</div><div className="mt-1 text-xs" style={{ color: "var(--mut)" }}>{dt(block.starts_at)} → {dt(block.ends_at)}</div>{block.reason && <div className="mt-1 text-xs" style={{ color: "var(--mut)" }}>Powód: {block.reason}</div>}<div className="mt-2 flex items-center justify-between gap-2"><Link to={`/sprzedawca/rezerwacje/ustawienia/${block.offer_id}`} className="text-xs font-semibold" style={{ color: "var(--gold)" }}>Ustawienia →</Link><button disabled={busy} onClick={() => onDeleteBlock(block.id)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50" style={{ border: "1px solid rgba(239,68,68,.35)", color: "#fca5a5" }}>Usuń</button></div></div>)}{activeBlocks.length === 0 && <div className="rounded-xl p-3 text-sm" style={{ background: "var(--header)", color: "var(--mut)" }}>Brak aktywnych blokad. Wszystkie terminy wynikają z grafików, rezerwacji i ustawień ofert.</div>}</div></div>

    <div className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}><div className="text-[10px] font-semibold tracking-[.14em]" style={{ color: "var(--gold)" }}>AUTOMATYCZNIE</div><h2 className="mt-1 text-lg font-semibold">Powiadomienia klienta</h2><div className="mt-3 space-y-2 text-xs leading-5" style={{ color: "var(--mut)" }}><div>✓ utworzenie i potwierdzenie rezerwacji</div><div>✓ zmiana terminu lub zasobu — aplikacja/push</div><div>✓ e-mail dla zdarzeń bookingu jest dodawany do kolejki wysyłkowej</div><div>✓ cena opłaconej rezerwacji pozostaje zablokowana przy przenoszeniu</div></div></div>
    <div className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}><h2 className="text-lg font-semibold">Szybkie ustawienia</h2><div className="mt-3 grid gap-2"><Link to="/sprzedawca/oferty" className="rounded-xl px-3 py-2.5 text-sm font-semibold" style={{ border: "1px solid var(--line)" }}>Oferty i konfiguracja bookingu →</Link><Link to="/sprzedawca/rezerwacje/grafiki" className="rounded-xl px-3 py-2.5 text-sm font-semibold" style={{ border: "1px solid var(--line)" }}>Grafiki i nieobecności zasobów →</Link></div></div>
    <div className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Aktywne zasoby</h2><Link to="/sprzedawca/rezerwacje/grafiki" className="text-xs font-semibold" style={{ color: "var(--gold)" }}>Edytuj grafiki →</Link></div><div className="mt-3 space-y-2">{resources.map((resource) => <Link key={resource.id} to={`/sprzedawca/rezerwacje/grafiki?resource=${encodeURIComponent(resource.id)}`} className="block rounded-xl p-3 text-sm transition hover:-translate-y-px" style={{ border: "1px solid var(--line)" }}><div className="flex items-center justify-between gap-2"><div className="font-semibold">{resource.name}</div><span className="text-[11px]" style={{ color: "var(--gold)" }}>Edytuj →</span></div><div className="text-xs" style={{ color: "var(--mut)" }}>{resourceKindLabel[resource.kind] || resource.kind}</div></Link>)}{resources.length === 0 && <p className="text-sm" style={{ color: "var(--mut)" }}>Brak aktywnych zasobów.</p>}</div></div>
  </aside>;
}