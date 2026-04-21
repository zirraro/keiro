import { SupabaseClient } from '@supabase/supabase-js';

export interface BusinessDossier {
  // Identite
  company_name: string | null;
  company_description: string | null;
  business_type: string | null;
  legal_status: string | null;
  founder_name: string | null;
  creation_year: number | null;
  employees_count: string | null;
  // Localisation
  city: string | null;
  region: string | null;
  country: string | null;
  address: string | null;
  catchment_area: string | null;
  // Offre
  main_products: string | null;
  price_range: string | null;
  unique_selling_points: string | null;
  competitors: string | null;
  // Cible
  target_audience: string | null;
  ideal_customer_profile: string | null;
  customer_pain_points: string | null;
  // Communication
  brand_tone: string | null;
  visual_style: string | null;
  brand_colors: string | null;
  content_themes: string | null;
  preferred_channels: string | null;
  posting_frequency: string | null;
  // Objectifs
  business_goals: string | null;
  marketing_goals: string | null;
  monthly_budget: string | null;
  kpi_targets: string | null;
  // Presence en ligne
  instagram_handle: string | null;
  tiktok_handle: string | null;
  linkedin_url: string | null;
  website_url: string | null;
  google_maps_url: string | null;
  facebook_url: string | null;
  // Assets
  logo_url: string | null;
  uploaded_files: Array<{ name: string; url: string; type: string; uploaded_at: string }>;
  // Custom fields (Clara adds these dynamically based on conversation)
  custom_fields: Record<string, string> | null;
  // Outbound-first language for the client's agents (fr / en / es / de / it / pt)
  // Drives TTS/video, cold emails, new posts, initial DMs. Replies still
  // mirror the prospect's language via languagePromptDirective.
  communication_language: string | null;
  // IA
  ai_summary: string | null;
  completeness_score: number;
}

export async function loadBusinessDossier(
  supabase: SupabaseClient,
  userId: string
): Promise<BusinessDossier | null> {
  const { data } = await supabase
    .from('business_dossiers')
    .select('*')
    .eq('user_id', userId)
    .single();
  return data;
}

const KNOWN_DOSSIER_FIELDS = new Set([
  'company_name', 'company_description', 'business_type', 'legal_status', 'founder_name',
  'creation_year', 'employees_count', 'city', 'region', 'country', 'address', 'catchment_area',
  'main_products', 'price_range', 'unique_selling_points', 'competitors', 'target_audience',
  'ideal_customer_profile', 'customer_pain_points', 'brand_tone', 'visual_style', 'brand_colors',
  'content_themes', 'preferred_channels', 'posting_frequency', 'business_goals', 'marketing_goals',
  'monthly_budget', 'kpi_targets', 'instagram_handle', 'tiktok_handle', 'linkedin_url',
  'website_url', 'google_maps_url', 'facebook_url', 'logo_url', 'uploaded_files', 'ai_summary',
  'value_proposition', 'business_model', 'market_segment', 'languages',
  'phone', 'email', 'horaires_ouverture', 'specialite',
  // communication_language (fr/en/...) drives outbound agent output.
  'communication_language',
]);

