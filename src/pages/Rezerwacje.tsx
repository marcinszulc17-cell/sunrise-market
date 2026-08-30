import { useEffect, useState } from "react";
import { myBookings } from "../lib/api";
import { supabase } from "../lib/supabase";
import { zl } from "../lib/money";
import { useSeo } from "../lib/seo";

const labels: Record<string, string> = {
  held: "Termin zablokowany", pending_payment: "Oczekuje na płatność",
  confirmed: "Potwierdzona", completed: "Zakończona", cancelled: "Anulowana", expired: "Wygasła",
};
const date = (iso: string, withTime: boolean) => new Date(iso).toLocaleString("pl-PL", withTime
  ? { weekday: "short", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }
  : { day: "numeric", month: "long", year: "numeric" });

export default function Rezerwacje() {
  useSeo("Moje rezerwacje", "Opłacone usługi i wynajem w Sunrise Market.", "/rezerwacje");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(true);
  const params = new URLSearchParams(window.location.search);
  const paid = params.get("paid") === "success" || params.get("card") === "success";
  const cancelled = params.get("card") === "cancel";

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { setAuthed(false); setLoading(false); return; }
      myBookings().then((data) => setRows(data as any[])).finally(() => setLoading(false));
    });
  }, []);

  return <main className="min-h-screen px-4 py-8" style={{ background: "var(--bg)", color: "var(--ink)" }}>
    <div className="mx-auto max-w-4xl">
      <div className="mb-7 flex items-center justify-between gap-3"><div><a href="/konto" className="text-sm" style={{ color: "var(--mut)" }}>← Moje konto</a><h1 className="mt-2 font-display text-3xl font-semibold">Moje rezerwacje</h1></div><a href="/" className="rounded-xl px-4 py-2 text-sm" style={{ border: "1px solid var(--line)" }}>Sklep</a></div>
      {paid && <p className="mb-5 rounded-2xl p-4" style={{ background: "rgba(34,197,94,.12)", border: "1px solid rgba(34,197,94,.35)", color: "var(--green)" }}>Płatność przyjęta. Status rezerwacji zaktualizuje się automatycznie po potwierdzeniu płatności.</p>}
      {cancelled && <p className="mb-5 rounded-2xl p-4" style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.3)" }}>Płatność przerwana. Termin pozostaje zablokowany tylko do końca czasu płatności.</p>}
      {!authed && <p>Zaloguj się, aby zobaczyć rezerwacje. <a className="underline" href={`/login?next=${encodeURIComponent("/rezerwacje")}`}>Logowanie</a></p>}
      {loading && <p style={{ color: "var(--mut)" }}>Ładowanie rezerwacji…</p>}
      {!loading && authed && rows.length === 0 && <div className="rounded-2xl p-6" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}><p className="font-semibold">Nie masz jeszcze rezerwacji.</p><p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>W ofertach z bookingiem wybierzesz usługę lub okres wynajmu i zapłacisz od razu.</p></div>}
      <div className="grid gap-3">{rows.map((r) => <article key={r.id} className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><a href={`/produkt/${r.offer_id}`} className="font-semibold hover:underline">{r.title}</a><p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>{r.booking_type === "appointment" ? date(r.starts_at, true) : `${date(r.starts_at, false)} – ${date(r.ends_at, false)} · ${r.units} dni`}</p></div><span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: r.status === "confirmed" ? "rgba(34,197,94,.14)" : "var(--header)", border: "1px solid var(--line)" }}>{labels[r.status] ?? r.status}</span></div>
        <div className="mt-4 flex items-center justify-between text-sm"><span style={{ color: "var(--mut)" }}>{r.payment_provider === "stripe" ? "Karta / BLIK / P24" : r.payment_provider === "sunrise_pay" ? "Sunrise Pay" : ""}</span><strong>{zl(Number(r.amount_gross))}</strong></div>
      </article>)}</div>
    </div>
  </main>;
}
