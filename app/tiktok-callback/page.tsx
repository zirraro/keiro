'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function TikTokCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [username, setUsername] = useState<string>('');

  useEffect(() => {
    const success = searchParams.get('success');
    const error = searchParams.get('error');
    const usernameParam = searchParams.get('username');

    if (success === 'true') {
      setStatus('success');
      if (usernameParam) {
        setUsername(decodeURIComponent(usernameParam));
      }
      // Redirect to library after 2 seconds
      setTimeout(() => {
        router.push('/library');
      }, 2000);
    } else if (error) {
      setStatus('error');
      setErrorMessage(decodeURIComponent(error));
    }
  }, [searchParams, router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white/10 backdrop-blur-lg rounded-2xl p-8 text-center">
        {status === 'loading' && (
          <>
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
            <h2 className="text-2xl font-bold text-white mb-2">
              Connexion à TikTok...
            </h2>
            <p className="text-gray-300">
              Veuillez patientez pendant que nous finalisons votre connexion.
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="text-6xl mb-4">✅</div>
            <h2 className="text-2xl font-bold text-white mb-2">
              TikTok connecté !
            </h2>
            <p className="text-gray-300 mb-4">
              Votre compte a été connecté avec succès.
            </p>
            <p className="text-sm text-gray-400">
              Redirection vers votre galerie...
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="text-6xl mb-4">❌</div>
            <h2 className="text-2xl font-bold text-white mb-2">
              Erreur de connexion
            </h2>
            <p className="text-gray-300 mb-6">
              {errorMessage || 'Une erreur est survenue lors de la connexion à TikTok.'}
            </p>
            <button
              onClick={() => router.push('/library')}
              className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-xl hover:from-purple-700 hover:to-pink-700 transition-all"
            >
              Retour à la galerie
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function TikTokCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white/10 backdrop-blur-lg rounded-2xl p-8 text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
          <h2 className="text-2xl font-bold text-white mb-2">
            Chargement...
          </h2>
        </div>
      </div>
    }>
      <TikTokCallbackContent />
    </Suspense>
  );
}
