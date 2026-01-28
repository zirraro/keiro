'use client';

import { useState, useEffect } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

interface TikTokWidgetProps {
  onConnect?: () => void;
  onPreparePost?: () => void;
}

export default function TikTokWidget({ onConnect, onPreparePost }: TikTokWidgetProps) {
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
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    loadTikTokStatus();
  }, []);

  const loadTikTokStatus = async () => {
    try {
      const supabase = supabaseBrowser();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      // Check if TikTok is connected
      const { data: profile } = await supabase
        .from('profiles')
        .select('tiktok_user_id, tiktok_username, tiktok_display_name')
        .eq('id', user.id)
        .single();

      if (profile?.tiktok_user_id) {
        setConnected(true);
        setTiktokUsername(profile.tiktok_username);

        // Load TikTok posts stats
        const { data: tiktokPosts } = await supabase
          .from('tiktok_posts')
          .select('*')
          .eq('user_id', user.id)
          .order('posted_at', { ascending: false })
          .limit(6);

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
        }
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
        <div className="p-4 border-b border-neutral-200 bg-gradient-to-r from-pink-50 to-cyan-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsCollapsed(!isCollapsed)}
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
              <span className="text-xl">🎵</span>
              <div>
                <h3 className="text-sm font-bold text-neutral-900">Vos posts TikTok</h3>
                <p className="text-xs text-neutral-500">Non connecté</p>
              </div>
            </div>
            <button
              onClick={onPreparePost}
              className="px-3 py-1.5 bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-xs font-semibold rounded-lg hover:shadow-lg transition-all"
            >
              Préparer un post
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
      <div className="p-4 border-b border-neutral-200 bg-gradient-to-r from-pink-50 to-cyan-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
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
            <span className="text-xl">🎵</span>
            <div>
              <h3 className="text-sm font-bold text-neutral-900">Vos posts TikTok</h3>
              <div className="flex items-center gap-2">
                {tiktokUsername && (
                  <span className="text-xs text-neutral-600">
                    @{tiktokUsername}
                  </span>
                )}
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                  Connecté
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onPreparePost}
            className="px-3 py-1.5 bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-xs font-semibold rounded-lg hover:shadow-lg transition-all"
          >
            Préparer un post
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <>
          {/* Stats */}
          {stats && (
        <div className="p-4 bg-gradient-to-r from-pink-50 to-cyan-50 border-b border-neutral-200">
          <div className="grid grid-cols-4 gap-3 text-center">
            <div>
              <p className="text-xl font-bold text-neutral-900">{stats.totalVideos}</p>
              <p className="text-xs text-neutral-600">Vidéos</p>
            </div>
            <div>
              <p className="text-xl font-bold text-neutral-900">
                {stats.totalViews > 1000
                  ? `${(stats.totalViews / 1000).toFixed(1)}k`
                  : stats.totalViews}
              </p>
              <p className="text-xs text-neutral-600">Vues</p>
            </div>
            <div>
              <p className="text-xl font-bold text-neutral-900">
                {stats.totalLikes > 1000
                  ? `${(stats.totalLikes / 1000).toFixed(1)}k`
                  : stats.totalLikes}
              </p>
              <p className="text-xs text-neutral-600">Likes</p>
            </div>
            <div>
              <p className="text-xl font-bold text-neutral-900">{stats.avgEngagement}</p>
              <p className="text-xs text-neutral-600">Engagement</p>
            </div>
          </div>
        </div>
      )}

      {/* Videos Grid */}
      {posts.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 p-3">
          {posts.map((post) => (
            <a
              key={post.id}
              href={post.share_url}
              target="_blank"
              rel="noopener noreferrer"
              className="relative aspect-[9/16] rounded-lg overflow-hidden group cursor-pointer bg-gradient-to-br from-pink-50 to-cyan-50"
            >
              {/* Thumbnail */}
              <img
                src={post.cached_thumbnail_url || post.cover_image_url}
                alt={post.title || 'TikTok video'}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
              />

              {/* Overlay with stats */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                <div className="text-white text-xs font-medium">
                  <div className="flex items-center gap-1">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                      <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                    </svg>
                    {post.view_count > 1000
                      ? `${(post.view_count / 1000).toFixed(1)}k`
                      : post.view_count || 0}
                  </div>
                </div>
              </div>

              {/* Play icon */}
              <div className="absolute top-2 right-2 bg-black/50 rounded-full p-1">
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                </svg>
              </div>
            </a>
          ))}
        </div>
      ) : (
        <div className="p-8 text-center">
          <svg className="w-12 h-12 mx-auto text-neutral-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <p className="text-sm text-neutral-500">Aucune vidéo publiée</p>
          <p className="text-xs text-neutral-400 mt-1">Publie ta première vidéo TikTok !</p>
        </div>
      )}
        </>
      )}
    </div>
  );
}
