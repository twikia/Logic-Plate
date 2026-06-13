import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

let browserClient: SupabaseClient | null = null;

export function getSupabaseConfigError(): string | null {
  if (!url.trim() || !anon.trim()) {
    return 'This voting site is missing Supabase configuration. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in the deployment environment.';
  }
  return null;
}

export function getSupabaseBrowserClient(): SupabaseClient {
  const configError = getSupabaseConfigError();
  if (configError) {
    throw new Error(configError);
  }
  if (!browserClient) {
    browserClient = createClient(url, anon);
  }
  return browserClient;
}
