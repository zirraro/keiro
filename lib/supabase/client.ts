import { createBrowserClient } from '@supabase/ssr';

// Instance singleton pour éviter de créer plusieurs clients
let supabaseInstance: any = null;

export function createClient() {
  // Si une instance existe déjà, la retourner
  if (supabaseInstance) {
    return supabaseInstance;
  }

  // En développement/démo, vérifier si les variables d'env sont configurées
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('[Supabase Client] Missing env vars, returning stub');
    // Retourner un stub minimal si pas configuré
    supabaseInstance = {
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
    return supabaseInstance;
  }

  // Créer et stocker l'instance singleton avec gestion des cookies
  supabaseInstance = createBrowserClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        // Vérifier si on est dans le navigateur
        if (typeof document === 'undefined') return null;

        // Lire depuis les cookies du navigateur
        const value = document.cookie
          .split('; ')
          .find(row => row.startsWith(`${name}=`))
          ?.split('=')[1];
        return value ? decodeURIComponent(value) : null;
      },
      set(name: string, value: string, options: any) {
        // Vérifier si on est dans le navigateur
        if (typeof document === 'undefined') return;

        // Écrire dans les cookies du navigateur
        let cookieString = `${name}=${encodeURIComponent(value)}`;

        if (options?.maxAge) {
          cookieString += `; max-age=${options.maxAge}`;
        }
        if (options?.path) {
          cookieString += `; path=${options.path}`;
        } else {
          cookieString += '; path=/';
        }
        if (options?.domain) {
          cookieString += `; domain=${options.domain}`;
        }
        if (options?.sameSite) {
          cookieString += `; samesite=${options.sameSite}`;
        }
        if (options?.secure) {
          cookieString += '; secure';
        }

        document.cookie = cookieString;
        console.log('[Supabase Client] Cookie set:', name);
      },
      remove(name: string, options: any) {
        // Vérifier si on est dans le navigateur
        if (typeof document === 'undefined') return;

        // Supprimer le cookie
        let cookieString = `${name}=; max-age=0`;
        if (options?.path) {
          cookieString += `; path=${options.path}`;
        } else {
          cookieString += '; path=/';
        }
        document.cookie = cookieString;
        console.log('[Supabase Client] Cookie removed:', name);
      },
    },
  });
  return supabaseInstance;
}

/** Alias pour compatibilité */
export function supabaseBrowser() {
  return createClient();
}

export default createClient;
