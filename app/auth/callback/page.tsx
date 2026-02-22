'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

/**
 * /auth/callback — Page client-side qui gère TOUS les flows de confirmation :
 * 1. ?code=xxx (PKCE) → exchangeCodeForSession (code_verifier dans localStorage)
 * 2. #access_token=xxx (Implicit) → auto-détecté par supabaseBrowser()
 * 3. ?token_hash=xxx&type=xxx (OTP) → verifyOtp
 *
 * Doit être client-side car le code_verifier PKCE est dans localStorage,
 * inaccessible depuis un Route Handler server-side.
 */
export default function AuthCallbackPage() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const handleAuth = async () => {
      try {
        const supabase = supabaseBrowser();
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const tokenHash = params.get('token_hash');
        const type = params.get('type') as 'signup' | 'email' | 'recovery' | 'invite' | undefined;
        const hashFragment = window.location.hash;

        // Flow 1: PKCE code exchange (most common from {{ .ConfirmationURL }})
        if (code) {
          console.log('[Auth Callback] Exchanging PKCE code...');
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (!error) {
            console.log('[Auth Callback] PKCE exchange success');
            setStatus('success');
            setTimeout(() => { window.location.href = '/generate?welcome=true'; }, 1000);
            return;
          }
          console.warn('[Auth Callback] PKCE exchange failed:', error.message);
          // Don't return — fall through to try other methods
        }

        // Flow 2: Token hash OTP verification
        if (tokenHash && type) {
          console.log('[Auth Callback] Verifying OTP token_hash...');
          const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
          if (!error) {
            console.log('[Auth Callback] OTP verification success');
            setStatus('success');
            setTimeout(() => { window.location.href = '/generate?welcome=true'; }, 1000);
            return;
          }
          console.warn('[Auth Callback] OTP verification failed:', error.message);
        }

        // Flow 3: Implicit flow — hash fragment (supabase client auto-detects)
        if (hashFragment && hashFragment.includes('access_token')) {
          console.log('[Auth Callback] Detected implicit flow hash fragment');
          // supabaseBrowser() auto-processes hash fragment on init
          // Wait a bit for it to complete
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Check if any flow resulted in a session
        const { data: { session } } = await supabase.auth.getSession();

        if (session) {
          console.log('[Auth Callback] Session active for:', session.user.email);

          // Ensure profile exists
          const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', session.user.id)
            .single();

          if (!profile) {
            console.log('[Auth Callback] Creating profile...');
            await supabase.from('profiles').insert([{
              id: session.user.id,
              email: session.user.email || '',
              first_name: session.user.user_metadata?.first_name || '',
              last_name: session.user.user_metadata?.last_name || '',
              business_type: session.user.user_metadata?.business_type || '',
            }]);
          }

          setStatus('success');
          setTimeout(() => { window.location.href = '/generate?welcome=true'; }, 1000);
          return;
        }

        // Nothing worked
        console.error('[Auth Callback] No session established');
        setStatus('error');
        setErrorMsg('La session n\'a pas pu être créée. Le lien a peut-être expiré.');

      } catch (err: any) {
        console.error('[Auth Callback] Error:', err);
        setStatus('error');
        setErrorMsg(err.message || 'Erreur inattendue');
      }
    };

    handleAuth();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
        {status === 'loading' && (
          <>
            <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-6"></div>
            <h2 className="text-xl font-bold text-neutral-900 mb-2">Connexion en cours...</h2>
            <p className="text-neutral-500 text-sm">Nous confirmons votre compte</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-neutral-900 mb-2">Compte confirmé !</h2>
            <p className="text-neutral-500 text-sm">Redirection...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="text-3xl">🔑</span>
            </div>
            <h2 className="text-xl font-bold text-neutral-900 mb-2">Lien expiré</h2>
            <p className="text-neutral-600 text-sm mb-6">{errorMsg}</p>
            <a
              href="/login"
              className="inline-block px-8 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold rounded-xl hover:shadow-lg transition-all"
            >
              Se connecter
            </a>
          </>
        )}
      </div>
    </div>
  );
}
