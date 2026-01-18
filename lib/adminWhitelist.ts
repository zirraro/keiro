/**
 * Système de whitelist admin
 * Les admins ont générations illimitées SANS watermark
 *
 * NOUVEAU : Utilise la colonne is_admin de la table profiles
 * Pour ajouter un admin, exécuter dans Supabase SQL Editor :
 * UPDATE public.profiles SET is_admin = true WHERE email = 'email@example.com';
 */

// Liste de fallback si la DB n'est pas accessible
export const ADMIN_EMAILS = [
  'contact@keiroai.com',
];

/**
 * Vérifie si un email est admin (fallback pour compatibilité)
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalizedEmail = email.toLowerCase().trim();
  return ADMIN_EMAILS.map(e => e.toLowerCase().trim()).includes(normalizedEmail);
}

/**
 * Vérifie si un utilisateur est admin via la DB (méthode recommandée)
 */
export async function isAdminUser(userId: string): Promise<boolean> {
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();

    const { data, error } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('[AdminWhitelist] Error checking admin status:', error);
      return false;
    }

    return data?.is_admin === true;
  } catch (error) {
    console.error('[AdminWhitelist] Error:', error);
    return false;
  }
}
