// Wiadomości (decyzja właściciela 2026-09-06): rozmowy kupujący ↔ sprzedawca per oferta. Lista wątków po lewej, wątek po prawej
// (na telefonie: lista → wątek). RPC my_conversations / conversation_messages (oznacza przeczytane) / send_message.
// Wejście: /wiadomosci?w=<conversation_id> (z powiadomienia lub po „Napisz do sprzedawcy”). Odświeżanie co 15 s.
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { myConversations, conversationMessages, sendMessage, type Conversation, type Message } from "../lib/api";
import { zl } from "../lib/money";
import { Ico, GOLD_GRAD, CARD, HomeFooter, timeAgo } from "../components/home/HomeShared";
import { SiteHeader, Breadcrumbs } from "../components/home/SiteChrome";

export default function Wiadomosci() {
  const navigate = useNavigate();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [list, setList] = useState<Conversation[] | null>(null);
  const [active, setActive] = useState<string | null>(() => new URLSearchParams(window.location.search).get("w"));
  const [msgs, setMsgs] = useState<Message[] | null>(null);
  const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  async function loadList() { try { setList(await myConversations()); } catch { setList([]); } }
  async function loadThread(id: string) { try { setMsgs(await conversationMessages(id)); } catch (e) { setErr((e as Error).message); } }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (!data.session) { setAuthed(false); return; } setAuthed(true); loadList(); });
  }, []);
  useEffect(() => { if (!authed || !active) { setMsgs(null); return; } loadThread(active); const t = setInterval(() => { loadThread(active); loadList(); }, 15000); return () => clearInterval(t); }, [authed, active]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [msgs?.length]);

  function open(id: string) { setActive(id); setErr(null); navigate(`/wiadomosci?w=${id}`, { replace: true }); }
  async function send(e: React.FormEvent) {
    e.preventDefault(); if (!active || !text.trim()) return; setBusy(true); setErr(null);
    try { await sendMessage(active, text.trim()); setText(""); await loadThread(active); await loadList(); } catch (e2) { setErr((e2 as Error).message); } finally { setBusy(false); }
  }
  const conv = list?.find((c) => c.conversation_id === active) ?? null;

  return <main className="min-h-screen pb-24 sm:pb-0" style={{ background: "var(--bg)", color: "var(--ink)" }}>
    <SiteHeader />
    <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 xl:px-10">
      <Breadcrumbs items={[{ label: "Strona główna", to: "/" }, { label: "Moje konto", to: "/konto" }, { label: "Wiadomości" }]} />
      <h1 className="mt-4 text-3xl font-bold">Wiadomości</h1>
      {authed === false ? <div className="mt-5 rounded-2xl p-6" style={CARD}><div className="font-semibold">Zaloguj się, aby zobaczyć wiadomości</div><a href={`/login?next=${encodeURIComponent("/wiadomosci")}`} className="mt-4 inline-flex h-11 items-center rounded-xl px-4 text-sm font-bold" style={{ background: GOLD_GRAD, color: "#101012" }}>Zaloguj się</a></div>
      : <div className="mt-5 grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        {/* Lista wątków */}
        <aside className={`${active ? "hidden lg:block" : ""} h-fit rounded-2xl`} style={CARD}>
          {list === null ? <div className="p-5 text-sm" style={{ color: "var(--mut)" }}>Wczytuję…</div>
          : list.length === 0 ? <div className="p-5 text-sm" style={{ color: "var(--mut)" }}>Nie masz jeszcze żadnych rozmów. Na stronie oferty kliknij <b style={{ color: "var(--ink)" }}>Napisz do sprzedawcy</b>.</div>
          : <ul className="max-h-[70vh] overflow-y-auto">{list.map((c) => <li key={c.conversation_id}><button type="button" onClick={() => open(c.conversation_id)} className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-white/5" style={{ background: c.conversation_id === active ? "rgba(245,166,35,.1)" : "transparent", borderBottom: "1px solid var(--line)" }}>
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg" style={{ background: "var(--header)" }}>{c.offer_image && <img src={c.offer_image} alt="" className="h-full w-full object-cover" />}</div>
            <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="truncate text-sm font-bold">{c.counterpart}</span><span className="ml-auto shrink-0 text-[11px]" style={{ color: "var(--mut)" }}>{timeAgo(c.last_message_at)}</span></div><div className="truncate text-xs" style={{ color: "var(--gold)" }}>{c.offer_title}</div><div className="truncate text-xs" style={{ color: "var(--mut)" }}>{c.last_preview}</div></div>
            {c.unread > 0 && <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1.5 text-[11px] font-bold" style={{ background: "var(--gold)", color: "#101012" }}>{c.unread}</span>}
          </button></li>)}</ul>}
        </aside>

        {/* Wątek */}
        <section className={`${active ? "" : "hidden lg:flex"} flex min-h-[60vh] flex-col rounded-2xl`} style={CARD}>
          {!conv ? <div className="grid flex-1 place-items-center p-8 text-sm" style={{ color: "var(--mut)" }}>{active && list && list.length > 0 ? "Wczytuję rozmowę…" : "Wybierz rozmowę z listy."}</div>
          : <>
            <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--line)" }}>
              <button type="button" onClick={() => { setActive(null); navigate("/wiadomosci", { replace: true }); }} className="grid h-10 w-10 place-items-center rounded-lg lg:hidden" style={{ background: "rgba(255,255,255,.05)" }} aria-label="Wróć do listy">←</button>
              <Link to={`/produkt/${conv.offer_id}`} className="h-11 w-11 shrink-0 overflow-hidden rounded-lg" style={{ background: "var(--header)" }}>{conv.offer_image && <img src={conv.offer_image} alt="" className="h-full w-full object-cover" />}</Link>
              <div className="min-w-0 flex-1"><div className="truncate font-bold">{conv.counterpart} <span className="text-xs font-normal" style={{ color: "var(--mut)" }}>· {conv.role === "buyer" ? "sprzedawca" : "kupujący"}</span></div><Link to={`/produkt/${conv.offer_id}`} className="block truncate text-xs" style={{ color: "var(--gold)" }}>{conv.offer_title} · {zl(conv.offer_price)}</Link></div>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-4" style={{ maxHeight: "55vh" }}>
              {msgs === null ? <div className="text-sm" style={{ color: "var(--mut)" }}>Wczytuję…</div> : msgs.map((m) => <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}><div className="max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-6" style={m.mine ? { background: "rgba(245,166,35,.16)", border: "1px solid rgba(245,166,35,.3)" } : { background: "rgba(255,255,255,.06)", border: "1px solid var(--line)" }}><div className="whitespace-pre-wrap break-words">{m.body}</div><div className="mt-1 text-[10px]" style={{ color: "var(--mut)" }}>{new Date(m.created_at).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" })}</div></div></div>)}
              <div ref={bottom} />
            </div>
            <form onSubmit={send} className="flex items-end gap-2 p-3" style={{ borderTop: "1px solid var(--line)" }}>
              <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); (e.currentTarget.form as HTMLFormElement)?.requestSubmit(); } }} rows={2} maxLength={4000} placeholder="Napisz wiadomość… (Enter — wyślij, Shift+Enter — nowa linia)" className="min-h-[44px] flex-1 resize-none rounded-xl px-3 py-2.5 text-sm outline-none" style={{ background: "rgba(255,255,255,.05)", border: "1px solid var(--line)", color: "var(--ink)" }} aria-label="Treść wiadomości" />
              <button type="submit" disabled={busy || !text.trim()} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl disabled:opacity-50" style={{ background: GOLD_GRAD, color: "#101012" }} aria-label="Wyślij"><Ico name="send" size={18} strokeWidth={2} /></button>
            </form>
            {err && <div className="px-4 pb-3 text-sm" style={{ color: "#f87171" }}>{err}</div>}
          </>}
        </section>
      </div>}
    </div>
    <HomeFooter />
  </main>;
}
