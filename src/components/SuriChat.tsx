// Asystent Suri w Sunrise Market (decyzja właściciela 2026-09-06): Suri jest mózgiem operacyjnym ekosystemu, w Market
// działa jej asystent — „Sunny”. Pływający przycisk na każdej stronie klienta (nad dolnym paskiem aplikacji), arkusz od dołu
// na telefonie / okno w rogu na desktopie, szybkie podpowiedzi, karty ofert z bazy (suri_recommend), pamięć rozmowy
// (suri_sessions / suri_messages). Nazwa persony w jednym miejscu: ASSISTANT_NAME.
import { useEffect, useRef, useState } from "react";
import { askSuri, suriHistory } from "../lib/api";
import { supabase } from "../lib/supabase";
import { zl } from "../lib/money";

export const ASSISTANT_NAME = "Sunny";
type Msg = { role: "user" | "suri"; text: string };
type Rec = { offer_id: string; title: string; price: number; reason?: string };
const GREETING: Msg = { role: "suri", text: `Cześć, jestem ${ASSISTANT_NAME} — asystent Suri w Sunrise Market ☀️ Powiedz, czego szukasz albo o co chcesz zapytać: znajdę oferty, wyjaśnię płatność, cashback, Ochronę Kupujących czy rezerwację.` };
const QUICK = ["Szukam auta do 20 tys. zł", "Fotowoltaika do domu", "Wynajem auta na weekend", "Jak działa Ochrona Kupujących?", "Ile wynosi cashback?"];

function guestSid(): string {
  try {
    let s = localStorage.getItem("suri_sid");
    if (!s) { s = crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 0x3) | 0x8).toString(16); }); localStorage.setItem("suri_sid", s); }
    return s;
  } catch { return ""; }
}

