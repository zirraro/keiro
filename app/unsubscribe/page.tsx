'use client';

/**
 * Public unsubscribe confirmation page.
 * Flow:
 *   1. User clicks the link in the email: /unsubscribe?t=<signed token>
 *   2. We POST the token to /api/unsubscribe — prospect is marked as perdu + unsubscribed.
 *   3. Show a confirmation message with optional "tell us why" textarea.
 *
 * GET on the API also works for mail-client pre-scanners (idempotent).
 */

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

type State =
  | { kind: 'loading' }
  | { kind: 'done'; email?: string }
  | { kind: 'error'; reason: string };

function UnsubscribeInner() {
  const params = useSearchParams();
  const token = params.get('t') || '';
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reason, setReason] = useState('');
  const [reasonSent, setReasonSent] = useState(false);
  const [sendingReason, setSendingReason] = useState(false);

  useEffect(() => {
    if (!token) {
      setState({ kind: 'error', reason: 'missing_token' });
      return;
    }
    (async () => {
      try {
        const res = await fetch('/api/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (!res.ok) {
          setState({ kind: 'error', reason: data?.error || 'unknown' });
        } else {
          setState({ kind: 'done', email: data.email });
        }
      } catch {
        setState({ kind: 'error', reason: 'network' });
      }
    })();
  }, [token]);

  const submitReason = useCallback(async () => {
    if (!token || !reason.trim()) return;
    setSendingReason(true);
    try {
      await fetch('/api/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, reason: reason.trim() }),
      });
      setReasonSent(true);
    } catch {} finally { setSendingReason(false); }
  }, [token, reason]);

  return (
    <div className="fixed inset-0 z-[9999] bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center p-6 overflow-auto">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        {state.kind === 'loading' && (
          <div className="p-8 text-center">
            <div className="inline-block animate-spin h-8 w-8 border-2 border-slate-300 border-t-slate-800 rounded-full mb-4" />
            <p className="text-slate-600 text-sm">Désinscription en cours...</p>
          </div>
        )}

        {state.kind === 'error' && (
          <div className="p-8 text-center">
            <div className="text-4xl mb-3">⚠️</div>
            <h1 className="text-lg font-bold text-slate-900 mb-2">Lien invalide ou expiré</h1>
            <p className="text-sm text-slate-600 mb-4">
              Nous n&apos;avons pas pu valider ce lien de désinscription.
              Si vous souhaitez vous désinscrire, répondez simplement à
              l&apos;email avec <em>&laquo; stop &raquo;</em> ou contactez-nous à{' '}
              <a href="mailto:contact@keiroai.com" className="text-blue-600 underline">
                contact@keiroai.com
              </a>.
            </p>
            <p className="text-xs text-slate-400">Code: {state.reason}</p>
          </div>
        )}

        {state.kind === 'done' && (
          <div className="p-8">
            <div className="text-center mb-6">
              <div className="text-4xl mb-3">✅</div>
              <h1 className="text-xl font-bold text-slate-900 mb-2">Désinscription confirmée</h1>
              <p className="text-sm text-slate-600">
                {state.email ? (
                  <>L&apos;adresse <strong className="text-slate-900">{state.email}</strong> ne recevra plus aucun email de KeiroAI.</>
                ) : (
                  <>Vous ne recevrez plus aucun email de KeiroAI.</>
                )}
              </p>
              <p className="text-xs text-slate-400 mt-2">
                Nous avons supprimé votre adresse de toutes nos séquences.
              </p>
            </div>

            {!reasonSent ? (
              <div className="border-t border-slate-200 pt-5">
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  Une raison ? (facultatif — ça nous aide)
                </label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Pas intéressé, trop d'emails, mauvaise cible, autre..."
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 resize-none"
                  maxLength={300}
                />
                <button
                  onClick={submitReason}
                  disabled={!reason.trim() || sendingReason}
                  className="mt-2 w-full py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white text-sm font-semibold rounded-lg transition"
                >
                  {sendingReason ? 'Envoi...' : 'Envoyer'}
                </button>
              </div>
            ) : (
              <div className="border-t border-slate-200 pt-5 text-center">
                <p className="text-xs text-slate-500">Merci pour votre retour 🙏</p>
              </div>
            )}

            <p className="text-[11px] text-slate-400 mt-6 text-center">
              KeiroAI — <a href="https://keiroai.com" className="underline">keiroai.com</a>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">Chargement...</div>}>
      <UnsubscribeInner />
    </Suspense>
  );
}
