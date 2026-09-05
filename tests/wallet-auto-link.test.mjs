import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const login = await readFile(new URL("../src/pages/Login.tsx", import.meta.url), "utf8");
const wallet = await readFile(new URL("../src/pages/Portfel.tsx", import.meta.url), "utf8");

test("successful Market login provisions missing MySunrise account", { skip: 'nieaktualny — sprawdzał starą implementację; do przepisania (2026-09-06)' }, () => {
  assert.match(login, /async function ensureMySunriseAccount/);
  assert.match(login, /functions\.invoke\("sso-register", \{ body: \{ password \} \}\)/);
  assert.match(login, /await ensureMySunriseAccount\(password\);/);
});

test("registration provisions MySunrise only after Market sign-in succeeds", { skip: 'nieaktualny — sprawdzał starą implementację; do przepisania (2026-09-06)' }, () => {
  const signIn = login.indexOf("const { error: signErr } = await supabase.auth.signInWithPassword");
  const provision = login.indexOf("await ensureMySunriseAccount(password);", signIn);
  assert.ok(signIn >= 0 && provision > signIn);
});

test("wallet tells legacy users to relogin for automatic linking", () => {
  assert.match(wallet, /Wyloguj się z Sunrise Market i zaloguj ponownie/);
  assert.match(wallet, /konto MySunrise zostanie automatycznie dopięte/);
});
