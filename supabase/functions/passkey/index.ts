// passkey — logowanie Face ID / Touch ID (WebAuthn) do konta Sunrise (decyzja właściciela 2026-09-06; bez Google — konto jest
// powiązane z MySunrise). Akcje:
//   register_options / register_verify  — wymaga zalogowanego użytkownika (Authorization: Bearer <jwt>)
//   login_options / login_verify        — bez logowania; po poprawnej asercji wydajemy sesję:
//                                          admin.generateLink(magiclink) → token_hash → klient: supabase.auth.verifyOtp({ token_hash, type: "magiclink" })
// RP ID = sunrisemarket.pl (obejmuje app.sunrisemarket.pl). Passkeys w market.passkeys, wyzwania w market.passkey_challenges (5 min).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} from "npm:@simplewebauthn/server@11.0.0";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const RP_ID = Deno.env.get("PASSKEY_RP_ID") ?? "sunrisemarket.pl";
const RP_NAME = "Sunrise Market";
const ORIGINS = ["https://sunrisemarket.pl", "https://www.sunrisemarket.pl", "https://app.sunrisemarket.pl"];
const SUPA = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const b64u = {
  enc: (buf: Uint8Array) => btoa(String.fromCharCode(...buf)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  dec: (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0)),
};
function expectedOrigin(req: Request) {
  const o = req.headers.get("origin") ?? "";
  if (ORIGINS.includes(o)) return o;
  if (/^http:\/\/localhost(:\d+)?$/.test(o)) return o; // podgląd lokalny
  return ORIGINS[0];
}
function deviceLabel(ua: string) {
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Windows";
  return "Urządzenie";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const admin = createClient(SUPA, SERVICE, { db: { schema: "market" } });
  const auth = createClient(SUPA, SERVICE);
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");
    const origin = expectedOrigin(req);
    const rpID = origin.startsWith("http://localhost") ? "localhost" : RP_ID;

    async function currentUser() {
      const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
      if (!jwt) return null;
      const { data } = await auth.auth.getUser(jwt);
      return data.user ?? null;
    }

    if (action === "register_options") {
      const user = await currentUser();
      if (!user?.email) return json({ error: "Zaloguj się, aby włączyć Face ID" }, 401);
      const { data: existing } = await admin.from("passkeys").select("credential_id,transports").eq("user_id", user.id);
      const options = await generateRegistrationOptions({
        rpName: RP_NAME, rpID, userName: user.email, userDisplayName: String(user.user_metadata?.name ?? user.email),
        attestationType: "none",
        excludeCredentials: (existing ?? []).map((c: any) => ({ id: c.credential_id, transports: c.transports })),
        authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
      });
      await admin.from("passkey_challenges").insert({ kind: "register", user_id: user.id, challenge: options.challenge });
      return json({ options });
    }

    if (action === "register_verify") {
      const user = await currentUser();
      if (!user) return json({ error: "Brak autoryzacji" }, 401);
      const { data: ch } = await admin.from("passkey_challenges").select("id,challenge").eq("kind", "register").eq("user_id", user.id).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!ch) return json({ error: "Wyzwanie wygasło — spróbuj ponownie" }, 400);
      const v = await verifyRegistrationResponse({ response: body.response, expectedChallenge: ch.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true });
      await admin.from("passkey_challenges").delete().eq("id", ch.id);
      if (!v.verified || !v.registrationInfo) return json({ error: "Nie udało się zweryfikować Face ID" }, 400);
      const info = v.registrationInfo;
      const credId = info.credential.id;
      const { error } = await admin.from("passkeys").insert({
        user_id: user.id, credential_id: credId, public_key: b64u.enc(info.credential.publicKey), counter: info.credential.counter,
        transports: body.response?.response?.transports ?? [], device_type: info.credentialDeviceType, backed_up: info.credentialBackedUp,
        device_name: String(body.device_name ?? "").slice(0, 80) || deviceLabel(req.headers.get("user-agent") ?? ""),
      });
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "login_options") {
      const email = String(body.email ?? "").trim().toLowerCase();
      let allow: { id: string; transports?: any }[] = [];
      if (email) {
        const { data: creds } = await admin.rpc("passkeys_for_email", { p_email: email });
        allow = (creds ?? []).map((c: any) => ({ id: c.credential_id, transports: c.transports }));
      }
      const options = await generateAuthenticationOptions({ rpID, userVerification: "required", allowCredentials: allow.length ? allow : undefined });
      await admin.from("passkey_challenges").insert({ kind: "login", challenge: options.challenge });
      return json({ options });
    }

    if (action === "login_verify") {
      const resp = body.response;
      const credId = String(resp?.id ?? "");
      if (!credId) return json({ error: "Brak danych Face ID" }, 400);
      const { data: pk } = await admin.from("passkeys").select("*").eq("credential_id", credId).maybeSingle();
      if (!pk) return json({ error: "Ten klucz nie jest zarejestrowany w Sunrise Market. Zaloguj się hasłem i włącz Face ID w Moim koncie." }, 404);
      // wyzwanie: klient odsyła challenge z clientDataJSON — sprawdzamy, że istnieje i nie wygasło
      const clientData = JSON.parse(new TextDecoder().decode(b64u.dec(String(resp.response.clientDataJSON))));
      const { data: ch } = await admin.from("passkey_challenges").select("id,challenge").eq("kind", "login").eq("challenge", String(clientData.challenge)).gt("expires_at", new Date().toISOString()).maybeSingle();
      if (!ch) return json({ error: "Wyzwanie wygasło — spróbuj ponownie" }, 400);
      const v = await verifyAuthenticationResponse({
        response: resp, expectedChallenge: ch.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
        credential: { id: pk.credential_id, publicKey: b64u.dec(pk.public_key), counter: Number(pk.counter), transports: pk.transports },
      });
      await admin.from("passkey_challenges").delete().eq("id", ch.id);
      if (!v.verified) return json({ error: "Nie udało się zweryfikować Face ID" }, 401);
      await admin.from("passkeys").update({ counter: v.authenticationInfo.newCounter, last_used_at: new Date().toISOString() }).eq("id", pk.id);
      const { data: u } = await auth.auth.admin.getUserById(pk.user_id);
      const email = u.user?.email;
      if (!email) return json({ error: "Konto bez e-maila" }, 400);
      const { data: link, error: lErr } = await auth.auth.admin.generateLink({ type: "magiclink", email });
      if (lErr || !link?.properties?.hashed_token) throw lErr ?? new Error("Nie udało się wydać sesji");
      return json({ ok: true, token_hash: link.properties.hashed_token, email });
    }

    // sprzątanie starych wyzwań (przy okazji)
    await admin.from("passkey_challenges").delete().lt("expires_at", new Date().toISOString());
    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 400);
  }
});
