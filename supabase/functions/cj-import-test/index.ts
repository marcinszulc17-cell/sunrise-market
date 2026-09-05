// NIEAKTYWNE — tymczasowy seeder CJ zostal zneutralizowany po jednorazowym uzyciu.
// Mozesz usunac te funkcje w panelu Supabase (Edge Functions → cj-import-test → Delete).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
Deno.serve(() => new Response(JSON.stringify({ disabled: true, note: "cj-import-test disabled; use cj-import-feed" }), { status: 410, headers: { "Content-Type": "application/json" } }));
