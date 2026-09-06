// Moje konto → Ustawienia: Face ID / Touch ID (passkeys). Lista urządzeń, „Włącz na tym urządzeniu”, usuwanie.
import { useEffect, useState } from "react";
import { deletePasskey, myPasskeys, passkeyLabel, passkeysAvailable, registerPasskey, type PasskeyRow } from "../lib/passkeys";

export default function PasskeyCard() {
  const [avail, setAvail] = useState<boolean | null>(null);
  const [rows, setRows] = useState<PasskeyRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const label = passkeyLabel();

  async function load() { try { setRows(await myPasskeys()); } catch { /* brak dostępu — pokażemy pustą listę */ } }
  useEffect(() => { passkeysAvailable().then(setAvail); load(); }, []);

  async function add() {
    setBusy(true); setMsg(null);
    try { await registerPasskey(); setMsg({ ok: true, text: `Gotowe — od teraz logujesz się przez ${label} na tym urządzeniu.` }); await load(); }
    catch (e: any) { setMsg({ ok: false, text: e?.message || "Nie udało się włączyć." }); }
    finally { setBusy(false); }
  }
  async function remove(id: string) {
    setBusy(true); setMsg(null);
    try { await deletePasskey(id); await load(); } catch (e: any) { setMsg({ ok: false, text: e?.message || "Nie udało się usunąć." }); } finally { setBusy(false); }
  }

  return <div className="rounded-2xl p-5" style={{ background: "var(--glass)", border: "1px solid var(--line)" }}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm" style={{ color: "var(--mut)" }}>Logowanie {label}</div>
        <div className="mt-1 font-semibold">{rows.length ? `🔐 Włączone na ${rows.length} ${rows.length === 1 ? "urządzeniu" : "urządzeniach"}` : "🔐 Wyłączone"}</div>
        <p className="mt-1 text-sm leading-5" style={{ color: "var(--mut)" }}>
          {avail === false ? "To urządzenie lub przeglądarka nie obsługuje logowania biometrycznego." : `Zamiast hasła — ${label}. Klucz zostaje na Twoim urządzeniu, Sunrise Market dostaje tylko potwierdzenie. Konto Sunrise (MySunrise) bez zmian.`}
        </p>
        {msg && <p className="mt-2 text-xs" style={{ color: msg.ok ? "#7AB89A" : "#f87171" }}>{msg.text}</p>}
        {rows.length > 0 && <ul className="mt-3 space-y-1.5">
          {rows.map((r) => <li key={r.id} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm" style={{ background: "var(--bg)", border: "1px solid var(--line)" }}>
            <span className="min-w-0 truncate">{r.device_name || "Urządzenie"}{r.backed_up ? " · w chmurze (iCloud/Google)" : ""}<span className="ml-2 text-xs" style={{ color: "var(--mut)" }}>{r.last_used_at ? `użyty ${new Date(r.last_used_at).toLocaleDateString("pl-PL")}` : `dodany ${new Date(r.created_at).toLocaleDateString("pl-PL")}`}</span></span>
            <button type="button" disabled={busy} onClick={() => remove(r.id)} className="shrink-0 text-xs underline" style={{ color: "var(--mut)" }}>Usuń</button>
          </li>)}
        </ul>}
      </div>
      {avail && <button type="button" disabled={busy} onClick={add} className="rounded-xl px-4 py-2 text-sm font-semibold" style={{ background: "linear-gradient(135deg,#E8891A,#F5A623)", color: "#101012", opacity: busy ? .6 : 1 }}>{busy ? "…" : rows.length ? "Dodaj to urządzenie" : "Włącz"}</button>}
    </div>
  </div>;
}

/** Zachęta na przeglądzie konta: urządzenie obsługuje Face ID, a użytkownik nie ma jeszcze klucza. Znika na 30 dni po „Nie teraz”. */
export function PasskeyNudge({ goSettings }: { goSettings: () => void }) {
  const [show, setShow] = useState(false);
  const label = passkeyLabel();
  useEffect(() => {
    (async () => {
      try { if (localStorage.getItem("sm:passkey-nudge") && Number(localStorage.getItem("sm:passkey-nudge")) > Date.now()) return; } catch { /* prywatny tryb */ }
      if (!(await passkeysAvailable())) return;
      const rows = await myPasskeys().catch(() => [] as PasskeyRow[]);
      setShow(rows.length === 0);
    })();
  }, []);
  if (!show) return null;
  function later() { try { localStorage.setItem("sm:passkey-nudge", String(Date.now() + 30 * 864e5)); } catch { /* ignoruj */ } setShow(false); }
  return <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3" style={{ background: "rgba(232,137,26,.10)", border: "1px solid rgba(232,137,26,.35)" }}>
    <div className="min-w-0 flex-1 text-sm"><b>Loguj się przez {label}</b> — bez hasła, jednym dotknięciem. Klucz zostaje na Twoim urządzeniu.</div>
    <button type="button" onClick={goSettings} className="rounded-xl px-3 py-1.5 text-sm font-semibold" style={{ background: "linear-gradient(135deg,#E8891A,#F5A623)", color: "#101012" }}>Włącz</button>
    <button type="button" onClick={later} className="text-xs underline" style={{ color: "var(--mut)" }}>Nie teraz</button>
  </div>;
}
