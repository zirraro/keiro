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
      // Communication language — feeds all outbound-first output (videos,
      // posts, cold emails, DMs initiated). REPLIES still mirror the
      // prospect's language automatically.
      { key: 'communication_language', label: 'Langue de communication (fr, en, es, de, it, pt)', placeholder: 'fr' },
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

  // Dynamic completeness: count ALL filled fields in dossier (not just form fields)
  const IGNORE_KEYS = new Set(['id', 'user_id', 'created_at', 'updated_at', 'completeness_score', 'uploaded_files', 'ai_summary']);
  const allDossierKeys = Object.keys(dossier).filter(k => !IGNORE_KEYS.has(k) && dossier[k] && String(dossier[k]).trim().length > 0);
  // Count custom_fields entries too
  const customFieldsCount = dossier.custom_fields ? Object.keys(dossier.custom_fields).filter(k => dossier.custom_fields[k] && String(dossier.custom_fields[k]).trim().length > 0).length : 0;
  const totalFilled = allDossierKeys.length + customFieldsCount;
  // Base expectation: 20 fields for a good profile, 30+ is excellent
  const completeness = Math.min(100, Math.round((totalFilled / 25) * 100));

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
      {/* Autofill from URL / IG handle — massive UX boost on first load */}
      <AutofillWidget
        onApplied={async () => {
          await loadDossier();
        }}
      />

      {/* Step indicators */}
      <div className="flex items-center justify-between gap-0.5 sm:gap-1 overflow-x-auto">
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

// ─────────────────────────────────────────────────────────────
// Autofill widget — one-click dossier boost from website + IG handle
// ─────────────────────────────────────────────────────────────
function AutofillWidget({ onApplied }: { onApplied: () => Promise<void> }) {
  const [website, setWebsite] = useState('');
  const [instagram, setInstagram] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    applied_count: number; score_before: number; score_after: number;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!website.trim() && !instagram.trim()) {
      setErr('Mets au moins une URL de site OU un handle Instagram.');
      return;
    }
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const res = await fetch('/api/business-dossier/autofill', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          website: website.trim() || undefined,
          instagram: instagram.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        setErr(data?.error || `Echec (${res.status})`);
        return;
      }
      setResult({
        applied_count: data.applied_count || 0,
        score_before: data.score_before || 0,
        score_after: data.score_after || 0,
      });
      await onApplied();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-teal-500/20 bg-gradient-to-br from-teal-500/10 to-blue-500/10 p-4">
      <div className="flex items-start gap-2 mb-3">
        <span className="text-xl shrink-0">{'\u26A1'}</span>
        <div className="flex-1">
          <p className="text-white text-sm font-bold">Remplissage express</p>
          <p className="text-white/60 text-[11px] leading-relaxed mt-0.5">
            Colle l&apos;URL de ton site + ton handle Instagram. Clara scanne ton site + ton profil et remplit ton dossier en quelques secondes — tu n&apos;as plus qu&apos;a corriger ce qui manque.
          </p>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-2 mb-2">
        <input
          type="url"
          value={website}
          onChange={e => setWebsite(e.target.value)}
          placeholder="https://mon-business.com"
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-teal-500/40"
        />
        <input
          type="text"
          value={instagram}
          onChange={e => setInstagram(e.target.value)}
          placeholder="@moncommerce"
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-teal-500/40"
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={submit}
          disabled={busy}
          className="px-4 py-2 bg-gradient-to-r from-teal-500 to-blue-500 text-white text-xs font-bold rounded-lg hover:opacity-90 transition disabled:opacity-50"
        >
          {busy ? 'Analyse en cours\u2026' : 'Remplir mon dossier'}
        </button>
        {result && (
          <p className="text-[11px] text-emerald-400">
            {'\u2713'} {result.applied_count} champs remplis — score {result.score_before}% \u2192 <strong>{result.score_after}%</strong>
          </p>
        )}
        {err && <p className="text-[11px] text-red-400">{err}</p>}
      </div>
    </div>
  );
}
