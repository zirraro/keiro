import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Crée un client Supabase côté serveur.
 * Note: Next 15 peut typer cookies() comme Promise dans certains contextes,
 * on cast en `any` pour rester synchrone (attendu par @supabase/ssr).
 */
export function supabaseServer() {
  // Forcer un store "synchrone" pour satisfaire les callbacks du client SSR
  const cookieStore = cookies() as any;

  const getCookie = (name: string) => {
    try {
      const c = cookieStore?.get?.(name);
      return c?.value;
    } catch {
      return undefined;
    }
  };

  const setCookie = (name: string, value: string, options?: CookieOptions) => {
    try {
      // Certains environnements (route handlers) autorisent set(); sinon on no-op.
      cookieStore?.set?.({ name, value, ...options });
    } catch {
      // no-op fallback
    }
  };

  const removeCookie = (name: string, options?: CookieOptions) => {
    try {
      cookieStore?.set?.({ name, value: '', ...(options || {}), maxAge: 0 });
    } catch {
      // no-op fallback
    }
  };

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: getCookie,
        set: setCookie,
        remove: removeCookie,
      },
    }
  );

  return supabase;
}
