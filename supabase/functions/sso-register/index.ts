import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MYS_URL = (Deno.env.get("MYSUNRISE_URL") ?? "https://lvmrhgpxhqvfuoftblky.supabase.co").replace(/\/$/, "");
const TOKEN = Deno.env.get("SUNRISE_MARKET_SERVICE_TOKEN");
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    if (!TOKEN) return json({ ok: false, error: "service_token_not_configured" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ ok: false, error: "unauthorized" }, 401);

    const token = authHeader.slice("Bearer ".length);
    const client = createClient(Deno.env.get("SUPABASE_URL")!, ANON);
    const { data: userData, error: userError } = await client.auth.getUser(token);
    const email = userData.user?.email?.trim().toLowerCase();
    if (userError || !email) return json({ ok: false, error: "unauthorized" }, 401);

    const { password, first_name } = await req.json();
    if (!password) return json({ ok: false, error: "missing_password" }, 400);

    const response = await fetch(`${MYS_URL}/functions/v1/provision-market-user`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-sunrise-service-token": TOKEN,
      },
      body: JSON.stringify({
        email,
        password,
        first_name: first_name ?? userData.user?.user_metadata?.first_name ?? null,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (response.ok && data?.ok) {
      return json({ ok: true, created: data.created ?? false, existed: data.existed ?? false });
    }
    return json({ ok: false, error: data?.error ?? `mysunrise_${response.status}` }, 502);
  } catch (err) {
    return json({ ok: false, error: String(err instanceof Error ? err.message : err) }, 400);
  }
});
