import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  // En développement/démo, vérifier si les variables d'env sont configurées
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('[Supabase Client] Missing env vars, returning stub');
    // Retourner un stub minimal si pas configuré
    return {
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
        getSession: async () => ({ data: { session: null }, error: null }),
        signInWithPassword: async () => ({ data: null, error: null }),
        signInWithOAuth: async () => ({ data: null, error: null }),
        signUp: async () => ({ data: null, error: null }),
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

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

/** Alias pour compatibilité */
export function supabaseBrowser() {
  return createClient();
}

export default createClient;
