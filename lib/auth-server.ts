import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

/**
 * Récupère l'utilisateur authentifié depuis les cookies Supabase
 * Utilisé dans les API Routes server-side
 */
export async function getAuthUser() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const cookieStore = await cookies();
    let accessToken: string | undefined;
    const allCookies = cookieStore.getAll();

    // Chercher le cookie Supabase avec pattern sb-{PROJECT_ID}-auth-token
    for (const cookie of allCookies) {
      if (cookie.name.startsWith('sb-') && cookie.name.endsWith('-auth-token')) {
        try {
          let cookieValue = cookie.value;

          // Décoder le base64 si nécessaire
          if (cookieValue.startsWith('base64-')) {
            const base64Content = cookieValue.substring(7);
            cookieValue = Buffer.from(base64Content, 'base64').toString('utf-8');
          }

          const parsed = JSON.parse(cookieValue);
          accessToken = parsed.access_token || (Array.isArray(parsed) ? parsed[0] : undefined);
          break;
        } catch (err) {
          console.error('[AuthServer] Error processing cookie:', err);
        }
      }
    }

    // Fallback aux anciens noms
    if (!accessToken) {
      const sbAccessToken = cookieStore.get('sb-access-token');
      const sbAuthToken = cookieStore.get('sb-auth-token');
      accessToken = sbAccessToken?.value || sbAuthToken?.value;
    }

    if (!accessToken) {
      return { user: null, error: 'No access token found' };
    }

    // Récupérer l'utilisateur avec le token
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);

    if (error || !user) {
      return { user: null, error: error?.message || 'User not found' };
    }

    return { user, error: null };
  } catch (error: any) {
    console.error('[AuthServer] Error getting user:', error);
    return { user: null, error: error.message };
  }
}
