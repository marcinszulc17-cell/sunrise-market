import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { operatorConsole, listReturns, resolveReturn, listPendingSellers, reviewSeller, listOffersAdmin, moderateOffer, amiOperator, bridgeQueue, retryBridgeOrder, getAutoForward, setAutoForward, approveBridgeForward, rejectBridgeForward } from "../lib/api";

const zl = (v: number) => Math.round(Number(v || 0)).toLocaleString("pl-PL") + " zł";
const n = (v: number) => Number(v || 0).toLocaleString("pl-PL");

export default function Operator() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [isOp, setIsOp] = useState<boolean | null>(null);
  const [k, setK] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rets, setRets] = useState<any[]>([]);
  const [sellers, setSellers] = useState<any[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [bridge, setBridge] = useState<any[]>([]);
  const [autoFwd, setAutoFwd] = useState<boolean>(false);
  const [fwdBusy, setFwdBusy] = useState(false);

  async function loadAll() {
    try { setK(await operatorConsole()); } catch (e) { setErr((e as Error).message); }
    try { setRets((await listReturns()) as any[]); } catch { /* ignore */ }
    try { setSellers((await listPendingSellers()) as any[]); } catch { /* ignore */ }
    try { setOffers((await listOffersAdmin()) as any[]); } catch { /* ignore */ }
    try { setBridge((await bridgeQueue()) as any[]); } catch { /* ignore */ }
    try { setAutoFwd(await getAutoForward()); } catch { /* ignore */ }
  }
  async function onToggleAuto() {
    const next = !autoFwd;
    if (next && !window.confirm("Włączyć AUTOMATYCZNY przekaz zamówień dropship do TeemDrop?\n\nUWAGA: każde opłacone zamówienie dropship będzie automatycznie kupowane u dostawcy (realny wydatek), bez ręcznego zatwierdzania.")) return;
    setFwdBusy(true);
    try { setAutoFwd(await setAutoForward(next)); await loadAll(); } catch (e) { alert((e as Error).message); } finally { setFwdBusy(false); }
  }
  async function onApproveBridge(id: string) {
    if (!window.confirm("Przekazać to zamówienie do TeemDrop? Zostanie kupione u dostawcy (realny wydatek).")) return;
    try { await approveBridgeForward(id); await loadAll(); } catch (e) { alert((e as Error).message); }
  }
  async function onRejectBridge(id: string) {
    if (!window.confirm("Odrzucić przekazanie tego zamówienia do TeemDrop?")) return;
    try { await rejectBridgeForward(id); await loadAll(); } catch (e) { alert((e as Error).message); }
  }
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setAuthed(false); return; }
      setAuthed(true);
      const op = await amiOperator();
      setIsOp(op);
      if (op) await loadAll();
    });
  }, []);
  async function onResolve(id: string, approve: boolean) { await resolveReturn(id, approve); await loadAll(); }
  async function onReviewSeller(id: string, approve: boolean) { await reviewSeller(id, approve); await loadAll(); }
  async function onModerate(id: string, hide: boolean) { await moderateOffer(id, hide); await loadAll(); }
  async function onRetryBridge(id: string) { await retryBridgeOrder(id); await loadAll(); }
  const bridgeColor: Record<string, string> = { awaiting_approval: "#F2A93B", pending: "var(--gold)", pushed: "#38E0F0", processing: "#38E0F0", shipped: "#34E3A0", delivered: "#34E3A0", error: "#F25CB0", cancelled: "var(--mut)" };
  const bridgeLabel: Record<string, string> = { awaiting_approval: "do zatwierdzenia", pending: "w kolejce", pushed: "przekazane", processing: "realizacja", shipped: "wysłane", delivered: "dostarczone", error: "błąd", cancelled: "odrzucone" };
  const awaitingCount = bridge.filter((b) => b.status === "awaiting_approval").length;

  const revenue = k ? Number(k.przychod_prowizje || 0) + Number(k.przychod_banery || 0) + Number(k.przychod_promowanie || 0) : 0;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 backdrop-blur" style={{ background: "rgba(7,7,15,.72)", borderBottom: "1px solid var(--line)" }}>
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center gap-3">
          <a href="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl grid place-items-center text-lg" style={{ background: "linear-gradient(135deg,#F2731D,#E0A21B)" }}>☀</div>
            <span className="font-display text-xl font-semibold">Sunrise Market</span>
          </a>
          <div className="flex-1" />
          <span className="text-sm" style={{ color: "var(--mut)" }}>Konsola operatora</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="font-display text-3xl font-semibold mb-6">Pulpit operatora</h1>
        {authed === false && <p style={{ color: "var(--mut)" }}>Zaloguj się. <a href="/login" className="text-amber-400 underline">Logowanie</a>.</p>}
        {authed && isOp === false && (
          <div className="rounded-2xl p-6" style={{ background: "var(--glass)", border: "1px solid rgba(242,92,176,.4)" }}>
            <div className="text-xl font-display font-semibold mb-1" style={{ color: "#F8A8D2" }}>Brak uprawnień</div>
            <p className="text-sm" style={{ color: "var(--mut)" }}>To konto nie ma roli operatora. <a href="/" className="text-amber-400 underline">Wróć do sklepu</a>.</p>
          </div>
        )}
        {err && <p className="text-rose-400">Błąd: {err}</p>}
        {k && (
          <>
            <div className="rounded-2xl p-6 mb-6" style={{ background: "linear-gradient(135deg, rgba(242,115,29,.14), rgba(124,58,237,.12))", border: "1px solid rgba(242,115,29,.3)" }}>
              <div className="text-sm" style={{ color: "var(--mut)" }}>Przychód platformy (prowizje + promowanie + banery)</div>
              <div className="font-display text-4xl font-bold" style={{ color: "var(--gold)" }}>{zl(revenue)}</div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Kpi label="GMV (obrót)" value={zl(k.gmv)} />
              <Kpi label="Przychód: prowizje 7,9%" value={zl(k.przychod_prowizje)} color="var(--green)" />
              <Kpi label="Cashback wypłacony" value={zl(k.cashback_wyplacony)} />
              <Kpi label="Przychód: promowanie" value={zl(k.przychod_promowanie)} color="var(--green)" />
              <Kpi label="Przychód: banery" value={zl(k.przychod_banery)} color="var(--green)" />
              <Kpi label="Subskrypcje aktywne" value={n(k.subskrypcje_aktywne)} />
              <Kpi label="Zamówienia" value={n(k.zamowienia)} />
              <Kpi label="Sprzedawcy aktywni" value={n(k.sprzedawcy_aktywni)} />
              <Kpi label="KYC do weryfikacji" value={n(k.kyc_do_weryfikacji)} />
              <Kpi label="Spory otwarte" value={n(k.spory_otwarte)} color={Number(k.spory_otwarte) ? "#F25CB0" : undefined} />
              <Kpi label="Moderacja: kolejka" value={n(k.moderacja_kolejka)} />
            </div>

            <section className="mt-8">
              <h2 className="font-display text-2xl font-semibold mb-4">Zwroty i reklamacje</h2>
              <div className="flex flex-col gap-2">
                {rets.map((r) => (
                  <div key={r.return_id} className="rounded-xl p-4 flex items-center justify-between gap-3" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
                    <div className="min-w-0">
                      <div className="text-sm">Zam. {String(r.order_id).slice(0, 8)} · {zl(r.refund_amount)}</div>
                      <div className="text-xs truncate" style={{ color: "var(--mut)" }}>{r.reason}</div>
                    </div>
                    {r.status === "requested"
                      ? <div className="flex gap-2 shrink-0">
                          <button onClick={() => onResolve(r.return_id, true)} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-black" style={{ background: "linear-gradient(135deg,#34E3A0,#38E0F0)" }}>Zwróć na portfel</button>
                          <button onClick={() => onResolve(r.return_id, false)} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>Odrzuć</button>
                        </div>
                      : <span className="text-xs shrink-0" style={{ color: "var(--mut)" }}>{r.status}</span>}
                  </div>
                ))}
                {rets.length === 0 && <p style={{ color: "var(--mut)" }}>Brak zgłoszeń.</p>}
              </div>
            </section>

            <section className="mt-8">
              <h2 className="font-display text-2xl font-semibold mb-4">Weryfikacja sprzedawców (KYC)</h2>
              <div className="flex flex-col gap-2">
                {sellers.map((s) => (
                  <div key={s.seller_id} className="rounded-xl p-4 flex items-center justify-between gap-3" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{s.legal_name}</div>
                      <div className="text-xs truncate" style={{ color: "var(--mut)" }}>{s.email}{s.nip && <> · NIP {s.nip}</>} · {s.kyc_status}</div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => onReviewSeller(s.seller_id, true)} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-black" style={{ background: "linear-gradient(135deg,#34E3A0,#38E0F0)" }}>Zatwierdź</button>
                      <button onClick={() => onReviewSeller(s.seller_id, false)} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>Odrzuć</button>
                    </div>
                  </div>
                ))}
                {sellers.length === 0 && <p style={{ color: "var(--mut)" }}>Brak sprzedawców do weryfikacji.</p>}
              </div>
            </section>

            <section className="mt-8">
              <h2 className="font-display text-2xl font-semibold mb-4">Moderacja ofert</h2>
              <div className="flex flex-col gap-2">
                {offers.map((o) => (
                  <div key={o.offer_id} className="rounded-xl p-4 flex items-center justify-between gap-3" style={{ background: "var(--glass)", border: "1px solid var(--line)", opacity: o.status === "hidden" ? 0.55 : 1 }}>
                    <div className="min-w-0">
                      <a href={`/produkt/${o.offer_id}`} className="text-sm font-semibold truncate hover:text-amber-300">{o.title}</a>
                      <div className="text-xs truncate" style={{ color: "var(--mut)" }}>{o.seller} · {zl(o.price_gross)} · {o.status === "hidden" ? "ukryta" : "aktywna"}</div>
                    </div>
                    {o.status === "hidden"
                      ? <button onClick={() => onModerate(o.offer_id, false)} className="text-xs font-semibold px-3 py-1.5 rounded-lg shrink-0 text-black" style={{ background: "linear-gradient(135deg,#34E3A0,#38E0F0)" }}>Przywróć</button>
                      : <button onClick={() => onModerate(o.offer_id, true)} className="text-xs px-3 py-1.5 rounded-lg shrink-0" style={{ background: "rgba(242,92,176,.14)", border: "1px solid rgba(242,92,176,.4)", color: "#F8A8D2" }}>Ukryj</button>}
                  </div>
                ))}
                {offers.length === 0 && <p style={{ color: "var(--mut)" }}>Brak ofert.</p>}
              </div>
            </section>

            <section className="mt-8">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <h2 className="font-display text-2xl font-semibold">
                  Fulfillment TeemDrop (dropship)
                  {awaitingCount > 0 && <span className="ml-2 text-sm px-2.5 py-1 rounded-full align-middle" style={{ background: "rgba(242,169,59,.16)", color: "#F2A93B" }}>{awaitingCount} do zatwierdzenia</span>}
                </h2>
                {/* Przełącznik automatu — domyślnie OFF, bo to realny wydatek u dostawcy */}
                <button onClick={onToggleAuto} disabled={fwdBusy}
                        className="text-sm px-4 py-2 rounded-xl font-semibold disabled:opacity-50"
                        style={{ background: autoFwd ? "linear-gradient(135deg,#34E3A0,#38E0F0)" : "var(--glass)", border: "1px solid var(--line)", color: autoFwd ? "#000" : "var(--ink)" }}>
                  Auto‑przekaz: {autoFwd ? "WŁĄCZONY ✅" : "wyłączony"}
                </button>
              </div>
              <p className="text-xs mb-4" style={{ color: "var(--mut)" }}>
                {autoFwd
                  ? "Automat WŁĄCZONY: każde opłacone zamówienie dropship jest kupowane u dostawcy bez pytania. Kliknij, by wyłączyć."
                  : "Automat wyłączony (bezpiecznie): zamówienia dropship czekają na Twoje ręczne „Przekaż”. Nic nie kupujemy u dostawcy bez zatwierdzenia."}
              </p>
              <div className="flex flex-col gap-2">
                {bridge.map((b) => (
                  <div key={b.bridge_id} className="rounded-xl p-4 flex items-center justify-between gap-3"
                       style={{ background: "var(--glass)", border: b.status === "awaiting_approval" ? "1px solid rgba(242,169,59,.5)" : "1px solid var(--line)" }}>
                    <div className="min-w-0">
                      <div className="text-sm">
                        Zam. {String(b.order_id).slice(0, 8)}
                        {b.total_gross != null && <> · {zl(b.total_gross)}</>}
                        {b.dropship_items != null && <> · {b.dropship_items} poz.</>}
                        {b.woo_order_id && <> · Woo #{b.woo_order_id}</>}
                        {b.tracking_number && <> · 📦 {b.tracking_number}</>}
                      </div>
                      <div className="text-xs truncate" style={{ color: "var(--mut)" }}>{b.buyer_email}{b.ship_city && <> · {b.ship_city}</>}</div>
                      {b.last_error && <div className="text-xs truncate" style={{ color: "#F8A8D2" }}>{b.last_error}</div>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs px-2.5 py-1 rounded-full" style={{ background: "var(--glass)", border: "1px solid var(--line)", color: bridgeColor[b.status] ?? "var(--ink)" }}>{bridgeLabel[b.status] ?? b.status}</span>
                      {b.status === "awaiting_approval" && <>
                        <button onClick={() => onApproveBridge(b.bridge_id)} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-black" style={{ background: "linear-gradient(135deg,#F2731D,#E0A21B)" }}>Przekaż →</button>
                        <button onClick={() => onRejectBridge(b.bridge_id)} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>Odrzuć</button>
                      </>}
                      {b.status === "error" && <>
                        <button onClick={() => onRetryBridge(b.bridge_id)} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>Ponów</button>
                        <button onClick={() => onRejectBridge(b.bridge_id)} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>Odrzuć</button>
                      </>}
                    </div>
                  </div>
                ))}
                {bridge.length === 0 && <p style={{ color: "var(--mut)" }}>Brak zamówień dropship.</p>}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
      <div className="text-xs mb-1" style={{ color: "var(--mut)" }}>{label}</div>
      <div className="font-display text-2xl font-semibold" style={{ color: color ?? "var(--ink)" }}>{value}</div>
    </div>
  );
}
