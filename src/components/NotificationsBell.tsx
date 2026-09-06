import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { myNotifications, markNotificationsRead } from "../lib/api";

type N = { id: string; type: string; title: string; body: string; read: boolean; created_at: string; href?: string; action?: string };
const ICON: Record<string, string> = { booking: "📅", order_paid: "🧾", new_sale: "💰", order_shipped: "📦", order_item_shipped: "📦", order_ready_for_pickup: "🏪", order_item_handed_over: "🤝", review_request: "⭐", seller_review: "⭐", order_dispute: "⚖️", message: "💬", new_lead: "📩", search: "🔔", price_drop: "📉" };

export default function NotificationsBell() {
  const [authed, setAuthed] = useState(false);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<N[]>([]);

  async function load() { try { setItems((await myNotifications()) as N[]); } catch { /* ignore */ } }
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data.user) { setAuthed(true); load(); } });
  }, []);

  const unread = items.filter((i) => !i.read).length;

  async function toggle() {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen && unread > 0) { await markNotificationsRead(); setItems((x) => x.map((i) => ({ ...i, read: true }))); }
  }

  if (!authed) return null;
  return (
    <div className="relative">
      <button onClick={toggle} className="relative w-9 h-9 rounded-xl grid place-items-center"
              style={{ background: "var(--glass)", border: "1px solid var(--line)" }} aria-label="Powiadomienia">
        🔔
        {unread > 0 && <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full text-[10px] grid place-items-center text-black font-bold"
                            style={{ background: "var(--primary)" }}>{unread}</span>}
      </button>
      {open && (<>
        {/* Na telefonie dzwonek jest przy lewej krawędzi, więc panel „right-0” wychodził poza ekran — mobilnie panel
            jest przypięty do szerokości ekranu (fixed), na desktopie nadal pod dzwonkiem. Tło zamyka po dotknięciu. */}
        <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden="true" />
        <div className="fixed inset-x-3 top-[72px] z-40 overflow-hidden rounded-2xl sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 sm:w-80"
             style={{ background: "rgba(20,32,54,.98)", border: "1px solid var(--line)", boxShadow: "0 18px 50px rgba(0,0,0,.45)" }}>
          <div className="flex items-center justify-between px-4 py-3 text-sm font-semibold" style={{ borderBottom: "1px solid var(--line)" }}><span>Powiadomienia</span><button type="button" onClick={() => setOpen(false)} aria-label="Zamknij" className="text-base leading-none" style={{ color: "var(--mut)" }}>×</button></div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 && <div className="px-4 py-6 text-sm" style={{ color: "var(--mut)" }}>Brak powiadomień.</div>}
            {items.slice(0, 8).map((i) => (
              <a key={i.id} href={i.href || "/powiadomienia"} className="flex gap-3 px-4 py-3 transition hover:bg-white/5" style={{ borderBottom: "1px solid var(--line)" }}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-base" style={{ background: "var(--glass)" }}>{ICON[i.type] || "🔔"}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{i.title}</span>
                  <span className="mt-0.5 block line-clamp-2 text-xs" style={{ color: "var(--mut)" }}>{i.body}</span>
                  <span className="mt-1 flex items-center justify-between text-[10px]" style={{ color: "var(--soft,#5E5E75)" }}><span>{new Date(i.created_at).toLocaleString("pl-PL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>{i.action && <span className="font-semibold" style={{ color: "var(--gold)" }}>{i.action} →</span>}</span>
                </span>
              </a>
            ))}
          </div>
          <a href="/powiadomienia" className="block px-4 py-3 text-center text-sm font-semibold" style={{ color: "var(--gold)", borderTop: "1px solid var(--line)" }}>Wszystkie powiadomienia i akcje →</a>
        </div>
      </>)}
    </div>
  );
}