export async function upsertBusinessDossier(
  supabase: SupabaseClient,
  userId: string,
  updates: Record<string, any>
): Promise<void> {
  // Separate known fields from custom fields
  const knownUpdates: Record<string, any> = {};
  const customUpdates: Record<string, string> = {};

  for (const [key, value] of Object.entries(updates)) {
    if (key === 'completeness_score' || key === 'custom_fields' || key === 'updated_at' || key === 'user_id') continue;
    if (KNOWN_DOSSIER_FIELDS.has(key)) {
      knownUpdates[key] = value;
    } else if (value && String(value).trim().length > 0) {
      // Custom field from Clara (horaires, specialite, ambiance, etc.)
      customUpdates[key] = String(value);
    }
  }

  // Load existing custom_fields to merge
  if (Object.keys(customUpdates).length > 0) {
    const { data: existing } = await supabase
      .from('business_dossiers')
      .select('custom_fields')
      .eq('user_id', userId)
      .single();

    knownUpdates.custom_fields = {
      ...(existing?.custom_fields || {}),
      ...customUpdates,
    };
  }

  // Calculate completeness dynamically — count ALL filled fields
  // Load existing data to merge for accurate count
  const { data: existingFull } = await supabase
    .from('business_dossiers')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  const merged = { ...(existingFull || {}), ...knownUpdates };
  const IGNORE = new Set(['id', 'user_id', 'created_at', 'updated_at', 'completeness_score', 'uploaded_files']);
  let filledCount = 0;
  for (const [k, v] of Object.entries(merged)) {
    if (IGNORE.has(k)) continue;
    if (k === 'custom_fields') {
      filledCount += Object.keys(v || {}).filter((ck: string) => (v as any)[ck] && String((v as any)[ck]).trim().length > 0).length;
    } else if (v && String(v).trim().length > 0) {
      filledCount++;
    }
  }
  const score = Math.min(100, Math.round((filledCount / 25) * 100));

  await supabase.from('business_dossiers').upsert({
    user_id: userId,
    ...knownUpdates,
    completeness_score: score,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
}

export function formatDossierForPrompt(dossier: BusinessDossier | null): string {
  if (!dossier) return '[Aucun dossier client disponible]';

  const sections: string[] = [];

  // Identite
  const identity: string[] = [];
  if (dossier.company_name) identity.push(`Nom: ${dossier.company_name}`);
  if (dossier.business_type) identity.push(`Type: ${dossier.business_type}`);
  if (dossier.company_description) identity.push(`Description: ${dossier.company_description}`);
  if (dossier.legal_status) identity.push(`Statut: ${dossier.legal_status}`);
  if (dossier.founder_name) identity.push(`Fondateur: ${dossier.founder_name}`);
  if (dossier.creation_year) identity.push(`Cree en: ${dossier.creation_year}`);
  if (dossier.employees_count) identity.push(`Equipe: ${dossier.employees_count}`);
  if (identity.length) sections.push(`IDENTITE:\n${identity.join('\n')}`);

  // Localisation
  const location: string[] = [];
  if (dossier.city) location.push(`Ville: ${dossier.city}`);
  if (dossier.region) location.push(`Region: ${dossier.region}`);
  if (dossier.address) location.push(`Adresse: ${dossier.address}`);
  if (dossier.catchment_area) location.push(`Zone de chalandise: ${dossier.catchment_area}`);
  if (location.length) sections.push(`LOCALISATION:\n${location.join('\n')}`);

  // Offre
  const offer: string[] = [];
  if (dossier.main_products) offer.push(`Produits/Services: ${dossier.main_products}`);
  if (dossier.price_range) offer.push(`Gamme de prix: ${dossier.price_range}`);
  if (dossier.unique_selling_points) offer.push(`Points forts: ${dossier.unique_selling_points}`);
  if (dossier.competitors) offer.push(`Concurrents: ${dossier.competitors}`);
  if (offer.length) sections.push(`OFFRE:\n${offer.join('\n')}`);

  // Cible
  const target: string[] = [];
  if (dossier.target_audience) target.push(`Audience: ${dossier.target_audience}`);
  if (dossier.ideal_customer_profile) target.push(`Client ideal: ${dossier.ideal_customer_profile}`);
  if (dossier.customer_pain_points) target.push(`Problemes clients: ${dossier.customer_pain_points}`);
  if (target.length) sections.push(`CIBLE:\n${target.join('\n')}`);

  // Communication
  const comm: string[] = [];
  if (dossier.brand_tone) comm.push(`Ton: ${dossier.brand_tone}`);
  if (dossier.visual_style) comm.push(`Style visuel: ${dossier.visual_style}`);
  if (dossier.brand_colors) comm.push(`Couleurs: ${dossier.brand_colors}`);
  if (dossier.content_themes) comm.push(`Themes contenu: ${dossier.content_themes}`);
  if (dossier.preferred_channels) comm.push(`Canaux: ${dossier.preferred_channels}`);
  if (dossier.posting_frequency) comm.push(`Frequence: ${dossier.posting_frequency}`);
  if (comm.length) sections.push(`COMMUNICATION:\n${comm.join('\n')}`);

  // Objectifs
  const goals: string[] = [];
  if (dossier.business_goals) goals.push(`Business: ${dossier.business_goals}`);
  if (dossier.marketing_goals) goals.push(`Marketing: ${dossier.marketing_goals}`);
  if (dossier.monthly_budget) goals.push(`Budget: ${dossier.monthly_budget}`);
  if (dossier.kpi_targets) goals.push(`KPIs: ${dossier.kpi_targets}`);
  if (goals.length) sections.push(`OBJECTIFS:\n${goals.join('\n')}`);

  // Presence en ligne
  const social: string[] = [];
  if (dossier.instagram_handle) social.push(`Instagram: @${dossier.instagram_handle}`);
  if (dossier.tiktok_handle) social.push(`TikTok: @${dossier.tiktok_handle}`);
  if (dossier.facebook_url) social.push(`Facebook: ${dossier.facebook_url}`);
  if (dossier.linkedin_url) social.push(`LinkedIn: ${dossier.linkedin_url}`);
  if (dossier.website_url) social.push(`Site web: ${dossier.website_url}`);
  if (dossier.google_maps_url) social.push(`Google Maps: ${dossier.google_maps_url}`);
  if (social.length) sections.push(`PRESENCE EN LIGNE:\n${social.join('\n')}`);

  // Custom fields (added by Clara during conversation)
  if (dossier.custom_fields && typeof dossier.custom_fields === 'object') {
    const customParts = Object.entries(dossier.custom_fields)
      .filter(([, v]) => v && String(v).trim().length > 0)
      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`);
    if (customParts.length) sections.push(`INFOS COMPLEMENTAIRES:\n${customParts.join('\n')}`);
  }

  if (dossier.ai_summary) sections.push(`RESUME IA: ${dossier.ai_summary}`);

  // Prominent targeting directive — LLMs tend to treat the dossier as
  // background info and drift toward generic advice. Putting the business
  // type + city + tone at the TOP as an explicit "tailor every response to
  // this exact business" instruction makes recommendations land much more
  // specifically, especially for niche business types.
  const targetingParts: string[] = [];
  if (dossier.business_type) targetingParts.push(`TYPE: ${dossier.business_type}`);
  if (dossier.city) targetingParts.push(`VILLE: ${dossier.city}`);
  if (dossier.brand_tone) targetingParts.push(`TON: ${dossier.brand_tone}`);
  if (dossier.target_audience) targetingParts.push(`CIBLE: ${dossier.target_audience}`);
  const targeting = targetingParts.length
    ? `=== CIBLAGE OBLIGATOIRE ===\nChaque conseil, exemple, post, email ou recommandation que tu donnes DOIT etre adapte specifiquement a ce business. Ne donne jamais de conseil generique qui pourrait s'appliquer a n'importe quel commerce.\n${targetingParts.join('\n')}\n\n`
    : '';

  return `${targeting}=== DOSSIER CLIENT (${dossier.completeness_score}% complet) ===\n${sections.join('\n\n')}`;
}

// Define which agents are visible to clients and their status
export type AgentVisibility = 'active' | 'coming_soon' | 'background' | 'admin_only';

export interface ClientAgent {
  id: string;
  displayName: string;
  title: string;
  description: string;
  visibility: AgentVisibility;
  minPlan: string; // 'gratuit' | 'createur' | 'pro' | 'fondateurs' | 'business' | 'elite' | 'agence'
  gradientFrom: string;
  gradientTo: string;
  icon: string; // emoji
  integrations?: string[]; // what the agent connects to
}

// ── Pack structure (new pricing mars 2026) ─────────────────
// Créateur (49EUR): LÉNA, JADE, AMI (basique), CLARA, Vidéos IA, Trend surfing
// Pro (99EUR): Tout Créateur + HUGO, FÉLIX, Branding mémorisé, LEO, AXEL
// Business (199EUR) / Fondateurs (149EUR = Business complet): Tout Pro + OSCAR, SARA, CRM, Multi-comptes 1+5, THEO, MAX, LOUIS
// Agence (sur devis): Tout Business + Illimité + Marque blanche
// Background: ALL agents optimize KeiroAI invisibly for ALL plans

export const CLIENT_AGENTS: ClientAgent[] = [
  // ── GRATUIT ─── Ami + Clara (stratégie + setup) ───
  {
    id: 'marketing',
    displayName: 'Ami',
    title: 'Directrice Stratégie Marketing',
    description: 'Analyse vos performances, recommande des stratégies, optimise vos campagnes et coordonne les agents opérationnels',
    visibility: 'coming_soon',
    minPlan: 'gratuit',
    gradientFrom: '#ec4899',
    gradientTo: '#f43f5e',
    icon: '\u{1F3AF}',
    integrations: ['Instagram Insights', 'TikTok Analytics'],
  },
  {
    id: 'onboarding',
    displayName: 'Clara',
    title: 'Guide de Demarrage',
    description: 'Configure automatiquement votre espace, guide vos premiers pas, active vos agents',
    visibility: 'coming_soon',
    minPlan: 'gratuit',
    gradientFrom: '#10b981',
    gradientTo: '#059669',
    icon: '\u{1F680}',
  },

  // ── CRÉATEUR (49EUR) ─── Contenu auto + DMs ───
  {
    id: 'content',
    displayName: 'Lena',
    title: 'Publication & Contenu',
    description: 'Publie automatiquement sur vos reseaux, genere vos posts, legendes, scripts video et calendrier editorial',
    visibility: 'coming_soon',
    minPlan: 'createur',
    gradientFrom: '#8b5cf6',
    gradientTo: '#6d28d9',
    icon: '\u2728',
    integrations: ['Instagram', 'TikTok', 'LinkedIn'],
  },
  {
    id: 'dm_instagram',
    displayName: 'Jade',
    title: 'DM & Commentaires Instagram',
    description: 'Envoie automatiquement des DMs strategiques, engage vos followers, convertit par message prive',
    visibility: 'coming_soon',
    minPlan: 'createur',
    gradientFrom: '#e11d48',
    gradientTo: '#be123c',
    icon: '\u{1F4AC}',
    integrations: ['Instagram DM'],
  },

  // ── CRÉATEUR (49EUR) ─── + Hugo, Léo (prospection + emails) ───
  {
    id: 'email',
    displayName: 'Hugo',
    title: 'Expert Email Marketing',
    description: 'Lance automatiquement vos séquences email, relance les prospects, envoie des newsletters personnalisées',
    visibility: 'coming_soon',
    minPlan: 'createur',
    gradientFrom: '#06b6d4',
    gradientTo: '#0891b2',
    icon: '\u{1F4E7}',
    integrations: ['Votre boite email (Brevo)', 'CRM KeiroAI'],
  },
  {
    id: 'ads',
    displayName: 'Felix',
    title: 'Expert Publicite',
    description: 'Cree et optimise automatiquement vos campagnes Meta Ads et Google Ads, maximise votre ROAS',
    visibility: 'coming_soon',
    minPlan: 'business',
    gradientFrom: '#ef4444',
    gradientTo: '#dc2626',
    icon: '\u{1F4E2}',
    integrations: ['Meta Ads (Facebook/Instagram)', 'Google Ads'],
  },
  {
    id: 'commercial',
    displayName: 'Leo',
    title: 'Assistant Prospection',
    description: 'Prospecte automatiquement, qualifie les leads, relance les prospects et gère votre pipeline CRM',
    visibility: 'coming_soon',
    minPlan: 'createur',
    gradientFrom: '#3b82f6',
    gradientTo: '#2563eb',
    icon: '\u{1F91D}',
    integrations: ['Google Maps', 'CRM KeiroAI', 'LinkedIn'],
  },
  {
    id: 'tiktok_comments',
    displayName: 'Axel',
    title: 'Expert TikTok Engagement',
    description: 'Commente automatiquement sur TikTok, engage votre communaute, genere du trafic vers votre profil',
    visibility: 'coming_soon',
    minPlan: 'business',
    gradientFrom: '#000000',
    gradientTo: '#1a1a2e',
    icon: '\u{1F3B5}',
    integrations: ['TikTok'],
  },

  {
    id: 'linkedin',
    displayName: 'Emma',
    title: 'Experte LinkedIn & Reseau Pro',
    description: 'Publie du contenu optimise sur LinkedIn, commente et engage votre reseau professionnel, genere des leads B2B',
    visibility: 'coming_soon',
    minPlan: 'business',
    gradientFrom: '#0A66C2',
    gradientTo: '#004182',
    icon: '\u{1F4BC}',
    integrations: ['LinkedIn'],
  },

  // ── BUSINESS (199EUR) / FONDATEURS (149EUR) ─── + OSCAR, SARA, THEO, MAX, LOUIS ───
  {
    id: 'seo',
    displayName: 'Oscar',
    title: 'Expert SEO & Visibilité',
    description: 'Optimise automatiquement votre SEO, rédige des articles blog, améliore votre visibilité Google',
    visibility: 'coming_soon',
    minPlan: 'pro',
    gradientFrom: '#f59e0b',
    gradientTo: '#d97706',
    icon: '\u{1F50D}',
    integrations: ['Votre site web / blog', 'Google Search Console'],
  },
  {
    id: 'rh',
    displayName: 'Sara',
    title: 'Expert Juridique & RH',
    description: 'Génère automatiquement vos contrats, vérifie la conformité RGPD, alerte sur les obligations légales',
    visibility: 'coming_soon',
    minPlan: 'pro',
    gradientFrom: '#d946ef',
    gradientTo: '#a21caf',
    icon: '\u2696\uFE0F',
  },
  {
    id: 'gmaps',
    displayName: 'Theo',
    title: 'Réputation & Avis Clients',
    description: 'Répond aux avis Google automatiquement, améliore ta note, fait apparaître ton commerce en premier quand les gens cherchent près de chez toi',
    visibility: 'coming_soon',
    minPlan: 'createur',
    gradientFrom: '#22c55e',
    gradientTo: '#16a34a',
    icon: '\u{1F4CD}',
    integrations: ['Google Business Profile', 'Google Maps'],
  },
  {
    id: 'chatbot',
    displayName: 'Max',
    title: 'Chatbot Site Web',
    description: 'Accueille automatiquement les visiteurs de votre site, capture les leads, qualifie les prospects 24/7',
    visibility: 'coming_soon',
    minPlan: 'pro',
    gradientFrom: '#7c3aed',
    gradientTo: '#5b21b6',
    icon: '\u{1F916}',
    integrations: ['Votre site internet (widget)', 'CRM KeiroAI'],
  },
  {
    id: 'whatsapp',
    displayName: 'Stella',
    title: 'Experte WhatsApp Business',
    description: 'Envoie et repond aux messages WhatsApp, relance les prospects chauds, convertit par conversation privee',
    visibility: 'coming_soon',
    minPlan: 'business',
    gradientFrom: '#25D366',
    gradientTo: '#128C7E',
    icon: '\u{1F4F2}',
    integrations: ['WhatsApp Business'],
  },
  {
    id: 'comptable',
    displayName: 'Louis',
    title: 'Expert Finance',
    description: 'Suit automatiquement votre tresorerie, genere des previsions, alerte sur les anomalies financieres',
    visibility: 'coming_soon',
    minPlan: 'business',
    gradientFrom: '#0e7490',
    gradientTo: '#155e75',
    icon: '\u{1F4B0}',
    integrations: ['Stripe', 'Facturation KeiroAI'],
  },

  // ── BACKGROUND AGENTS ─── Optimisent KeiroAI pour TOUS les plans ───
  {
    id: 'retention',
    displayName: 'Theo',
    title: 'Agent Retention',
    description: "Detecte l'inactivite et relance les utilisateurs, optimise l'experience",
    visibility: 'background',
    minPlan: 'gratuit',
    gradientFrom: '#6366f1',
    gradientTo: '#4f46e5',
    icon: '\u{1F504}',
  },
  {
    id: 'ceo',
    displayName: 'Noah',
    title: 'Orchestrateur IA',
    description: 'Coordonne les agents, optimise les strategies globales, analyse cross-donnees',
    visibility: 'background',
    minPlan: 'gratuit',
    gradientFrom: '#0c1a3a',
    gradientTo: '#1e3a5f',
    icon: '\u{1F9E0}',
  },
  {
    id: 'qa',
    displayName: 'QA Agent',
    title: 'Testeur Qualite',
    description: 'Teste toutes les fonctionnalites KeiroAI comme un vrai client — generation, publication, agents, checkout',
    visibility: 'admin_only',
    minPlan: 'gratuit',
    gradientFrom: '#059669',
    gradientTo: '#10b981',
    icon: '\u{1F9EA}',
  },
];

// Agents not yet functional — show "à venir" regardless of plan
export const FORCED_COMING_SOON_AGENTS = new Set(['tiktok_comments', 'linkedin', 'whatsapp', 'ads']);

export function getVisibleAgents(plan: string, isAdmin = false): (ClientAgent & { notReleased?: boolean })[] {
  const planOrder = ['gratuit', 'free', 'sprint', 'solo', 'solo_promo', 'createur', 'pro', 'pro_promo', 'fondateurs', 'standard', 'business', 'elite', 'agence'];
  const userPlanIndex = planOrder.indexOf(plan || 'gratuit');

  return CLIENT_AGENTS
    .filter(a => a.visibility !== 'background' && (a.visibility !== 'admin_only' || isAdmin))
    .map(a => {
      const requiredIndex = planOrder.indexOf(a.minPlan);
      const isAccessible = isAdmin || userPlanIndex >= requiredIndex;
      const isNotReleased = FORCED_COMING_SOON_AGENTS.has(a.id) && !isAdmin;

      return {
        ...a,
        visibility: isAdmin ? 'active' : isNotReleased ? 'coming_soon' : (isAccessible ? 'active' : 'coming_soon'),
        notReleased: isNotReleased,
      };
    });
}
