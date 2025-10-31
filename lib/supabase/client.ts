import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Client Supabase pour utilisation côté client (browser)
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('[Supabase] Missing environment variables. Using stub client.');
    // Retourner un stub si les variables ne sont pas configurées
    return {
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
        getSession: async () => ({ data: { session: null }, error: null }),
        signInWithOAuth: async () => ({ data: null, error: null }),
        signOut: async () => ({ error: null }),
        onAuthStateChange: (cb: any) => {
          try { cb(null, null); } catch {}
          return { data: { subscription: { unsubscribe() {} } } };
        },
      },
      from: () => ({
        select: async () => ({ data: [], error: null }),
        insert: async () => ({ data: null, error: null }),
        update: async () => ({ data: null, error: null }),
        delete: async () => ({ data: null, error: null }),
      }),
    } as any;
  }

  return createSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false, // Ne pas persister la session pour l'instant
    },
  });
}

// Alias pour compatibilité
export function supabaseBrowser() {
  return createClient();
}

export default createClient;
