'use client';

import { useState, useEffect } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

interface TikTokWidgetProps {
  onConnect?: () => void;
  onPreparePost?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: (collapsed: boolean) => void;
}

export default function TikTokWidget({ onConnect, onPreparePost, isCollapsed = false, onToggleCollapse }: TikTokWidgetProps) {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [tiktokUsername, setTiktokUsername] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    totalVideos: number;
    totalViews: number;
    totalLikes: number;
    avgEngagement: string;
  } | null>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [failedThumbnails, setFailedThumbnails] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadTikTokStatus();
  }, []);

  const handleSyncMedia = async () => {
    setSyncing(true);
    try {
      const response = await fetch('/api/tiktok/sync-media', {
        method: 'POST',
        credentials: 'include'
      });

      const data = await response.json();

      if (data.ok) {
        console.log('[TikTokWidget] Synced', data.synced, 'videos');
        // Reload status after sync
        await loadTikTokStatus();

        if (data.synced === 0) {
          alert(
            `ℹ️ Synchronisation terminée\n\n` +
            `${data.message || 'Aucune vidéo trouvée sur votre compte TikTok.'}\n\n` +
            `Si vous venez de publier, attendez quelques minutes et réessayez.`
          );
        } else {
          alert(`✅ ${data.synced} vidéo(s) synchronisée(s) depuis TikTok`);
        }
      } else {
        // Check if needs reconnection
        if (data.needsReconnect) {
          const reconnect = confirm(
            `⚠️ Permissions insuffisantes\n\n` +
            `${data.error}\n\n` +
            `Voulez-vous reconnecter votre compte TikTok ?`
          );

          if (reconnect) {
            window.location.href = '/api/auth/tiktok-oauth';
            return;
          }
        }

        throw new Error(data.error || 'Failed to sync');
      }
    } catch (error: any) {
      console.error('[TikTokWidget] Error syncing:', error);
      alert(
        `❌ Erreur de synchronisation\n\n` +
        `${error.message}\n\n` +
        `Solutions:\n` +
        `• Reconnectez votre compte TikTok\n` +
        `• Vérifiez vos autorisations\n` +
        `• Contactez le support si cela persiste`
      );
    } finally {
      setSyncing(false);
    }
  };

  const loadTikTokStatus = async () => {
    try {
      const supabase = supabaseBrowser();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      console.log('[TikTokWidget] Loading TikTok status for user:', user.id);

      // Check if TikTok is connected
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('tiktok_user_id, tiktok_username, tiktok_display_name')
        .eq('id', user.id)
        .single();

      console.log('[TikTokWidget] Profile data:', profile, 'Error:', profileError);

      if (profile?.tiktok_user_id) {
        setConnected(true);
        setTiktokUsername(profile.tiktok_username || profile.tiktok_display_name || null);
        console.log('[TikTokWidget] TikTok connected, username:', profile.tiktok_username);

        // Load TikTok posts stats
        const { data: tiktokPosts, error: postsError } = await supabase
          .from('tiktok_posts')
          .select('*')
          .eq('user_id', user.id)
          .order('posted_at', { ascending: false })
          .limit(6);

        console.log('[TikTokWidget] TikTok posts:', tiktokPosts, 'Error:', postsError);

        if (tiktokPosts && tiktokPosts.length > 0) {
          setPosts(tiktokPosts);

          const totalVideos = tiktokPosts.length;
          const totalViews = tiktokPosts.reduce((sum: number, p: any) => sum + (p.view_count || 0), 0);
          const totalLikes = tiktokPosts.reduce((sum: number, p: any) => sum + (p.like_count || 0), 0);
          const avgEngagement = totalViews > 0
            ? ((totalLikes / totalViews) * 100).toFixed(2)
            : '0';

          setStats({
            totalVideos,
            totalViews,
            totalLikes,
            avgEngagement: `${avgEngagement}%`,
          });

          console.log('[TikTokWidget] Stats calculated:', { totalVideos, totalViews, totalLikes });
        } else {
          console.log('[TikTokWidget] No TikTok posts found, you may need to sync');
        }
      } else {
        console.log('[TikTokWidget] TikTok not connected');
      }
    } catch (error) {
      console.error('[TikTokWidget] Error loading status:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-neutral-200 p-6 animate-pulse">
        <div className="h-4 bg-neutral-200 rounded w-1/3 mb-4"></div>
        <div className="h-3 bg-neutral-200 rounded w-2/3"></div>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
        <div className={`border-b border-neutral-200 bg-gradient-to-r from-pink-50 to-cyan-50 ${isCollapsed ? 'p-2' : 'p-4'}`}>
          <div className={`flex ${isCollapsed ? 'flex-col items-center gap-2' : 'items-center justify-between'}`}>
            <div className={`flex items-center gap-2 ${isCollapsed ? 'flex-col' : ''}`}>
              <button
                onClick={() => onToggleCollapse?.(!isCollapsed)}
                className="p-1 hover:bg-white/50 rounded transition-colors"
                title={isCollapsed ? "Développer" : "Réduire"}
              >
                <svg
                  className={`w-4 h-4 text-neutral-600 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              <span className={`${isCollapsed ? 'text-2xl' : 'text-xl'}`}>🎵</span>
              {!isCollapsed && (
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">Vos posts TikTok</h3>
                  <p className="text-xs text-neutral-500">Non connecté</p>
                </div>
              )}
            </div>
            <button
              onClick={isCollapsed ? onConnect : onPreparePost}
              className={`bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold rounded-lg hover:shadow-lg transition-all ${
                isCollapsed
                  ? 'w-full px-2 py-1.5 text-[10px]'
                  : 'px-3 py-1.5 text-xs'
              }`}
              title={isCollapsed ? (onConnect ? "Se connecter" : "Préparer un post") : ""}
            >
              {isCollapsed ? 'Connecter' : 'Préparer un post'}
            </button>
          </div>
        </div>
        {!isCollapsed && (
          <div className="p-6 text-center">
            <svg className="w-12 h-12 text-cyan-300 mx-auto mb-3" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z"/>
            </svg>
            <p className="text-sm text-neutral-600 mb-3">
              Connectez votre TikTok pour publier automatiquement
            </p>
            <button
              onClick={onConnect}
              className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-medium rounded-lg hover:shadow-lg transition-all"
            >
              Connecter TikTok
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
      {/* Header */}
      <div className={`border-b border-neutral-200 bg-gradient-to-r from-pink-50 to-cyan-50 ${isCollapsed ? 'p-2' : 'p-4'}`}>
        <div className={`flex ${isCollapsed ? 'flex-col items-center gap-2' : 'items-center justify-between'}`}>
          <div className={`flex items-center gap-2 ${isCollapsed ? 'flex-col' : ''}`}>
            <button
              onClick={() => onToggleCollapse?.(!isCollapsed)}
              className="p-1 hover:bg-white/50 rounded transition-colors"
              title={isCollapsed ? "Développer" : "Réduire"}
            >
              <svg
                className={`w-4 h-4 text-neutral-600 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <span className={`${isCollapsed ? 'text-2xl' : 'text-xl'}`}>🎵</span>
            {!isCollapsed && (
              <div>
                <h3 className="text-sm font-bold text-neutral-900">Vos posts TikTok</h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-600 font-medium">
                    {tiktokUsername ? `@${tiktokUsername}` : 'Compte TikTok'}
                  </span>
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                    ✓
                  </span>
                </div>
              </div>
            )}
          </div>
          <button
            onClick={onPreparePost}
            className={`bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold rounded-lg hover:shadow-lg transition-all ${
              isCollapsed
                ? 'w-full px-2 py-1.5 text-[10px]'
                : 'px-3 py-1.5 text-xs'
            }`}
            title={isCollapsed ? "Préparer un post" : ""}
          >
            {isCollapsed ? '+ Post' : 'Préparer un post'}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <>
          {/* Videos Grid - Same format as Instagram */}
          {posts.length > 0 ? (
            <div className="max-w-2xl mx-auto p-3">
              <div className="grid grid-cols-3 gap-2">
              {posts.map((post) => {
                const thumbnailUrl = post.cached_thumbnail_url || post.cover_image_url;
                const hasError = failedThumbnails.has(post.id);

                return (
                <a
                  key={post.id}
                  href={post.share_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative aspect-square rounded-lg overflow-hidden group cursor-pointer bg-gradient-to-br from-cyan-50 to-blue-50"
                >
                  {/* Thumbnail - Prioritize cached_thumbnail_url */}
                  {!hasError && thumbnailUrl ? (
                    <img
                      src={thumbnailUrl}
                      alt={post.video_description?.substring(0, 30) || 'TikTok video'}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                      onError={(e) => {
                        console.error('[TikTokWidget] Thumbnail failed:', thumbnailUrl);
                        setFailedThumbnails(prev => new Set(prev).add(post.id));
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="text-center p-2">
                        <svg className="w-8 h-8 text-cyan-400 mx-auto mb-1" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                        </svg>
                        <p className="text-[10px] text-neutral-400 leading-tight">{post.video_description?.substring(0, 40) || 'Vidéo TikTok'}</p>
                      </div>
                    </div>
                  )}

                  {/* Simple overlay on hover - No stats */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-300 flex items-center justify-center">
                    <svg className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                    </svg>
                  </div>
                </a>
              ))}
              </div>
            </div>
      ) : (
        <div className="p-8 text-center">
          <svg className="w-12 h-12 mx-auto text-neutral-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <p className="text-sm text-neutral-500 mb-3">Aucune vidéo synchronisée</p>
          <p className="text-xs text-neutral-400 mb-4">Synchronise tes vidéos TikTok existantes ou publie ta première vidéo !</p>
          <button
            onClick={handleSyncMedia}
            disabled={syncing}
            className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-medium rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 mx-auto"
          >
            {syncing ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Synchronisation...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Synchroniser mes vidéos TikTok</span>
              </>
            )}
          </button>
        </div>
      )}
        </>
      )}
    </div>
  );
}
