'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import Link from 'next/link';
import PlatformChoiceModal from './PlatformChoiceModal';

// Images de démo pour le mode visiteur
const DEMO_POSTS = [
  { id: '1', media_url: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=400&h=400&fit=crop', permalink: '#' },
  { id: '2', media_url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&h=400&fit=crop', permalink: '#' },
  { id: '3', media_url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400&h=400&fit=crop', permalink: '#' },
  { id: '4', media_url: 'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=400&h=400&fit=crop', permalink: '#' },
  { id: '5', media_url: 'https://images.unsplash.com/photo-1556761175-b413da4baf72?w=400&h=400&fit=crop', permalink: '#' },
  { id: '6', media_url: 'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=400&h=400&fit=crop', permalink: '#' },
  { id: '7', media_url: 'https://images.unsplash.com/photo-1552581234-26160f608093?w=400&h=400&fit=crop', permalink: '#' },
  { id: '8', media_url: 'https://images.unsplash.com/photo-1553877522-43269d4ea984?w=400&h=400&fit=crop', permalink: '#' },
  { id: '9', media_url: 'https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?w=400&h=400&fit=crop', permalink: '#' },
  { id: '10', media_url: 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=400&h=400&fit=crop', permalink: '#' },
  { id: '11', media_url: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=400&h=400&fit=crop', permalink: '#' },
  { id: '12', media_url: 'https://images.unsplash.com/photo-1432888622747-4eb9a8f2c293?w=400&h=400&fit=crop', permalink: '#' },
];

interface InstagramWidgetProps {
  isGuest?: boolean;
  onPreparePost?: () => void;
  onPrepareInstagram?: () => void;
  onPrepareTikTok?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: (collapsed: boolean) => void;
}

export default function InstagramWidget({
  isGuest = false,
  onPreparePost,
  onPrepareInstagram,
  onPrepareTikTok,
  isCollapsed = false,
  onToggleCollapse
}: InstagramWidgetProps) {
  const [profile, setProfile] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(!isGuest);
  const [showPlatformChoice, setShowPlatformChoice] = useState(false);

  useEffect(() => {
    if (!isGuest) {
      loadData();
    }
  }, [isGuest]);

  const loadData = async () => {
    try {
      const supabase = supabaseBrowser();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('instagram_username, instagram_business_account_id, instagram_access_token')
        .eq('id', user.id)
        .single();

      setProfile(profileData);

      if (profileData?.instagram_business_account_id) {
        console.log('[InstagramWidget] Loading Instagram posts from database...');

        // Charger les posts Instagram depuis la table dédiée
        const { data: instagramPosts, error } = await supabase
          .from('instagram_posts')
          .select('*')
          .eq('user_id', user.id)
          .order('posted_at', { ascending: false })
          .limit(6);

        if (error) {
          console.error('[InstagramWidget] Error loading posts:', error);
          // Si erreur (table n'existe pas?), déclencher la sync qui créera les posts
          console.log('[InstagramWidget] Table error - triggering sync to create posts');

          fetch('/api/instagram/sync-media', { method: 'POST', credentials: 'include' })
            .then(r => r.json())
            .then(data => {
              console.log('[InstagramWidget] Sync result:', data);
              if (data.ok) {
                // Attendre 2 secondes puis recharger
                setTimeout(() => loadData(), 2000);
              }
            })
            .catch(err => console.error('[InstagramWidget] Sync failed:', err));
        } else if (instagramPosts && instagramPosts.length > 0) {
          // Transformer en format attendu par le widget
          const transformedPosts = instagramPosts.map((post: any) => ({
            id: post.id,
            caption: post.caption || '',
            media_url: post.original_media_url,
            thumbnail_url: post.cached_media_url,
            cached_media_url: post.cached_media_url, // ✅ FIX: Ajouter cached_media_url
            cachedUrl: post.cached_media_url, // URL stable depuis Storage
            permalink: post.permalink, // Lien vers le vrai post Instagram
            media_type: post.media_type,
            timestamp: post.posted_at
          }));

          console.log('[InstagramWidget] Loaded', transformedPosts.length, 'Instagram posts');
          setPosts(transformedPosts);
        } else {
          console.log('[InstagramWidget] No Instagram posts found - triggering sync');

          // Si pas de posts, lancer la sync immédiatement
          fetch('/api/instagram/sync-media', { method: 'POST', credentials: 'include' })
            .then(r => r.json())
            .then(data => {
              console.log('[InstagramWidget] Sync result:', data);
              if (data.ok) {
                console.log('[InstagramWidget] Initial sync completed:', data.cached, 'posts');
                // Attendre 2 secondes puis recharger
                setTimeout(() => loadData(), 2000);
              }
            })
            .catch(err => console.error('[InstagramWidget] Sync failed:', err));
        }
      }
    } catch (error) {
      console.error('[InstagramWidget] Error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-neutral-200 p-2">
        <div className="animate-pulse">
          <div className="h-4 bg-neutral-200 rounded w-32 mb-3"></div>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-1">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="aspect-square bg-neutral-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Mode visiteur ou pas encore connecté
  if (isGuest || !profile?.instagram_username) {
    const displayPosts = isGuest ? DEMO_POSTS : [];

    return (
      <div className="bg-white rounded-xl shadow-lg border border-neutral-200 overflow-hidden">
        <div className="p-4 border-b border-neutral-200 bg-gradient-to-r from-purple-50 to-pink-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-pink-500" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
              </svg>
              <div>
                <h3 className="font-semibold text-neutral-900 text-sm">Vos posts Instagram</h3>
                <p className="text-xs text-neutral-500">{isGuest ? 'Aperçu démo' : 'Non connecté'}</p>
              </div>
            </div>
            <button
              onClick={onPreparePost}
              className="px-3 py-1.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-semibold rounded-lg hover:shadow-lg transition-all"
            >
              Préparer un post
            </button>
          </div>
        </div>

        {isGuest ? (
          <div className="grid grid-cols-3 md:grid-cols-6 gap-1 p-2">
            {displayPosts.slice(0, 6).map((post) => (
              <div
                key={post.id}
                className="relative aspect-square rounded-lg overflow-hidden bg-neutral-100"
              >
                <img
                  src={post.media_url}
                  alt="Demo post"
                  className="w-full h-full object-cover opacity-70"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end justify-center pb-2">
                  <span className="text-white text-xs font-medium">Exemple</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center">
            <svg className="w-12 h-12 text-pink-300 mx-auto mb-3" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
            </svg>
            <p className="text-sm text-neutral-600 mb-3">
              Connectez votre Instagram pour voir vos posts
            </p>
            <Link
              href="/api/auth/instagram-oauth"
              className="inline-block px-6 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-medium rounded-lg hover:shadow-lg transition-all"
            >
              Connecter Instagram
            </Link>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-lg border border-neutral-200 overflow-hidden">
      <div className={`border-b border-neutral-200 bg-gradient-to-r from-purple-50 to-pink-50 ${isCollapsed ? 'p-2' : 'p-4'}`}>
        <div className={`flex ${isCollapsed ? 'flex-col items-center gap-2' : 'items-center justify-between mb-3'}`}>
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
            <span className={`${isCollapsed ? 'text-2xl' : 'text-xl'}`}>📸</span>
            {!isCollapsed && (
              <div>
                <h3 className="font-semibold text-neutral-900 text-sm">Vos posts Instagram</h3>
                <p className="text-xs text-neutral-500">@{profile.instagram_username}</p>
              </div>
            )}
          </div>
          <button
            onClick={() => {
              // Le bouton du widget ouvre TOUJOURS le modal Instagram directement
              if (onPrepareInstagram) {
                onPrepareInstagram();
              } else {
                onPreparePost?.();
              }
            }}
            className={`bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-lg hover:shadow-lg transition-all ${
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

      {/* Modal de choix de plateforme */}
      {showPlatformChoice && (
        <PlatformChoiceModal
          onClose={() => setShowPlatformChoice(false)}
          onSelectInstagram={() => {
            setShowPlatformChoice(false);
            onPrepareInstagram?.();
          }}
          onSelectTikTok={() => {
            setShowPlatformChoice(false);
            onPrepareTikTok?.();
          }}
        />
      )}

      {!isCollapsed && (posts.length > 0 ? (
        <div className="p-3">
          <div className="grid grid-cols-3 gap-2">
          {posts.map((post) => {
            // Utiliser UNIQUEMENT cached_media_url (Supabase Storage)
            const imageUrl = post.cached_media_url || post.thumbnail_url || post.media_url;
            const isFromCache = !!post.cached_media_url;

            // DEBUG: Afficher l'URL de l'image
            console.log('[InstagramWidget] 🔍 Image URL for post', post.id.substring(0, 12), ':', imageUrl);
            console.log('[InstagramWidget] 📦 Post data:', {
              cached: post.cached_media_url,
              thumbnail: post.thumbnail_url,
              media: post.media_url
            });

            return (
              <a
                key={post.id}
                href={post.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="relative aspect-square rounded-lg overflow-hidden group cursor-pointer bg-neutral-100"
                title={isFromCache ? 'Image depuis votre stockage' : 'Image Instagram (peut expirer)'}
              >
                {/* Image Instagram */}
                <img
                  src={imageUrl}
                  alt={post.caption?.substring(0, 30) || 'Instagram post'}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                  onLoad={(e) => {
                    const img = e.target as HTMLImageElement;
                    console.log('[InstagramWidget] ✅ Image loaded:', post.id.substring(0, 12), 'Size:', img.naturalWidth, 'x', img.naturalHeight);
                  }}
                  onError={(e) => {
                    const img = e.target as HTMLImageElement;
                    console.error('[InstagramWidget] ❌ Image failed:', post.id.substring(0, 12));
                    console.error('[InstagramWidget] ❌ Failed URL:', img.src);
                  }}
                />
                {/* Overlay hover */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-300 flex items-center justify-center">
                  <svg className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                  </svg>
                </div>
              </a>
            );
          })}
          </div>
        </div>
      ) : (
        <div className="p-6 text-center">
          <svg className="w-12 h-12 text-neutral-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-sm text-neutral-500">Aucun post publié</p>
          <p className="text-xs text-neutral-400 mt-1">Publiez votre premier post !</p>
        </div>
      ))}
    </div>
  );
}
