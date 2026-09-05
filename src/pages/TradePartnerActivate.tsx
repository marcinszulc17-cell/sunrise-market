import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

type PartnerStatus = {
  seller_id: string;
  seller_type: string;
  partner_since: string | null;
  free_until: string | null;
  billing_starts: string | null;
  annual_fee_gross: number | string | null;
  renewal_due: boolean;
  can_sell: boolean;
};

export default function TradePartnerActivate() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const [name, setName] = useState("");
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [status, setStatus] = useState<PartnerStatus | null>(null);

  async function loadStatus() {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      navigate(`/login?next=${encodeURIComponent("/sprzedawca/partner")}`, { replace: true });
      return;
    }
    const meta = auth.user.user_metadata || {};
    setName([meta.first_name, meta.last_name].filter(Boolean).join(" ") || auth.user.email?.split("@")[0] || "");
    const { data, error } = await supabase.schema("market").rpc("my_trade_partner_status");
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] as PartnerStatus | undefined : undefined;
    setStatus(row ?? null);
  }

  useEffect(() => {
    (async () => {
      try {
        await loadStatus();
        const renewal = sp.get("renewal");
        const sessionId = sp.get("session_id");
        if (renewal === "success" && sessionId) {
          const { data, error } = await supabase.functions.invoke("trade-partner-renew", { body: { action: "verify", session_id: sessionId } });
          if (error) throw error;
          if (!data?.ok) throw new Error(data?.error || "Nie udało się potwierdzić płatności");
          setMsg("Odnowienie opłacone. Partner Handlowy jest aktywny przez kolejny rok ✅");
          await loadStatus();
          window.history.replaceState({}, "", "/sprzedawca/partner");
        } else if (renewal === "cancel") {
          setMsg("Płatność została anulowana. Możesz wrócić do odnowienia w dowolnym momencie.");
          window.history.replaceState({}, "", "/sprzedawca/partner");
        }
      } catch (e) {
        setMsg((e as Error).message || "Nie udało się wczytać statusu Partnera Handlowego");
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      await loadStatus();
      setMsg("Partner Handlowy aktywny. Pierwsze 12 miesięcy bez opłaty ✅");
    } catch (e) {
      setMsg((e as Error).message || "Nie udało się aktywować Partnera Handlowego");
    } finally {
      setBusy(false);
    }
  }

  async function renew(paymentMethod: "wallet" | "card") {
    setBusy(true);
    setMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke("trade-partner-renew", { body: { payment_method: paymentMethod } });
      if (error) throw error;
      if (data?.need_topup) {
        setMsg(`Brakuje ${Number(data.shortfall || 0).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł w Sunrise Wallet.`);
        return;
      }
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      if (data?.ok) {
        await loadStatus();
        setMsg("Konto Sprzedawcy odnowione na kolejny rok ✅");
        return;
      }
      throw new Error(data?.error || "Nie udało się rozpocząć odnowienia");
    } catch (e) {
      setMsg((e as Error).message || "Nie udało się odnowić konta Sprzedawcy");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Shell><p style={{ color: "var(--mut)" }}>Sprawdzam dostęp…</p></Shell>;

  const fee = Number(status?.annual_fee_gross ?? 299);
  const privatePartner = status?.seller_type === "private_partner";

  return <Shell>
    <div className="mx-auto max-w-3xl">
      <Link to="/sprzedawca" className="text-sm underline" style={{ color: "var(--mut)" }}>← Centrum sprzedawcy</Link>
      <div className="mt-5 rounded-3xl p-6 sm:p-8" style={{ background: "var(--glass)", border: "1px solid rgba(200,150,90,.28)" }}>
        <div className="text-xs font-semibold tracking-[.15em]" style={{ color: "var(--gold)" }}>MYSUNRISE · SPRZEDAWCA</div>
        <h1 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">Sprzedawaj swoje produkty i zarabiaj</h1>
        <p className="mt-3 text-sm leading-6 sm:text-base" style={{ color: "var(--mut)" }}>
          Sprzedaż działa na Twoim istniejącym koncie MySunrise. Nie zakładamy drugiego konta i nie wymagamy NIP-u. Wypłaty trafiają na Twój prywatny portfel Sunrise Pay. Masz firmę i chcesz więcej? Wybierz <Link to="/sprzedawca/dolacz" className="underline">Partnera Handlowego</Link>.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {[
            ["🛍️", "Własne produkty", "Wystawiaj prywatne rzeczy, auta, sprzęt i inne przedmioty."],
            ["💸", "Dodatkowy dochód", "Zarabiaj na własnej sprzedaży oraz poleceniach dostępnych w ekosystemie."],
            ["🎁", "12 miesięcy bez opłaty", "Pierwszy rok konta Sprzedawcy jest bez opłaty rocznej."],
            ["🔄", `${fee.toFixed(0)} zł / rok`, "Po okresie startowym odnawiasz dostęp sprzedażowy na kolejne 12 miesięcy."],
          ].map(([icon, title, body]) => <div key={title} className="rounded-2xl p-4" style={{ background: "var(--header)", border: "1px solid var(--line)" }}>
            <div className="text-2xl">{icon}</div><div className="mt-2 font-semibold">{title}</div><div className="mt-1 text-sm leading-5" style={{ color: "var(--mut)" }}>{body}</div>
          </div>)}
        </div>

        {status?.seller_id && privatePartner ? (
          <div className="mt-6 rounded-2xl p-5" style={{ background: status.renewal_due ? "rgba(239,68,68,.07)" : "rgba(34,197,94,.07)", border: status.renewal_due ? "1px solid rgba(239,68,68,.22)" : "1px solid rgba(34,197,94,.22)" }}>
            <div className="text-sm font-semibold">{status.renewal_due ? "Odnowienie wymagane" : "Partner Handlowy aktywny"}</div>
            {!status.renewal_due && status.free_until && <p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Pierwszy rok bez opłaty do <b style={{ color: "var(--ink)" }}>{new Date(status.free_until + "T00:00:00").toLocaleDateString("pl-PL")}</b>. Potem {fee.toFixed(0)} zł za 12 miesięcy.</p>}
            {status.renewal_due && <>
              <p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Opłać {fee.toFixed(0)} zł, aby aktywować możliwość wystawiania nowych ofert na kolejny rok.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button onClick={() => renew("wallet")} disabled={busy} className="rounded-xl px-4 py-3 font-semibold disabled:opacity-50" style={{ background: "var(--header)", border: "1px solid var(--line)" }}>💳 Zapłać z Sunrise Wallet</button>
                <button onClick={() => renew("card")} disabled={busy} className="rounded-xl px-4 py-3 font-semibold text-black disabled:opacity-50" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>Karta / BLIK / P24 →</button>
              </div>
            </>}
            {status.can_sell && <Link to="/sprzedawca/wystaw" className="mt-4 inline-flex rounded-xl px-4 py-2.5 font-semibold text-black" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>+ Wystaw ofertę</Link>}
          </div>
        ) : status?.seller_id ? (
          <div className="mt-6 rounded-2xl p-5" style={{ background: "rgba(34,197,94,.07)", border: "1px solid rgba(34,197,94,.22)" }}>
            <div className="font-semibold">Konto profesjonalnego sprzedawcy jest aktywne</div>
            <p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>Ten profil nie korzysta z prywatnego planu Partnera Handlowego.</p>
            <Link to="/sprzedawca" className="mt-4 inline-flex underline" style={{ color: "var(--gold)" }}>Przejdź do centrum sprzedawcy →</Link>
          </div>
        ) : <>
          <div className="mt-6">
            <label className="text-sm font-medium">Nazwa wyświetlana sprzedawcy</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="mt-2 w-full rounded-xl px-3 py-3 outline-none" style={{ background: "var(--header)", border: "1px solid var(--line)", color: "var(--ink)" }} placeholder="np. Marcin" />
          </div>

          <label className="mt-5 flex items-start gap-3 rounded-2xl p-4 text-sm" style={{ background: "rgba(200,150,90,.08)", border: "1px solid rgba(200,150,90,.22)" }}>
            <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} className="mt-1" />
            <span style={{ color: "var(--mut)" }}>Aktywuję konto Sprzedawcy, akceptuję zasady sprzedaży Sunrise Market i przyjmuję do wiadomości, że pierwszy rok jest bez opłaty, a po 12 miesiącach dalszy dostęp sprzedażowy kosztuje {fee.toFixed(0)} zł za rok.</span>
          </label>

          <button onClick={activate} disabled={busy || !accept} className="mt-5 w-full rounded-2xl py-3.5 font-bold text-black disabled:opacity-50" style={{ background: "linear-gradient(135deg,#C8965A,#E8C896)" }}>
            {busy ? "Aktywuję…" : "Aktywuj konto Sprzedawcy →"}
          </button>
        </>}

        {msg && <div className="mt-4 rounded-xl p-3 text-sm" style={{ background: "rgba(200,150,90,.08)", color: "var(--ink)", border: "1px solid rgba(200,150,90,.20)" }}>{msg}</div>}
      </div>
    </div>
  </Shell>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen px-4 py-8 sm:px-6" style={{ background: "var(--bg)", color: "var(--ink)" }}><div className="mx-auto max-w-6xl">{children}</div></main>;
}
