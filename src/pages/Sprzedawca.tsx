import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { getMySeller } from "../lib/payments";
import { becomeSeller, myOffers, createOffer, topCategories, childCategories } from "../lib/api";

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
    if (s) setOffers((await myOffers()) as Off[]);
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
    e.preventDefault(); setBusy(true); setMsg(null);
    try { await becomeSeller(legalName, nip); await refresh(); setMsg("Konto sprzedawcy aktywne."); }
    catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
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
      await createOffer({ title, description: desc, price, stock, categorySlug: chosen.slug });
      setTitle(""); setDesc(""); setPrice(0); setStock(1);
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
          <button disabled={busy} className="rounded-xl py-2 font-semibold text-black" style={{ background: "linear-gradient(135deg,#F2731D,#E0A21B)" }}>{busy ? "…" : "Aktywuj konto sprzedawcy"}</button>
        </form>
      ) : (
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
            <p className="text-xs" style={{ color: "var(--mut)" }}>Kategoria: {chosen?.name ?? "—"}. Prowizja platformy 7,9%.</p>
            <button disabled={busy} className="rounded-xl py-2 font-semibold text-black" style={{ background: "linear-gradient(135deg,#F2731D,#D9560C)" }}>{busy ? "…" : "Wystaw"}</button>
          </form>

          {/* moje oferty */}
          <div>
            <h2 className="font-semibold text-lg mb-3">Twoje oferty ({offers.length})</h2>
            <div className="flex flex-col gap-2">
              {offers.map((o) => (
                <a key={o.offer_id} href={`/produkt/${o.offer_id}`} className="flex items-center justify-between rounded-xl p-3 hover:border-amber-500/40"
                   style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
                  <div>
                    <div className="font-medium">{o.title}</div>
                    <div className="text-xs" style={{ color: "var(--mut)" }}>{o.category} · {o.stock} szt.</div>
                  </div>
                  <div className="font-display text-lg font-semibold">{zl(o.price_gross)}</div>
                </a>
              ))}
              {offers.length === 0 && <p style={{ color: "var(--mut)" }}>Brak ofert. Wystaw pierwszą po lewej.</p>}
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
          <a href="/sprzedawca/rozliczenia" className="text-sm text-zinc-300 hover:text-white">Rozliczenia</a>
          <a href="/" className="text-sm text-zinc-300 hover:text-white">← Sklep</a>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
