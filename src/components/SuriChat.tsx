import { useEffect, useRef, useState } from "react";
import { askSuri, suriHistory } from "../lib/api";
import { supabase } from "../lib/supabase";

type Msg = { role: "user" | "suri"; text: string };
type Rec = { offer_id: string; title: string; price: number; reason?: string };

const zl = (v: number) => Math.round(v).toLocaleString("pl-PL") + " zł";
const SURI_AVATAR = "https://www.mysunrise.com.pl/assets/suri-fab-face-CdFEf7im.png";
const GREETING: Msg = { role: "suri", text: "Hej, tu Suri ☀️ Twoja ekspertka Sunrise Market. Powiedz, czego szukasz — dobiorę najlepszą okazję, a płacisz wygodnie portfelem Sunrise Pay i zgarniasz punkty!" };

// Stały identyfikator rozmowy: dla zalogowanych = ich user id (pamięć też między
// urządzeniami), dla gości = UUID zapisany w przeglądarce (pamięć po zamknięciu).
function guestSid(): string {
  try {
    let s = localStorage.getItem("suri_sid");
    if (!s) {
      s = (crypto as any)?.randomUUID ? crypto.randomUUID()
        : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0; const v = c === "x" ? r : (r & 0x3) | 0x8; return v.toString(16);
          });
      localStorage.setItem("suri_sid", s);
    }
    return s;
  } catch {
    return "";
  }
}

export default function SuriChat() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([GREETING]);
  const [recs, setRecs] = useState<Rec[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const sidRef = useRef<string>("");
  const uidRef = useRef<string | undefined>(undefined);
  const boxRef = useRef<HTMLDivElement>(null);

  function scroll() { setTimeout(() => boxRef.current?.scrollTo(0, boxRef.current.scrollHeight), 50); }

  // Ustal sesję i wczytaj historię rozmowy (raz, przy montowaniu).
  useEffect(() => {
    let alive = true;
    (async () => {
      let sid = "";
      try {
        const { data: { user } } = await supabase.auth.getUser();
        uidRef.current = user?.id;
        sid = user?.id || guestSid();
      } catch {
        sid = guestSid();
      }
      if (!alive) return;
      sidRef.current = sid;
      if (!sid) return;
      try {
        const hist = await suriHistory(sid);
        if (!alive || !hist.length) return;
        setMsgs([GREETING, ...hist.map((h) => ({ role: h.role === "user" ? "user" : "suri", text: h.content } as Msg))]);
        scroll();
      } catch { /* brak historii */ }
    })();
    return () => { alive = false; };
  }, []);

  async function send() {
    const m = input.trim();
    if (!m || busy) return;
    setInput(""); setMsgs((x) => [...x, { role: "user", text: m }]); setBusy(true); scroll();
    try {
      const res = await askSuri(m, sidRef.current || undefined, uidRef.current);
      setMsgs((x) => [...x, { role: "suri", text: res.reply ?? "…" }]);
      setRecs((res.offers ?? []).map((o: any) => ({ offer_id: o.offer_id, title: o.title, price: o.price, reason: o.reason })));
    } catch (e) {
      setMsgs((x) => [...x, { role: "suri", text: "Ups, nie udało się połączyć. Spróbuj ponownie." }]);
    } finally { setBusy(false); scroll(); }
  }

  return (
    <>
      {/* bąbel */}
      <button onClick={() => setOpen((o) => !o)}
        className="fixed bottom-5 right-5 z-40 w-16 h-16 rounded-full grid place-items-center overflow-hidden shadow-xl"
        style={{ border: "2px solid #F2731D", boxShadow: "0 10px 30px -8px rgba(242,115,29,.7)", background: "#12121e" }}
        aria-label="Suri — ekspertka Sunrise">
        {open ? <span className="text-2xl">✕</span>
              : <img src={SURI_AVATAR} alt="Suri" className="w-full h-full object-cover" />}
      </button>

      {open && (
        <div className="fixed bottom-24 right-5 z-40 w-[360px] max-w-[92vw] rounded-2xl overflow-hidden flex flex-col"
             style={{ background: "rgba(12,12,24,.96)", border: "1px solid var(--line)", height: 520, backdropFilter: "blur(8px)" }}>
          {/* header */}
          <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid var(--line)" }}>
            <img src={SURI_AVATAR} alt="Suri" className="w-9 h-9 rounded-full object-cover" style={{ border: "1px solid var(--line)" }} />
            <div>
              <div className="font-semibold text-sm">Suri</div>
              <div className="text-[11px]" style={{ color: "var(--green)" }}>● ekspertka Sunrise Market</div>
            </div>
          </div>

          {/* wiadomości */}
          <div ref={boxRef} className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2">
            {msgs.map((m, i) => (
              <div key={i} className={"max-w-[85%] rounded-2xl px-3 py-2 text-sm " + (m.role === "user" ? "self-end text-black" : "self-start")}
                   style={m.role === "user"
                     ? { background: "linear-gradient(135deg,#F2731D,#E0A21B)" }
                     : { background: "var(--glass)", border: "1px solid var(--line)", color: "var(--ink)" }}>
                {m.text}
              </div>
            ))}
            {busy && <div className="self-start text-xs px-2" style={{ color: "var(--mut)" }}>Suri pisze…</div>}

            {recs.length > 0 && (
              <div className="flex flex-col gap-2 mt-1">
                {recs.map((r) => (
                  <a key={r.offer_id} href={`/produkt/${r.offer_id}`}
                     className="rounded-xl p-2 flex items-center justify-between gap-2"
                     style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{r.title}</div>
                      {r.reason && <div className="text-[11px] truncate" style={{ color: "var(--mut)" }}>{r.reason}</div>}
                    </div>
                    <div className="font-display font-semibold whitespace-nowrap">{zl(r.price)}</div>
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* input */}
          <div className="p-3 flex gap-2" style={{ borderTop: "1px solid var(--line)" }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()}
                   placeholder="Zapytaj Suri…" className="flex-1 rounded-xl px-3 py-2 text-sm bg-zinc-900 outline-none" />
            <button onClick={send} disabled={busy} className="px-4 rounded-xl font-semibold text-black disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg,#F2731D,#D9560C)" }}>→</button>
          </div>
        </div>
      )}
    </>
  );
}
