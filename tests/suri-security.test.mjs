import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const edge = await readFile(new URL("../supabase/functions/suri-commerce/index.ts", import.meta.url), "utf8");
const chat = await readFile(new URL("../src/components/SuriChat.tsx", import.meta.url), "utf8");
const api = await readFile(new URL("../src/lib/api.ts", import.meta.url), "utf8");

test("SURI derives identity from JWT and protects bound session history", () => {
  assert.match(edge, /auth\.getUser\(jwt\)/);
  assert.match(edge, /existingSession\?\.user_id && existingSession\.user_id !== authUserId/);
  assert.match(edge, /Brak dostępu do sesji/);
  assert.doesNotMatch(edge, /user_id\s*\}\s*=\s*body/);
});

test("anonymous SURI chat cannot call the paid LLM", () => {
  assert.match(edge, /login_required_for_ai/);
  assert.match(edge, /const out = authUserId/);
  assert.match(edge, /if \(authUserId\) \{\s*im = await llm/);
});

test("frontend uses random session IDs and never sends user_id", () => {
  assert.match(chat, /const sid = guestSid\(\)/);
  assert.doesNotMatch(chat, /user\?\.id \|\| guestSid/);
  assert.doesNotMatch(chat, /uidRef/);
  assert.doesNotMatch(api, /user_id: userId/);
});
