import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function TradePartnerActivate() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        navigate(`/login?next=${encodeURIComponent("/sprzedawca/partner")}`, { replace: true });
        return;
      }
      const meta = data.user.user_metadata || {};
      setName([meta.first_name, meta.last_name].filter(Boolean).join(" ") || data.user.email?.split("@")[0] || "");
      const { data: status } = await supabase.schema("market").rpc("my_trade_partner_status");
      const row = Array.isArray(status) ? status[0] : null;
      if (row?.seller_id && row?.can_sell) {
        navigate("/sprzedawca", { replace: true });
        return;
      }
      setLoading(false);
    });
  }, [navigate]);

  async function activate() {
    if (!accept) {
      setMsg("Zaakceptuj warunki Partnera Handlowego i regulamin Sunrise Market.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const { error } = await supabase.schema("market").rpc("activate_trade_partner", {
        p_display_name: name.trim() || null,
        p_accept: true,
      });
      if (error) throw error;
      navigate("/sprzedawca", { replace: true });
    } catch (e) {
      setMsg((e as Error).message || "Nie udało się aktywować Partnera Handlowego");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Shell><p style={{ color: "var(--mut)" }}>Sprawdzam dostęp…</p></Shell>;

  return <Shell>
    <div className="mx-auto max-w-3xl">
      <Link to="/sprzedawca" className="text-sm underline" style={{ color: "var(--mut)" }}>← Centrum sprzedawcy</Link>
      <div className="mt-5 rounded-3xl p-6 sm:p-8" style={{ background: "var(--glass)", border: "1px solid rgba(200,150,90,.28)" }}>
        <div className="text-xs font-semibold tracking-[.15em]" style={{ color: "var(--gold)" }}>MYSUNRISE · PARTNER HANDLOWY</div>
        <h1 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">Sprzedawaj swoje produkty i zarabiaj</h1>
        <p className="mt-3 text-sm leading-6 sm:text-base" style={{ color: "var(--mut)" }}>
          Aktywujesz sprzedaż prywatną na swoim istniejącym koncie MySunrise. Nie zakładamy drugiego konta i nie wymagamy NIP-u, jeśli sprzedajesz prywatnie.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {[
            ["🛍️", "Własne produkty", "Wystawiaj prywatne rzeczy, auta, sprzęt i inne przedmioty."],
            ["💸", "Dodatkowy dochód", "Zarabiaj na własnej sprzedaży oraz poleceniach dostępnych w ekosystemie."],
            ["🎁", "12 miesięcy bez opłaty", "Pierwszy rok członkostwa Partnera Handlowego jest bez opłaty rocznej."],
            ["🔄", "Odnowienie po roku", "Po okresie startowym dostęp sprzedażowy wymaga rocznego odnowienia. Kwota będzie pokazana przed płatnością."],
          ].map(([icon, title, body]) => <div key={title} className="rounded-2xl p-4" style={{ background: "var(--header)", border: "1px solid var(--line)" }}>
            <div className="text-2xl">{icon}</div><div className="mt-2 font-semibold">{title}</div><div className="mt-1 text-sm leading-5" style={{ color: "var(--mut)" }}>{body}</div>
          </div>)}
        </div>

        <div className="mt-6">
          <label className="text-sm font-medium">Nazwa wyświetlana sprzedawcy</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="mt-2 w-full rounded-xl px-3 py-3 outline-none" style={{ background: "var(--header)", border: "1px solid var(--line)", color: "var(--ink)" }} placeholder="np. Marcin" />
        </div>

        <label className="mt-5 flex items-start gap-3 rounded-2xl p-4 text-sm" style={{ background: "rgba(200,150,90,.08)", border: "1px solid rgba(200,150,90,.22)" }}>
          <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} className="mt-1" />
          <span style={{ color: "var(--mut)" }}>Aktywuję status Partnera Handlowego, akceptuję zasady sprzedaży Sunrise Market i przyjmuję do wiadomości, że po 12 miesiącach dalszy dostęp sprzedażowy będzie wymagał rocznego odnowienia na warunkach pokazanych przed płatnością.</span>
        </label>

        {msg && <div className="mt-4 rounded-xl p-3 text-sm" style={{ background: "rgba(239,68,68,.08)", color: "#fca5a5", border: "1px solid rgba(239,68,68,.20)" }}>{msg}</div>}

        <button onClick={activate} disabled={busy || !accept} className="mt-5 w-full rounded-2xl py-3.5 font-bold text-black disabled:opacity-50" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>
          {busy ? "Aktywuję…" : "Aktywuj Partnera Handlowego →"}
        </button>
      </div>
    </div>
  </Shell>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen px-4 py-8 sm:px-6" style={{ background: "var(--bg)", color: "var(--ink)" }}><div className="mx-auto max-w-6xl">{children}</div></main>;
}
