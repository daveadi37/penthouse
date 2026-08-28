import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/* ============================================================
   The one place the backend is reached from.

   Both values are baked into the bundle at build time, which is why
   changing either one means building and deploying again. The anon key
   is safe to ship: it grants nothing on its own, and every table is
   behind row-level security keyed to the signed-in account.

   With neither set the app runs entirely on the device against the
   seeded example house. That is deliberate — the whole thing can be
   clicked through before a Supabase project exists.
   ============================================================ */

const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

export const backendConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = backendConfigured
  ? createClient(url, anonKey, {
      auth: {
        // The iPad and the iPhone are shared-ish devices in a household,
        // but signing in every morning would kill the thing. Sessions
        // persist and refresh; signing out is a deliberate act.
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
      global: { headers: { 'x-application-name': 'goldcrest-3808' } },
    })
  : null;

/** Where the Edge Functions live, for the calls that need the service role. */
export const functionsUrl = backendConfigured ? `${url.replace(/\/$/, '')}/functions/v1` : '';

export function describeBackend(): string {
  if (!backendConfigured) return 'Not connected — running on the seeded example house, on this device only.';
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
