// Diagnostyka zakonczona 2026-09-05. Klucze Stripe sa w market.internal_secrets (stripe_secret_key, stripe_webhook_secret).
// Funkcja wylaczona — mozna ja skasowac w panelu Supabase: Edge Functions -> diag-env-names.
Deno.serve(() => new Response("gone", { status: 410 }));
