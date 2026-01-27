'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function TikTokCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const error = searchParams.get('error');
      const errorDescription = searchParams.get('error_description');

      // Check for OAuth errors
      if (error) {
        setStatus('error');
        setErrorMessage(errorDescription || error);
        return;
      }

      // Check for code
      if (!code) {
        setStatus('error');
        setErrorMessage('Code d\'autorisation manquant');
        return;
      }

      try {
        // Exchange code for tokens
        const response = await fetch('/api/auth/tiktok-callback', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ code }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Erreur lors de la connexion TikTok');
        }

        // Success
        setStatus('success');

        // Redirect to library after 2 seconds
        setTimeout(() => {
          router.push('/library');
        }, 2000);
      } catch (error: any) {
        console.error('[TikTokCallback] Error:', error);
        setStatus('error');
        setErrorMessage(error.message || 'Une erreur est survenue');
      }
    };

    handleCallback();
  }, [searchParams, router]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-50 via-purple-50 to-cyan-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
          <div className="mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-pink-500 to-cyan-500 rounded-full animate-pulse">
              <span className="text-3xl">🎵</span>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 mb-2">
            Connexion à TikTok...
          </h1>
          <p className="text-neutral-600 text-sm mb-6">
            Nous finalisons la connexion de ton compte TikTok
          </p>
          <div className="flex items-center justify-center gap-2">
            <div className="w-2 h-2 bg-pink-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-50 via-purple-50 to-cyan-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
          <div className="mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 mb-2">
            Erreur de connexion
          </h1>
          <p className="text-neutral-600 text-sm mb-6">
            {errorMessage}
          </p>
          <button
            onClick={() => router.push('/library')}
            className="w-full py-3 bg-gradient-to-r from-pink-500 to-cyan-500 text-white font-semibold rounded-lg hover:shadow-lg transition-all"
          >
            Retour à la bibliothèque
          </button>
        </div>
      </div>
    );
  }

  // Success state
  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-purple-50 to-cyan-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
        <div className="mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>
        <h1 className="text-2xl font-bold text-neutral-900 mb-2">
          TikTok connecté !
        </h1>
        <p className="text-neutral-600 text-sm mb-2">
          Ton compte TikTok a été connecté avec succès
        </p>
        <p className="text-neutral-500 text-xs mb-6">
          Redirection vers la bibliothèque...
        </p>
        <div className="flex items-center justify-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" style={{ animationDelay: '150ms' }}></div>
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" style={{ animationDelay: '300ms' }}></div>
        </div>
      </div>
    </div>
  );
}
