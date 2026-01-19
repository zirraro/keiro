'use client';

import { useState, useEffect } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

export default function DebugLibraryPage() {
  const [debug, setDebug] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDebugInfo = async () => {
      const supabase = supabaseBrowser();

      // 1. Vérifier l'utilisateur
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      // 2. Vérifier les cookies
      const cookies = document.cookie.split(';').reduce((acc: any, cookie) => {
        const [key, value] = cookie.trim().split('=');
        acc[key] = value;
        return acc;
      }, {});

      // Chercher le cookie Supabase avec pattern sb-{PROJECT_ID}-auth-token
      const supabaseCookie = Object.keys(cookies).find(name =>
        name.startsWith('sb-') && name.endsWith('-auth-token')
      );

      // 3. Vérifier directement dans la base de données
      let images = [];
      let dbError = null;
      if (user) {
        const { data, error } = await supabase
          .from('saved_images')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        images = data || [];
        dbError = error;
      }

      // 4. Tester l'API
      const apiResponse = await fetch('/api/library/images', {
        credentials: 'include'
      });
      const apiData = await apiResponse.json();

      setDebug({
        user: user ? {
          id: user.id,
          email: user.email,
          created_at: user.created_at
        } : null,
        userError,
        cookies: {
          hasSbAccessToken: !!cookies['sb-access-token'],
          hasSupabaseAuthToken: !!cookies['supabase-auth-token'],
          hasSupabaseProjectCookie: !!supabaseCookie,
          supabaseCookieName: supabaseCookie || null,
          allCookies: Object.keys(cookies)
        },
        database: {
          imageCount: images.length,
          images: images.map((img: any) => ({
            id: img.id,
            title: img.title,
            image_url: img.image_url?.substring(0, 100) + '...',
            created_at: img.created_at
          })),
          error: dbError
        },
        api: {
          status: apiResponse.status,
          ok: apiData.ok,
          error: apiData.error,
          imageCount: apiData.images?.length || 0
        }
      });

      setLoading(false);
    };

    fetchDebugInfo();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-4">Debug Library</h1>
          <p>Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Debug Library 🔍</h1>

        {/* User Info */}
        <div className="bg-white rounded-lg border p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">👤 Utilisateur</h2>
          {debug.user ? (
            <div className="space-y-2">
              <p><strong>ID:</strong> {debug.user.id}</p>
              <p><strong>Email:</strong> {debug.user.email}</p>
              <p><strong>Créé le:</strong> {new Date(debug.user.created_at).toLocaleString()}</p>
              <p className="text-green-600 font-semibold">✅ Connecté</p>
            </div>
          ) : (
            <div>
              <p className="text-red-600 font-semibold">❌ Non connecté</p>
              {debug.userError && (
                <pre className="mt-2 p-2 bg-red-50 rounded text-xs">
                  {JSON.stringify(debug.userError, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* Cookies */}
        <div className="bg-white rounded-lg border p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">🍪 Cookies</h2>
          <div className="space-y-2">
            <p>
              <strong>Cookie Supabase (sb-*-auth-token):</strong>{' '}
              {debug.cookies.hasSupabaseProjectCookie ? (
                <span className="text-green-600 font-bold">✅ Présent ({debug.cookies.supabaseCookieName})</span>
              ) : (
                <span className="text-red-600 font-bold">❌ Absent</span>
              )}
            </p>
            <p className="text-xs text-neutral-500 italic">
              {debug.cookies.hasSupabaseProjectCookie ?
                "✅ Le cookie d'authentification est correctement créé" :
                "⚠️ Vous devez vous déconnecter et reconnecter pour créer le cookie"
              }
            </p>
            <hr className="my-3" />
            <p>
              <strong>sb-access-token (legacy):</strong>{' '}
              {debug.cookies.hasSbAccessToken ? (
                <span className="text-green-600">✅ Présent</span>
              ) : (
                <span className="text-neutral-400">❌ Absent (normal)</span>
              )}
            </p>
            <p>
              <strong>supabase-auth-token (legacy):</strong>{' '}
              {debug.cookies.hasSupabaseAuthToken ? (
                <span className="text-green-600">✅ Présent</span>
              ) : (
                <span className="text-neutral-400">❌ Absent (normal)</span>
              )}
            </p>
            <details className="mt-2">
              <summary className="cursor-pointer text-sm text-neutral-600">
                Tous les cookies ({debug.cookies.allCookies.length})
              </summary>
              <pre className="mt-2 p-2 bg-neutral-50 rounded text-xs overflow-auto">
                {JSON.stringify(debug.cookies.allCookies, null, 2)}
              </pre>
            </details>
          </div>
        </div>

        {/* Database Direct */}
        <div className="bg-white rounded-lg border p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">💾 Base de données (Direct)</h2>
          <div className="space-y-2">
            <p>
              <strong>Nombre d'images:</strong>{' '}
              <span className={debug.database.imageCount > 0 ? 'text-green-600 font-bold' : 'text-orange-600'}>
                {debug.database.imageCount}
              </span>
            </p>
            {debug.database.error && (
              <div className="mt-2">
                <p className="text-red-600 font-semibold">❌ Erreur</p>
                <pre className="mt-2 p-2 bg-red-50 rounded text-xs">
                  {JSON.stringify(debug.database.error, null, 2)}
                </pre>
              </div>
            )}
            {debug.database.imageCount > 0 && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-blue-600 font-semibold">
                  Voir les {debug.database.imageCount} images
                </summary>
                <div className="mt-2 space-y-2">
                  {debug.database.images.map((img: any) => (
                    <div key={img.id} className="p-2 bg-neutral-50 rounded text-xs">
                      <p><strong>ID:</strong> {img.id}</p>
                      <p><strong>Titre:</strong> {img.title || '(sans titre)'}</p>
                      <p><strong>URL:</strong> {img.image_url}</p>
                      <p><strong>Créé:</strong> {new Date(img.created_at).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        </div>

        {/* API Test */}
        <div className="bg-white rounded-lg border p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">🌐 API /api/library/images</h2>
          <div className="space-y-2">
            <p>
              <strong>Status HTTP:</strong>{' '}
              <span className={debug.api.status === 200 ? 'text-green-600' : 'text-red-600'}>
                {debug.api.status}
              </span>
            </p>
            <p>
              <strong>Réponse ok:</strong>{' '}
              {debug.api.ok ? (
                <span className="text-green-600">✅ true</span>
              ) : (
                <span className="text-red-600">❌ false</span>
              )}
            </p>
            <p>
              <strong>Nombre d'images:</strong>{' '}
              <span className={debug.api.imageCount > 0 ? 'text-green-600 font-bold' : 'text-orange-600'}>
                {debug.api.imageCount}
              </span>
            </p>
            {debug.api.error && (
              <div className="mt-2">
                <p className="text-red-600 font-semibold">❌ Erreur API</p>
                <pre className="mt-2 p-2 bg-red-50 rounded text-xs">
                  {debug.api.error}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Diagnosis */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">🔍 Diagnostic</h2>
          {!debug.user ? (
            <p className="text-red-600 font-semibold">❌ Vous n'êtes pas connecté. Connectez-vous d'abord sur /login.</p>
          ) : !debug.cookies.hasSupabaseProjectCookie ? (
            <div>
              <p className="text-red-600 font-semibold">❌ Le cookie d'authentification n'est pas créé !</p>
              <p className="mt-2 text-sm">
                <strong>Solution :</strong> Vous devez vous <strong>déconnecter</strong> (effacer les cookies ou navigation privée)
                puis vous <strong>reconnecter</strong> sur /login pour créer le nouveau cookie.
              </p>
            </div>
          ) : debug.database.imageCount === 0 ? (
            <p className="text-orange-600">⚠️ Aucune image dans la base de données. Essayez de sauvegarder une image d'abord.</p>
          ) : debug.api.status === 401 ? (
            <div>
              <p className="text-red-600 font-semibold">❌ L'API ne reconnaît pas votre session.</p>
              <p className="mt-2 text-sm">Le cookie existe mais l'API ne peut pas le lire. Vérifiez les logs serveur.</p>
            </div>
          ) : debug.api.imageCount === 0 && debug.database.imageCount > 0 ? (
            <p className="text-red-600">❌ Les images existent dans la DB mais l'API ne les retourne pas. Problème de filtrage ou de requête.</p>
          ) : (
            <p className="text-green-600 font-semibold">✅ Tout fonctionne ! Les images devraient apparaître dans /library.</p>
          )}
        </div>
      </div>
    </div>
  );
}
