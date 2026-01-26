'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import Link from 'next/link';

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
}

export default function InstagramWidget({ isGuest = false }: InstagramWidgetProps) {
  const [profile, setProfile] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(!isGuest);
  const [syncing, setSyncing] = useState(false);
  const [testingUrls, setTestingUrls] = useState(false);
  const [fixingUrls, setFixingUrls] = useState(false);

  useEffect(() => {
    if (!isGuest) {
      loadData();
    }
  }, [isGuest]);

  const testStorageUrls = async () => {
    setTestingUrls(true);
    try {
      const postsWithCache = posts.filter(p => p.cachedUrl);

      if (postsWithCache.length === 0) {
        alert('Aucune URL cachée trouvée.\n\nCliquez d\'abord sur "Synchroniser les images".');
        return;
      }

      console.log('[InstagramWidget] Testing Storage URLs...');
      let results = '📊 TEST DES URLS STORAGE:\n\n';

      for (const post of postsWithCache.slice(0, 3)) { // Tester 3 URLs max
        results += `📷 Post ${post.id}:\n`;
        results += `URL: ${post.cachedUrl}\n`;

        try {
          const response = await fetch(post.cachedUrl);
          if (response.ok) {
            results += `✅ Status: ${response.status} OK\n`;
            results += `Type: ${response.headers.get('content-type')}\n`;
          } else {
            results += `❌ Status: ${response.status} ${response.statusText}\n`;
          }
        } catch (error: any) {
          results += `❌ Erreur: ${error.message}\n`;
        }
        results += '\n';
      }

      results += '\n💡 SI ERREUR 404:\nLe bucket n\'est pas public.\nAllez dans Supabase → Storage → instagram-media → Cochez "Public"';

      alert(results);
      console.log('[InstagramWidget] Test results:', results);
    } catch (error) {
      console.error('[InstagramWidget] Test error:', error);
      alert('Erreur lors du test');
    } finally {
      setTestingUrls(false);
    }
  };

  const handleFixCachedUrls = async () => {
    const confirm = window.confirm(
      '🔧 Corriger les URLs en base de données ?\n\n' +
      'Cette action va :\n' +
      '• Chercher les images dans Storage\n' +
      '• Mettre à jour la BDD avec les URLs correctes\n' +
      '• Afficher le nombre d\'images corrigées\n\n' +
      'À utiliser si les images sont noires malgré la synchronisation.'
    );

    if (!confirm) return;

    setFixingUrls(true);
    try {
      console.log('[InstagramWidget] Fixing cached URLs in database...');
      const response = await fetch('/api/instagram/update-cached-urls', {
        method: 'POST',
      });
      const data = await response.json();

      if (data.ok) {
        console.log('[InstagramWidget] Fix successful:', data);
        alert(
          `✅ Correction réussie !\n\n` +
          `Entrées mises à jour : ${data.updated}\n` +
          `Entrées créées : ${data.created}\n` +
          `Total traité : ${data.total}\n\n` +
          `Rechargez la page pour voir les images.`
        );

        // Recharger les données
        await loadData();
      } else {
        console.error('[InstagramWidget] Fix failed:', data);
        alert(`❌ Erreur : ${data.error}`);
      }
    } catch (error) {
      console.error('[InstagramWidget] Fix error:', error);
      alert('Erreur lors de la correction des URLs');
    } finally {
      setFixingUrls(false);
    }
  };

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      console.log('[InstagramWidget] Manual sync triggered...');
      const response = await fetch('/api/instagram/sync-media', {
        method: 'POST',
      });
      const data = await response.json();

      if (data.ok) {
        console.log('[InstagramWidget] Sync successful:', data);
        console.log('[InstagramWidget] Cached posts with URLs:', data.posts);

        // Mettre à jour directement les posts avec les URLs cachées
        if (data.posts && data.posts.length > 0) {
          // Récupérer les posts actuels
          const supabase = supabaseBrowser();
          const { data: { user } } = await supabase.auth.getUser();

          if (user) {
            const { data: profileData } = await supabase
              .from('profiles')
              .select('instagram_business_account_id, instagram_access_token')
              .eq('id', user.id)
              .single();

            if (profileData?.instagram_business_account_id) {
              // Récupérer les posts Instagram
              const fields = 'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp';
              const instagramApiUrl = `https://graph.facebook.com/v20.0/${profileData.instagram_business_account_id}/media?fields=${fields}&limit=24&access_token=${profileData.instagram_access_token}`;

              const postsResponse = await fetch(instagramApiUrl);
              const postsData = await postsResponse.json();

              if (postsData.data) {
                // Merger les posts avec les URLs cachées
                const mergedPosts = postsData.data.map((post: any) => {
                  const cachedPost = data.posts.find((cp: any) => cp.id === post.id);
                  return {
                    ...post,
                    cachedUrl: cachedPost?.cachedUrl || null
                  };
                });

                console.log('[InstagramWidget] Merged posts:', mergedPosts);
                setPosts(mergedPosts.slice(0, 12));
              }
            }
          }
        }

        alert(`✓ Synchronisation réussie !\n\n${data.cached} images sur ${data.total} ont été téléchargées.\n\nLes images devraient maintenant s'afficher.`);
      } else {
        console.error('[InstagramWidget] Sync failed:', data);
        alert(`Erreur de synchronisation: ${data.error}`);
      }
    } catch (error) {
      console.error('[InstagramWidget] Sync error:', error);
      alert('Erreur lors de la synchronisation');
    } finally {
      setSyncing(false);
    }
  };

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
        .select('instagram_username, instagram_business_account_id')
        .eq('id', user.id)
        .single();

      setProfile(profileData);

      if (profileData?.instagram_business_account_id) {
        console.log('[InstagramWidget] Fetching Instagram posts...');
        const response = await fetch('/api/instagram/posts');
        if (response.ok) {
          const data = await response.json();
          console.log('[InstagramWidget] Received posts:', {
            total: data.posts?.length,
            cached: data.cached,
            hasCachedUrls: data.posts?.some((p: any) => p.cachedUrl)
          });
          setPosts(data.posts?.slice(0, 12) || []);
        } else {
          console.error('[InstagramWidget] Failed to fetch posts:', response.status);
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
      <div className="bg-white rounded-xl shadow-lg border border-neutral-200 p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-neutral-200 rounded w-32 mb-3"></div>
          <div className="grid grid-cols-6 gap-1">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
              <div key={i} className="aspect-square bg-neutral-200 rounded"></div>
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
            {isGuest && (
              <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full font-medium">
                Démo
              </span>
            )}
          </div>
        </div>

        {isGuest ? (
          <div className="grid grid-cols-6 gap-1 p-2">
            {displayPosts.map((post) => (
              <div
                key={post.id}
                className="relative aspect-square rounded overflow-hidden bg-neutral-100"
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
      <div className="p-4 border-b border-neutral-200 bg-gradient-to-r from-purple-50 to-pink-50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-pink-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
            </svg>
            <div>
              <h3 className="font-semibold text-neutral-900 text-sm">Vos posts Instagram</h3>
              <p className="text-xs text-neutral-500">@{profile.instagram_username}</p>
            </div>
          </div>
          <a
            href={`https://www.instagram.com/${profile.instagram_username}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-pink-600 hover:text-pink-700 font-medium flex items-center gap-1"
          >
            Voir sur Instagram
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>

        {/* Boutons de synchronisation et test */}
        <div className="space-y-2">
          <button
            onClick={handleManualSync}
            disabled={syncing}
            className="w-full px-3 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-medium rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {syncing ? (
              <>
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Synchronisation...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Synchroniser les images
              </>
            )}
          </button>

          {/* Bouton de test - visible seulement si on a des posts */}
          {posts.length > 0 && (
            <button
              onClick={testStorageUrls}
              disabled={testingUrls}
              className="w-full px-3 py-2 bg-blue-500 text-white text-xs font-medium rounded-lg hover:bg-blue-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {testingUrls ? (
                <>
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Test en cours...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Tester les URLs Storage
                </>
              )}
            </button>
          )}

          {/* Bouton pour corriger les URLs en BDD */}
          <button
            onClick={handleFixCachedUrls}
            disabled={fixingUrls}
            className="w-full px-3 py-2 bg-orange-500 text-white text-xs font-medium rounded-lg hover:bg-orange-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {fixingUrls ? (
              <>
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Correction en cours...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                🔧 Corriger URLs en BDD
              </>
            )}
          </button>
        </div>
      </div>

      {posts.length > 0 ? (
        <div className="grid grid-cols-6 gap-1 p-2">
          {posts.map((post) => {
            // Utiliser UNIQUEMENT cachedUrl si disponible, sinon fallback
            const imageUrl = post.cachedUrl || post.thumbnail_url || post.media_url;

            // Debug détaillé
            console.log(`[InstagramWidget] Post ${post.id}:`, {
              hasCachedUrl: !!post.cachedUrl,
              cachedUrl: post.cachedUrl,
              fallbackUrl: post.thumbnail_url || post.media_url,
              usingUrl: imageUrl
            });

            return (
              <a
                key={post.id}
                href={post.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="relative aspect-square rounded overflow-hidden group cursor-pointer bg-gradient-to-br from-purple-50 to-pink-50"
                title={post.cachedUrl ? `Storage: ${post.cachedUrl}` : `Instagram CDN (may fail): ${imageUrl}`}
              >
                {/* Indicateur de chargement + Fallback */}
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-purple-50 to-pink-50">
                  {/* Icône Instagram en arrière-plan */}
                  <svg className="w-12 h-12 text-pink-300" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                  </svg>
                </div>
                {/* Image Instagram depuis cache Supabase Storage */}
                <img
                  src={imageUrl}
                  alt={post.caption?.substring(0, 30) || 'Instagram post'}
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                  crossOrigin="anonymous"
                  style={{
                    backgroundColor: 'transparent',
                    minHeight: '100%',
                    minWidth: '100%'
                  }}
                  onLoad={(e) => {
                    const img = e.target as HTMLImageElement;
                    console.log(`[InstagramWidget] ✅ Image loaded for post ${post.id}`);
                    console.log(`[InstagramWidget]    URL: ${imageUrl}`);
                    console.log(`[InstagramWidget]    Natural size: ${img.naturalWidth}x${img.naturalHeight}`);

                    // Vérifier que l'image a une taille valide
                    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                      img.style.opacity = '1';
                      img.style.zIndex = '10';
                    } else {
                      console.error(`[InstagramWidget] ❌ Image has invalid dimensions for post ${post.id}`);
                      img.style.display = 'none';
                    }
                  }}
                  onError={(e) => {
                    const img = e.target as HTMLImageElement;
                    console.error(`[InstagramWidget] ❌ Image FAILED to load for post ${post.id}`);
                    console.error(`[InstagramWidget]    URL: ${imageUrl}`);
                    // Cacher l'image - le fallback sera visible
                    img.style.display = 'none';
                  }}
                />
                {/* Overlay hover */}
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-opacity duration-300 flex items-center justify-center z-20">
                  <svg className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                  </svg>
                </div>
              </a>
            );
          })}
        </div>
      ) : (
        <div className="p-6 text-center">
          <svg className="w-12 h-12 text-neutral-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-sm text-neutral-500">Aucun post publié</p>
          <p className="text-xs text-neutral-400 mt-1">Publiez votre premier post !</p>
        </div>
      )}
    </div>
  );
}
