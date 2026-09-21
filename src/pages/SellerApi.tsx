// Panel sprzedawcy → Integracje: klucze do publicznego API Sunrise Market.
//
// Klucz pokazujemy JEDEN RAZ, przy tworzeniu. W bazie leży tylko jego skrót, więc nie
// umiemy go odtworzyć i nikt — łącznie z nami — nie odczyta go później z panelu.
// To nie jest niedoróbka, tylko jedyny sposób, żeby wyciek bazy nie oznaczał wycieku kluczy.
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { SiteHeader, Breadcrumbs } from "../components/home/SiteChrome";
import { GOLD_GRAD, CARD } from "../components/home/HomeShared";
import { useSeo } from "../lib/seo";

type Klucz = { id: string; nazwa: string; prefiks: string; zakres: string[]; limit_ofert: number; created_at: string; last_used_at: string | null; revoked_at: string | null };

export default function SellerApi() {
  const [klucze, setKlucze] = useState<Klucz[] | null>(null);
  const [nazwa, setNazwa] = useState("");
  const [limit, setLimit] = useState(500);
  const [nowy, setNowy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [zajety, setZajety] = useState(false);

  useSeo("Klucze API — Sunrise Market", "Integracja zewnętrznej platformy z Sunrise Market: klucze API, limity i dokumentacja.", "/sprzedawca/api");

  async function wczytaj() {
    const { data, error } = await supabase.from("moje_klucze_api").select("*").order("created_at", { ascending: false });
    if (error) { setErr(error.message); setKlucze([]); return; }
    setKlucze((data as Klucz[]) ?? []);
  }
  useEffect(() => { wczytaj(); }, []);

  async function utworz() {
    setErr(null); setZajety(true);
    const { data, error } = await supabase.rpc("utworz_klucz_api", { p_nazwa: nazwa, p_limit_ofert: limit });
    setZajety(false);
    if (error) { setErr(error.message); return; }
    setNowy(data as string); setNazwa(""); wczytaj();
  }
  async function odwolaj(id: string) {
    const { error } = await supabase.rpc("odwolaj_klucz_api", { p_id: id });
    if (error) { setErr(error.message); return; }
    wczytaj();
  }

  return <main className="min-h-screen pb-16" style={{ background: "var(--bg)", color: "var(--ink)" }}>
    <SiteHeader back />
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <Breadcrumbs back="/sprzedawca" items={[{ label: "Sprzedawca", to: "/sprzedawca" }, { label: "Integracje" }]} />
      <h1 className="mt-4 font-display text-3xl font-semibold">Klucze API</h1>
      <p className="mt-2 text-sm leading-6" style={{ color: "var(--mut)" }}>
        Kluczem API zewnętrzna platforma — Twój sklep, hurtownia albo integrator — wystawia u Ciebie
        oferty i odbiera zamówienia bez logowania się do panelu. Jeden klucz to jedno połączenie:
        jeśli przestaniesz z kimś współpracować, odwołujesz tylko jego klucz.
        {" "}<a href="/api-sprzedawcy" className="underline" style={{ color: "var(--gold)" }}>Dokumentacja dla programisty</a>.
      </p>

      {nowy && <div className="mt-5 rounded-2xl p-4" style={{ background: "rgba(122,184,154,.10)", border: "1px solid rgba(122,184,154,.35)" }}>
        <div className="font-semibold">Skopiuj klucz teraz — drugi raz go nie pokażemy</div>
        <code className="mt-2 block break-all rounded-xl p-3 text-sm" style={{ background: "var(--header)", border: "1px solid var(--line)" }}>{nowy}</code>
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={() => navigator.clipboard?.writeText(nowy)} className="rounded-xl px-3 py-2 text-sm font-semibold" style={CARD}>Kopiuj</button>
          <button type="button" onClick={() => setNowy(null)} className="rounded-xl px-3 py-2 text-sm" style={CARD}>Mam go, zamknij</button>
        </div>
        <p className="mt-2 text-xs" style={{ color: "var(--mut)" }}>
          Trzymamy wyłącznie skrót klucza, więc nie odtworzymy go ani my, ani nikt, kto dostałby się do bazy.
        </p>
      </div>}

      <div className="mt-6 rounded-2xl p-5" style={CARD}>
        <div className="font-semibold">Nowy klucz</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_160px_auto]">
          <label className="text-sm">Nazwa połączenia
            <input value={nazwa} onChange={(e) => setNazwa(e.target.value)} placeholder="np. Gapli" className="mt-1 w-full rounded-xl px-3 py-2 text-sm outline-none" style={{ background: "var(--header)", border: "1px solid var(--line)", color: "var(--ink)" }} />
          </label>
          <label className="text-sm">Limit ofert
            <input type="number" min={1} max={20000} value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="mt-1 w-full rounded-xl px-3 py-2 text-sm outline-none" style={{ background: "var(--header)", border: "1px solid var(--line)", color: "var(--ink)" }} />
          </label>
          <button type="button" disabled={zajety} onClick={utworz} className="mt-6 h-10 rounded-xl px-4 text-sm font-bold text-black disabled:opacity-60" style={{ background: GOLD_GRAD }}>
            {zajety ? "Tworzę…" : "Utwórz klucz"}
          </button>
        </div>
        <p className="mt-2 text-xs" style={{ color: "var(--mut)" }}>
          Limit ofert to bezpiecznik: integrator z katalogiem na milion pozycji nie zaleje Marketu jednym wywołaniem.
          Zacznij od kilkuset i podnieś, gdy zobaczysz, że sprzedaż idzie.
        </p>
      </div>

      {err && <div className="mt-4 rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(239,68,68,.10)", color: "#fca5a5" }}>{err}</div>}

      <div className="mt-6 space-y-3">
        {klucze === null && <div className="text-sm" style={{ color: "var(--mut)" }}>Wczytuję…</div>}
        {klucze?.length === 0 && <div className="rounded-2xl p-5 text-sm" style={{ ...CARD, color: "var(--mut)" }}>Nie masz jeszcze żadnego klucza.</div>}
        {klucze?.map((k) => <div key={k.id} className="flex flex-wrap items-center gap-3 rounded-2xl p-4" style={CARD}>
          <div className="min-w-0 flex-1">
            <div className="font-medium">{k.nazwa} {k.revoked_at && <span className="text-xs" style={{ color: "var(--mut)" }}>— odwołany</span>}</div>
            <div className="text-xs" style={{ color: "var(--mut)" }}>
              {k.prefiks}… · limit {k.limit_ofert} ofert · {k.last_used_at ? `ostatnio użyty ${new Date(k.last_used_at).toLocaleString("pl-PL")}` : "jeszcze nieużywany"}
            </div>
          </div>
          {!k.revoked_at && <button type="button" onClick={() => odwolaj(k.id)} className="rounded-xl px-3 py-2 text-sm font-semibold" style={CARD}>Odwołaj</button>}
        </div>)}
      </div>
    </div>
  </main>;
}
