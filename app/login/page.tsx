'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const supabase = supabaseBrowser();

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form fields - Step 1
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [customBusinessType, setCustomBusinessType] = useState('');

  // Form fields - Step 2 (optional enrichment)
  const [companyName, setCompanyName] = useState('');
  const [website, setWebsite] = useState('');
  const [businessSince, setBusinessSince] = useState('');
  const [teamSize, setTeamSize] = useState('');
  const [socialNetworks, setSocialNetworks] = useState<string[]>([]);
  const [postingFrequency, setPostingFrequency] = useState('');
  const [mainGoal, setMainGoal] = useState('');
  const [marketingBudget, setMarketingBudget] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [acquisitionSource, setAcquisitionSource] = useState('');
  const [companyDescription, setCompanyDescription] = useState('');
  const [brandTone, setBrandTone] = useState('');
  const [mainProducts, setMainProducts] = useState('');
  const [competitors, setCompetitors] = useState('');
  const [contentThemes, setContentThemes] = useState<string[]>([]);
  const [socialGoalsMonthly, setSocialGoalsMonthly] = useState('');

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

    const finalBusinessType = businessType === 'other' ? customBusinessType : businessType;

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/generate`,
          data: {
            first_name: firstName,
            last_name: lastName,
            business_type: finalBusinessType,
          },
        },
      });

      if (signUpError) {
        if (signUpError.message.includes('already registered') || signUpError.message.includes('User already registered')) {
          setError('Un compte existe déjà avec cet email. Veuillez vous connecter ou réinitialiser votre mot de passe.');
          setMode('login');
          return;
        }
        throw signUpError;
      }

      console.log('[Signup] User created:', data.user?.id);

      if (data.user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .insert([
            {
              id: data.user.id,
              email: email,
              first_name: firstName,
              last_name: lastName,
              business_type: finalBusinessType,
            },
          ]);

        if (profileError) {
          console.error('[Signup] Profile creation error:', profileError);
        } else {
          console.log('[Signup] Profile created successfully');
        }
      }

      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        console.log('[Signup] User logged in immediately, showing step 2');
        setSuccess(true);
        setStep(2);
      } else {
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

  const toggleSocialNetwork = (network: string) => {
    setSocialNetworks(prev =>
      prev.includes(network)
        ? prev.filter(n => n !== network)
        : [...prev, network]
    );
  };

  const toggleContentTheme = (theme: string) => {
    setContentThemes(prev =>
      prev.includes(theme)
        ? prev.filter(t => t !== theme)
        : [...prev, theme]
    );
  };

  const handleStep2Submit = async () => {
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const updateData: Record<string, any> = {};
        if (companyName) updateData.company_name = companyName;
        if (website) updateData.website = website;
        if (businessSince) updateData.business_since = businessSince;
        if (teamSize) updateData.team_size = teamSize;
        if (socialNetworks.length > 0) updateData.social_networks = socialNetworks;
        if (postingFrequency) updateData.posting_frequency = postingFrequency;
        if (mainGoal) updateData.main_goal = mainGoal;
        if (marketingBudget) updateData.marketing_budget = marketingBudget;
        if (targetAudience) updateData.target_audience = targetAudience;
        if (acquisitionSource) updateData.acquisition_source = acquisitionSource;
        if (companyDescription) updateData.company_description = companyDescription;
        if (brandTone) updateData.brand_tone = brandTone;
        if (mainProducts) updateData.main_products = mainProducts;
        if (competitors) updateData.competitors = competitors;
        if (contentThemes.length > 0) updateData.content_themes = contentThemes;
        if (socialGoalsMonthly) updateData.social_goals_monthly = socialGoalsMonthly;

        if (Object.keys(updateData).length > 0) {
          const { error } = await supabase
            .from('profiles')
            .update(updateData)
            .eq('id', user.id);

          if (error) {
            console.error('[Signup] Profile enrichment error:', error);
          } else {
            console.log('[Signup] Profile enriched successfully');
          }
        }
      }
    } catch (err: any) {
      console.error('[Signup] Step 2 error:', err);
    } finally {
      setLoading(false);
      window.location.href = '/generate';
    }
  };

  const handleSkipStep2 = () => {
    window.location.href = '/generate';
  };

  // Step 2 - Profile enrichment
  if (step === 2) {
    const selectClass = "w-full px-4 py-3 rounded-lg border-2 border-neutral-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer text-sm";
    const inputClass = "w-full px-4 py-3 rounded-lg border-2 border-neutral-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all text-sm";

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 flex items-center justify-center px-4 py-12">
        <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-8">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="w-14 h-14 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-neutral-900">
              Personnalisez votre expérience
            </h1>
            <p className="text-neutral-500 mt-2 text-sm">
              Ces infos aident notre IA à mieux vous servir (optionnel)
            </p>
          </div>

          {/* Progress */}
          <div className="flex items-center gap-2 mb-6">
            <div className="flex-1 h-1.5 bg-blue-500 rounded-full"></div>
            <div className="flex-1 h-1.5 bg-blue-200 rounded-full"></div>
          </div>

          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            {/* Nom de l'entreprise */}
            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-1">
                Nom de l{"'"}entreprise
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className={inputClass}
                placeholder="Mon entreprise"
              />
            </div>

            {/* Description de l'entreprise - NEW */}
            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-1">
                Description de l{"'"}entreprise
              </label>
              <textarea
                value={companyDescription}
                onChange={(e) => setCompanyDescription(e.target.value)}
                className={`${inputClass} resize-none`}
                rows={3}
                placeholder="Décrivez votre activité en quelques phrases..."
              />
            </div>

            {/* Site web */}
            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-1">
                Site web
              </label>
              <input
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className={inputClass}
                placeholder="https://monsite.com"
              />
            </div>

            {/* Produits/services principaux - NEW */}
            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-1">
                Produits / services principaux
              </label>
              <input
                type="text"
                value={mainProducts}
                onChange={(e) => setMainProducts(e.target.value)}
                className={inputClass}
                placeholder="Ex: Formation en ligne, coaching, SaaS..."
              />
            </div>

            {/* Année de création + Taille équipe */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-1">
                  Année de création
                </label>
                <select
                  value={businessSince}
                  onChange={(e) => setBusinessSince(e.target.value)}
                  className={selectClass}
                >
                  <option value="">Sélectionnez...</option>
                  <option value="2024-2025">2024-2025</option>
                  <option value="2020-2023">2020-2023</option>
                  <option value="2015-2019">2015-2019</option>
                  <option value="before-2015">Avant 2015</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-1">
                  Nombre d{"'"}employés
                </label>
                <select
                  value={teamSize}
                  onChange={(e) => setTeamSize(e.target.value)}
                  className={selectClass}
                >
                  <option value="">Sélectionnez...</option>
                  <option value="solo">Solo</option>
                  <option value="2-5">2-5</option>
                  <option value="6-20">6-20</option>
                  <option value="21-50">21-50</option>
                  <option value="50+">50+</option>
                </select>
              </div>
            </div>

            {/* Ton de communication - NEW */}
            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-1">
                Ton de communication
              </label>
              <select
                value={brandTone}
                onChange={(e) => setBrandTone(e.target.value)}
                className={selectClass}
              >
                <option value="">Sélectionnez...</option>
                <option value="professionnel">Professionnel</option>
                <option value="decontracte">Décontracté</option>
                <option value="humoristique">Humoristique</option>
                <option value="inspirant">Inspirant</option>
                <option value="luxe-premium">Luxe / Premium</option>
              </select>
            </div>

            {/* Réseaux sociaux */}
            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-2">
                Réseaux sociaux utilisés
              </label>
              <div className="flex flex-wrap gap-2">
                {['Instagram', 'TikTok', 'Facebook', 'LinkedIn', 'YouTube', 'Aucun'].map((network) => (
                  <button
                    key={network}
                    type="button"
                    onClick={() => toggleSocialNetwork(network)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                      socialNetworks.includes(network)
                        ? 'bg-blue-500 text-white'
                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                    }`}
                  >
                    {network}
                  </button>
                ))}
              </div>
            </div>

            {/* Thèmes de contenu préférés - NEW */}
            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-2">
                Thèmes de contenu préférés
              </label>
              <div className="flex flex-wrap gap-2">
                {['Promotions', 'Éducatif', 'Coulisses', 'Témoignages', 'Actualité', 'Storytelling'].map((theme) => (
                  <button
                    key={theme}
                    type="button"
                    onClick={() => toggleContentTheme(theme)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                      contentThemes.includes(theme)
                        ? 'bg-blue-500 text-white'
                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                    }`}
                  >
                    {theme}
                  </button>
                ))}
              </div>
            </div>

            {/* Fréquence de publication */}
            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-1">
                Fréquence de publication actuelle
              </label>
              <select
                value={postingFrequency}
                onChange={(e) => setPostingFrequency(e.target.value)}
                className={selectClass}
              >
                <option value="">Sélectionnez...</option>
                <option value="never">Jamais</option>
                <option value="less-than-weekly">Moins d{"'"}1x/semaine</option>
                <option value="1-3-weekly">1-3x/semaine</option>
                <option value="daily">Quotidien</option>
              </select>
            </div>

            {/* Objectif principal */}
            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-1">
                Objectif principal
              </label>
              <select
                value={mainGoal}
                onChange={(e) => setMainGoal(e.target.value)}
                className={selectClass}
              >
                <option value="">Sélectionnez...</option>
                <option value="visibility">Visibilité / notoriété</option>
                <option value="sales">Ventes / conversions</option>
                <option value="engagement">Engagement communauté</option>
                <option value="leads">Génération de leads</option>
                <option value="recruitment">Recrutement</option>
              </select>
            </div>

            {/* Budget + Audience */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-1">
                  Budget marketing/mois
                </label>
                <select
                  value={marketingBudget}
                  onChange={(e) => setMarketingBudget(e.target.value)}
                  className={selectClass}
                >
                  <option value="">Sélectionnez...</option>
                  <option value="0">0€</option>
                  <option value="under-100">Moins de 100€</option>
                  <option value="100-500">100-500€</option>
                  <option value="500-2000">500-2000€</option>
                  <option value="2000+">2000€+</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-1">
                  Audience cible
                </label>
                <select
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  className={selectClass}
                >
                  <option value="">Sélectionnez...</option>
                  <option value="b2c-local">B2C local</option>
                  <option value="b2c-national">B2C national</option>
                  <option value="b2b">B2B</option>
                  <option value="both">Les deux</option>
                </select>
              </div>
            </div>

            {/* Objectifs réseaux sociaux (mensuel) - NEW */}
            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-1">
                Objectifs réseaux sociaux (mensuel)
              </label>
              <select
                value={socialGoalsMonthly}
                onChange={(e) => setSocialGoalsMonthly(e.target.value)}
                className={selectClass}
              >
                <option value="">Sélectionnez...</option>
                <option value="debuter">Débuter</option>
                <option value="10-posts">10 posts/mois</option>
                <option value="20-posts">20 posts/mois</option>
                <option value="30-plus">30+ posts/mois</option>
              </select>
            </div>

            {/* Concurrents principaux - NEW */}
            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-1">
                Concurrents principaux
              </label>
              <input
                type="text"
                value={competitors}
                onChange={(e) => setCompetitors(e.target.value)}
                className={inputClass}
                placeholder="Ex: Canva, Buffer, Hootsuite..."
              />
            </div>

            {/* Source d'acquisition */}
            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-1">
                Comment nous avez-vous connu ?
              </label>
              <select
                value={acquisitionSource}
                onChange={(e) => setAcquisitionSource(e.target.value)}
                className={selectClass}
              >
                <option value="">Sélectionnez...</option>
                <option value="google">Google</option>
                <option value="social-media">Réseaux sociaux</option>
                <option value="word-of-mouth">Bouche-à-oreille</option>
                <option value="blog">Article / Blog</option>
                <option value="other">Autre</option>
              </select>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={handleSkipStep2}
              className="flex-1 py-3 border-2 border-neutral-200 text-neutral-600 font-semibold rounded-lg hover:bg-neutral-50 transition-all"
            >
              Passer
            </button>
            <button
              type="button"
              onClick={handleStep2Submit}
              disabled={loading}
              className="flex-1 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Enregistrement...' : 'Continuer'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 flex items-center justify-center px-4 py-12">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
        {/* Logo / Titre */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
            KeiroAI
          </h1>
          <p className="text-neutral-600 mt-2">
            Créez des visuels qui surfent sur l{"'"}actu
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
                Type d{"'"}activité
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
              {businessType === 'other' && (
                <input
                  type="text"
                  required
                  value={customBusinessType}
                  onChange={(e) => setCustomBusinessType(e.target.value)}
                  className="w-full mt-2 px-4 py-3 rounded-lg border-2 border-neutral-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                  placeholder="Précisez votre activité..."
                />
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Création du compte...' : 'Créer mon compte'}
            </button>

            <p className="text-xs text-neutral-500 text-center">
              En créant un compte, vous acceptez nos conditions d{"'"}utilisation
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
