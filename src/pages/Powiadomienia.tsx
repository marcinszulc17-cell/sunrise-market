// Centrum powiadomień /powiadomienia (decyzja właściciela 2026-09-06): jedno miejsce ze wszystkimi powiadomieniami i przyciskiem
// akcji („Wyślij kod”, „Nadaj paczkę”, „Oceń zakup”…). Link i etykieta liczone po stronie bazy (market.notification_link → my_inbox).
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { SiteHeader } from "../components/home/SiteChrome";
import { markNotificationsRead } from "../lib/api";

export type InboxItem = { id: string; type: string; title: string; body: string; read: boolean; created_at: string; href: string; action: string };
const ICON: Record<string, string> = { booking: "📅", order_paid: "🧾", new_sale: "💰", order_shipped: "📦", order_item_shipped: "📦", order_ready_for_pickup: "🏪", order_item_handed_over: "🤝", order_stale: "⏳", review_request: "⭐", seller_review: "⭐", order_dispute: "⚖️", message: "💬", new_lead: "📩", search: "🔔", price_drop: "📉" };
export const iconFor = (t: string) => ICON[t] || "🔔";
export function timeLabel(s: string) { const d = new Date(s); const diff = (Date.now() - d.getTime()) / 6e4; if (diff < 1) return "przed chwilą"; if (diff < 60) return `${Math.round(diff)} min temu`; if (diff < 1440) return `${Math.round(diff / 60)} godz. temu`; return d.toLocaleDateString("pl-PL", { day: "numeric", month: "short" }); }

export async function myInbox(limit = 50): Promise<InboxItem[]> { const { data, error } = await supabase.rpc("my_inbox", { p_limit: limit }); if (error) throw error; return (data ?? []) as InboxItem[]; }

export default function Powiadomienia() {
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [filter, setFilter] = useState<"all" | "unread" | "todo">("all");
  useEffect(() => { supabase.auth.getSession().then(async ({ data }) => { setAuthed(!!data.session); if (data.session) { try { setItems(await myInbox(100)); } catch { setItems([]); } } }); }, []);
  const list = useMemo(() => (items ?? []).filter((i) => filter === "all" ? true : filter === "unread" ? !i.read : /Wyślij|Rozlicz|Potwierdź|Zrealizuj|Odpowiedz|Oceń|Nadaj/i.test(i.action)), [items, filter]);
  async function open(i: InboxItem) { if (!i.read) { supabase.rpc("mark_notification_read", { p_id: i.id }).then(() => {}, () => {}); setItems((x) => (x ?? []).map((y) => y.id === i.id ? { ...y, read: true } : y)); } window.location.assign(i.href); }
  async function readAll() { await markNotificationsRead().catch(() => {}); setItems((x) => (x ?? []).map((y) => ({ ...y, read: true }))); }
  const unread = (items ?? []).filter((i) => !i.read).length;
  const box = { background: "var(--glass)", border: "1px solid var(--line)" } as const;

  return <main className="min-h-screen pb-24" style={{ background: "var(--bg)", color: "var(--ink)" }}>
    <SiteHeader back />
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3 pl-12 sm:pl-0">
        <div><h1 className="font-display text-3xl font-semibold">Powiadomienia</h1><p className="mt-1 text-sm" style={{ color: "var(--mut)" }}>{unread ? `${unread} nieprzeczytane` : "Wszystko przeczytane"}</p></div>
        {unread > 0 && <button type="button" onClick={readAll} className="text-sm underline" style={{ color: "var(--mut)" }}>oznacz wszystkie jako przeczytane</button>}
      </div>
      <div className="mt-4 flex gap-1 rounded-xl p-1" style={box}>{([["all", "Wszystkie"], ["todo", "Do zrobienia"], ["unread", "Nieprzeczytane"]] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setFilter(k)} className="flex-1 rounded-lg px-3 py-2 text-sm font-semibold" style={filter === k ? { background: "linear-gradient(135deg,#E8891A,#F5A623)", color: "#101012" } : {}}>{l}</button>)}</div>
      {authed === false && <div className="mt-4 rounded-2xl p-6 text-sm" style={box}>Zaloguj się, aby zobaczyć powiadomienia. <Link to="/login?next=/powiadomienia" className="underline" style={{ color: "var(--gold)" }}>Logowanie</Link></div>}
      {items === null && authed && <div className="mt-4 rounded-2xl p-6 text-sm" style={box}>Wczytuję…</div>}
      {items && list.length === 0 && <div className="mt-4 rounded-2xl p-6 text-sm" style={{ ...box, color: "var(--mut)" }}>Brak powiadomień w tej zakładce.</div>}
      <ul className="mt-4 space-y-2">{list.map((i) => <li key={i.id}>
        <button type="button" onClick={() => open(i)} className="flex w-full items-start gap-3 rounded-2xl p-4 text-left transition hover:-translate-y-0.5" style={{ ...box, borderColor: i.read ? "var(--line)" : "rgba(245,166,35,.45)" }}>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg" style={{ background: i.read ? "var(--header)" : "rgba(245,166,35,.14)" }}>{iconFor(i.type)}</span>
          <span className="min-w-0 flex-1">
            <span className="flex items-start justify-between gap-2"><span className={`text-sm ${i.read ? "font-medium" : "font-bold"}`}>{i.title}</span><span className="shrink-0 text-[11px]" style={{ color: "var(--mut)" }}>{timeLabel(i.created_at)}</span></span>
            <span className="mt-0.5 block text-sm leading-5" style={{ color: "var(--mut)" }}>{i.body}</span>
            <span className="mt-2 inline-flex h-8 items-center rounded-lg px-3 text-xs font-bold" style={{ background: i.read ? "var(--header)" : "linear-gradient(135deg,#E8891A,#F5A623)", color: i.read ? "var(--ink)" : "#101012", border: i.read ? "1px solid var(--line)" : "none" }}>{i.action} →</span>
          </span>
        </button>
      </li>)}</ul>
    </div>
  </main>;
}
