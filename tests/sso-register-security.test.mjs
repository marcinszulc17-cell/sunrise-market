import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const registerSource = await readFile(new URL("../supabase/functions/sso-register/index.ts", import.meta.url), "utf8");
const loginSource = await readFile(new URL("../supabase/functions/sso-login/index.ts", import.meta.url), "utf8");
const loginPage = await readFile(new URL("../src/pages/Login.tsx", import.meta.url), "utf8");

test("password relay SSO endpoints are retired", () => {
  for (const source of [registerSource, loginSource]) {
    assert.match(source, /status\s*=\s*410/);
    assert.match(source, /mysunrise_sso/);
    assert.doesNotMatch(source, /password/);
    assert.doesNotMatch(source, /auth\.admin\.(createUser|updateUserById)/);
  }
});

test("legacy Market login never forwards a password to SSO functions", () => {
  assert.match(loginPage, /signInWithPassword/);
  assert.doesNotMatch(loginPage, /functions\.invoke\("sso-login"/);
  assert.doesNotMatch(loginPage, /functions\.invoke\("sso-register"/);
});
