'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { Suspense } from 'react';

function ConfirmContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const verify = async () => {
      const tokenHash = searchParams.get('token_hash');
      const type = searchParams.get('type') as 'signup' | 'email' | 'recovery' | 'invite' | undefined;

      if (!tokenHash || !type) {
        setStatus('error');
        setErrorMsg('Lien de confirmation invalide.');
        return;
      }

      try {
        const supabase = supabaseBrowser();

        // Verify the OTP token - this confirms email AND creates a session
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type,
        });

        if (error) {
          console.error('[Auth Confirm] verifyOtp error:', error);
          // If token expired or already used, redirect to login
          if (error.message?.includes('expired') || error.message?.includes('already')) {
            setStatus('error');
            setErrorMsg('Ce lien a expiré ou a déjà été utilisé. Connectez-vous avec vos identifiants.');
          } else {
            setStatus('error');
            setErrorMsg(error.message || 'Erreur lors de la confirmation.');
          }
          return;
        }

        // Success! Session is now active client-side
        setStatus('success');

        // Redirect to generate page with welcome popup
        setTimeout(() => {
          window.location.href = '/generate?welcome=true';
        }, 1500);

      } catch (err: any) {
        console.error('[Auth Confirm] Unexpected error:', err);
        setStatus('error');
        setErrorMsg('Erreur inattendue. Veuillez réessayer.');
      }
    };

    verify();
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        {status === 'loading' && (
          <>
            <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-6"></div>
            <h2 className="text-xl font-bold text-neutral-900 mb-2">Confirmation en cours...</h2>
            <p className="text-neutral-500 text-sm">Nous vérifions votre email</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-neutral-900 mb-2">Email confirmé !</h2>
            <p className="text-neutral-500 text-sm">Redirection vers votre espace...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-neutral-900 mb-2">Oups</h2>
            <p className="text-neutral-600 text-sm mb-6">{errorMsg}</p>
            <a
              href="/login"
              className="inline-block px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold rounded-xl hover:shadow-lg transition-all"
            >
              Se connecter
            </a>
          </>
        )}
      </div>
    </div>
  );
}

export default function AuthConfirmPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-6"></div>
          <h2 className="text-xl font-bold text-neutral-900 mb-2">Chargement...</h2>
        </div>
      </div>
    }>
      <ConfirmContent />
    </Suspense>
  );
}
