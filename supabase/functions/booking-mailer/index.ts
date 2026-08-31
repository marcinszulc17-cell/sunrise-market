import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c] || c));
const safeTimezone = (value: unknown) => {
  const timezone = typeof value === "string" && value.trim() ? value.trim() : "Europe/Warsaw";
  try {
    new Intl.DateTimeFormat("pl-PL", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return "Europe/Warsaw";
  }
};
const fmt = (iso: string, timezone: string, withTime = true) => new Intl.DateTimeFormat("pl-PL", { timeZone: timezone, dateStyle: "long", ...(withTime ? { timeStyle: "short" } : {}) }).format(new Date(iso));

function copy(event: string, recipient: string, p: any) {
  const timezone = safeTimezone(p.timezone);
  const when = p.booking_type === "daily" ? `${fmt(p.starts_at, timezone, false)} – ${fmt(p.ends_at, timezone, false)}` : fmt(p.starts_at, timezone, true);
  const price = `${Number(p.amount_gross || 0).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
  const seller = recipient === "seller";
  const map: Record<string, [string,string]> = {
    created: [seller ? "Nowa rezerwacja w Sunrise Market" : "Otrzymaliśmy Twoją rezerwację", seller ? "Klient utworzył nową rezerwację." : "Termin został zapisany. Jeśli rezerwacja wymaga płatności, jej potwierdzenie wyślemy osobno."],
    confirmed: [seller ? "Rezerwacja potwierdzona" : "Twoja rezerwacja jest potwierdzona", seller ? "Płatność/rezerwacja została potwierdzona." : "Wszystko gotowe — rezerwacja jest potwierdzona."],
    cancelled: [seller ? "Rezerwacja anulowana" : "Rezerwacja została anulowana", "Rezerwacja nie jest już aktywna."],
    completed: [seller ? "Rezerwacja zakończona" : "Dziękujemy za skorzystanie z Sunrise Market", seller ? "Rezerwacja została oznaczona jako zakończona." : "Rezerwacja została zakończona. Dziękujemy za skorzystanie z usługi."],
    reminder: [seller ? "Przypomnienie o rezerwacji" : "Przypomnienie o Twojej rezerwacji", "Zbliża się termin rezerwacji."],
    rescheduled: [seller ? "Termin rezerwacji został zmieniony" : "Nowy termin Twojej rezerwacji", seller ? "Termin lub przypisany zasób rezerwacji został zmieniony. Poniżej znajdziesz aktualne dane." : "Termin Twojej rezerwacji został zmieniony. Poniżej znajdziesz aktualne dane."],
  };
  const [subject, lead] = map[event] || ["Aktualizacja rezerwacji Sunrise Market", "Status rezerwacji został zaktualizowany."];
  const resource = p.resource_name ? `<br><b>Pracownik / zasób:</b> ${esc(p.resource_name)}` : "";
  const html = `<!doctype html><html><body style="margin:0;background:#07070f;color:#f5f2ea;font-family:Arial,sans-serif"><div style="max-width:620px;margin:auto;padding:32px 20px"><div style="color:#d6aa6d;font-weight:700;letter-spacing:.12em">SUNRISE MARKET</div><h1 style="font-size:26px;margin:16px 0">${esc(subject)}</h1><p style="color:#c9c5bd;line-height:1.6">${esc(lead)}</p><div style="margin:24px 0;padding:20px;border:1px solid #2b2932;border-radius:16px;background:#111018"><div style="font-size:18px;font-weight:700">${esc(p.title)}</div><p style="margin:10px 0 0;color:#c9c5bd"><b>Termin:</b> ${esc(when)}${resource}<br><b>Kwota:</b> ${esc(price)}<br><b>Status:</b> ${esc(p.status)}</p></div><a href="https://sunrisemarket.pl/${seller ? "sprzedawca/rezerwacje" : "rezerwacje"}" style="display:inline-block;padding:12px 18px;border-radius:12px;background:#d6aa6d;color:#07070f;text-decoration:none;font-weight:700">Zobacz rezerwację</a><p style="margin-top:28px;font-size:12px;color:#77727e">Wiadomość wysłana automatycznie przez Sunrise Market.</p></div></body></html>`;
  return { subject, html };
}

Deno.serve(async () => {
  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resend = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("BOOKING_MAIL_FROM") || "Sunrise Market <noreply@sunrisemarket.pl>";
  const sb = createClient(url, service, { auth: { persistSession: false } });
  const { data: rows, error } = await sb.schema("market").from("booking_mail_outbox").select("id,event_type,recipient_type,recipient_email,payload,attempts").in("status", ["pending","failed"]).lt("attempts", 5).order("created_at").limit(25);
  if (error) return json({ ok: false, error: error.message }, 500);
  if (!rows?.length) return json({ ok: true, configured: Boolean(resend), processed: 0, sent: 0, failed: 0 });
  if (!resend) return json({ ok: false, configured: false, pending: rows.length, error: "RESEND_API_KEY missing" }, 503);

  let sent = 0, failed = 0;
  for (const row of rows) {
    const { data: claimed } = await sb.schema("market").from("booking_mail_outbox").update({ status: "sending" }).eq("id", row.id).in("status", ["pending","failed"]).select("id").maybeSingle();
    if (!claimed) continue;
    try {
      const c = copy(row.event_type, row.recipient_type, row.payload);
      const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: [row.recipient_email], subject: c.subject, html: c.html }) });
      if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0,300)}`);
      await sb.schema("market").from("booking_mail_outbox").update({ status: "sent", sent_at: new Date().toISOString(), attempts: Number(row.attempts || 0) + 1, last_error: null }).eq("id", row.id);
      sent++;
    } catch (e) {
      await sb.schema("market").from("booking_mail_outbox").update({ status: "failed", attempts: Number(row.attempts || 0) + 1, last_error: String((e as Error).message).slice(0,500) }).eq("id", row.id);
      failed++;
    }
  }
  return json({ ok: true, configured: true, processed: rows.length, sent, failed });
});
