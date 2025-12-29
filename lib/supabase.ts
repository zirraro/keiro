import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

function getSupabaseClient() {
  if (supabaseInstance) return supabaseInstance;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Supabase URL and anon key are required');
  }

  supabaseInstance = createClient(url, key, {
    auth: { persistSession: false }
  });

  return supabaseInstance;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return getSupabaseClient()[prop as keyof SupabaseClient];
  }
});
