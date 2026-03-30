'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';

function InstagramCallbackContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Connexion à Instagram en cours...');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const code = searchParams.get('code');
        const error = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');

        // Vérifier si l'utilisateur a refusé l'autorisation
        if (error) {
          console.error('[InstagramCallback] OAuth error:', error, errorDescription);
          setStatus('error');
          setMessage(errorDescription || 'Connexion refusée');
          setTimeout(() => { window.location.href = '/library'; }, 3000);
          return;
        }

        // Vérifier si nous avons le code d'autorisation
        if (!code) {
          setStatus('error');
          setMessage('Code d\'autorisation manquant');
          setTimeout(() => { window.location.href = '/library'; }, 3000);
          return;
        }

        // Extract userId from state parameter (set during OAuth initiation)
        const stateParam = searchParams.get('state');
        let userId: string | null = null;
        let returnTo: string = '/assistant';
        if (stateParam) {
          try {
            const decoded = JSON.parse(atob(stateParam));
            userId = decoded.userId;
            // Return to the page that initiated the OAuth
            if (decoded.returnTo) returnTo = decoded.returnTo;
          } catch (e) {
            console.warn('[InstagramCallback] Could not decode state:', e);
          }
        }

        // Also try to restore Supabase session
        const supabase = supabaseBrowser();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          await supabase.auth.refreshSession();
        }

        // If no userId from state, try from session
        if (!userId) {
          const { data: { user } } = await supabase.auth.getUser();
          userId = user?.id || null;
        }

        setMessage('Échange du code d\'autorisation...');

        // Appeler notre API pour échanger le code contre un token
        const response = await fetch('/api/auth/instagram-callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, userId })
        });

        const data = await response.json();

        if (data.ok) {
          setStatus('success');
          setMessage('Compte Instagram connecté avec succès !');

          // Restore Supabase session before redirecting
          // This prevents the user from being logged out after Instagram OAuth redirect
          try {
            const sb = supabaseBrowser();
            await sb.auth.refreshSession();
            const { data: { session: currentSession } } = await sb.auth.getSession();
            if (!currentSession) {
              console.warn('[InstagramCallback] Session lost after OAuth, user may need to re-login');
            }
          } catch {}

          // Redirect back to where the user came from
          setTimeout(() => { window.location.href = returnTo; }, 1500);
        } else {
          throw new Error(data.error || 'Erreur lors de la connexion Instagram');
        }

      } catch (error: any) {
        console.error('[InstagramCallback] Error:', error);
        setStatus('error');
        setMessage(error.message || 'Erreur lors de la connexion');
        setTimeout(() => { window.location.href = '/library'; }, 3000);
      }
    };

    handleCallback();
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-50 to-white flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        {status === 'loading' && (
          <>
            <div className="w-20 h-20 border-4 border-[#0c1a3a]/10 border-t-[#0c1a3a] rounded-full animate-spin mx-auto mb-6"></div>
            <h2 className="text-2xl font-bold text-neutral-900 mb-2">Connexion en cours</h2>
            <p className="text-neutral-600">{message}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-12 h-12 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-green-900 mb-2">Succès !</h2>
            <p className="text-green-700">{message}</p>
            <p className="text-sm text-neutral-500 mt-4">Redirection vers votre galerie...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-12 h-12 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-red-900 mb-2">Erreur</h2>
            <p className="text-red-700">{message}</p>
            <p className="text-sm text-neutral-500 mt-4">Redirection...</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function InstagramCallbackClient() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-neutral-50 to-white flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-20 h-20 border-4 border-[#0c1a3a]/10 border-t-[#0c1a3a] rounded-full animate-spin mx-auto mb-6"></div>
          <h2 className="text-2xl font-bold text-neutral-900 mb-2">Chargement</h2>
          <p className="text-neutral-600">Préparation...</p>
        </div>
      </div>
    }>
      <InstagramCallbackContent />
    </Suspense>
  );
}
