'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { isAdminUser, isAdminEmail } from '@/lib/adminWhitelist';

/**
 * Badge qui s'affiche en haut de page pour indiquer le mode Admin
 * (Générations illimitées, pas de watermark)
 */
export default function AdminBadge() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAdmin() {
      try {
        const supabase = supabaseBrowser();
        const { data: { user } } = await supabase.auth.getUser();
        console.log('[AdminBadge] User check:', {
          user,
          email: user?.email,
          userId: user?.id
        });

        if (!user) {
          setLoading(false);
          return;
        }

        // Vérifier via la DB d'abord
        const isAdminFromDB = await isAdminUser(user.id);
        console.log('[AdminBadge] isAdminFromDB:', isAdminFromDB);

        // Fallback sur email si la DB check échoue
        const isAdminFromEmail = user.email ? isAdminEmail(user.email) : false;
        console.log('[AdminBadge] isAdminFromEmail:', isAdminFromEmail);

        if (isAdminFromDB || isAdminFromEmail) {
          setIsAdmin(true);
        }
      } catch (error) {
        console.error('[AdminBadge] Error checking admin status:', error);
      } finally {
        setLoading(false);
      }
    }

    checkAdmin();
  }, []);

  if (loading || !isAdmin) return null;

  return (
    <div className="fixed top-4 right-4 z-50">
      <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 animate-pulse">
        <span className="text-lg">👑</span>
        <div className="text-sm font-semibold">
          <div>Mode Admin</div>
          <div className="text-xs opacity-90">Générations illimitées</div>
        </div>
      </div>
    </div>
  );
}
