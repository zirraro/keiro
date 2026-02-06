import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export async function supabaseServer() {
  const cookieStore = await cookies();

  // Vérifier si les variables d'env sont configurées
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('[Supabase Server] Missing env vars, returning stub');
    // Retourner un stub minimal si pas configuré
    return {
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
        getSession: async () => ({ data: { session: null }, error: null }),
      },
      from: () => ({
        select: async () => ({ data: [], error: null }),
        insert: async () => ({ data: null, error: null }),
        update: async () => ({ data: null, error: null }),
        delete: async () => ({ data: null, error: null }),
      }),
      storage: {
        from: () => ({
          upload: async () => ({ data: null, error: null }),
          download: async () => ({ data: null, error: null }),
          remove: async () => ({ data: null, error: null }),
          list: async () => ({ data: [], error: null }),
        }),
      },
    } as any;
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch (error) {
          // cookies().set() peut échouer dans les Server Components
          // C'est normal, on ignore l'erreur
        }
      },
    },
  });
}

// Client admin avec service role (pour storage, admin operations)
export function supabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.warn('[Supabase Admin] Missing env vars, returning stub');
    // Retourner un stub minimal si pas configuré
    return {
      auth: {
        admin: {
          listUsers: async () => ({ data: { users: [] }, error: null }),
        },
      },
      from: () => ({
        select: async () => ({ data: [], error: null }),
        insert: async () => ({ data: null, error: null }),
        update: async () => ({ data: null, error: null }),
        delete: async () => ({ data: null, error: null }),
      }),
      storage: {
        from: () => ({
          upload: async () => ({ data: null, error: null }),
          download: async () => ({ data: null, error: null }),
          remove: async () => ({ data: null, error: null }),
          list: async () => ({ data: [], error: null }),
          getPublicUrl: () => ({ data: { publicUrl: '' } }),
        }),
      },
    } as any;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// Helper pour générer une URL publique depuis un chemin de storage
export function publicUrlFromPath(path: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!supabaseUrl) {
    console.warn('[publicUrlFromPath] Missing SUPABASE_URL');
    return '';
  }

  // Format: https://PROJECT_ID.supabase.co/storage/v1/object/public/BUCKET/PATH
  // Le path devrait déjà inclure le bucket (ex: "assets/library/file.png")
  const [bucket, ...rest] = path.split('/');
  const filePath = rest.join('/');

  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${filePath}`;
}

export default supabaseServer;
