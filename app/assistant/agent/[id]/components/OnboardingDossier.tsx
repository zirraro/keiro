'use client';

import { useState, useEffect, useCallback } from 'react';

interface DossierField {
  key: string;
  label: string;
  placeholder: string;
  type?: 'text' | 'textarea';
}

const STEPS = [
  {
    id: 'identite',
    title: 'Ton commerce',
    icon: '\u{1F3E2}',
    description: 'Parle-nous de ton business',
    fields: [
      { key: 'company_name', label: 'Nom du commerce', placeholder: 'Ex: Boulangerie Martin' },
      { key: 'company_description', label: 'Description en 1 phrase', placeholder: 'Ex: Boulangerie artisanale bio a Paris 11e', type: 'textarea' as const },
      { key: 'business_type', label: 'Type d\'activite', placeholder: 'Ex: restaurant, coach, boutique...' },
      { key: 'founder_name', label: 'Ton prenom', placeholder: 'Prenom' },
      { key: 'employees_count', label: 'Taille equipe', placeholder: 'Ex: solo, 2-5, 5-10' },
    ],
  },
  {
    id: 'localisation',
    title: 'Ta zone',
    icon: '\u{1F4CD}',
    description: 'Ou se trouve ton business',
    fields: [
      { key: 'city', label: 'Ville', placeholder: 'Ex: Paris' },
      { key: 'address', label: 'Adresse (optionnel)', placeholder: 'Adresse complete' },
      { key: 'catchment_area', label: 'Tes clients viennent d\'ou ?', placeholder: 'Ex: quartier, 5km, tout Paris, national' },
    ],
  },
  {
    id: 'offre',
    title: 'Ton offre',
    icon: '\u{1F381}',
    description: 'Ce que tu proposes',
    fields: [
      { key: 'main_products', label: 'Tes produits / services', placeholder: 'Ex: pain bio, viennoiseries, sandwichs midi', type: 'textarea' as const },
      { key: 'price_range', label: 'Gamme de prix', placeholder: 'Ex: 2-15 EUR, premium, accessible' },
      { key: 'unique_selling_points', label: 'Ce qui te differencie', placeholder: 'Ex: 100% bio, cuisson au feu de bois', type: 'textarea' as const },
      { key: 'competitors', label: 'Tes concurrents (optionnel)', placeholder: 'Ex: Boulangerie Dupont, Paul' },
    ],
  },
  {
    id: 'cible',
    title: 'Tes clients',
    icon: '\u{1F3AF}',
    description: 'Qui sont tes meilleurs clients',
    fields: [
      { key: 'target_audience', label: 'Qui sont tes clients ?', placeholder: 'Ex: familles 30-50 ans, CSP+, quartier', type: 'textarea' as const },
      { key: 'ideal_customer_profile', label: 'Ton client ideal', placeholder: 'Decris ton meilleur client type' },
      { key: 'customer_pain_points', label: 'Quel probleme tu resous ?', placeholder: 'Ex: manque de temps, cherche du bio' },
    ],
  },
  {
    id: 'communication',
    title: 'Ton style',
    icon: '\u{1F3A8}',
    description: 'Comment tu communiques',
    fields: [
      { key: 'brand_tone', label: 'Ton de communication', placeholder: 'Ex: chaleureux, premium, fun, pro' },
      { key: 'visual_style', label: 'Style visuel', placeholder: 'Ex: epure, colorful, rustique, moderne' },
      { key: 'brand_colors', label: 'Couleurs de marque', placeholder: 'Ex: marron, dore, blanc creme' },
      { key: 'content_themes', label: 'Themes de contenu', placeholder: 'Ex: recettes, coulisses, temoignages', type: 'textarea' as const },
      { key: 'posting_frequency', label: 'Frequence souhaitee', placeholder: 'Ex: 1/jour, 3/semaine' },
    ],
  },
  {
    id: 'objectifs',
    title: 'Tes objectifs',
    icon: '\u{1F680}',
    description: 'Ce que tu veux atteindre',
    fields: [
      { key: 'business_goals', label: 'Objectif business #1', placeholder: 'Ex: doubler le CA en 6 mois' },
      { key: 'marketing_goals', label: 'Objectif marketing', placeholder: 'Ex: 1000 followers, plus de reservations' },
      { key: 'monthly_budget', label: 'Budget com mensuel', placeholder: 'Ex: 49 EUR/mois' },
    ],
  },
  {
    id: 'presence',
    title: 'En ligne',
    icon: '\u{1F310}',
    description: 'Tes reseaux et site web',
    fields: [
      { key: 'instagram_handle', label: 'Instagram', placeholder: '@moncommerce' },
      { key: 'tiktok_handle', label: 'TikTok', placeholder: '@moncommerce' },
      { key: 'website_url', label: 'Site web', placeholder: 'https://...' },
      { key: 'google_maps_url', label: 'Google Maps', placeholder: 'Lien fiche Google' },
      { key: 'facebook_url', label: 'Facebook', placeholder: 'https://facebook.com/...' },
    ],
  },
];

const ALL_FIELDS = STEPS.flatMap(s => s.fields);

