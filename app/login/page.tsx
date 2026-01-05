'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const supabase = supabaseBrowser();

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [businessType, setBusinessType] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      setSuccess(true);
      setTimeout(() => {
        // Force hard reload pour que le Header se rafraîchisse
        window.location.href = '/generate';
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      setError('Veuillez entrer votre email');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });

      if (error) throw error;

      setSuccess(true);
      setError('Email de réinitialisation envoyé ! Vérifiez votre boîte mail.');
    } catch (err: any) {
      setError(err.message || 'Erreur lors de l\'envoi de l\'email');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Créer le compte
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/generate`,
          data: {
            first_name: firstName,
            last_name: lastName,
            business_type: businessType,
          },
        },
      });

      if (signUpError) {
        // Vérifier si c'est une erreur de compte déjà existant
        if (signUpError.message.includes('already registered') || signUpError.message.includes('User already registered')) {
          setError('Un compte existe déjà avec cet email. Veuillez vous connecter ou réinitialiser votre mot de passe.');
          setMode('login'); // Basculer vers le mode connexion
          return;
        }
        throw signUpError;
      }

      console.log('[Signup] User created:', data.user?.id);

      // Créer le profil dans la table profiles
      if (data.user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .insert([
            {
              id: data.user.id,
              email: email,
              first_name: firstName,
              last_name: lastName,
              business_type: businessType,
            },
          ]);

        if (profileError) {
          console.error('[Signup] Profile creation error:', profileError);
          // Ne pas bloquer l'inscription si la création du profil échoue
        } else {
          console.log('[Signup] Profile created successfully');
        }
      }

      // Vérifier si l'utilisateur est directement connecté (si email confirmation désactivée)
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        // Utilisateur connecté immédiatement
        console.log('[Signup] User logged in immediately');
        setSuccess(true);
        setTimeout(() => {
          // Force hard reload pour que le Header se rafraîchisse
          window.location.href = '/generate';
        }, 1000);
      } else {
        // Email de confirmation nécessaire
        setSuccess(true);
        setError('Vérifiez votre email pour confirmer votre inscription !');
      }
    } catch (err: any) {
      console.error('[Signup] Error:', err);
      setError(err.message || 'Erreur lors de l\'inscription');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 flex items-center justify-center px-4 py-12">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
        {/* Logo / Titre */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
            KeiroAI
          </h1>
          <p className="text-neutral-600 mt-2">
            Créez des visuels qui surfent sur l'actu
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 bg-neutral-100 rounded-lg p-1">
          <button
            onClick={() => setMode('login')}
            className={`flex-1 py-2 px-4 rounded-md font-semibold transition-all ${
              mode === 'login'
                ? 'bg-white text-blue-600 shadow'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Connexion
          </button>
          <button
            onClick={() => setMode('signup')}
            className={`flex-1 py-2 px-4 rounded-md font-semibold transition-all ${
              mode === 'signup'
                ? 'bg-white text-blue-600 shadow'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Inscription
          </button>
        </div>

        {/* Success Message */}
        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-700 text-sm font-medium">
              {mode === 'login' ? 'Connexion réussie !' : 'Compte créé avec succès !'}
            </p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {/* Login Form */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-2">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border-2 border-neutral-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                placeholder="votre@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-2">
                Mot de passe
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border-2 border-neutral-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Connexion...' : 'Se connecter'}
            </button>

            <button
              type="button"
              onClick={handleResetPassword}
              disabled={loading}
              className="w-full text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors"
            >
              Mot de passe oublié ?
            </button>
          </form>
        )}

        {/* Signup Form */}
        {mode === 'signup' && (
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-2">
                  Prénom
                </label>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border-2 border-neutral-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                  placeholder="Jean"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-2">
                  Nom
                </label>
                <input
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border-2 border-neutral-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                  placeholder="Dupont"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-2">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border-2 border-neutral-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                placeholder="votre@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-2">
                Mot de passe
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border-2 border-neutral-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                placeholder="••••••••"
              />
              <p className="text-xs text-neutral-500 mt-1">Minimum 6 caractères</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-2">
                Type d'activité
              </label>
              <select
                required
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border-2 border-neutral-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer"
              >
                <option value="">Sélectionnez...</option>
                <option value="restaurant">Restaurant / Café</option>
                <option value="retail">Commerce / Retail</option>
                <option value="services">Services / Conseil</option>
                <option value="ecommerce">E-commerce</option>
                <option value="agency">Agence / Marketing</option>
                <option value="freelance">Freelance</option>
                <option value="other">Autre</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Création du compte...' : 'Créer mon compte'}
            </button>

            <p className="text-xs text-neutral-500 text-center">
              En créant un compte, vous acceptez nos conditions d'utilisation
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
