'use client';

import { useState, useEffect, useCallback } from 'react';

interface DossierField {
  key: string;
  label: string;
  section: string;
  placeholder: string;
  type?: 'text' | 'textarea' | 'select';
  options?: string[];
}

const DOSSIER_FIELDS: DossierField[] = [
  // Identite
  { key: 'company_name', label: 'Nom du commerce', section: 'Identite', placeholder: 'Ex: Boulangerie Martin' },
  { key: 'company_description', label: 'Description en 1 phrase', section: 'Identite', placeholder: 'Ex: Boulangerie artisanale bio a Paris 11e', type: 'textarea' },
  { key: 'business_type', label: 'Type d\'activite', section: 'Identite', placeholder: 'Ex: restaurant, coach, boutique...' },
  { key: 'founder_name', label: 'Fondateur / Gerant', section: 'Identite', placeholder: 'Prenom Nom' },
  { key: 'employees_count', label: 'Taille equipe', section: 'Identite', placeholder: 'Ex: solo, 2-5, 5-10' },
  // Localisation
  { key: 'city', label: 'Ville', section: 'Localisation', placeholder: 'Ex: Paris' },
  { key: 'address', label: 'Adresse', section: 'Localisation', placeholder: 'Adresse complete' },
  { key: 'catchment_area', label: 'Zone de chalandise', section: 'Localisation', placeholder: 'Ex: 5km autour, tout Paris, national' },
  // Offre
  { key: 'main_products', label: 'Produits / Services principaux', section: 'Offre', placeholder: 'Ex: pain bio, viennoiseries, sandwichs midi', type: 'textarea' },
  { key: 'price_range', label: 'Gamme de prix', section: 'Offre', placeholder: 'Ex: 2-15 EUR, premium, accessible' },
  { key: 'unique_selling_points', label: 'Ce qui vous differencie', section: 'Offre', placeholder: 'Ex: 100% bio, cuisson au feu de bois', type: 'textarea' },
  { key: 'competitors', label: 'Concurrents locaux', section: 'Offre', placeholder: 'Ex: Boulangerie Dupont, Paul' },
  // Cible
  { key: 'target_audience', label: 'Audience cible', section: 'Cible', placeholder: 'Ex: familles CSP+, 30-50 ans, quartier', type: 'textarea' },
  { key: 'ideal_customer_profile', label: 'Client ideal', section: 'Cible', placeholder: 'Decris ton meilleur client type' },
  { key: 'customer_pain_points', label: 'Problemes que tu resous', section: 'Cible', placeholder: 'Ex: manque de temps pour cuisiner, cherche du bio' },
  // Communication
  { key: 'brand_tone', label: 'Ton de communication', section: 'Communication', placeholder: 'Ex: chaleureux et familial, premium, fun' },
  { key: 'visual_style', label: 'Style visuel', section: 'Communication', placeholder: 'Ex: epure, colorful, rustique, moderne' },
  { key: 'brand_colors', label: 'Couleurs de marque', section: 'Communication', placeholder: 'Ex: marron, dore, blanc creme' },
  { key: 'content_themes', label: 'Themes de contenu', section: 'Communication', placeholder: 'Ex: recettes, coulisses, temoignages clients', type: 'textarea' },
  { key: 'preferred_channels', label: 'Canaux preferes', section: 'Communication', placeholder: 'Ex: Instagram, TikTok, Google Maps' },
  { key: 'posting_frequency', label: 'Frequence souhaitee', section: 'Communication', placeholder: 'Ex: 1 post/jour, 3/semaine' },
  // Objectifs
  { key: 'business_goals', label: 'Objectif business #1', section: 'Objectifs', placeholder: 'Ex: doubler le CA en 6 mois' },
  { key: 'marketing_goals', label: 'Objectif marketing', section: 'Objectifs', placeholder: 'Ex: 1000 followers IG, plus de reservations' },
  { key: 'monthly_budget', label: 'Budget com mensuel', section: 'Objectifs', placeholder: 'Ex: 49 EUR/mois, 200 EUR/mois' },
  // Presence en ligne
  { key: 'instagram_handle', label: 'Instagram', section: 'Presence en ligne', placeholder: '@moncommerce' },
  { key: 'tiktok_handle', label: 'TikTok', section: 'Presence en ligne', placeholder: '@moncommerce' },
  { key: 'website_url', label: 'Site web', section: 'Presence en ligne', placeholder: 'https://...' },
  { key: 'google_maps_url', label: 'Google Maps', section: 'Presence en ligne', placeholder: 'Lien fiche Google' },
  { key: 'facebook_url', label: 'Facebook', section: 'Presence en ligne', placeholder: 'https://facebook.com/...' },
];

