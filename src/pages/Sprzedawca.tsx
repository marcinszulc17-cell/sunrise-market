import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { getMySeller } from "../lib/payments";
import { becomeSeller, myOffers, createOffer, topCategories, childCategories, uploadProductImage, myBalance, mySubscription, promoteOffer, sellerOrders, markShipped } from "../lib/api";
import { setMode } from "../lib/mode";

const zl = (v: number) => Math.round(v).toLocaleString("pl-PL") + " zł";
type Cat = { id: string; slug: string; name: string };
type Off = { offer_id: string; title: string; price_gross: number; stock: number; status: string; category: string };

export default function Sprzedawca() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [seller, setSeller] = useState<any>(null);
  const [offers, setOffers] = useState<Off[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // formularz "zostań sprzedawcą"
  const [legalName, setLegalName] = useState("");
  const [nip, setNip] = useState("");
  const [accept, setAccept] = useState(false);
  const [balance, setBalance] = useState<number>(0);
  const [imageUrl, setImageUrl] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [sub, setSub] = useState<any>(null);
  const [sorders, setSorders] = useState<any[]>([]);

  // formularz oferty
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState<number>(0);
  const [stock, setStock] = useState<number>(1);
  const [d1, setD1] = useState<Cat[]>([]); const [d2, setD2] = useState<Cat[]>([]); const [d3, setD3] = useState<Cat[]>([]);
  const [s1, setS1] = useState<Cat | null>(null); const [s2, setS2] = useState<Cat | null>(null); const [s3, setS3] = useState<Cat | null>(null);

  async function refresh() {
    const s = await getMySeller();
    setSeller(s);
    if (s) {
      setOffers((await myOffers()) as Off[]); setBalance(await myBalance().catch(() => 0));
      setSub(await mySubscription().catch(() => null)); setSorders((await sellerOrders().catch(() => [])) as any[]);
    }
  }
  async function onShip(orderId: string) {
    setMsg(null);
    try { const t = await markShipped(orderId); setMsg("Oznaczono wysłane. Nr przesyłki: " + t); await refresh(); }
    catch (e) { setMsg((e as Error).message); }
  }
  async function onPromote(offerId: string) {
    setMsg(null);
    try { const cost = await promoteOffer(offerId, 7); setMsg(`Wyróżniono na 7 dni za ${cost} zł (z portfela).`); await refresh(); }
    catch (e) { setMsg((e as Error).message); }
  }
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { setAuthed(false); return; }
      setAuthed(true);
      await refresh();
      setD1((await topCategories()) as Cat[]);
    })();
  }, []);

  async function onBecome(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    if (!accept) { setMsg("Zaakceptuj Regulamin sprzedawcy i Regulamin Sunrise Pay."); return; }
    setBusy(true);
    try { await becomeSeller(legalName, nip, accept); await refresh(); setMsg("Konto sprzedawcy aktywne."); }
    catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }
  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setUploading(true); setMsg(null);
    try { setImageUrl(await uploadProductImage(f)); }
    catch (err) { setMsg("Błąd uploadu zdjęcia: " + (err as Error).message); }
    finally { setUploading(false); }
  }

  async function pick1(slug: string) {
    const c = d1.find((x) => x.slug === slug) ?? null;
    setS1(c); setS2(null); setS3(null); setD2([]); setD3([]);
    if (c) setD2((await childCategories(c.id)) as Cat[]);
  }
  async function pick2(slug: string) {
    const c = d2.find((x) => x.slug === slug) ?? null;
    setS2(c); setS3(null); setD3([]);
    if (c) setD3((await childCategories(c.id)) as Cat[]);
  }
  function pick3(slug: string) { setS3(d3.find((x) => x.slug === slug) ?? null); }

  const chosen = s3 ?? s2 ?? s1;

  async function onCreate(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    if (!chosen) { setMsg("Wybierz kategorię."); return; }
    setBusy(true);
    try {
      await createOffer({ title, description: desc, price, stock, categorySlug: chosen.slug, imageUrl });
      setTitle(""); setDesc(""); setPrice(0); setStock(1); setImageUrl("");
      await refresh();
      setMsg("Oferta wystawiona ✅");
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }

  const inp = "w-full rounded-lg px-3 py-2 bg-zinc-900 text-zinc-100 outline-none";
  const sel = "rounded-lg px-3 py-2 bg-zinc-900 text-zinc-100 outline-none";

  if (authed === false) return <Shell><p style={{ color: "var(--mut)" }}>Zaloguj się, aby wystawiać oferty. <a href="/login" className="text-amber-400 underline">Logowanie</a>.</p></Shell>;
  if (authed === null) return <Shell><p style={{ color: "var(--mut)" }}>Ładowanie…</p></Shell>;

  return (
    <Shell>
      <h1 className="font-display text-3xl font-semibold mb-6">Panel sprzedawcy</h1>
      {msg && <div className="mb-5 rounded-lg px-4 py-2 text-sm" style={{ background: "rgba(242,115,29,.12)", color: "var(--gold)" }}>{msg}</div>}

      {!seller ? (
        <form onSubmit={onBecome} className="max-w-md rounded-2xl p-5 flex flex-col gap-3" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
          <h2 className="font-semibold text-lg">Zostań sprzedawcą</h2>
          <input className={inp} placeholder="Nazwa firmy" value={legalName} onChange={(e) => setLegalName(e.target.value)} required />
          <input className={inp} placeholder="NIP (opcjonalnie)" value={nip} onChange={(e) => setNip(e.target.value)} />
          <label className="flex items-start gap-2 text-sm" style={{ color: "var(--mut)" }}>
            <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} className="mt-1" />
            <span>Akceptuję <a href="/legal/regulamin-sprzedawcy.html" target="_blank" className="text-amber-400 underline">Regulamin sprzedawcy</a> oraz <a href="/legal/regulamin.html" target="_blank" className="text-amber-400 underline">Regulamin Sunrise Pay</a> (prowizja 7,9%, wypłata na portfel Sunrise Pay).</span>
          </label>
          <button disabled={busy || !accept} className="rounded-xl py-2 font-semibold text-black disabled:opacity-50" style={{ background: "linear-gradient(135deg,#F2731D,#E0A21B)" }}>{busy ? "…" : "Aktywuj konto sprzedawcy"}</button>
        </form>
      ) : (
        <div className="flex flex-col gap-6">
        <div className="rounded-2xl p-4 flex items-center justify-between" style={{ background: "var(--glass)", border: "1px solid rgba(52,227,160,.25)" }}>
          <div>
            <div className="text-sm" style={{ color: "var(--mut)" }}>Saldo portfela ({seller.legal_name}) — zarobki ze sprzedaży + cashback</div>
            <div className="font-display text-2xl font-semibold" style={{ color: "var(--green)" }}>{zl(balance)}</div>
          </div>
          <a href="/portfel" className="text-sm rounded-lg px-3 py-2" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>Portfel →</a>
        </div>
        {sub && (
          <div className="rounded-2xl p-4 text-sm flex items-center justify-between" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
            <span style={{ color: "var(--mut)" }}>
              Subskrypcja Sunrise Pay:{" "}
              {sub.in_free
                ? <b style={{ color: "var(--green)" }}>darmowa do {sub.promo_until} ({sub.days_left} dni)</b>
                : <b style={{ color: "var(--gold)" }}>{Number(sub.monthly_fee).toFixed(0)} zł/mc</b>}
            </span>
            <a href="/cennik" className="text-amber-400 underline text-xs">Cennik</a>
          </div>
        )}
        <div className="grid gap-8 lg:grid-cols-2">
          {/* wystaw ofertę */}
          <form onSubmit={onCreate} className="rounded-2xl p-5 flex flex-col gap-3 h-fit" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
            <h2 className="font-semibold text-lg">Wystaw ofertę</h2>
            <input className={inp} placeholder="Nazwa produktu" value={title} onChange={(e) => setTitle(e.target.value)} required />
            <textarea className={inp} placeholder="Opis" value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} />
            <div className="flex gap-3">
              <input className={inp} type="number" min={0} step="0.01" placeholder="Cena zł" value={price || ""} onChange={(e) => setPrice(Number(e.target.value))} required />
              <input className={inp} type="number" min={0} placeholder="Sztuk" value={stock} onChange={(e) => setStock(Number(e.target.value))} />
            </div>
            <div className="flex flex-col gap-2">
              <select className={sel} value={s1?.slug ?? ""} onChange={(e) => pick1(e.target.value)} required>
                <option value="">— Dział —</option>
                {d1.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </select>
              {d2.length > 0 && (
                <select className={sel} value={s2?.slug ?? ""} onChange={(e) => pick2(e.target.value)}>
                  <option value="">— Podkategoria (opcjonalnie) —</option>
                  {d2.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                </select>
              )}
              {d3.length > 0 && (
                <select className={sel} value={s3?.slug ?? ""} onChange={(e) => pick3(e.target.value)}>
                  <option value="">— Szczegółowa (opcjonalnie) —</option>
                  {d3.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                </select>
              )}
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm cursor-pointer rounded-lg px-3 py-2" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
                {uploading ? "Wgrywam…" : imageUrl ? "Zmień zdjęcie" : "📷 Dodaj zdjęcie"}
                <input type="file" accept="image/*" onChange={onPickImage} className="hidden" />
              </label>
              {imageUrl && <img src={imageUrl} alt="podgląd" className="w-12 h-12 rounded-lg object-cover" />}
            </div>
            <p className="text-xs" style={{ color: "var(--mut)" }}>Kategoria: {chosen?.name ?? "—"}. Prowizja platformy 7,9%. Wypłata netto na Twój portfel Sunrise Pay.</p>
            <button disabled={busy || uploading} className="rounded-xl py-2 font-semibold text-black disabled:opacity-50" style={{ background: "linear-gradient(135deg,#F2731D,#D9560C)" }}>{busy ? "…" : "Wystaw"}</button>
          </form>

          {/* moje oferty */}
          <div>
            <h2 className="font-semibold text-lg mb-3">Twoje oferty ({offers.length})</h2>
            <div className="flex flex-col gap-2">
              {offers.map((o) => (
                <div key={o.offer_id} className="flex items-center justify-between gap-3 rounded-xl p-3"
                     style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
                  <div className="flex-1 min-w-0">
                    <a href={`/produkt/${o.offer_id}`} className="font-medium hover:text-amber-300">{o.title}</a>
                    <div className="text-xs" style={{ color: "var(--mut)" }}>{o.category} · {o.stock} szt.</div>
                  </div>
                  <button onClick={() => onPromote(o.offer_id)} className="text-xs px-3 py-1.5 rounded-lg whitespace-nowrap"
                          style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>✨ Promuj</button>
                  <div className="font-display text-lg font-semibold whitespace-nowrap">{zl(o.price_gross)}</div>
                </div>
              ))}
              {offers.length === 0 && <p style={{ color: "var(--mut)" }}>Brak ofert. Wystaw pierwszą po lewej.</p>}
            </div>
          </div>
        </div>

        {/* zamówienia sprzedawcy */}
        <div>
          <h2 className="font-semibold text-lg mb-3">Zamówienia ({sorders.length})</h2>
          <div className="flex flex-col gap-2">
            {sorders.map((o) => (
              <div key={o.order_id} className="rounded-xl p-4" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm" style={{ color: "var(--mut)" }}>
                    {new Date(o.created_at).toLocaleString("pl-PL")} · {({ paid: "Opłacone", shipped: "Wysłane", delivered: "Dostarczone", completed: "Zakończone" } as any)[o.status] ?? o.status}
                    {o.tracking_no && <> · {o.tracking_no}</>}
                  </span>
                  {o.status === "paid"
                    ? <button onClick={() => onShip(o.order_id)} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-black" style={{ background: "linear-gradient(135deg,#F2731D,#E0A21B)" }}>Oznacz wysłane</button>
                    : <span className="text-xs" style={{ color: "var(--green)" }}>✓</span>}
                </div>
                <div className="flex flex-col gap-0.5">
                  {(o.items ?? []).map((it: any, i: number) => (
                    <div key={i} className="flex justify-between text-sm"><span>{it.title} × {it.qty}</span><span style={{ color: "var(--mut)" }}>{zl(it.payout)}</span></div>
                  ))}
                </div>
                <div className="text-right text-sm mt-2 pt-2" style={{ borderTop: "1px solid var(--line)" }}>Twoje netto: <b style={{ color: "var(--green)" }}>{zl(o.my_total)}</b></div>
              </div>
            ))}
            {sorders.length === 0 && <p style={{ color: "var(--mut)" }}>Brak zamówień.</p>}
          </div>
        </div>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 backdrop-blur" style={{ background: "rgba(7,7,15,.72)", borderBottom: "1px solid var(--line)" }}>
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center gap-3">
          <a href="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl grid place-items-center text-lg" style={{ background: "linear-gradient(135deg,#F2731D,#E0A21B)" }}>☀</div>
            <span className="font-display text-xl font-semibold">Sunrise Market</span>
          </a>
          <div className="flex-1" />
          <button onClick={() => { setMode("buyer"); window.location.href = "/"; }}
                  className="text-sm font-semibold px-3 py-1.5 rounded-lg text-black"
                  style={{ background: "linear-gradient(135deg,#F2731D,#D9560C)" }}>🛍️ Przełącz na konto klienta</button>
          <a href="/sprzedawca/rozliczenia" className="text-sm text-zinc-300 hover:text-white hidden sm:block">Rozliczenia</a>
          <a href="/konto" className="text-sm text-zinc-300 hover:text-white">Konto</a>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