export default function OnboardingDossier() {
  const [dossier, setDossier] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  // Load dossier + auto-refresh every 10s to pick up changes from Clara chat
  const loadDossier = useCallback(async () => {
    try {
      const res = await fetch('/api/business-dossier', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.dossier) setDossier(prev => {
          // Only update if data actually changed
          const newJson = JSON.stringify(data.dossier);
          const prevJson = JSON.stringify(prev);
          return newJson !== prevJson ? data.dossier : prev;
        });
      }
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { loadDossier(); }, [loadDossier]);

  // Auto-refresh to pick up dossier updates from Clara chat
  useEffect(() => {
    const interval = setInterval(loadDossier, 10000);
    return () => clearInterval(interval);
  }, [loadDossier]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await fetch('/api/business-dossier', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(dossier),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {} finally { setSaving(false); }
  }, [dossier]);

  const updateField = useCallback((key: string, value: string) => {
    setDossier(prev => ({ ...prev, [key]: value }));
  }, []);

  const filledCount = ALL_FIELDS.filter(f => dossier[f.key] && String(dossier[f.key]).trim().length > 0).length;
  const completeness = Math.round((filledCount / ALL_FIELDS.length) * 100);

  const step = STEPS[currentStep];
  const stepFilled = step.fields.filter(f => dossier[f.key] && String(dossier[f.key]).trim().length > 0).length;
  const isLastStep = currentStep === STEPS.length - 1;
  const isFirstStep = currentStep === 0;

  const goNext = async () => {
    await handleSave();
    if (!isLastStep) setCurrentStep(prev => prev + 1);
  };

  const goPrev = () => {
    if (!isFirstStep) setCurrentStep(prev => prev - 1);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400" /></div>;
  }

  return (
    <div className="p-5 space-y-5">
      {/* Step indicators */}
      <div className="flex items-center justify-between gap-1">
        {STEPS.map((s, i) => {
          const sFilled = s.fields.filter(f => dossier[f.key] && String(dossier[f.key]).trim().length > 0).length;
          const isComplete = sFilled === s.fields.length;
          const isCurrent = i === currentStep;
          return (
            <button
              key={s.id}
              onClick={() => setCurrentStep(i)}
              className={`flex-1 py-2 rounded-lg text-center transition-all ${
                isCurrent ? 'bg-white/15 border border-white/20' :
                isComplete ? 'bg-green-500/10 border border-green-500/20' :
                'bg-white/5 border border-transparent hover:bg-white/10'
              }`}
            >
              <div className="text-sm">{s.icon}</div>
              <div className={`text-[9px] font-medium mt-0.5 ${isCurrent ? 'text-white' : isComplete ? 'text-green-400' : 'text-white/40'}`}>
                {s.title}
              </div>
            </button>
          );
        })}
      </div>

      {/* Progress */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-blue-500 transition-all duration-500" style={{ width: `${completeness}%` }} />
        </div>
        <span className="text-white/60 text-[10px] font-bold">{completeness}%</span>
      </div>

      {/* Current step content */}
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-2xl">{step.icon}</span>
          <div>
            <h3 className="text-white font-bold text-sm">Etape {currentStep + 1}/{STEPS.length} — {step.title}</h3>
            <p className="text-white/40 text-xs">{step.description}</p>
          </div>
          <span className="ml-auto text-white/30 text-[10px]">{stepFilled}/{step.fields.length}</span>
        </div>

        <div className="space-y-4">
          {step.fields.map(field => (
            <div key={field.key}>
              <label className="text-white/70 text-xs font-medium mb-1.5 block">{field.label}</label>
              {field.type === 'textarea' ? (
                <textarea
                  value={dossier[field.key] || ''}
                  onChange={e => updateField(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  rows={2}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-teal-500/50 resize-none"
                />
              ) : (
                <input
                  type="text"
                  value={dossier[field.key] || ''}
                  onChange={e => updateField(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={goPrev}
          disabled={isFirstStep}
          className="px-4 py-2.5 text-xs font-semibold rounded-xl bg-white/10 text-white/60 hover:bg-white/15 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          {'\u2190'} Precedent
        </button>

        <button
          onClick={goNext}
          className={`px-5 py-2.5 text-xs font-semibold rounded-xl transition-all ${
            saved ? 'bg-green-500/20 text-green-400 border border-green-500/30'
            : isLastStep
              ? 'bg-gradient-to-r from-green-600 to-teal-600 text-white shadow-lg'
              : 'bg-gradient-to-r from-teal-600 to-blue-600 text-white shadow-lg'
          }`}
        >
          {saved ? '\u2713 Sauvegarde !' : isLastStep ? 'Terminer' : `Suivant \u2192`}
        </button>
      </div>

      {/* Tip */}
      <div className="rounded-xl bg-teal-500/10 border border-teal-500/20 px-4 py-3 flex items-start gap-2">
        <span className="text-sm flex-shrink-0">{'\u{1F4AC}'}</span>
        <p className="text-teal-300/80 text-[11px]">
          Tu peux aussi remplir tout ca en discutant avec Clara dans le chat ! Clique sur le bouton chat en bas a droite.
        </p>
      </div>
    </div>
  );
}
