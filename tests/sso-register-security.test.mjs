import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../supabase/functions/sso-register/index.ts", import.meta.url), "utf8");

test("sso-register requires authenticated Market identity and environment service token", () => {
  assert.match(source, /Deno\.env\.get\("SUNRISE_MARKET_SERVICE_TOKEN"\)/);
  assert.match(source, /service_token_not_configured/);
  assert.match(source, /auth\.getUser\(token\)/);
  assert.match(source, /userData\.user\?\.email/);
  assert.doesNotMatch(source, /SUNRISE_MARKET_SERVICE_TOKEN"\)\s*\?\?\s*["']/);
});
