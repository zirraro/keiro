'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

/**
 * Page de debug pour vérifier le statut admin
 * Accès : /debug-admin
 */
export default function DebugAdminPage() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const supabase = supabaseBrowser();

        // Charger l'utilisateur
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        console.log('[Debug] User:', user);
        console.log('[Debug] User error:', userError);

        if (userError) {
          setError(`Error loading user: ${userError.message}`);
        }

        setUser(user);

        // Charger le profil si l'utilisateur existe
        if (user) {
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

          console.log('[Debug] Profile:', profile);
          console.log('[Debug] Profile error:', profileError);

          if (profileError) {
            setError(`Error loading profile: ${profileError.message}`);
          }

          setProfile(profile);
        }
      } catch (err: any) {
        console.error('[Debug] Exception:', err);
        setError(`Exception: ${err.message}`);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const fixAdmin = async () => {
    try {
      const supabase = supabaseBrowser();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        alert('Vous devez être connecté');
        return;
      }

      // Essayer de mettre à jour is_admin
      const { data, error } = await supabase
        .from('profiles')
        .update({ is_admin: true })
        .eq('id', user.id)
        .select();

      if (error) {
        alert(`Erreur : ${error.message}`);
        console.error('[Debug] Update error:', error);
      } else {
        alert('✅ Admin activé ! Rechargez la page.');
        console.log('[Debug] Update success:', data);
        window.location.reload();
      }
    } catch (err: any) {
      alert(`Exception : ${err.message}`);
      console.error('[Debug] Exception:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-neutral-600">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-neutral-900 mb-6">🔍 Debug Admin Status</h1>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800 font-semibold">Erreur :</p>
            <p className="text-red-600 text-sm mt-1">{error}</p>
          </div>
        )}

        {/* User Info */}
        <div className="bg-white rounded-lg border p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">👤 User (auth.users)</h2>
          {user ? (
            <div className="space-y-2 text-sm">
              <div className="flex gap-2">
                <span className="font-medium w-40">ID:</span>
                <span className="font-mono text-xs">{user.id}</span>
              </div>
              <div className="flex gap-2">
                <span className="font-medium w-40">Email:</span>
                <span>{user.email}</span>
              </div>
              <div className="flex gap-2">
                <span className="font-medium w-40">Email confirmé:</span>
                <span>{user.email_confirmed_at ? '✅ Oui' : '❌ Non'}</span>
              </div>
              <div className="flex gap-2">
                <span className="font-medium w-40">Created at:</span>
                <span>{new Date(user.created_at).toLocaleString('fr-FR')}</span>
              </div>
            </div>
          ) : (
            <p className="text-neutral-500">❌ Aucun utilisateur connecté</p>
          )}
        </div>

        {/* Profile Info */}
        <div className="bg-white rounded-lg border p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">📋 Profile (public.profiles)</h2>
          {profile ? (
            <div className="space-y-2 text-sm">
              <div className="flex gap-2">
                <span className="font-medium w-40">ID:</span>
                <span className="font-mono text-xs">{profile.id}</span>
              </div>
              <div className="flex gap-2">
                <span className="font-medium w-40">Email:</span>
                <span>{profile.email}</span>
              </div>
              <div className="flex gap-2">
                <span className="font-medium w-40">Is Admin:</span>
                <span className={profile.is_admin ? 'text-green-600 font-bold' : 'text-red-600'}>
                  {profile.is_admin ? '✅ TRUE' : '❌ FALSE'}
                </span>
              </div>
              <div className="flex gap-2">
                <span className="font-medium w-40">First Name:</span>
                <span>{profile.first_name || '-'}</span>
              </div>
              <div className="flex gap-2">
                <span className="font-medium w-40">Last Name:</span>
                <span>{profile.last_name || '-'}</span>
              </div>
              <div className="flex gap-2">
                <span className="font-medium w-40">Business Type:</span>
                <span>{profile.business_type || '-'}</span>
              </div>
            </div>
          ) : user ? (
            <div>
              <p className="text-red-500">❌ Profil introuvable pour cet utilisateur</p>
              <p className="text-sm text-neutral-600 mt-2">
                Le profil n'existe pas dans la table public.profiles
              </p>
            </div>
          ) : (
            <p className="text-neutral-500">Connectez-vous d'abord</p>
          )}
        </div>

        {/* Actions */}
        <div className="bg-white rounded-lg border p-6">
          <h2 className="text-xl font-semibold mb-4">🛠️ Actions</h2>

          {user && profile && !profile.is_admin && (
            <button
              onClick={fixAdmin}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              🔧 Activer le mode Admin pour ce compte
            </button>
          )}

          {user && profile && profile.is_admin && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-green-800 font-semibold">✅ Mode Admin activé !</p>
              <p className="text-green-600 text-sm mt-1">
                Le badge devrait apparaître sur /generate. Si ce n'est pas le cas, déconnectez-vous puis reconnectez-vous.
              </p>
            </div>
          )}

          {user && !profile && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-yellow-800 font-semibold">⚠️ Profil manquant</p>
              <p className="text-yellow-600 text-sm mt-1">
                Vous devez créer un profil dans public.profiles. Exécutez ce SQL :
              </p>
              <pre className="bg-neutral-900 text-neutral-100 p-3 rounded mt-2 text-xs overflow-x-auto">
{`INSERT INTO public.profiles (id, email, is_admin, created_at, updated_at)
VALUES (
  '${user.id}',
  '${user.email}',
  true,
  NOW(),
  NOW()
);`}
              </pre>
            </div>
          )}

          {!user && (
            <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4">
              <p className="text-neutral-600">
                Vous devez d'abord vous connecter. <a href="/login" className="text-blue-600 hover:underline">Aller à /login</a>
              </p>
            </div>
          )}
        </div>

        <div className="mt-6 text-center">
          <a href="/" className="text-blue-600 hover:underline">← Retour à l'accueil</a>
        </div>
      </div>
    </div>
  );
}