const SECTION_ICONS: Record<string, string> = {
  'Identite': '\u{1F3E2}',
  'Localisation': '\u{1F4CD}',
  'Offre': '\u{1F381}',
  'Cible': '\u{1F3AF}',
  'Communication': '\u{1F3A8}',
  'Objectifs': '\u{1F680}',
  'Presence en ligne': '\u{1F310}',
};

export default function OnboardingDossier() {
  const [dossier, setDossier] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>('Identite');

  // Load dossier
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/business-dossier', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (data.dossier) setDossier(data.dossier);
        }
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  // Save dossier
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

  // Update field
  const updateField = useCallback((key: string, value: string) => {
    setDossier(prev => ({ ...prev, [key]: value }));
  }, []);

  // Completeness
  const filledCount = DOSSIER_FIELDS.filter(f => {
    const val = dossier[f.key];
    return val && String(val).trim().length > 0;
  }).length;
  const completeness = Math.round((filledCount / DOSSIER_FIELDS.length) * 100);

  // Group by section
  const sections = DOSSIER_FIELDS.reduce<Record<string, DossierField[]>>((acc, f) => {
    if (!acc[f.section]) acc[f.section] = [];
    acc[f.section].push(f);
    return acc;
  }, {});

  if (loading) {
    return <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400" /></div>;
  }

  return (
    <div className="p-5 space-y-5">
      {/* Header with progress */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-bold text-sm">Ton dossier business</h3>
          <p className="text-white/40 text-xs mt-0.5">
            {completeness}% complet — {filledCount}/{DOSSIER_FIELDS.length} champs remplis
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all ${
            saved ? 'bg-green-500/20 text-green-400 border border-green-500/30'
            : 'bg-gradient-to-r from-teal-600 to-blue-600 text-white shadow-lg'
          }`}
        >
          {saved ? '\u2713 Sauvegarde !' : saving ? 'Sauvegarde...' : 'Sauvegarder'}
        </button>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-teal-500 to-blue-500 transition-all duration-500"
          style={{ width: `${completeness}%` }}
        />
      </div>

      {/* Sections */}
      <div className="space-y-2">
        {Object.entries(sections).map(([sectionName, fields]) => {
          const isExpanded = expandedSection === sectionName;
          const sectionFilled = fields.filter(f => dossier[f.key] && String(dossier[f.key]).trim().length > 0).length;
          const sectionIcon = SECTION_ICONS[sectionName] || '\u{1F4CB}';

          return (
            <div key={sectionName} className="rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
              <button
                onClick={() => setExpandedSection(isExpanded ? null : sectionName)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/[0.03] transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">{sectionIcon}</span>
                  <span className="text-white text-xs font-semibold">{sectionName}</span>
                  <span className="text-white/30 text-[10px]">{sectionFilled}/{fields.length}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${sectionFilled === fields.length ? 'bg-green-500' : 'bg-teal-500'}`}
                      style={{ width: `${(sectionFilled / fields.length) * 100}%` }}
                    />
                  </div>
                  <svg className={`w-4 h-4 text-white/40 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
                  {fields.map(field => (
                    <div key={field.key}>
                      <label className="text-white/60 text-[10px] font-medium mb-1 block">{field.label}</label>
                      {field.type === 'textarea' ? (
                        <textarea
                          value={dossier[field.key] || ''}
                          onChange={e => updateField(field.key, e.target.value)}
                          placeholder={field.placeholder}
                          rows={2}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-xs placeholder-white/20 focus:outline-none focus:ring-1 focus:ring-teal-500/50 resize-none"
                        />
                      ) : (
                        <input
                          type="text"
                          value={dossier[field.key] || ''}
                          onChange={e => updateField(field.key, e.target.value)}
                          placeholder={field.placeholder}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-xs placeholder-white/20 focus:outline-none focus:ring-1 focus:ring-teal-500/50"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Tip */}
      <div className="rounded-xl bg-teal-500/10 border border-teal-500/20 px-4 py-3 flex items-start gap-2">
        <span className="text-sm flex-shrink-0">{'\u{1F4AC}'}</span>
        <p className="text-teal-300/80 text-[11px]">
          Tu peux aussi remplir ton dossier en discutant avec Clara dans le chat. Elle te posera les bonnes questions et remplira tout automatiquement !
        </p>
      </div>
    </div>
  );
}
