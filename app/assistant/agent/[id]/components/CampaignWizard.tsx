'use client';

import { useState, useCallback } from 'react';

/**
 * CampaignWizard — Quick 3-step wizard to launch an agent campaign.
 * Step 1: Choose what the agent does (pre-filled per agent type)
 * Step 2: Set frequency/targets
 * Step 3: Confirm & activate
 * Saves to org_agent_configs with auto_mode=true.
 */

interface WizardStep {
  title: string;
  fields: Array<{
    key: string;
    label: string;
    type: 'select' | 'number' | 'toggle' | 'time';
    options?: Array<{ value: string; label: string }>;
    default: any;
    icon?: string;
  }>;
}

const AGENT_WIZARDS: Record<string, { title: string; subtitle: string; icon: string; steps: WizardStep[] }> = {
  content: {
    title: 'Lancer la publication automatique',
    subtitle: 'Lena publie du contenu sur tes reseaux',
    icon: '\u2728',
    steps: [
      { title: 'Tes reseaux', fields: [
        { key: 'ig_enabled', label: 'Instagram', type: 'toggle', default: true, icon: '\u{1F4F8}' },
        { key: 'posts_per_day_ig', label: 'Posts Instagram/jour', type: 'number', default: 1 },
        { key: 'tt_enabled', label: 'TikTok', type: 'toggle', default: true, icon: '\u{1F3B5}' },
        { key: 'posts_per_day_tt', label: 'Videos TikTok/jour', type: 'number', default: 1 },
        { key: 'li_enabled', label: 'LinkedIn', type: 'toggle', default: false, icon: '\u{1F4BC}' },
        { key: 'posts_per_day_li', label: 'Posts LinkedIn/jour', type: 'number', default: 1 },
      ]},
      { title: 'Format et style', fields: [
        { key: 'formats_ig', label: 'Format Instagram', type: 'select', options: [{ value: 'all', label: 'Mix (posts + reels + stories)' }, { value: 'reels', label: 'Reels/Videos' }, { value: 'static', label: 'Photos' }, { value: 'carousel', label: 'Carrousels' }], default: 'all' },
        { key: 'visual_style', label: 'Style visuel', type: 'select', options: [{ value: 'brand', label: 'DA de marque' }, { value: 'modern', label: 'Moderne' }, { value: 'warm', label: 'Chaleureux' }, { value: 'bold', label: 'Bold/Colore' }], default: 'brand' },
        { key: 'auto_publish', label: 'Publier automatiquement', type: 'toggle', default: true },
      ]},
      { title: 'Horaires', fields: [
        { key: 'publish_hour_1', label: 'Matin', type: 'time', default: '09:00' },
        { key: 'publish_hour_2', label: 'Midi', type: 'time', default: '13:30' },
        { key: 'publish_hour_3', label: 'Soir', type: 'time', default: '18:00' },
      ]},
    ],
  },
  email: {
    title: 'Lancer la prospection email',
    subtitle: 'Hugo envoie des emails personnalises a tes prospects',
    icon: '\u{1F4E7}',
    steps: [
      { title: 'Volume', fields: [
        { key: 'max_emails_day', label: 'Emails/jour max', type: 'number', default: 30 },
        { key: 'email_types', label: 'Types de prospects', type: 'select', options: [{ value: 'all', label: 'Tous les types' }, { value: 'restaurant', label: 'Restaurants' }, { value: 'boutique', label: 'Boutiques' }, { value: 'coach', label: 'Coachs/Freelances' }], default: 'all' },
      ]},
      { title: 'Style', fields: [
        { key: 'email_tone', label: 'Ton des emails', type: 'select', options: [{ value: 'friendly', label: 'Amical' }, { value: 'professional', label: 'Professionnel' }, { value: 'direct', label: 'Direct' }], default: 'friendly' },
        { key: 'auto_followup', label: 'Relances auto', type: 'toggle', default: true },
        { key: 'max_followups', label: 'Nombre max de relances', type: 'number', default: 3 },
      ]},
    ],
  },
  dm_instagram: {
    title: 'Lancer la prospection DM',
    subtitle: 'Jade envoie des DMs personnalises a tes prospects',
    icon: '\u{1F4AC}',
    steps: [
      { title: 'Volume', fields: [
        { key: 'max_dms_day', label: 'DMs/jour max', type: 'number', default: 30 },
        { key: 'target', label: 'Cible', type: 'select', options: [{ value: 'new_followers', label: 'Nouveaux abonnes' }, { value: 'engaged', label: 'Utilisateurs engages' }, { value: 'prospects', label: 'Prospects CRM' }], default: 'new_followers' },
      ]},
      { title: 'Style', fields: [
        { key: 'dm_tone', label: 'Ton des DMs', type: 'select', options: [{ value: 'casual', label: 'Casual (ami)' }, { value: 'value', label: 'Value-first (conseil)' }, { value: 'direct', label: 'Direct (proposition)' }], default: 'casual' },
        { key: 'auto_reply', label: 'Reponse auto', type: 'toggle', default: true },
      ]},
    ],
  },
  commercial: {
    title: 'Lancer la prospection commerciale',
    subtitle: 'Leo prospecte et gere ton pipeline CRM',
    icon: '\u{1F91D}',
    steps: [
      { title: 'Ciblage', fields: [
        { key: 'daily_prospect_target', label: 'Prospects/jour', type: 'number', default: 20 },
        { key: 'priority_types', label: 'Types prioritaires', type: 'select', options: [{ value: 'all', label: 'Tous' }, { value: 'restaurant', label: 'Restaurants' }, { value: 'boutique', label: 'Boutiques' }, { value: 'premium', label: 'Premium' }], default: 'all' },
        { key: 'prospect_sources', label: 'Sources', type: 'select', options: [{ value: 'all', label: 'Toutes' }, { value: 'google', label: 'Google' }, { value: 'maps', label: 'Google Maps' }], default: 'all' },
      ]},
    ],
  },
  gmaps: {
    title: 'Lancer la gestion des avis Google',
    subtitle: 'Theo repond a tous tes avis Google',
    icon: '\u2B50',
    steps: [
      { title: 'Configuration', fields: [
        { key: 'auto_reply_reviews', label: 'Reponse auto aux avis', type: 'toggle', default: true },
        { key: 'reply_tone', label: 'Ton des reponses', type: 'select', options: [{ value: 'warm', label: 'Chaleureux' }, { value: 'professional', label: 'Professionnel' }, { value: 'enthusiastic', label: 'Enthousiaste' }], default: 'warm' },
      ]},
    ],
  },
  seo: {
    title: 'Lancer l\'analyse SEO',
    subtitle: 'Oscar analyse ton site et suit tes positions Google',
    icon: '\u{1F50D}',
    steps: [
      { title: 'Configuration', fields: [
        { key: 'website_url', label: 'URL de ton site', type: 'select', options: [{ value: 'auto', label: 'Detection automatique' }], default: 'auto' },
        { key: 'seo_frequency', label: 'Frequence d\'analyse', type: 'select', options: [{ value: 'daily', label: 'Quotidien' }, { value: 'weekly', label: 'Hebdomadaire' }], default: 'weekly' },
      ]},
    ],
  },
  linkedin: {
    title: 'Lancer l\'engagement LinkedIn',
    subtitle: 'Emma publie et engage ton reseau pro',
    icon: '\u{1F4BC}',
    steps: [
      { title: 'Configuration', fields: [
        { key: 'posts_per_day_li', label: 'Posts/jour', type: 'number', default: 2 },
        { key: 'li_tone', label: 'Ton', type: 'select', options: [{ value: 'professional', label: 'Pro' }, { value: 'casual_pro', label: 'Pro decontracte' }, { value: 'expert', label: 'Expert' }], default: 'casual_pro' },
        { key: 'auto_engage', label: 'Engagement auto (likes, comments)', type: 'toggle', default: true },
      ]},
    ],
  },
};

