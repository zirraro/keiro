'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { ScaleIn } from '@/components/ui/motion';
import { AnimatedGradientBG } from '@/components/ui/animated-gradient-bg';
import { KeiroLogo } from '@/components/ui/keiro-logo';
import { useLanguage } from '@/lib/i18n/context';

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-neutral-50 flex items-center justify-center"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = supabaseBrowser();
  const { t } = useLanguage();

  const stripeSessionId = searchParams.get('stripe_session_id');
  const paymentSuccess = searchParams.get('payment_success') === '1';
  const planFromUrl = searchParams.get('plan');

  // Redirect après login : /generate par défaut
  const getRedirectUrl = () => {
    const redirect = searchParams.get('redirect') || '/generate';
    const plan = searchParams.get('plan');
    return plan ? `${redirect}?plan=${plan}` : redirect;
  };

  // Après login/signup, lier le paiement Stripe au compte si session_id présent
  const claimStripePayment = async () => {
    if (!stripeSessionId) return;
    try {
      const res = await fetch('/api/stripe/claim-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: stripeSessionId }),
      });
      const data = await res.json();
      if (data.ok) {
        console.log('[Login] Stripe payment claimed:', data.plan);
      } else {
        console.error('[Login] Failed to claim payment:', data.error);
      }
    } catch (err) {
      console.error('[Login] Claim payment error:', err);
    }
  };

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
  const [promoCode, setPromoCode] = useState('');

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

      // S'assurer que le profil existe (peut manquer si supprimé manuellement)
      if (data.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', data.user.id)
          .single();

        if (!profile) {
          console.log('[Login] Profile missing, creating...');
          await supabase.from('profiles').insert([{
            id: data.user.id,
            email: data.user.email || '',
            first_name: data.user.user_metadata?.first_name || '',
            last_name: data.user.user_metadata?.last_name || '',
            business_type: data.user.user_metadata?.business_type || '',
          }]);

          // Réassocier les données orphelines
          if (data.user.email) {
            try {
              await fetch('/api/auth/reassociate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  userId: data.user.id,
                  email: data.user.email,
                }),
              });
            } catch (err) {
              console.error('[Login] Reassociation error:', err);
            }
          }
        }
      }

      // Lier le paiement Stripe si session_id présent
      if (stripeSessionId) {
        setSuccess(true);
        setError(t.login.activatingPlan);
        await claimStripePayment();
        window.location.href = '/generate';
        return;
      }

      // Activer code promo si fourni — passer le token explicitement car le cookie peut ne pas être encore dispo
      if (promoCode.trim() && data.session?.access_token) {
        try {
          const promoRes = await fetch('/api/credits/redeem', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${data.session.access_token}`,
            },
            body: JSON.stringify({ code: promoCode.trim() }),
          });
          const promoData = await promoRes.json();
          if (promoData.ok) {
            setSuccess(true);
            setError(`+${promoData.credits} ${t.common.credits} ! ${t.login.promoApplied}`);
            setTimeout(() => { window.location.href = getRedirectUrl(); }, 2500);
            return;
          } else {
            console.error('[Login] Promo code error:', promoData.error);
            setError(promoData.error || 'Erreur code promo');
          }
        } catch (promoErr) {
          console.error('[Login] Promo code fetch error:', promoErr);
        }
      }

      setSuccess(true);
      setTimeout(() => {
        window.location.href = getRedirectUrl();
      }, 1000);
    } catch (err: any) {
      setError(err.message || t.login.loginError);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      setError(t.login.enterEmail);
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
      setError(t.login.resetEmailSent);
    } catch (err: any) {
      setError(err.message || t.login.loginError);
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Sauvegarder le stripe_session_id pour le récupérer après confirmation email
    if (stripeSessionId) {
      localStorage.setItem('pending_stripe_session', stripeSessionId);
    }

    // Sauvegarder le code promo pour le récupérer après confirmation email
    if (promoCode.trim()) {
      localStorage.setItem('pending_promo_code', promoCode.trim().toUpperCase());
    }

    const finalBusinessType = businessType === 'other' ? customBusinessType : businessType;

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            first_name: firstName,
            last_name: lastName,
            business_type: finalBusinessType,
          },
        },
      });

      if (signUpError) {
        if (signUpError.message.includes('already registered') || signUpError.message.includes('User already registered')) {
          setError(t.login.accountExists);
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

      // Activer code promo si fourni ET session existe (pas de confirmation email)
      let promoExpiresMessage = '';
      if (promoCode.trim() && session?.access_token) {
        try {
          const promoRes = await fetch('/api/credits/redeem', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ code: promoCode.trim() }),
          });
          const promoData = await promoRes.json();
          if (promoData.ok) {
            promoExpiresMessage = ` +${promoData.credits} crédits ajoutés${promoData.expiresAt ? ' — expirent dans 14 jours' : ''}.`;
            localStorage.removeItem('pending_promo_code'); // Déjà activé, pas besoin du callback
          }
          console.log('[Signup] Promo code redeemed:', promoData);
        } catch (promoErr) {
          console.error('[Signup] Promo code error:', promoErr);
        }
      }

      if (session) {
        // Lier le paiement Stripe si session_id présent
        if (stripeSessionId) {
          setSuccess(true);
          setError(t.login.activatingPlan);
          await claimStripePayment();
          window.location.href = '/generate';
          return;
        }

        console.log('[Signup] User logged in immediately, showing step 2');
        setSuccess(true);
        if (promoExpiresMessage) setError(promoExpiresMessage.trim());
        setStep(2);
      } else {
        // Email de confirmation requis
        if (stripeSessionId) {
          setSuccess(true);
          setError(t.login.signupSuccess);
        } else {
          setSuccess(true);
          setError(t.login.signupSuccess + promoExpiresMessage);
        }
      }
    } catch (err: any) {
      console.error('[Signup] Error:', err);
      setError(err.message || t.login.signupError);
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
      window.location.href = getRedirectUrl();
    }
  };

  const handleSkipStep2 = () => {
    window.location.href = getRedirectUrl();
  };

  // Step 2 - Profile enrichment
  if (step === 2) {
    const selectClass = "w-full px-4 py-3 rounded-lg border-2 border-neutral-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer text-sm";
    const inputClass = "w-full px-4 py-3 rounded-lg border-2 border-neutral-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all text-sm";

    return (
      <div className="relative min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 flex items-center justify-center px-4 py-12 overflow-hidden">
        <AnimatedGradientBG variant="hero" />
        <ScaleIn className="relative w-full max-w-lg">
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl w-full p-8">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="w-14 h-14 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-neutral-900">
              {t.login.step2PersonalizeTitle}
            </h1>
            <p className="text-neutral-500 mt-2 text-sm">
              {t.login.step2PersonalizeSub}
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
                {t.login.step2CompanyName}
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className={inputClass}
                placeholder={t.login.step2CompanyNamePlaceholder}
              />
            </div>

            {/* Description de l'entreprise - NEW */}
            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-1">
                {t.login.step2CompanyDesc}
              </label>
              <textarea
                value={companyDescription}
                onChange={(e) => setCompanyDescription(e.target.value)}
                className={`${inputClass} resize-none`}
                rows={3}
                placeholder={t.login.step2CompanyDescPlaceholder}
              />
            </div>

            {/* Site web */}
            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-1">
                {t.login.step2Website}
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
                {t.login.step2Products}
              </label>
              <input
                type="text"
                value={mainProducts}
                onChange={(e) => setMainProducts(e.target.value)}
                className={inputClass}
                placeholder={t.login.step2ProductsPlaceholder}
              />
            </div>

            {/* Année de création + Taille équipe */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-1">
                  {t.login.step2YearCreated}
                </label>
                <input
                  type="text"
                  value={businessSince}
                  onChange={(e) => setBusinessSince(e.target.value)}
                  className={inputClass}
                  placeholder="Ex: 2020"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-1">
                  {t.login.step2Employees}
                </label>
                <select
                  value={teamSize}
                  onChange={(e) => setTeamSize(e.target.value)}
                  className={selectClass}
                >
                  <option value="">{t.login.step2SelectPlaceholder}</option>
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
                {t.login.step2BrandTone}
              </label>
              <select
                value={brandTone}
                onChange={(e) => setBrandTone(e.target.value)}
                className={selectClass}
              >
                <option value="">{t.login.step2SelectPlaceholder}</option>
                <option value="professionnel">{t.login.step2TonePro}</option>
                <option value="decontracte">{t.login.step2ToneCasual}</option>
                <option value="humoristique">{t.login.step2ToneHumor}</option>
                <option value="inspirant">{t.login.step2ToneInspiring}</option>
                <option value="luxe-premium">{t.login.step2ToneLuxury}</option>
              </select>
            </div>

            {/* Réseaux sociaux */}
            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-2">
                {t.login.step2SocialNetworks}
              </label>
              <div className="flex flex-wrap gap-2">
                {['Instagram', 'TikTok', 'Facebook', 'LinkedIn', 'YouTube', t.login.step2None].map((network) => (
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
                {t.login.step2ContentThemes}
              </label>
              <div className="flex flex-wrap gap-2">
                {[t.login.step2ThemePromos, t.login.step2ThemeEducational, t.login.step2ThemeBehindScenes, t.login.step2ThemeTestimonials, t.login.step2ThemeNews, t.login.step2ThemeStorytelling].map((theme) => (
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
                {t.login.step2PostingFrequency}
              </label>
              <select
                value={postingFrequency}
                onChange={(e) => setPostingFrequency(e.target.value)}
                className={selectClass}
              >
                <option value="">{t.login.step2SelectPlaceholder}</option>
                <option value="never">{t.login.step2FreqNever}</option>
                <option value="less-than-weekly">{t.login.step2FreqLessWeekly}</option>
                <option value="1-3-weekly">{t.login.step2FreqWeekly}</option>
                <option value="daily">{t.login.step2FreqDaily}</option>
              </select>
            </div>

            {/* Objectif principal */}
            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-1">
                {t.login.step2MainGoal}
              </label>
              <select
                value={mainGoal}
                onChange={(e) => setMainGoal(e.target.value)}
                className={selectClass}
              >
                <option value="">{t.login.step2SelectPlaceholder}</option>
                <option value="visibility">{t.login.step2GoalVisibility}</option>
                <option value="sales">{t.login.step2GoalSales}</option>
                <option value="engagement">{t.login.step2GoalEngagement}</option>
                <option value="leads">{t.login.step2GoalLeads}</option>
                <option value="recruitment">{t.login.step2GoalRecruitment}</option>
              </select>
            </div>

            {/* Budget + Audience */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-1">
                  {t.login.step2MarketingBudget}
                </label>
                <select
                  value={marketingBudget}
                  onChange={(e) => setMarketingBudget(e.target.value)}
                  className={selectClass}
                >
                  <option value="">{t.login.step2SelectPlaceholder}</option>
                  <option value="0">0€</option>
                  <option value="under-100">Moins de 100€</option>
                  <option value="100-500">100-500€</option>
                  <option value="500-2000">500-2000€</option>
                  <option value="2000+">2000€+</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-1">
                  {t.login.step2TargetAudience}
                </label>
                <select
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  className={selectClass}
                >
                  <option value="">{t.login.step2SelectPlaceholder}</option>
                  <option value="b2c-local">{t.login.step2AudienceB2CLocal}</option>
                  <option value="b2c-national">{t.login.step2AudienceB2CNational}</option>
                  <option value="b2b">{t.login.step2AudienceB2B}</option>
                  <option value="both">{t.login.step2AudienceBoth}</option>
                </select>
              </div>
            </div>

            {/* Objectifs réseaux sociaux (mensuel) - NEW */}
            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-1">
                {t.login.step2SocialGoals}
              </label>
              <select
                value={socialGoalsMonthly}
                onChange={(e) => setSocialGoalsMonthly(e.target.value)}
                className={selectClass}
              >
                <option value="">{t.login.step2SelectPlaceholder}</option>
                <option value="debuter">{t.login.step2GoalStart}</option>
                <option value="10-posts">10 posts/mois</option>
                <option value="20-posts">20 posts/mois</option>
                <option value="30-plus">30+ posts/mois</option>
              </select>
            </div>

            {/* Concurrents principaux - NEW */}
            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-1">
                {t.login.step2Competitors}
              </label>
              <input
                type="text"
                value={competitors}
                onChange={(e) => setCompetitors(e.target.value)}
                className={inputClass}
                placeholder={t.login.step2CompetitorsPlaceholder}
              />
            </div>

            {/* Source d'acquisition */}
            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-1">
                {t.login.step2HowFound}
              </label>
              <select
                value={acquisitionSource}
                onChange={(e) => setAcquisitionSource(e.target.value)}
                className={selectClass}
              >
                <option value="">{t.login.step2SelectPlaceholder}</option>
                <option value="google">{t.login.step2SourceGoogle}</option>
                <option value="social-media">{t.login.step2SourceSocial}</option>
                <option value="word-of-mouth">{t.login.step2SourceWordOfMouth}</option>
                <option value="blog">{t.login.step2SourceBlog}</option>
                <option value="other">{t.login.step2SourceOther}</option>
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
              {t.login.step2Skip}
            </button>
            <button
              type="button"
              onClick={handleStep2Submit}
              disabled={loading}
              className="flex-1 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed cta-shimmer"
            >
              {loading ? t.login.step2Saving : t.login.step2Continue}
            </button>
          </div>
        </div>
        </ScaleIn>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 flex items-center justify-center px-4 py-12 overflow-hidden">
      <AnimatedGradientBG variant="hero" />
      <ScaleIn className="relative w-full max-w-md">
      <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl w-full p-8">
        {/* Logo / Titre */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            <KeiroLogo size={48} color="#111111" />
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
            KeiroAI
          </h1>
          <p className="text-neutral-600 mt-2">
            {t.login.loginSubtitle}
          </p>
        </div>

        {/* Paiement Stripe réussi — créer un compte pour activer */}
        {paymentSuccess && (
          <div className="mb-6 p-4 bg-green-50 border-2 border-green-200 rounded-xl">
            <p className="text-green-800 font-semibold text-sm">
              {t.login.paymentReceived}
            </p>
            <p className="text-green-700 text-xs mt-1">
              {mode === 'login' ? t.login.loginCta : t.login.signupCta} {t.login.paymentActivate} <span className="font-semibold capitalize">{planFromUrl}</span>.
            </p>
          </div>
        )}

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
            {t.login.loginTab}
          </button>
          <button
            onClick={() => setMode('signup')}
            className={`flex-1 py-2 px-4 rounded-md font-semibold transition-all ${
              mode === 'signup'
                ? 'bg-white text-blue-600 shadow'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            {t.login.signupTab}
          </button>
        </div>

        {/* Success Message */}
        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-700 text-sm font-medium">
              {mode === 'login' ? t.login.loginSuccess : t.login.signupSuccess}
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
                {t.login.email}
              </label>
              <input
                type="email"
                name="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border-2 border-neutral-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                placeholder="votre@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-2">
                {t.login.password}
              </label>
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border-2 border-neutral-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                placeholder="••••••••"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-500 mb-1">
                {t.login.promoCode}
              </label>
              <input
                type="text"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                className="w-full px-4 py-2.5 rounded-lg border-2 border-neutral-200 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-100 transition-all uppercase tracking-wider text-sm"
                placeholder="MONCODE"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed cta-shimmer"
            >
              {loading ? t.login.connecting : t.login.loginCta}
            </button>

            <button
              type="button"
              onClick={handleResetPassword}
              disabled={loading}
              className="w-full text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors"
            >
              {t.login.forgotPassword}
            </button>
          </form>
        )}

        {/* Signup Form */}
        {mode === 'signup' && (
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-2">
                  {t.login.step2FirstName}
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
                  {t.login.step2LastName}
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
                {t.login.email}
              </label>
              <input
                type="email"
                name="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border-2 border-neutral-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                placeholder="votre@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-2">
                {t.login.password}
              </label>
              <input
                type="password"
                name="new-password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border-2 border-neutral-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                placeholder="••••••••"
              />
              <p className="text-xs text-neutral-500 mt-1">{t.login.passwordMinLength}</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-2">
                {t.login.signupBusinessType}
              </label>
              <select
                required
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border-2 border-neutral-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer"
              >
                <option value="">{t.login.step2SelectPlaceholder}</option>
                <option value="restaurant">{t.login.signupRestaurant}</option>
                <option value="retail">{t.login.signupRetail}</option>
                <option value="services">{t.login.signupServices}</option>
                <option value="ecommerce">{t.login.signupEcommerce}</option>
                <option value="agency">{t.login.signupAgency}</option>
                <option value="freelance">{t.login.signupFreelance}</option>
                <option value="other">{t.login.signupOther}</option>
              </select>
              {businessType === 'other' && (
                <input
                  type="text"
                  required
                  value={customBusinessType}
                  onChange={(e) => setCustomBusinessType(e.target.value)}
                  className="w-full mt-2 px-4 py-3 rounded-lg border-2 border-neutral-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                  placeholder={t.login.signupOtherPlaceholder}
                />
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-500 mb-1">
                {t.login.promoCode}
              </label>
              <input
                type="text"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                className="w-full px-4 py-2.5 rounded-lg border-2 border-neutral-200 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-100 transition-all uppercase tracking-wider text-sm"
                placeholder="MONCODE"
              />
              <p className="text-xs text-neutral-400 mt-1">{t.login.signupPromoHint}</p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed cta-shimmer"
            >
              {loading ? t.login.signupCreating : t.login.signupCta}
            </button>

            <p className="text-xs text-neutral-500 text-center">
              {t.login.signupTerms}
            </p>
          </form>
        )}
      </div>
      </ScaleIn>
    </div>
  );
}
