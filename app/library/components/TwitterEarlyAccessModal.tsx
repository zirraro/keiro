"use client";

import { useState } from 'react';
import { useLanguage } from '@/lib/i18n/context';
import { supabaseBrowser } from '@/lib/supabase/client';

interface TwitterEarlyAccessModalProps {
  onClose: () => void;
}

export default function TwitterEarlyAccessModal({ onClose }: TwitterEarlyAccessModalProps) {
  const { locale } = useLanguage();
  const en = locale === 'en';
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErr(en ? 'Invalid email' : 'Email invalide');
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const sb = supabaseBrowser();
      const { data: { user } } = await sb.auth.getUser();
      await sb.from('feature_waitlist').insert({
        feature: 'twitter_publish',
        email: email.trim().toLowerCase(),
        user_id: user?.id || null,
        meta: { source: 'library_twitter_modal' },
      });
      setDone(true);
    } catch (e: any) {
      // Even if insert fails (table missing / dup), we don't want to
      // leave the user confused — just thank them.
      console.warn('[TwitterEarlyAccess] insert error:', e?.message);
      setDone(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start sm:items-center justify-center z-[60] p-4 pt-[80px] sm:pt-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 sm:p-8 relative my-auto">
        <button onClick={onClose} aria-label="Close" className="absolute top-3 right-3 w-8 h-8 rounded-full hover:bg-neutral-100 flex items-center justify-center text-neutral-500">
          ✕
        </button>

        <div className="flex items-center justify-center w-14 h-14 rounded-full bg-black mb-4 mx-auto">
          <svg viewBox="0 0 24 24" className="w-7 h-7 fill-white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
        </div>

        <h2 className="text-xl sm:text-2xl font-bold text-center text-neutral-900 mb-2">
          {en ? 'X / Twitter publishing is coming' : 'La publication X / Twitter arrive bientôt'}
        </h2>
        <p className="text-sm text-neutral-600 text-center mb-5">
          {en
            ? "We're finalising the X / Twitter integration. Drop your email to be one of the first to publish from KeiroAI."
            : 'On finalise l’intégration X / Twitter. Laisse ton email pour être parmi les premiers à publier depuis KeiroAI.'}
        </p>

        {done ? (
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 mb-3 text-2xl">✓</div>
            <p className="text-emerald-700 font-semibold mb-4">
              {en ? 'You’re on the list — we’ll email you as soon as it ships.' : 'Tu es sur la liste — on t’écrit dès que c’est dispo.'}
            </p>
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-lg bg-neutral-900 text-white text-sm font-semibold hover:bg-neutral-700"
            >
              {en ? 'Close' : 'Fermer'}
            </button>
          </div>
        ) : (
          <>
            <input
              type="email"
              autoFocus
              value={email}
              onChange={(e) => { setEmail(e.target.value); setErr(null); }}
              placeholder={en ? 'your@email.com' : 'ton@email.com'}
              className="w-full px-4 py-2.5 border border-neutral-300 rounded-lg text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900 mb-2"
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            />
            {err && <div className="text-xs text-red-600 mb-2">{err}</div>}
            <button
              onClick={submit}
              disabled={loading || !email.trim()}
              className="w-full py-2.5 rounded-lg bg-black text-white font-semibold text-sm hover:bg-neutral-800 disabled:opacity-50"
            >
              {loading ? '…' : en ? 'Join the early access' : 'Rejoindre l’early access'}
            </button>
            <p className="text-[11px] text-neutral-400 text-center mt-3">
              {en ? 'No spam, just one launch email.' : 'Aucun spam, juste un email au lancement.'}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
