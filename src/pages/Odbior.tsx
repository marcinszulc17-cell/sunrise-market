// /odbior/:token — klient zeskanował kod QR sprzedawcy przy wydaniu/zwrocie najmu (decyzja właściciela 2026-09-06).
// Logowanie (jeśli trzeba) → verify_handover_link → tożsamość potwierdzona → od razu protokół klienta: zdjęcia, potwierdzenie stanu.
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { SiteHeader } from "../components/home/SiteChrome";
import BuyerRentalProtocolCard from "../components/BuyerRentalProtocolCard";

export default function Odbior() {
  const { token = "" } = useParams();
  const [state, setState] = useState<{ status: "loading" | "login" | "ok" | "expired" | "not_yours" | "not_found" | "error"; bookingId?: string; phase?: string; deposit?: number; depositStatus?: string; retained?: number; msg?: string }>({ status: "loading" });

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setState({ status: "login" }); return; }
      const { data, error } = await supabase.rpc("verify_handover_link", { p_token: token });
      if (error) { setState({ status: "error", msg: error.message }); return; }
      const row = (data && data[0]) as { booking_id: string; phase: string; status: string } | undefined;
      if (!row || row.status === "not_found") { setState({ status: "not_found" }); return; }
      if (row.status !== "ok") { setState({ status: row.status as any, bookingId: row.booking_id }); return; }
      let deposit = 0, depositStatus = "", retained = 0;
      try {
        const { data: b } = await supabase.rpc("my_bookings");
        const mine = ((b ?? []) as any[]).find((x) => x.id === row.booking_id);
        if (mine) { deposit = Number(mine.deposit_gross || 0); depositStatus = String(mine.deposit_status || ""); retained = Number(mine.deposit_retained_gross || 0); }
      } catch { /* karta poradzi sobie bez kaucji */ }
      setState({ status: "ok", bookingId: row.booking_id, phase: row.phase, deposit, depositStatus, retained });
    })();
  }, [token]);

  const box = { background: "var(--glass)", border: "1px solid var(--line)" } as const;
  return <main className="min-h-screen pb-24" style={{ background: "var(--bg)", color: "var(--ink)" }}>
    <SiteHeader compact />
    <div className="mx-auto max-w-2xl px-4 py-6">
      {state.status === "loading" && <div className="rounded-2xl p-6 text-sm" style={box}>Sprawdzam kod…</div>}
      {state.status === "login" && <div className="rounded-2xl p-6" style={box}><h1 className="text-xl font-bold">Zaloguj się, aby potwierdzić {"odbiór"}</h1><p className="mt-2 text-sm" style={{ color: "var(--mut)" }}>Kod QR jest przypisany do Twojej rezerwacji. Po zalogowaniu wrócisz tutaj automatycznie.</p><a href={`/login?next=${encodeURIComponent(`/odbior/${token}`)}`} className="mt-4 inline-flex h-12 items-center rounded-xl px-5 font-bold text-black" style={{ background: "linear-gradient(135deg,#E8891A,#F5A623)" }}>Zaloguj się (Face ID lub hasło)</a></div>}
      {state.status === "expired" && <div className="rounded-2xl p-6" style={box}><h1 className="text-xl font-bold">Kod QR wygasł</h1><p className="mt-2 text-sm" style={{ color: "var(--mut)" }}>Kod jest ważny 15 minut. Poproś sprzedawcę o odświeżenie kodu i zeskanuj ponownie.</p>{state.bookingId && <a href="/rezerwacje" className="mt-4 inline-block text-sm underline" style={{ color: "var(--gold)" }}>Przejdź do moich rezerwacji</a>}</div>}
      {state.status === "not_yours" && <div className="rounded-2xl p-6" style={box}><h1 className="text-xl font-bold">To nie Twoja rezerwacja</h1><p className="mt-2 text-sm" style={{ color: "var(--mut)" }}>Kod QR jest przypisany do innego konta. Zaloguj się na konto, którym opłacono rezerwację.</p></div>}
      {state.status === "not_found" && <div className="rounded-2xl p-6" style={box}><h1 className="text-xl font-bold">Nieznany kod</h1><p className="mt-2 text-sm" style={{ color: "var(--mut)" }}>Ten link nie jest aktywnym kodem odbioru. Poproś sprzedawcę o nowy kod QR.</p></div>}
      {state.status === "error" && <div className="rounded-2xl p-6 text-sm" style={box}>{state.msg}</div>}
      {state.status === "ok" && state.bookingId && <>
        <div className="mb-4 rounded-2xl p-4" style={{ background: "rgba(122,184,154,.12)", border: "1px solid rgba(122,184,154,.4)" }}>
          <div className="font-bold">✓ Tożsamość potwierdzona — {state.phase === "handover" ? "wydanie" : "zwrot"}</div>
          <div className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Sprzedawca widzi już potwierdzenie. Teraz zrób zdjęcia stanu {state.phase === "handover" ? "przy odbiorze" : "przy zwrocie"} i potwierdź protokół poniżej.</div>
        </div>
        <BuyerRentalProtocolCard bookingId={state.bookingId} depositGross={state.deposit} depositStatus={state.depositStatus} depositRetainedGross={state.retained} />
        <a href="/rezerwacje" className="mt-4 inline-block text-sm underline" style={{ color: "var(--mut)" }}>Wszystkie moje rezerwacje →</a>
      </>}
    </div>
  </main>;
}
