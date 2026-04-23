/**
 * Browser-safe Supabase client. Uses the anon key; RLS on the Supabase
 * side restricts what this caller can read to the public feed slice:
 * `us_or_remote_eligible = true AND relevant = true` rows of `public.jobs`
 * and the `public.scrape_runs_latest` table.
 *
 * For server-side reads we could build a second client here that uses
 * the service-role key, but v1 doesn't need it — the public data is
 * enough for the Feed page.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
      "Copy .env.local.example to .env.local and fill in the values from " +
      "Supabase Dashboard → Settings → API.",
  );
}

export const supabase: SupabaseClient<Database> = createClient<Database>(url, key, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
