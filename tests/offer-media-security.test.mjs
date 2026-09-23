import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const api = await readFile(new URL("../src/lib/api.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260923190000_owner_scoped_offer_media.sql", import.meta.url), "utf8");

test("offer media uploads use authenticated owner folders", () => {
  assert.match(api, /supabase\.auth\.getUser\(\)/);
  assert.match(api, /\$\{ownerId\}\/zdjecia\//);
  assert.match(api, /\$\{ownerId\}\/wideo\//);
  assert.match(api, /Sesja wygasła/);
});

test("storage policy only allows uploads to auth uid folder", () => {
  assert.match(migration, /storage\.foldername\(name\)/);
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /bucket_id = 'product-images'/);
});
