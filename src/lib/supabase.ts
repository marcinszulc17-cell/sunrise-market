import { createClient } from "@supabase/supabase-js";
// Klient Supabase dla frontu (klucz anon, publiczny). Schemat 'market'.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { db: { schema: "market" } },
);
