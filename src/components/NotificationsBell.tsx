import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { myNotifications, markNotificationsRead } from "../lib/api";

type N = { id: string; type: string; title: string; body: string; read: boolean; created_at: string };

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
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] rounded-2xl overflow-hidden z-40"
             style={{ background: "rgba(20,32,54,.98)", border: "1px solid var(--line)" }}>
          <div className="px-4 py-3 text-sm font-semibold" style={{ borderBottom: "1px solid var(--line)" }}>Powiadomienia</div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 && <div className="px-4 py-6 text-sm" style={{ color: "var(--mut)" }}>Brak powiadomień.</div>}
            {items.map((i) => (
              <div key={i.id} className="px-4 py-3" style={{ borderBottom: "1px solid var(--line)" }}>
                <div className="text-sm font-medium">{i.title}</div>
                <div className="text-xs mt-0.5" style={{ color: "var(--mut)" }}>{i.body}</div>
                <div className="text-[10px] mt-1" style={{ color: "var(--soft,#5E5E75)" }}>{new Date(i.created_at).toLocaleString("pl-PL")}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
