// SSO handoff: uzytkownik zalogowany w MySunrise wchodzi do Sunrise Market BEZ ponownego logowania.
// Wejscie: { access_token } (token sesji huba MySunrise).
// 1) Weryfikacja tokenu w hubie -> e-mail. 2) Znajdz/utworz konto w Markecie.
// 3) Wygeneruj magiclink token_hash -> frontend robi verifyOtp i ma sesje.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_KEY")!;
const MYS_URL = (Deno.env.get("MYSUNRISE_URL") ?? "https://lvmrhgpxhqvfuoftblky.supabase.co").replace(/\/$/, "");
const MYS_ANON = Deno.env.get("MYSUNRISE_ANON_KEY") ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2bXJoZ3B4aHF2ZnVvZnRibGt5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MDgzMDgsImV4cCI6MjA5NzE4NDMwOH0.tqxTejWN-sSn43qQkVKSVAXBxUb6KbQRRq2wQIhunfw";
function json(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } }); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { access_token } = await req.json().catch(() => ({}));
    if (!access_token) return json({ ok: false, error: "missing_token" }, 400);

    // 1) Zweryfikuj token w hubie MySunrise
    const r = await fetch(`${MYS_URL}/auth/v1/user`, {
      headers: { "apikey": MYS_ANON, "Authorization": `Bearer ${access_token}` },
    });
    if (!r.ok) return json({ ok: false, error: "hub_token_invalid" }, 401);
    const hubUser = await r.json();
    const mail = String(hubUser?.email || "").trim().toLowerCase();
    if (!mail) return json({ ok: false, error: "no_email" }, 400);

    // 2) Znajdz lub utworz konto w Markecie
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE_KEY);
    const { data: uid } = await admin.rpc("user_id_by_email", { p_email: mail });
    if (!uid) {
      const pw = crypto.randomUUID() + crypto.randomUUID();
      const { error: cErr } = await admin.auth.admin.createUser({
        email: mail, password: pw, email_confirm: true,
        user_metadata: { source: "mysunrise_sso", hub_user_id: hubUser?.id || "" },
      });
      if (cErr) return json({ ok: false, error: `create_failed: ${cErr.message}` }, 500);
    }

    // 3) Magiclink -> token_hash (frontend: supabase.auth.verifyOtp({type:'email', token_hash}))
    const { data: link, error: lErr } = await admin.auth.admin.generateLink({ type: "magiclink", email: mail });
    if (lErr || !link?.properties?.hashed_token) return json({ ok: false, error: `link_failed: ${lErr?.message || "no_token"}` }, 500);

    return json({ ok: true, token_hash: link.properties.hashed_token, email: mail });
  } catch (err) {
    return json({ ok: false, error: String((err as Error)?.message || err) }, 400);
  }
});
