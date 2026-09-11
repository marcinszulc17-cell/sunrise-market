// Synchronizacja kalendarzy (iCal) dla ofert rezerwacyjnych.
//
// Dwie strony tej samej sprawy:
//  • EKSPORT — nasz link .ics, który właściciel wkleja w Bookingu/Airbnb/Nocowaniu,
//    żeby tam zablokowały się terminy zajęte u nas.
//  • IMPORT — linki z tamtych portali wklejone u nas; zajęte terminy przychodzą
//    jako blokady, więc klient nie kupi doby, która jest już sprzedana gdzie indziej.
//
// Świadomie mówimy wprost, że to nie jest natychmiastowe: portale odświeżają takie
// kalendarze co kilkadziesiąt minut i przenoszą TERMINY, nie ceny.
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Feed = {
  id: string;
  url: string;
  label: string | null;
  active: boolean;
  last_sync_at: string | null;
  last_status: string | null;
  last_error: string | null;
  last_event_count: number | null;
};

type Row = {
  offer_id: string;
  title: string;
  ical_token: string;
  feeds: Feed[];
  imported_blocks: number;
};

const exportUrl = (offerId: string, token: string) =>
  `${window.location.origin}/api/ical?offer=${offerId}&token=${token}`;

function when(iso: string | null) {
  if (!iso) return "jeszcze nie pobrany";
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "przed chwilą";
  if (mins < 60) return `${mins} min temu`;
  if (mins < 1440) return `${Math.round(mins / 60)} godz. temu`;
  return d.toLocaleString("pl-PL");
}

