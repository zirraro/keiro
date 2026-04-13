'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface ConversionPopupProps {
  isOpen: boolean;
  imageUrl: string | null;
  onClose: () => void; // "Continuer sans sauvegarder"
  onSuccess: () => void; // After account creation
}

export default function ConversionPopup({ isOpen, imageUrl, onClose, onSuccess }: ConversionPopupProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'signup' | 'login'>('signup');
  const router = useRouter();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError('Entre ton email'); return; }
    if (mode === 'signup' && password.length < 6) { setError('6 caract\u00E8res minimum'); return; }

    setIsSubmitting(true);
    setError('');

    try {
      const endpoint = mode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!data.ok && !data.user) {
        throw new Error(data.error || 'Erreur');
      }

      // Success — trigger download + bonus credits
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Erreur. R\u00E9essaie.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Blurred background with the generated image */}
      <div className="absolute inset-0 bg-black/70">
        {imageUrl && (
          <div className="absolute inset-0 flex items-center justify-center">
            <img
              src={imageUrl}
              alt="Ton visuel"
              className="max-w-[80%] max-h-[80%] object-contain blur-[8px] opacity-60 scale-105"
            />
          </div>
        )}
      </div>

      {/* Popup */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8 z-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Celebration icon */}
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center text-3xl shadow-lg">
            {'\uD83C\uDF89'}
          </div>
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold text-center mb-2">
          Ton visuel est pr{'\u00EA'}t !
        </h2>
        <p className="text-neutral-600 text-center mb-6 text-sm leading-relaxed">
          Cr{'\u00E9'}e ton compte gratuit pour le t{'\u00E9'}l{'\u00E9'}charger — et re{'\u00E7'}ois{' '}
          <strong className="text-neutral-900">2 cr{'\u00E9'}ations suppl{'\u00E9'}mentaires + 1 vid{'\u00E9'}o</strong>{' '}
          offertes pendant 7 jours.
        </p>

        {/* Benefits */}
        <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl p-4 mb-6 border border-green-100">
          <div className="space-y-2">
            {[
              { icon: '\uD83D\uDDBC\uFE0F', text: '3 visuels IA pro gratuits' },
              { icon: '\uD83C\uDFAC', text: '1 vid\u00E9o IA offerte' },
              { icon: '\u23F0', text: '7 jours gratuits — carte requise, aucun d\u00E9bit' },
              { icon: '\uD83D\uDCE5', text: 'T\u00E9l\u00E9chargement imm\u00E9diat de ton visuel' },
            ].map((b, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <span className="text-lg">{b.icon}</span>
                <span className="text-sm text-neutral-700 font-medium">{b.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ton@email.com"
            required
            className="w-full px-4 py-3 rounded-xl border-2 border-neutral-200 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/10 transition-all text-sm"
            autoFocus
          />
          {mode === 'signup' && (
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mot de passe (6 caract\u00E8res min)"
              className="w-full px-4 py-3 rounded-xl border-2 border-neutral-200 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/10 transition-all text-sm"
            />
          )}

          {error && <p className="text-red-500 text-xs text-center">{error}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3.5 bg-gradient-to-r from-purple-600 to-[#1e3a5f] text-white font-bold rounded-xl hover:shadow-lg hover:shadow-purple-500/20 transition-all disabled:opacity-50 text-sm"
          >
            {isSubmitting ? 'Cr\u00E9ation...' : mode === 'signup'
              ? '\u2192 T\u00E9l\u00E9charger & activer mes 3 cr\u00E9ations gratuites'
              : '\u2192 Me connecter & t\u00E9l\u00E9charger'}
          </button>
        </form>

        {/* Toggle login/signup */}
        <button
          onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setError(''); }}
          className="w-full text-center text-xs text-purple-600 hover:text-purple-800 mt-3 font-medium"
        >
          {mode === 'signup' ? 'D\u00E9j\u00E0 un compte ? Se connecter' : 'Pas encore de compte ? S\'inscrire'}
        </button>

        {/* Dismiss */}
        <button
          onClick={onClose}
          className="w-full text-center text-xs text-neutral-400 hover:text-neutral-500 mt-4 transition-colors"
        >
          Continuer sans sauvegarder (le visuel sera perdu)
        </button>
      </div>
    </div>
  );
}
