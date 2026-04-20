'use client';

/**
 * Instagram Asset Badge — shows at the top of every Instagram-related
 * panel (Jade/DMs, Lena/Content, comments, insights).
 *
 * Why it exists: Meta's App Review explicitly requires that each
 * screencast shows "the asset selection (IG Business account and
 * Facebook Page visible)". Having a persistent badge with the username
 * + Page name visible at the top of every panel guarantees the reviewer
 * sees the asset without any extra navigation.
 *
 * It doubles as a simple UX reminder for the business owner about
 * which Instagram identity their agents are acting on.
 */

import { useEffect, useState } from 'react';
import { useLanguage } from '@/lib/i18n/context';
import { supabaseBrowser } from '@/lib/supabase/client';

interface AssetInfo {
  igUsername: string | null;
  igBusinessId: string | null;
  pageName: string | null;
  profilePictureUrl: string | null;
  followersCount: number | null;
}

export function InstagramAssetBadge() {
  const { t } = useLanguage();
  const p = t.panels;
  const [info, setInfo] = useState<AssetInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sb = supabaseBrowser();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) {
          if (!cancelled) setLoading(false);
          return;
        }
        const { data: profile } = await sb
          .from('profiles')
          .select('instagram_username, instagram_business_account_id, facebook_page_name, instagram_profile_picture_url, instagram_followers_count')
          .eq('id', user.id)
          .maybeSingle();
        if (cancelled) return;
        setInfo({
          igUsername: profile?.instagram_username || null,
          igBusinessId: profile?.instagram_business_account_id || null,
          pageName: profile?.facebook_page_name || null,
          profilePictureUrl: profile?.instagram_profile_picture_url || null,
          followersCount: profile?.instagram_followers_count ?? null,
        });
      } catch {}
      finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 mb-3 animate-pulse">
        <div className="h-8 bg-white/5 rounded" />
      </div>
    );
  }

  const connected = !!info?.igBusinessId;

  if (!connected) {
    return (
      <div
        data-tour="ig-asset-badge"
        className="rounded-xl border-2 border-dashed border-amber-500/30 bg-amber-500/5 p-3 mb-3 flex items-center justify-between gap-3"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center text-white text-lg flex-shrink-0">
            {'\u{1F4F7}'}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-amber-300">
              {p.assetBadgeNotConnected}
            </div>
            <div className="text-[10px] text-white/50 mt-0.5">
              {p.assetBadgeTitle}
            </div>
          </div>
        </div>
        <a
          href="/api/auth/instagram-oauth"
          className="flex-shrink-0 px-3 py-2 bg-gradient-to-r from-pink-500 to-purple-600 text-white text-[11px] font-bold rounded-lg hover:opacity-90 transition"
        >
          {'\u26A1'} {p.assetBadgeConnectCta}
        </a>
      </div>
    );
  }

  return (
    <div
      data-tour="ig-asset-badge"
      className="rounded-xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/5 via-pink-500/5 to-purple-500/5 p-3 mb-3"
    >
      <div className="flex items-center gap-3">
        {/* Profile picture or gradient placeholder */}
        {info?.profilePictureUrl ? (
          <img
            src={info.profilePictureUrl}
            alt={info?.igUsername ?? ''}
            className="w-10 h-10 rounded-full object-cover border-2 border-emerald-400/40 flex-shrink-0"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 via-purple-600 to-orange-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
            {(info?.igUsername || '?')[0].toUpperCase()}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-semibold">
              {p.assetBadgeConnected}
            </span>
            <span className="text-sm font-bold text-white truncate">
              @{info?.igUsername || '—'}
            </span>
            <span className="flex-shrink-0 w-4 h-4 rounded-full bg-emerald-500/30 flex items-center justify-center">
              <span className="text-emerald-400 text-[9px]">{'\u2713'}</span>
            </span>
          </div>
          <div className="text-[10px] text-white/40 mt-0.5 truncate">
            {info?.pageName ? (
              <>
                {p.assetBadgeThrough} <span className="text-white/60">{info.pageName}</span>
                {typeof info.followersCount === 'number' && (
                  <span className="ml-1.5">· {info.followersCount.toLocaleString(typeof window !== 'undefined' && localStorage.getItem('keiro_language') === 'en' ? 'en-US' : 'fr-FR')} followers</span>
                )}
              </>
            ) : (
              <span>{p.assetBadgeStateReady}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
