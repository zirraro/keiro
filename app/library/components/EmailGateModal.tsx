'use client';

import { useState } from 'react';

interface EmailGateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (email: string) => void;
}

export default function EmailGateModal({ isOpen, onClose, onSubmit }: EmailGateModalProps) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const validateEmail = (email: string) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Veuillez entrer votre email');
      return;
    }

    if (!validateEmail(email)) {
      setError('Format d\'email invalide');
      return;
    }

    setLoading(true);
    try {
      // Stocker en localStorage
      localStorage.setItem('keiro_guest_email', email);
      localStorage.setItem('keiro_guest_started_at', new Date().toISOString());

      onSubmit(email);
      onClose();
    } catch (err) {
      setError('Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-cyan-500 p-6 text-white">
          <h2 className="text-2xl font-bold mb-2">🎉 Commencez gratuitement !</h2>
          <p className="text-blue-100 text-sm">
            Entrez votre email pour accéder à la galerie
          </p>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Avantages */}
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-neutral-900">Upload d'images illimité</p>
                <p className="text-xs text-neutral-600">Stockez vos visuels dans votre galerie</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-neutral-900">1 brouillon Instagram gratuit</p>
                <p className="text-xs text-neutral-600">Créez un post Instagram professionnel</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-neutral-900">Accès aux fonctionnalités de base</p>
                <p className="text-xs text-neutral-600">Organisation et gestion de vos images</p>
              </div>
            </div>
          </div>

          {/* Email Input */}
          <div>
            <label className="block text-sm font-semibold text-neutral-700 mb-2">
              Votre email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError('');
              }}
              placeholder="vous@exemple.com"
              className="w-full px-4 py-3 rounded-lg border-2 border-neutral-300 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all"
              disabled={loading}
            />
            {error && (
              <p className="text-red-600 text-sm mt-2 flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </p>
            )}
          </div>

          {/* Disclaimer */}
          <p className="text-xs text-neutral-500 text-center">
            En continuant, vous acceptez de recevoir nos communications.
            Pas de spam, promis ! 🙏
          </p>

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-lg border-2 border-neutral-300 text-neutral-700 font-semibold hover:bg-neutral-50 transition-colors"
              disabled={loading}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-3 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading}
            >
              {loading ? 'Chargement...' : 'Commencer 🚀'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
