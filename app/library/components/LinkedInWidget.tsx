'use client';

import { useState, useEffect } from 'react';
import { LinkedInIcon } from './Icons';
import { supabaseBrowser } from '@/lib/supabase/client';

interface LinkedInWidgetProps {
  isGuest?: boolean;
  onPreparePost?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: (collapsed: boolean) => void;
  onConnectionChange?: (connected: boolean, username: string) => void;
  onConnect?: () => void;
}

export default function LinkedInWidget({
  isGuest = false,
  onPreparePost,
  isCollapsed = false,
  onToggleCollapse,
  onConnectionChange,
  onConnect
}: LinkedInWidgetProps) {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [username, setUsername] = useState<string>('');
  const [publishedDrafts, setPublishedDrafts] = useState<any[]>([]);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadLinkedInStatus();
  }, []);

  const loadLinkedInStatus = async () => {
    try {
      const supabase = supabaseBrowser();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('linkedin_user_id, linkedin_username')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('[LinkedInWidget] Error fetching profile:', error);
      }

      const isConnected = !!profile?.linkedin_user_id;
      const name = profile?.linkedin_username || '';

      setConnected(isConnected);
      setUsername(name);
      onConnectionChange?.(isConnected, name);

      if (isConnected) {
        await syncDrafts();
      }
    } catch (error) {
      console.error('[LinkedInWidget] Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const syncDrafts = async () => {
    try {
      const res = await fetch('/api/library/linkedin-drafts');
      if (res.ok) {
        const data = await res.json();
        const allDrafts = data.posts || [];
        setPublishedDrafts(allDrafts.slice(0, 6));
      }
    } catch (error) {
      console.error('[LinkedInWidget] Sync error:', error);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncDrafts();
    } finally {
      setSyncing(false);
    }
  };

  const handleConnect = () => {
    window.location.href = '/api/auth/linkedin-oauth';
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-neutral-200 p-6 animate-pulse">
        <div className="h-4 bg-neutral-200 rounded w-1/3 mb-4"></div>
        <div className="h-3 bg-neutral-200 rounded w-2/3"></div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
      <div className={`border-b border-neutral-200 bg-gradient-to-r from-blue-50 to-sky-50 ${isCollapsed ? 'p-2' : 'p-4'}`}>
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
            <LinkedInIcon className={`${isCollapsed ? 'w-8 h-8' : 'w-6 h-6'} text-[#0077B5]`} />
            {!isCollapsed && (
              <div>
                <h3 className="text-sm font-bold text-neutral-900">Vos posts LinkedIn</h3>
                {connected ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-neutral-600 font-medium">{username}</span>
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">✓</span>
                  </div>
                ) : (
                  <p className="text-xs text-neutral-500">
                    {isGuest ? 'Aperçu démo' : 'Non connecté'}
                  </p>
                )}
              </div>
            )}
          </div>
          <div className={`flex items-center gap-2 ${isCollapsed ? 'flex-col w-full' : ''}`}>
            {connected && !isCollapsed && (
              <button
                onClick={handleSync}
                disabled={syncing}
                className="p-2 border border-neutral-300 text-neutral-500 rounded-lg hover:bg-blue-50 hover:text-[#0077B5] hover:border-blue-200 transition-all disabled:opacity-50"
                title="Synchroniser les posts"
              >
                <svg className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            )}
            <button
              onClick={onPreparePost}
              className={`bg-gradient-to-r from-[#0077B5] to-blue-600 text-white font-semibold rounded-lg hover:shadow-lg transition-all ${
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
      </div>

      {!isCollapsed && (
        <>
          {isGuest ? (
            <div className="p-6 text-center">
              <LinkedInIcon className="w-12 h-12 text-[#0077B5]/30 mx-auto mb-3" />
              <p className="text-sm text-neutral-600">Créez un compte pour connecter LinkedIn</p>
            </div>
          ) : connected ? (
            publishedDrafts.length > 0 ? (
              <div className="p-3">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                  {publishedDrafts.map((draft) => (
                    <div key={draft.id} className="relative aspect-square rounded-lg overflow-hidden bg-gradient-to-br from-blue-50 to-sky-50 group">
                      {draft.media_url ? (
                        <img
                          src={draft.media_url}
                          alt="LinkedIn post"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center p-2">
                          <p className="text-[10px] text-neutral-500 line-clamp-4 text-center leading-tight">
                            {draft.caption?.substring(0, 80) || 'Post texte'}
                          </p>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-300 flex items-end">
                        <div className="w-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-white text-[10px] font-medium bg-green-600/80 px-1.5 py-0.5 rounded">Publié</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-6 text-center">
                <LinkedInIcon className="w-10 h-10 text-[#0077B5]/20 mx-auto mb-2" />
                <p className="text-xs text-neutral-500 mb-1">Aucun post publié</p>
                <p className="text-xs text-neutral-400">Publiez votre premier post depuis vos brouillons</p>
              </div>
            )
          ) : (
            <div className="p-6 text-center">
              <LinkedInIcon className="w-12 h-12 text-[#0077B5]/30 mx-auto mb-3" />
              <p className="text-sm text-neutral-600 mb-3">
                Connectez votre LinkedIn pour publier directement
              </p>
              <button
                onClick={onConnect || handleConnect}
                className="px-6 py-2 bg-gradient-to-r from-[#0077B5] to-blue-600 text-white text-sm font-medium rounded-lg hover:from-[#005f8f] hover:to-blue-700 transition-all shadow-md"
              >
                Connecter LinkedIn
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