// Default wizard for agents not listed above
const DEFAULT_WIZARD = {
  title: 'Activer l\'agent',
  subtitle: 'Configure et lance l\'automatisation',
  icon: '\u{1F916}',
  steps: [{ title: 'Mode', fields: [
    { key: 'auto_mode_level', label: 'Niveau d\'autonomie', type: 'select' as const, options: [{ value: 'auto', label: 'Automatique (agit seul)' }, { value: 'notify', label: 'Notification avant action' }, { value: 'manual', label: 'Manuel' }], default: 'auto' },
  ]}],
};

export default function CampaignWizard({ agentId, agentName, onClose, onActivated }: {
  agentId: string;
  agentName: string;
  onClose: () => void;
  onActivated: () => void;
}) {
  const wizard = AGENT_WIZARDS[agentId] || DEFAULT_WIZARD;
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Record<string, any>>(() => {
    const defaults: Record<string, any> = {};
    wizard.steps.forEach(s => s.fields.forEach(f => { defaults[f.key] = f.default; }));
    return defaults;
  });
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const totalSteps = wizard.steps.length;
  const currentStep = wizard.steps[step];
  const isLast = step >= totalSteps - 1;

  const handleActivate = useCallback(async () => {
    setSaving(true);
    try {
      await fetch('/api/agents/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ agent_id: agentId, auto_mode: true, setup_completed: true, ...values }),
      });
      setDone(true);
      setTimeout(() => { onActivated(); onClose(); }, 1500);
    } catch {
      setSaving(false);
    }
  }, [agentId, values, onActivated, onClose]);

  if (done) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="bg-gray-900 border border-emerald-500/30 rounded-2xl p-8 max-w-sm w-full text-center animate-in zoom-in-95 duration-300">
          <div className="text-5xl mb-4">{'\u{1F680}'}</div>
          <h2 className="text-xl font-bold text-white mb-2">{agentName} active !</h2>
          <p className="text-sm text-white/50">L&apos;agent commence a travailler pour toi immediatement.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-white/10 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-300">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600/20 to-blue-600/15 px-5 py-4 flex items-center gap-3">
          <span className="text-2xl">{wizard.icon}</span>
          <div className="flex-1">
            <h3 className="text-white font-bold text-sm">{wizard.title}</h3>
            <p className="text-white/40 text-[10px]">{wizard.subtitle}</p>
          </div>
          <button onClick={onClose} className="text-white/20 hover:text-white/50 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Progress */}
        {totalSteps > 1 && (
          <div className="px-5 pt-3 flex gap-1.5">
            {wizard.steps.map((_, i) => (
              <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= step ? 'bg-purple-500' : 'bg-white/10'}`} />
            ))}
          </div>
        )}

        {/* Step content */}
        <div className="px-5 py-4">
          <h4 className="text-white font-semibold text-xs mb-3">{currentStep.title}</h4>
          <div className="space-y-3">
            {currentStep.fields.map(field => (
              <div key={field.key} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {field.icon && <span className="text-sm">{field.icon}</span>}
                  <span className="text-xs text-white/70">{field.label}</span>
                </div>

                {field.type === 'toggle' && (
                  <button
                    onClick={() => setValues(prev => ({ ...prev, [field.key]: !prev[field.key] }))}
                    className={`w-10 h-5.5 rounded-full flex-shrink-0 transition-all relative ${values[field.key] ? 'bg-purple-600' : 'bg-white/15'}`}
                  >
                    <div className={`absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white shadow-sm transition-all ${values[field.key] ? 'left-[18px]' : 'left-0.5'}`} style={{ width: 18, height: 18 }} />
                  </button>
                )}

                {field.type === 'select' && (
                  <select
                    value={values[field.key] || field.default}
                    onChange={e => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                    className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-white/70 focus:outline-none focus:ring-1 focus:ring-purple-500/50 min-w-[130px]"
                  >
                    {field.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                )}

                {field.type === 'number' && (
                  <input
                    type="number"
                    value={values[field.key] ?? field.default}
                    onChange={e => setValues(prev => ({ ...prev, [field.key]: parseInt(e.target.value) || 0 }))}
                    className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-white/70 focus:outline-none focus:ring-1 focus:ring-purple-500/50 w-16 text-center"
                    min={0}
                  />
                )}

                {field.type === 'time' && (
                  <input
                    type="time"
                    value={values[field.key] || field.default}
                    onChange={e => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                    className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-white/70 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Navigation */}
        <div className="px-5 pb-4 flex items-center justify-between gap-3">
          {step > 0 ? (
            <button onClick={() => setStep(s => s - 1)} className="px-4 py-2 text-xs text-white/40 hover:text-white/70 transition min-h-[44px]">
              {'\u2190'} Retour
            </button>
          ) : <div />}

          {isLast ? (
            <button
              onClick={handleActivate}
              disabled={saving}
              className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-xs font-bold rounded-xl hover:shadow-lg transition min-h-[44px] disabled:opacity-50"
            >
              {saving ? 'Activation...' : `\u{26A1} Activer ${agentName}`}
            </button>
          ) : (
            <button
              onClick={() => setStep(s => s + 1)}
              className="px-6 py-2.5 bg-purple-600 text-white text-xs font-bold rounded-xl hover:bg-purple-500 transition min-h-[44px]"
            >
              Suivant {'\u2192'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