function SunIcon({ size = 26 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>;
}

export default function SuriChat({ initialPrompt }: { initialPrompt?: string }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([GREETING]);
  const [recs, setRecs] = useState<Rec[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const sidRef = useRef(""); const uidRef = useRef<string | undefined>(undefined);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scroll = () => setTimeout(() => boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight, behavior: "smooth" }), 60);

  useEffect(() => {
    let alive = true;
    (async () => {
      let sid = "";
      try { const { data: { user } } = await supabase.auth.getUser(); uidRef.current = user?.id; sid = user?.id || guestSid(); } catch { sid = guestSid(); }
      if (!alive) return; sidRef.current = sid; if (!sid) return;
      try { const hist = await suriHistory(sid); if (alive && hist.length) { setMsgs([GREETING, ...hist.slice(-12).map((h) => ({ role: h.role === "user" ? "user" : "suri", text: h.content } as Msg))]); } } catch { /* brak historii */ }
    })();
    const onOpen = (e: Event) => { setOpen(true); const q = (e as CustomEvent).detail?.prompt; if (q) setTimeout(() => send(String(q)), 80); };
    window.addEventListener("sunrise-open-assistant", onOpen);
    return () => { alive = false; window.removeEventListener("sunrise-open-assistant", onOpen); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) { scroll(); setTimeout(() => inputRef.current?.focus(), 150); if (initialPrompt && msgs.length === 1) send(initialPrompt); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send(text?: string) {
    const m = (text ?? input).trim();
    if (!m || busy) return;
    setInput(""); setMsgs((x) => [...x, { role: "user", text: m }]); setBusy(true); scroll();
    try {
      const res = await askSuri(m, sidRef.current || undefined, uidRef.current);
      setMsgs((x) => [...x, { role: "suri", text: res.reply ?? "…" }]);
      setRecs((res.offers ?? []).map((o: any) => ({ offer_id: o.offer_id, title: o.title, price: Number(o.price), reason: o.reason })));
    } catch { setMsgs((x) => [...x, { role: "suri", text: "Ups, nie udało się połączyć. Spróbuj ponownie." }]); }
    finally { setBusy(false); scroll(); }
  }

  return <>
    <button type="button" onClick={() => setOpen((o) => !o)} aria-label={open ? "Zamknij asystenta" : `${ASSISTANT_NAME} — asystent Suri`} aria-expanded={open}
      className="fixed right-4 z-[45] grid h-14 w-14 place-items-center rounded-full text-black shadow-2xl transition active:scale-95 sm:bottom-6 sm:right-6"
      style={{ bottom: "calc(84px + env(safe-area-inset-bottom))", background: "linear-gradient(135deg,#F5A623,#E8891A)", boxShadow: "0 12px 30px -8px rgba(232,137,26,.75)" }}>
      {open ? <span className="text-2xl leading-none">×</span> : <SunIcon />}
    </button>

    {open && <div role="dialog" aria-label={`${ASSISTANT_NAME} — asystent Suri`} className="fixed inset-x-0 z-[46] flex max-h-[78dvh] flex-col overflow-hidden rounded-t-3xl sm:inset-auto sm:!bottom-24 sm:right-6 sm:h-[560px] sm:w-[380px] sm:rounded-3xl" style={{ bottom: "calc(72px + env(safe-area-inset-bottom))", background: "var(--bg)", border: "1px solid var(--line)", boxShadow: "0 30px 80px rgba(0,0,0,.5)" }}>
      <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--line)" }}>
        <div className="grid h-10 w-10 place-items-center rounded-full text-black" style={{ background: "linear-gradient(135deg,#F5A623,#E8891A)" }}><SunIcon size={22} /></div>
        <div className="min-w-0 flex-1"><div className="font-semibold leading-tight">{ASSISTANT_NAME}</div><div className="text-[11px]" style={{ color: "var(--mut)" }}>asystent Suri · Sunrise Market</div></div>
        <button type="button" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-lg text-xl" style={{ color: "var(--mut)" }} aria-label="Zamknij">×</button>
      </div>

      <div ref={boxRef} className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 py-3">
        {msgs.map((m, i) => <div key={i} className={`max-w-[88%] whitespace-pre-line rounded-2xl px-3 py-2 text-sm leading-5 ${m.role === "user" ? "self-end text-black" : "self-start"}`} style={m.role === "user" ? { background: "linear-gradient(135deg,#F5A623,#E8891A)" } : { background: "var(--glass)", border: "1px solid var(--line)", color: "var(--ink)" }}>{m.text}</div>)}
        {busy && <div className="self-start px-2 text-xs" style={{ color: "var(--mut)" }}>{ASSISTANT_NAME} pisze…</div>}
        {recs.length > 0 && <div className="mt-1 flex flex-col gap-2">{recs.map((r) => <a key={r.offer_id} href={`/produkt/${r.offer_id}`} className="flex items-center justify-between gap-2 rounded-xl p-2.5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
          <div className="min-w-0"><div className="truncate text-sm font-medium">{r.title}</div>{r.reason && <div className="truncate text-[11px]" style={{ color: "var(--mut)" }}>{r.reason}</div>}</div>
          <div className="shrink-0 font-semibold" style={{ color: "var(--gold)" }}>{zl(r.price)}</div>
        </a>)}</div>}
        {msgs.length <= 1 && <div className="mt-1 flex flex-wrap gap-2">{QUICK.map((q) => <button key={q} type="button" onClick={() => send(q)} className="rounded-full px-3 py-1.5 text-xs font-medium" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>{q}</button>)}</div>}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex gap-2 p-3 pb-[max(.75rem,env(safe-area-inset-bottom))]" style={{ borderTop: "1px solid var(--line)" }}>
        <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} placeholder={`Napisz do ${ASSISTANT_NAME}…`} aria-label="Wiadomość" enterKeyHint="send" className="min-w-0 flex-1 rounded-xl px-3 py-2.5 text-base outline-none sm:text-sm" style={{ background: "var(--glass)", border: "1px solid var(--line)", color: "var(--ink)" }} />
        <button type="submit" disabled={busy || !input.trim()} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl font-bold text-black disabled:opacity-40" style={{ background: "linear-gradient(135deg,#F5A623,#E8891A)" }} aria-label="Wyślij">→</button>
      </form>
    </div>}
  </>;
}
