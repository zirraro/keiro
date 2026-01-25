'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export const dynamic = 'force-dynamic';

function InstagramCallbackContent() {
  const router = useRouter();
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
          setTimeout(() => router.push('/library'), 3000);
          return;
        }

        // Vérifier si nous avons le code d'autorisation
        if (!code) {
          setStatus('error');
          setMessage('Code d\'autorisation manquant');
          setTimeout(() => router.push('/library'), 3000);
          return;
        }

        setMessage('Échange du code d\'autorisation...');

        // Appeler notre API pour échanger le code contre un token
        const response = await fetch('/api/auth/instagram-callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code })
        });

        const data = await response.json();

        if (data.ok) {
          setStatus('success');
          setMessage('✅ Compte Instagram connecté avec succès !');

          // Rediriger vers la galerie après 2 secondes
          setTimeout(() => router.push('/library'), 2000);
        } else {
          throw new Error(data.error || 'Erreur lors de la connexion Instagram');
        }

      } catch (error: any) {
        console.error('[InstagramCallback] Error:', error);
        setStatus('error');
        setMessage(error.message || 'Erreur lors de la connexion');
        setTimeout(() => router.push('/library'), 3000);
      }
    };

    handleCallback();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-50 to-white flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        {status === 'loading' && (
          <>
            <div className="w-20 h-20 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-6"></div>
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

export default function InstagramCallback() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-neutral-50 to-white flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-20 h-20 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-6"></div>
          <h2 className="text-2xl font-bold text-neutral-900 mb-2">Chargement</h2>
          <p className="text-neutral-600">Préparation...</p>
        </div>
      </div>
    }>
      <InstagramCallbackContent />
    </Suspense>
  );
}
