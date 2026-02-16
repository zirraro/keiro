'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';

function LinkedInCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [username, setUsername] = useState<string>('');

  useEffect(() => {
    const handleCallback = async () => {
      const success = searchParams.get('success');
      const error = searchParams.get('error');
      const usernameParam = searchParams.get('username');

      if (success === 'true') {
        const supabase = supabaseBrowser();
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          const { error: refreshError } = await supabase.auth.refreshSession();
          if (refreshError) {
            console.warn('[LinkedInCallback] Session lost, but LinkedIn connected. Redirecting to library.');
          }
        }

        setStatus('success');
        if (usernameParam) {
          setUsername(decodeURIComponent(usernameParam));
        }
        setTimeout(() => {
          window.location.href = '/library';
        }, 2000);
      } else if (error) {
        setStatus('error');
        setErrorMessage(decodeURIComponent(error));
      }
    };

    handleCallback();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white/10 backdrop-blur-lg rounded-2xl p-8 text-center">
        {status === 'loading' && (
          <>
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-[#0077B5] mx-auto mb-4"></div>
            <h2 className="text-2xl font-bold text-white mb-2">
              Connexion à LinkedIn...
            </h2>
            <p className="text-gray-300">
              Veuillez patienter pendant que nous finalisons votre connexion.
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-20 h-20 rounded-full bg-gradient-to-r from-[#0077B5] to-blue-600 flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.5 2h-17A1.5 1.5 0 002 3.5v17A1.5 1.5 0 003.5 22h17a1.5 1.5 0 001.5-1.5v-17A1.5 1.5 0 0020.5 2zM8 19H5v-9h3zM6.5 8.25A1.75 1.75 0 118.3 6.5a1.78 1.78 0 01-1.8 1.75zM19 19h-3v-4.74c0-1.42-.6-1.93-1.38-1.93A1.74 1.74 0 0013 14.19a.66.66 0 000 .14V19h-3v-9h2.9v1.3a3.11 3.11 0 012.7-1.4c1.55 0 3.36.86 3.36 3.66z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">
              LinkedIn connecté !
            </h2>
            {username && (
              <p className="text-[#0077B5] font-semibold mb-2">{username}</p>
            )}
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
              {errorMessage || 'Une erreur est survenue lors de la connexion à LinkedIn.'}
            </p>
            <button
              onClick={() => router.push('/library')}
              className="px-6 py-3 bg-gradient-to-r from-[#0077B5] to-blue-600 text-white font-semibold rounded-xl hover:from-[#005f8f] hover:to-blue-700 transition-all"
            >
              Retour à la galerie
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function LinkedInCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white/10 backdrop-blur-lg rounded-2xl p-8 text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-[#0077B5] mx-auto mb-4"></div>
          <h2 className="text-2xl font-bold text-white mb-2">
            Chargement...
          </h2>
        </div>
      </div>
    }>
      <LinkedInCallbackContent />
    </Suspense>
  );
}
