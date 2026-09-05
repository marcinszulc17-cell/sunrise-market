import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_KEY")!;
const MYS_URL = (Deno.env.get("MYSUNRISE_URL") ?? "https://lvmrhgpxhqvfuoftblky.supabase.co").replace(/\/$/, "");
const MYS_ANON = Deno.env.get("MYSUNRISE_ANON_KEY") ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2bXJoZ3B4aHF2ZnVvZnRibGt5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MDgzMDgsImV4cCI6MjA5NzE4NDMwOH0.tqxTejWN-sSn43qQkVKSVAXBxUb6KbQRRq2wQIhunfw";
function json(b, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } }); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { email, password } = await req.json();
    if (!email || !password) return json({ ok: false, error: "missing" }, 400);
    const mail = String(email).trim().toLowerCase();

    const r = await fetch(`${MYS_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": MYS_ANON },
      body: JSON.stringify({ email: mail, password }),
    });
    if (!r.ok) {
      return json({ ok: false, reason: "mysunrise_invalid" });
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL"), SERVICE_KEY);
    const { data: uid } = await admin.rpc("user_id_by_email", { p_email: mail });
    if (uid) {
      await admin.auth.admin.updateUserById(uid, { password, email_confirm: true });
    } else {
      await admin.auth.admin.createUser({ email: mail, password, email_confirm: true });
    }
    return json({ ok: true, linked: true });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message ? err.message : err) }, 400);
  }
});
