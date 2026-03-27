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

export async function upsertBusinessDossier(
  supabase: SupabaseClient,
  userId: string,
  updates: Partial<BusinessDossier>
): Promise<void> {
  // Calculate completeness
  const coreFields = ['company_name', 'company_description', 'business_type', 'target_audience', 'brand_tone', 'main_products', 'city', 'unique_selling_points'];
  const importantFields = ['founder_name', 'ideal_customer_profile', 'business_goals', 'marketing_goals', 'visual_style', 'content_themes', 'preferred_channels'];
  const bonusFields = ['competitors', 'instagram_handle', 'logo_url', 'website_url', 'price_range', 'customer_pain_points', 'catchment_area', 'posting_frequency', 'brand_colors'];

  let score = 0;
  const allUpdates = { ...updates };
  for (const f of coreFields) {
    if ((allUpdates as Record<string, unknown>)[f]) score += 8; // 8 × 8 = 64
  }
  for (const f of importantFields) {
    if ((allUpdates as Record<string, unknown>)[f]) score += 3; // 7 × 3 = 21
  }
  for (const f of bonusFields) {
    if ((allUpdates as Record<string, unknown>)[f]) score += 1.67; // 9 × 1.67 = 15
  }

  await supabase.from('business_dossiers').upsert({
    user_id: userId,
    ...updates,
    completeness_score: Math.min(100, Math.round(score)),
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

  if (dossier.ai_summary) sections.push(`RESUME IA: ${dossier.ai_summary}`);

  return `=== DOSSIER CLIENT (${dossier.completeness_score}% complet) ===\n${sections.join('\n\n')}`;
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
}

// ── Pack structure (new pricing mars 2026) ─────────────────
// Créateur (49EUR): LÉNA, JADE, AMI (basique), CLARA, Vidéos IA, Trend surfing
// Pro (99EUR): Tout Créateur + HUGO, FÉLIX, Branding mémorisé, LEO, AXEL
// Business (199EUR) / Fondateurs (149EUR = Business complet): Tout Pro + OSCAR, SARA, CRM, Multi-comptes 1+5, THEO, MAX, LOUIS
// Agence (sur devis): Tout Business + Illimité + Marque blanche
// Background: ALL agents optimize KeiroAI invisibly for ALL plans

export const CLIENT_AGENTS: ClientAgent[] = [
  // ── GRATUIT ─── Ami (basique) + Clara ───
  {
    id: 'marketing',
    displayName: 'Ami',
    title: 'Directrice Strategie Marketing',
    description: 'Analyse vos performances, recommande des strategies, optimise vos campagnes et coordonne les agents operationnels',
    visibility: 'coming_soon', // coming_soon until launch
    minPlan: 'gratuit',
    gradientFrom: '#ec4899',
    gradientTo: '#f43f5e',
    icon: '\u{1F3AF}',
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

  // ── CRÉATEUR (49EUR) ─── LÉNA + JADE ───
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
  },
  {
    id: 'dm_instagram',
    displayName: 'Jade',
    title: 'Experte DM Instagram',
    description: 'Envoie automatiquement des DMs strategiques, engage vos followers, convertit par message prive',
    visibility: 'coming_soon',
    minPlan: 'createur',
    gradientFrom: '#e11d48',
    gradientTo: '#be123c',
    icon: '\u{1F4AC}',
  },

  // ── PRO (99EUR) ─── + HUGO, FÉLIX, LEO, AXEL ───
  {
    id: 'email',
    displayName: 'Hugo',
    title: 'Expert Email Marketing',
    description: 'Lance automatiquement vos sequences email, relance les prospects, envoie des newsletters personnalisees',
    visibility: 'coming_soon',
    minPlan: 'pro',
    gradientFrom: '#06b6d4',
    gradientTo: '#0891b2',
    icon: '\u{1F4E7}',
  },
  {
    id: 'ads',
    displayName: 'Felix',
    title: 'Expert Publicite',
    description: 'Cree et optimise automatiquement vos campagnes Meta Ads et Google Ads, maximise votre ROAS',
    visibility: 'coming_soon',
    minPlan: 'pro',
    gradientFrom: '#ef4444',
    gradientTo: '#dc2626',
    icon: '\u{1F4E2}',
  },
  {
    id: 'commercial',
    displayName: 'Leo',
    title: 'Assistant Prospection',
    description: 'Prospecte automatiquement, qualifie les leads, relance les prospects et gere votre pipeline CRM',
    visibility: 'coming_soon',
    minPlan: 'pro',
    gradientFrom: '#3b82f6',
    gradientTo: '#2563eb',
    icon: '\u{1F91D}',
  },
  {
    id: 'tiktok_comments',
    displayName: 'Axel',
    title: 'Expert TikTok Engagement',
    description: 'Commente automatiquement sur TikTok, engage votre communaute, genere du trafic vers votre profil',
    visibility: 'coming_soon',
    minPlan: 'pro',
    gradientFrom: '#000000',
    gradientTo: '#1a1a2e',
    icon: '\u{1F3B5}',
  },

  // ── BUSINESS (199EUR) / FONDATEURS (149EUR) ─── + OSCAR, SARA, THEO, MAX, LOUIS ───
  {
    id: 'seo',
    displayName: 'Oscar',
    title: 'Expert SEO & Visibilite',
    description: 'Optimise automatiquement votre SEO, redige des articles blog, ameliore votre visibilite Google',
    visibility: 'coming_soon',
    minPlan: 'business',
    gradientFrom: '#f59e0b',
    gradientTo: '#d97706',
    icon: '\u{1F50D}',
  },
  {
    id: 'rh',
    displayName: 'Sara',
    title: 'Expert Juridique & RH',
    description: 'Genere automatiquement vos contrats, verifie la conformite RGPD, alerte sur les obligations legales',
    visibility: 'coming_soon',
    minPlan: 'business',
    gradientFrom: '#d946ef',
    gradientTo: '#a21caf',
    icon: '\u2696\uFE0F',
  },
  {
    id: 'gmaps',
    displayName: 'Theo',
    title: 'Reputation & Avis Clients',
    description: 'Genere des avis Google 5 etoiles, repond aux avis automatiquement, fait apparaitre ton commerce en premier quand les gens cherchent pres de chez toi',
    visibility: 'coming_soon',
    minPlan: 'business',
    gradientFrom: '#22c55e',
    gradientTo: '#16a34a',
    icon: '\u{1F4CD}',
  },
  {
    id: 'chatbot',
    displayName: 'Max',
    title: 'Chatbot Site Web',
    description: 'Accueille automatiquement les visiteurs de votre site, capture les leads, qualifie les prospects 24/7',
    visibility: 'coming_soon',
    minPlan: 'business',
    gradientFrom: '#7c3aed',
    gradientTo: '#5b21b6',
    icon: '\u{1F916}',
  },
  {
    id: 'whatsapp',
    displayName: 'Stella',
    title: 'Experte WhatsApp Business',
    description: 'Envoie et repond aux messages WhatsApp, relance les prospects chauds, convertit par conversation privee, gere les campagnes WhatsApp automatiquement',
    visibility: 'coming_soon',
    minPlan: 'business',
    gradientFrom: '#25D366',
    gradientTo: '#128C7E',
    icon: '\u{1F4F2}',
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

export function getVisibleAgents(plan: string, isAdmin = false): ClientAgent[] {
  const planOrder = ['gratuit', 'free', 'sprint', 'solo', 'solo_promo', 'createur', 'pro', 'pro_promo', 'fondateurs', 'standard', 'business', 'elite', 'agence'];
  const userPlanIndex = planOrder.indexOf(plan || 'gratuit');

  return CLIENT_AGENTS
    .filter(a => a.visibility !== 'background' && (a.visibility !== 'admin_only' || isAdmin))
    .map(a => {
      const requiredIndex = planOrder.indexOf(a.minPlan);
      const isAccessible = isAdmin || userPlanIndex >= requiredIndex;
      return {
        ...a,
        // Admin or users with sufficient plan see agents as active
        // coming_soon agents become active if user's plan meets minPlan requirement
        visibility: isAdmin ? 'active' : (isAccessible ? 'active' : 'coming_soon'),
      } as ClientAgent;
    });
}
