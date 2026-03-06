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
    <div className="fixed top-2 left-2 z-40">
      <div className="bg-purple-600/90 text-white px-2.5 py-1 rounded-md shadow-sm flex items-center gap-1.5 text-[11px] font-medium backdrop-blur-sm">
        <span className="text-xs leading-none">👑</span>
        Admin
      </div>
    </div>
  );
}
