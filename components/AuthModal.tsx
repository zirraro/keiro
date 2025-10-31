'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

type AuthModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'magic'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { signIn, signUp, signInWithMagicLink } = useAuth();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (mode === 'magic') {
        const { error } = await signInWithMagicLink(email);
        if (error) {
          setError(error);
        } else {
          setSuccess('Un lien de connexion a été envoyé à votre email!');
          setEmail('');
        }
      } else if (mode === 'signup') {
        const { error } = await signUp(email, password);
        if (error) {
          setError(error);
        } else {
          setSuccess('Compte créé! Vérifiez votre email pour confirmer.');
          setEmail('');
          setPassword('');
        }
      } else {
        const { error } = await signIn(email, password);
        if (error) {
          setError(error);
        } else {
          onClose();
        }
      }
    } catch (e: any) {
      setError(e.message || 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">
            {mode === 'signup' ? 'Créer un compte' : mode === 'magic' ? 'Lien magique' : 'Connexion'}
          </h2>
          <button
            onClick={onClose}
            className="text-2xl text-neutral-500 hover:text-neutral-900"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => {
              setMode('signin');
              setError(null);
              setSuccess(null);
            }}
            className={`flex-1 py-2 text-sm rounded-lg transition ${
              mode === 'signin'
                ? 'bg-blue-600 text-white font-medium'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
          >
            Connexion
          </button>
          <button
            onClick={() => {
              setMode('signup');
              setError(null);
              setSuccess(null);
            }}
            className={`flex-1 py-2 text-sm rounded-lg transition ${
              mode === 'signup'
                ? 'bg-blue-600 text-white font-medium'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
          >
            Inscription
          </button>
          <button
            onClick={() => {
              setMode('magic');
              setError(null);
              setSuccess(null);
            }}
            className={`flex-1 py-2 text-sm rounded-lg transition ${
              mode === 'magic'
                ? 'bg-blue-600 text-white font-medium'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
          >
            ✨ Email
          </button>
        </div>

        {/* Description */}
        <p className="text-sm text-neutral-600 mb-4">
          {mode === 'signup'
            ? 'Créez votre compte pour sauvegarder vos créations et accéder à votre librairie personnalisée.'
            : mode === 'magic'
            ? 'Recevez un lien de connexion par email. Pas besoin de mot de passe!'
            : 'Connectez-vous pour accéder à votre librairie personnalisée.'}
        </p>

        {/* Messages */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
            {success}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5 text-neutral-700">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="votre@email.com"
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {mode !== 'magic' && (
            <div>
              <label className="block text-sm font-medium mb-1.5 text-neutral-700">
                Mot de passe
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                minLength={6}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {mode === 'signup' && (
                <p className="mt-1 text-xs text-neutral-500">Minimum 6 caractères</p>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading
              ? 'Chargement...'
              : mode === 'signup'
              ? 'Créer mon compte'
              : mode === 'magic'
              ? 'Envoyer le lien magique'
              : 'Se connecter'}
          </button>
        </form>

        {/* Mode visiteur */}
        <div className="mt-6 pt-6 border-t border-neutral-200 text-center">
          <p className="text-xs text-neutral-500 mb-2">Mode visiteur disponible</p>
          <button
            onClick={onClose}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            Continuer sans compte (1 génération gratuite)
          </button>
        </div>
      </div>
    </div>
  );
}
