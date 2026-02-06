'use client';

import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

interface ProfileData {
  company_name?: string;
  website?: string;
  business_since?: string;
  team_size?: string;
  social_networks?: string[];
  posting_frequency?: string;
  main_goal?: string;
  marketing_budget?: string;
  target_audience?: string;
  acquisition_source?: string;
  company_description?: string;
  brand_tone?: string;
  main_products?: string;
  competitors?: string;
  content_themes?: string[];
  social_goals_monthly?: string;
}

interface ProfileEnrichmentModalProps {
  profile: ProfileData | null;
  userId: string;
  onClose: () => void;
}

const ENRICHMENT_FIELDS: (keyof ProfileData)[] = [
  'company_name', 'website', 'business_since', 'team_size',
  'social_networks', 'posting_frequency', 'main_goal', 'marketing_budget',
  'target_audience', 'acquisition_source', 'company_description', 'brand_tone',
  'main_products', 'competitors', 'content_themes', 'social_goals_monthly',
];

function countFilledFields(profile: ProfileData | null): number {
  if (!profile) return 0;
  return ENRICHMENT_FIELDS.filter((field) => {
    const val = profile[field];
    if (Array.isArray(val)) return val.length > 0;
    return !!val;
  }).length;
}

export function shouldShowEnrichmentModal(profile: ProfileData | null): boolean {
  if (!profile) return false;
  const filled = countFilledFields(profile);
  return filled < 8; // < 50% filled → show modal every time
}

const CONTENT_THEME_OPTIONS = [
  'Promotions', 'Éducatif', 'Coulisses', 'Témoignages', 'Actualité', 'Storytelling',
];

export default function ProfileEnrichmentModal({ profile, userId, onClose }: ProfileEnrichmentModalProps) {
  const [loading, setLoading] = useState(false);

  // Form state initialized from existing profile
  const [companyName, setCompanyName] = useState(profile?.company_name || '');
  const [website, setWebsite] = useState(profile?.website || '');
  const [businessSince, setBusinessSince] = useState(profile?.business_since || '');
  const [teamSize, setTeamSize] = useState(profile?.team_size || '');
  const [socialNetworks, setSocialNetworks] = useState<string[]>(profile?.social_networks || []);
  const [postingFrequency, setPostingFrequency] = useState(profile?.posting_frequency || '');
  const [mainGoal, setMainGoal] = useState(profile?.main_goal || '');
  const [marketingBudget, setMarketingBudget] = useState(profile?.marketing_budget || '');
  const [targetAudience, setTargetAudience] = useState(profile?.target_audience || '');
  const [acquisitionSource, setAcquisitionSource] = useState(profile?.acquisition_source || '');
  const [companyDescription, setCompanyDescription] = useState(profile?.company_description || '');
  const [brandTone, setBrandTone] = useState(profile?.brand_tone || '');
  const [mainProducts, setMainProducts] = useState(profile?.main_products || '');
  const [competitors, setCompetitors] = useState(profile?.competitors || '');
  const [contentThemes, setContentThemes] = useState<string[]>(profile?.content_themes || []);
  const [socialGoalsMonthly, setSocialGoalsMonthly] = useState(profile?.social_goals_monthly || '');

  const toggleSocialNetwork = (network: string) => {
    setSocialNetworks(prev =>
      prev.includes(network) ? prev.filter(n => n !== network) : [...prev, network]
    );
  };

  const toggleContentTheme = (theme: string) => {
    setContentThemes(prev =>
      prev.includes(theme) ? prev.filter(t => t !== theme) : [...prev, theme]
    );
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const supabase = supabaseBrowser();
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
          .eq('id', userId);

        if (error) {
          console.error('[ProfileEnrichment] Update error:', error);
        } else {
          console.log('[ProfileEnrichment] Profile updated successfully');
        }
      }
    } catch (err) {
      console.error('[ProfileEnrichment] Error:', err);
    } finally {
      setLoading(false);
      onClose();
    }
  };

  const selectClass = "w-full px-4 py-3 rounded-lg border-2 border-neutral-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer text-sm";
  const inputClass = "w-full px-4 py-3 rounded-lg border-2 border-neutral-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all text-sm";

  const filled = countFilledFields(profile);
  const percent = Math.round((filled / 16) * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 pb-4">
          <div className="text-center mb-4">
            <div className="w-14 h-14 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-neutral-900">
              Personnalisez votre exp{"é"}rience
            </h2>
            <p className="text-neutral-500 mt-2 text-sm">
              Complétez votre profil pour que notre IA génère des contenus parfaitement adaptés à votre business
            </p>
          </div>

          {/* Progress bar */}
          <div className="mb-2">
            <div className="flex justify-between text-xs text-neutral-500 mb-1">
              <span>Profil complété</span>
              <span>{percent}%</span>
            </div>
            <div className="w-full h-2 bg-neutral-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Scrollable form */}
        <div className="flex-1 overflow-y-auto px-6 space-y-4">
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
              {CONTENT_THEME_OPTIONS.map((theme) => (
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
                <option value="0">0&#8364;</option>
                <option value="under-100">Moins de 100&#8364;</option>
                <option value="100-500">100-500&#8364;</option>
                <option value="500-2000">500-2000&#8364;</option>
                <option value="2000+">2000&#8364;+</option>
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
          <div className="pb-2">
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

        {/* Buttons - Fixed at bottom */}
        <div className="flex gap-3 p-6 pt-4 border-t border-neutral-100">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 border-2 border-neutral-200 text-neutral-600 font-semibold rounded-lg hover:bg-neutral-50 transition-all"
          >
            Passer
          </button>
          <button
            type="button"
            onClick={handleSubmit}
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