export default function SellerIcalPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  async function load() {
    const { data, error } = await supabase.rpc("seller_ical_overview");
    if (!error) setRows((data || []) as Row[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
    } catch {
      setMsg("Nie udało się skopiować — zaznacz link i skopiuj ręcznie.");
    }
  }

  async function addFeed(offerId: string) {
    const clean = url.trim();
    if (!clean) { setMsg("Wklej link do kalendarza."); return; }
    setBusy(true); setMsg("");
    const { error } = await supabase.rpc("seller_ical_feed_add", {
      p_offer: offerId, p_url: clean, p_label: label.trim() || null,
    });
    if (error) { setMsg(error.message); setBusy(false); return; }
    setUrl(""); setLabel("");
    await sync(offerId, true);
  }

  async function removeFeed(id: string) {
    setBusy(true); setMsg("");
    const { error } = await supabase.rpc("seller_ical_feed_delete", { p_id: id });
    if (error) setMsg(error.message);
    else setMsg("Kalendarz odpięty. Blokady, które z niego przyszły, zostały usunięte.");
    await load(); setBusy(false);
  }

  async function sync(offerId: string, quiet = false) {
    setBusy(true); if (!quiet) setMsg("");
    const { data, error } = await supabase.functions.invoke("ical", { body: { offer_id: offerId } });
    if (error) setMsg("Nie udało się pobrać kalendarzy: " + error.message);
    else {
      const r = data as { feeds: number; synced: number; failed: number; events: number; errors?: string[] };
      setMsg(
        r.failed
          ? `Pobrano ${r.synced} z ${r.feeds} kalendarzy. Nieudane: ${r.failed}. ${(r.errors || []).join("; ")}`
          : `Pobrano ${r.synced} kalendarzy, zajętych terminów: ${r.events}.`,
      );
    }
    await load(); setBusy(false);
  }

  async function resetToken(offerId: string) {
    setBusy(true);
    const { error } = await supabase.rpc("seller_ical_token_reset", { p_offer: offerId });
    setMsg(error ? error.message : "Nowy link wygenerowany. Stary przestał działać — wklej nowy w portalach.");
    await load(); setBusy(false);
  }

  if (loading) return null;
  if (!rows.length) return null;

  return (
    <div className="mb-6 rounded-2xl p-5" style={{ background: "var(--card)", border: "1px solid var(--line)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">Synchronizacja kalendarzy (iCal)</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>
            Wymiana zajętych terminów z Bookingiem, Airbnb i innymi portalami. Przenoszą się terminy, nie ceny.
          </p>
        </div>
      </div>

      {msg && (
        <div className="mt-4 rounded-xl p-3 text-sm" style={{ background: "rgba(232,137,26,.12)", border: "1px solid rgba(232,137,26,.25)" }}>
          {msg}
        </div>
      )}

      <div className="mt-4 grid gap-3">
        {rows.map((r) => {
          const link = exportUrl(r.offer_id, r.ical_token);
          const isOpen = open === r.offer_id;
          return (
            <div key={r.offer_id} className="rounded-xl p-4" style={{ border: "1px solid var(--line)" }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{r.title}</div>
                  <div className="text-xs" style={{ color: "var(--mut)" }}>
                    Podpięte kalendarze: {r.feeds.length} · terminy zajęte z zewnątrz: {r.imported_blocks}
                  </div>
                </div>
                <button
                  onClick={() => setOpen(isOpen ? null : r.offer_id)}
                  className="rounded-xl px-3 py-1.5 text-sm font-semibold"
                  style={{ border: "1px solid var(--line)" }}
                >
                  {isOpen ? "Zwiń" : "Ustaw"}
                </button>
              </div>

              {isOpen && (
                <div className="mt-4 grid gap-4">
                  {/* EKSPORT */}
                  <div>
                    <div className="text-sm font-semibold">1. Nasz kalendarz — wklej ten link w portalu</div>
                    <p className="mt-1 text-xs" style={{ color: "var(--mut)" }}>
                      W Bookingu: Kalendarz → Synchronizacja kalendarzy → Dodaj połączony kalendarz.
                      W Airbnb: Kalendarz → Dostępność → Synchronizuj kalendarze.
                      Ten link zawiera tylko zajęte daty — bez nazwisk gości i bez kwot.
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input
                        readOnly
                        value={link}
                        onFocus={(e) => e.currentTarget.select()}
                        className="min-w-0 flex-1 rounded-xl px-3 py-2 text-xs"
                        style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
                      />
                      <button
                        onClick={() => copy(link, r.offer_id)}
                        className="rounded-xl px-3 py-2 text-sm font-semibold"
                        style={{ border: "1px solid var(--gold)", color: "var(--gold)" }}
                      >
                        {copied === r.offer_id ? "Skopiowano" : "Kopiuj"}
                      </button>
                      <button
                        onClick={() => resetToken(r.offer_id)}
                        disabled={busy}
                        className="rounded-xl px-3 py-2 text-xs"
                        style={{ border: "1px solid var(--line)", color: "var(--mut)" }}
                      >
                        Wygeneruj nowy link
                      </button>
                    </div>
                  </div>

                  {/* IMPORT */}
                  <div>
                    <div className="text-sm font-semibold">2. Kalendarze z innych portali — wklej je u nas</div>
                    <p className="mt-1 text-xs" style={{ color: "var(--mut)" }}>
                      Skopiuj w tamtym portalu link „eksportuj kalendarz" (adres kończy się na .ics) i wklej poniżej.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <input
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://… .ics"
                        className="min-w-0 flex-1 rounded-xl px-3 py-2 text-sm"
                        style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
                      />
                      <input
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        placeholder="Nazwa (np. Booking)"
                        className="w-44 rounded-xl px-3 py-2 text-sm"
                        style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
                      />
                      <button
                        onClick={() => addFeed(r.offer_id)}
                        disabled={busy}
                        className="rounded-xl px-4 py-2 text-sm font-semibold"
                        style={{ background: "var(--gold)", color: "#1a1205" }}
                      >
                        Dodaj
                      </button>
                    </div>

                    {r.feeds.length > 0 && (
                      <div className="mt-3 grid gap-2">
                        {r.feeds.map((f) => (
                          <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs" style={{ background: "var(--bg)", border: "1px solid var(--line)" }}>
                            <div className="min-w-0">
                              <div className="font-semibold">{f.label || "Kalendarz zewnętrzny"}</div>
                              <div className="truncate" style={{ color: "var(--mut)" }}>{f.url}</div>
                              <div style={{ color: f.last_status === "error" ? "#ef4444" : "var(--mut)" }}>
                                {f.last_status === "error"
                                  ? `Błąd pobierania (${when(f.last_sync_at)}): ${f.last_error}`
                                  : `Ostatnie pobranie: ${when(f.last_sync_at)}${f.last_event_count != null ? ` · zajętych terminów: ${f.last_event_count}` : ""}`}
                              </div>
                            </div>
                            <button
                              onClick={() => removeFeed(f.id)}
                              disabled={busy}
                              className="rounded-lg px-3 py-1.5 font-semibold"
                              style={{ border: "1px solid var(--line)" }}
                            >
                              Odepnij
                            </button>
                          </div>
                        ))}
                        <div>
                          <button
                            onClick={() => sync(r.offer_id)}
                            disabled={busy}
                            className="rounded-xl px-4 py-2 text-sm font-semibold"
                            style={{ border: "1px solid var(--gold)", color: "var(--gold)" }}
                          >
                            {busy ? "Pobieram…" : "Pobierz teraz"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <p className="text-xs" style={{ color: "var(--mut)" }}>
                    Uwaga: żaden portal nie synchronizuje się natychmiast — odświeżenie po obu stronach trwa
                    zwykle od kilkunastu minut do godziny. Przy terminach last minute pilnuj kalendarza ręcznie.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
