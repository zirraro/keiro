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
    title: 'Creer un post maintenant',
    subtitle: 'Lena genere et publie en quelques secondes',
    icon: '\u2728',
    steps: [
      { title: 'Quel post veux-tu ?', fields: [
        { key: 'platform', label: 'Plateforme', type: 'select', options: [{ value: 'instagram', label: '\u{1F4F8} Instagram' }, { value: 'tiktok', label: '\u{1F3B5} TikTok' }, { value: 'linkedin', label: '\u{1F4BC} LinkedIn' }], default: 'instagram' },
        { key: 'format', label: 'Format', type: 'select', options: [{ value: 'post', label: 'Photo/Image' }, { value: 'reel', label: 'Reel/Video' }, { value: 'carousel', label: 'Carrousel' }, { value: 'story', label: 'Story' }], default: 'post' },
        { key: 'pillar', label: 'Theme', type: 'select', options: [{ value: 'tips', label: '\u{1F4A1} Conseil/Astuce' }, { value: 'demo', label: '\u{1F3AC} Demo/Resultat' }, { value: 'social_proof', label: '\u2B50 Temoignage/Preuve' }, { value: 'trends', label: '\u{1F525} Tendance du moment' }], default: 'tips' },
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
  const [statusMsg, setStatusMsg] = useState('');

  const totalSteps = wizard.steps.length;
  const currentStep = wizard.steps[step];
  const isLast = step >= totalSteps - 1;

  const handleActivate = useCallback(async () => {
    setSaving(true);
    try {
      // 1. Save settings + activate auto_mode
      setStatusMsg('Sauvegarde des parametres...');
      await fetch('/api/agents/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ agent_id: agentId, auto_mode: true, setup_completed: true, ...values }),
      });
      try { localStorage.setItem(`keiro_agent_settings_${agentId}`, JSON.stringify({ auto_mode: true, setup_completed: true, ...values })); } catch {}

      // 2. Trigger IMMEDIATE action — WAIT for response (don't fire-and-forget)
      const ACTION_MESSAGES: Record<string, string> = {
        content: 'Generation du post en cours...',
        email: 'Lancement des emails...',
        dm_instagram: 'Lancement de la prospection DM...',
        commercial: 'Recherche de prospects...',
        seo: 'Analyse SEO en cours...',
        gmaps: 'Scan des avis Google...',
        linkedin: 'Publication LinkedIn en cours...',
      };
      setStatusMsg(ACTION_MESSAGES[agentId] || 'Activation en cours...');

      // Use client-chat to trigger the action via the agent (natural, conversational)
      const ACTION_PROMPTS: Record<string, string> = {
        content: `Genere et publie immediatement 1 post ${values.platform || 'instagram'} format ${values.format || 'post'} sur le theme ${values.pillar || 'tips'}. Inclus le visuel, la legende et les hashtags.`,
        email: 'Lance une campagne email maintenant. Envoie les premiers emails aux prospects qualifies dans le CRM.',
        dm_instagram: 'Lance une session de prospection DM Instagram maintenant. Envoie des DMs personnalises aux prospects.',
        commercial: 'Lance une session de prospection commerciale. Trouve et qualifie de nouveaux prospects.',
        seo: 'Lance une analyse SEO complete de mon site web maintenant.',
        gmaps: 'Scanne et reponds a mes derniers avis Google.',
        linkedin: 'Genere et publie un post LinkedIn professionnel maintenant.',
      };

      // Trigger direct API calls for ALL agents (chat alone doesn't execute real actions)
      const directCalls: Record<string, () => Promise<any>> = {
        content: () => fetch('/api/agents/content', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ action: 'generate_post', platform: values.platform || 'instagram', format: values.format || 'post', pillar: values.pillar || 'tips', draftOnly: false }),
        }),
        email: () => fetch('/api/agents/email/daily?slot=morning&types=all', { credentials: 'include' }),
        dm_instagram: () => fetch('/api/agents/dm-instagram?slot=morning', { method: 'POST', credentials: 'include' }),
        commercial: () => fetch('/api/agents/gmaps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({}) }),
        seo: () => fetch('/api/agents/seo', { credentials: 'include' }),
        gmaps: () => fetch('/api/agents/google-reviews', { credentials: 'include' }),
        linkedin: () => fetch('/api/agents/content', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ action: 'generate_post', platform: 'linkedin', format: 'text', pillar: 'tips', draftOnly: false }) }),
      };
      if (directCalls[agentId]) {
        directCalls[agentId]().catch(() => {});
      }

      // Log campaign start in agent history
      fetch('/api/agents/client-chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ agent_id: agentId, message: `[SYSTEM] Campagne lancee: ${ACTION_MESSAGES[agentId] || 'Action en cours'}`, _system_log: true }),
      }).catch(() => {});

      // Notify ContentWorkflow that generation is in progress
      if (agentId === 'content' || agentId === 'linkedin') {
        try { (window as any).__contentGenerating?.(); } catch {}
      }

      const prompt = ACTION_PROMPTS[agentId];
      if (prompt) {
        const res = await fetch('/api/agents/client-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ agent_id: agentId, message: prompt }),
        });
        const data = await res.json();
        if (data.reply) {
          setStatusMsg('');
          setDone(true);
          // Campaign completed — logged via chat history automatically
          // Show agent response in chat
          try { (window as any).__campaignResult = data.reply; } catch {}
          setTimeout(() => { onActivated(); onClose(); }, 2500);
          return;
        }
      }

      setDone(true);
      setTimeout(() => { onActivated(); onClose(); }, 2000);
    } catch (e: any) {
      console.error('[CampaignWizard] Error:', e);
      setStatusMsg('Erreur — reessaye');
      setTimeout(() => setSaving(false), 2000);
    }
  }, [agentId, values, onActivated, onClose]);

  // Saving state — show spinner with status message
  if (saving && !done) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="bg-gray-900 border border-purple-500/30 rounded-2xl p-8 max-w-sm w-full text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-400 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-white mb-2">{agentName} travaille...</h2>
          <p className="text-sm text-white/50">{statusMsg || 'Preparation en cours...'}</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="bg-gray-900 border border-emerald-500/30 rounded-2xl p-8 max-w-sm w-full text-center animate-in zoom-in-95 duration-300">
          <div className="text-5xl mb-4">{'\u2705'}</div>
          <h2 className="text-lg font-bold text-white mb-2">Campagne lancee !</h2>
          <p className="text-sm text-white/50 mb-2">Les resultats apparaissent dans ton dashboard.</p>
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
                    value={values[field.key] ?? field.default}
                    onChange={e => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                    className="bg-[#1a2744] border border-white/10 rounded-lg px-2.5 py-2 text-[11px] text-white focus:outline-none focus:ring-1 focus:ring-purple-500/50 min-w-[150px]"
                  >
                    {field.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                )}

                {field.type === 'number' && (
                  <input
                    type="number"
                    value={values[field.key] ?? field.default}
                    onChange={e => setValues(prev => ({ ...prev, [field.key]: parseInt(e.target.value) || 0 }))}
                    className="bg-[#1a2744] border border-white/10 rounded-lg px-2.5 py-2 text-[11px] text-white focus:outline-none focus:ring-1 focus:ring-purple-500/50 w-16 text-center"
                    min={0}
                  />
                )}

                {field.type === 'time' && (
                  <input
                    type="time"
                    value={values[field.key] || field.default}
                    onChange={e => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                    className="bg-[#1a2744] border border-white/10 rounded-lg px-2.5 py-2 text-[11px] text-white focus:outline-none focus:ring-1 focus:ring-purple-500/50"
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
              {saving ? (agentId === 'content' ? 'Generation en cours...' : 'Activation...') : agentId === 'content' ? '\u{1F680} Generer maintenant' : `\u{26A1} Activer ${agentName}`}
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
