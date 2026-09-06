// Face ID / Touch ID (WebAuthn passkeys) — decyzja właściciela 2026-09-06: bez Google, konto jest powiązane z MySunrise.
// Rejestracja po zalogowaniu (Moje konto → Bezpieczeństwo), logowanie na ekranie logowania. Serwer: edge fn `passkey`.
import { startRegistration, startAuthentication, browserSupportsWebAuthn, platformAuthenticatorIsAvailable } from "@simplewebauthn/browser";
import { supabase } from "./supabase";

export type PasskeyRow = { id: string; device_name: string | null; device_type: string | null; backed_up: boolean; created_at: string; last_used_at: string | null };

/** Czy to urządzenie ma Face ID / Touch ID / Windows Hello (a przeglądarka obsługuje passkeys). */
export async function passkeysAvailable(): Promise<boolean> {
  try { return browserSupportsWebAuthn() && await platformAuthenticatorIsAvailable(); } catch { return false; }
}

/** Etykieta dla przycisku: iPhone/iPad/Mac → Face ID / Touch ID, reszta → odcisk palca / PIN urządzenia. */
export function passkeyLabel(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return "Face ID / Touch ID";
  if (/Macintosh/.test(ua)) return "Touch ID";
  if (/Android/.test(ua)) return "odcisk palca";
  if (/Windows/.test(ua)) return "Windows Hello";
  return "klucz urządzenia";
}

async function call(action: string, body: Record<string, unknown> = {}, withAuth = false) {
  const headers: Record<string, string> = {};
  if (withAuth) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Zaloguj się, aby włączyć Face ID");
    headers.Authorization = `Bearer ${session.access_token}`;
  }
  const { data, error } = await supabase.functions.invoke("passkey", { body: { action, ...body }, headers });
  if (error) {
    let msg = error.message;
    try { const j = await (error as any).context?.json?.(); if (j?.error) msg = j.error; } catch { /* brak treści */ }
    throw new Error(msg);
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as any;
}

/** Włącz Face ID na tym urządzeniu (użytkownik zalogowany). */
export async function registerPasskey(deviceName?: string): Promise<void> {
  const { options } = await call("register_options", {}, true);
  let response;
  try { response = await startRegistration({ optionsJSON: options }); }
  catch (e: any) {
    if (e?.name === "InvalidStateError") throw new Error("To urządzenie jest już dodane.");
    if (e?.name === "NotAllowedError") throw new Error("Anulowano.");
    throw e;
  }
  await call("register_verify", { response, device_name: deviceName }, true);
}

/** Zaloguj Face ID: opcjonalnie e-mail (zawęża do kluczy tego konta), zwraca zalogowaną sesję. */
export async function loginWithPasskey(email?: string): Promise<{ email: string }> {
  const { options } = await call("login_options", email ? { email } : {});
  let response;
  try { response = await startAuthentication({ optionsJSON: options }); }
  catch (e: any) {
    if (e?.name === "NotAllowedError") throw new Error("Anulowano lub brak zapisanego klucza na tym urządzeniu.");
    throw e;
  }
  const out = await call("login_verify", { response });
  const { error } = await supabase.auth.verifyOtp({ token_hash: out.token_hash, type: "magiclink" });
  if (error) throw error;
  return { email: out.email };
}

export async function myPasskeys(): Promise<PasskeyRow[]> {
  const { data, error } = await supabase.rpc("my_passkeys");
  if (error) throw error;
  return (data ?? []) as PasskeyRow[];
}

export async function deletePasskey(id: string): Promise<void> {
  const { error } = await supabase.rpc("delete_passkey", { p_id: id });
  if (error) throw error;
}
