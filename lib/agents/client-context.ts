import { SupabaseClient } from '@supabase/supabase-js';

export interface BusinessDossier {
  company_name: string | null;
  company_description: string | null;
  business_type: string | null;
  target_audience: string | null;
  brand_tone: string | null;
  main_products: string | null;
  competitors: string | null;
  unique_selling_points: string | null;
  business_goals: string | null;
  instagram_handle: string | null;
  tiktok_handle: string | null;
  linkedin_url: string | null;
  website_url: string | null;
  google_maps_url: string | null;
  logo_url: string | null;
  uploaded_files: Array<{ name: string; url: string; type: string; uploaded_at: string }>;
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
  const fields = ['company_name', 'company_description', 'business_type', 'target_audience', 'brand_tone', 'main_products'];
  const bonusFields = ['competitors', 'unique_selling_points', 'instagram_handle', 'logo_url', 'website_url'];

  let score = 0;
  const allUpdates = { ...updates };
  for (const f of fields) {
    if ((allUpdates as Record<string, unknown>)[f]) score += 12; // 6 × 12 = 72
  }
  for (const f of bonusFields) {
    if ((allUpdates as Record<string, unknown>)[f]) score += 5.6; // 5 × 5.6 = 28
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

  const parts: string[] = [];

  if (dossier.company_name) parts.push(`Entreprise: ${dossier.company_name}`);
  if (dossier.business_type) parts.push(`Type: ${dossier.business_type}`);
  if (dossier.company_description) parts.push(`Description: ${dossier.company_description}`);
  if (dossier.main_products) parts.push(`Produits/Services: ${dossier.main_products}`);
  if (dossier.target_audience) parts.push(`Cible: ${dossier.target_audience}`);
  if (dossier.brand_tone) parts.push(`Ton de communication: ${dossier.brand_tone}`);
  if (dossier.unique_selling_points) parts.push(`Points forts: ${dossier.unique_selling_points}`);
  if (dossier.competitors) parts.push(`Concurrents: ${dossier.competitors}`);
  if (dossier.business_goals) parts.push(`Objectifs: ${dossier.business_goals}`);

  const socialParts: string[] = [];
  if (dossier.instagram_handle) socialParts.push(`Instagram: @${dossier.instagram_handle}`);
  if (dossier.tiktok_handle) socialParts.push(`TikTok: @${dossier.tiktok_handle}`);
  if (dossier.linkedin_url) socialParts.push(`LinkedIn: ${dossier.linkedin_url}`);
  if (dossier.website_url) socialParts.push(`Site web: ${dossier.website_url}`);
  if (dossier.google_maps_url) socialParts.push(`Google Maps: ${dossier.google_maps_url}`);
  if (socialParts.length) parts.push(`Presenc en ligne:\n${socialParts.join('\n')}`);

  if (dossier.ai_summary) parts.push(`Resume IA: ${dossier.ai_summary}`);

  return `=== DOSSIER CLIENT ===\n${parts.join('\n')}\nCompletude: ${dossier.completeness_score}%`;
}

// Define which agents are visible to clients and their status
export type AgentVisibility = 'active' | 'coming_soon' | 'background';

export interface ClientAgent {
  id: string;
  displayName: string;
  title: string;
  description: string;
  visibility: AgentVisibility;
  minPlan: string; // 'gratuit' | 'solo' | 'fondateurs' | 'business'
  gradientFrom: string;
  gradientTo: string;
  icon: string; // emoji
}

// ── Pack structure ──────────────────────────────────────────
// Pack Starter (gratuit): Ami only (chat) — ALL agents run in background
// Pack Pro (solo 49EUR): + agents réseaux sociaux (Content, SEO, GMaps, DM, TikTok, Chatbot)
// Pack Fondateurs (149EUR): ALL agents accessible (chat + actions)
// Background: ALL agents optimize KeiroAI invisibly for ALL plans

export const CLIENT_AGENTS: ClientAgent[] = [
  // ── PACK STARTER (gratuit) ─── Chat: Ami only ───
  {
    id: 'marketing',
    displayName: 'Ami',
    title: 'Coach Marketing',
    description: 'Strategie marketing, idees de contenu, analyse de performance et conseils personnalises',
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
    description: 'Configuration de votre compte, premiers pas, personnalisation de votre espace',
    visibility: 'coming_soon',
    minPlan: 'gratuit',
    gradientFrom: '#10b981',
    gradientTo: '#059669',
    icon: '\u{1F680}',
  },

  // ── PACK PRO (solo 49EUR) ─── Agents reseaux sociaux ───
  {
    id: 'content',
    displayName: 'Lena',
    title: 'Creatrice de Contenu',
    description: 'Calendrier editorial, legendes, scripts video, idees de posts, optimisation visuelle',
    visibility: 'coming_soon',
    minPlan: 'solo',
    gradientFrom: '#8b5cf6',
    gradientTo: '#6d28d9',
    icon: '\u2728',
  },
  {
    id: 'seo',
    displayName: 'Oscar',
    title: 'Expert SEO & Visibilite',
    description: 'Referencement Google, mots-cles, optimisation fiche Google, visibilite locale',
    visibility: 'coming_soon',
    minPlan: 'solo',
    gradientFrom: '#f59e0b',
    gradientTo: '#d97706',
    icon: '\u{1F50D}',
  },
  {
    id: 'gmaps',
    displayName: 'Theo',
    title: 'Expert Google Maps',
    description: 'Optimisation fiche Google, avis clients, visibilite locale, SEO geographique',
    visibility: 'coming_soon',
    minPlan: 'solo',
    gradientFrom: '#22c55e',
    gradientTo: '#16a34a',
    icon: '\u{1F4CD}',
  },
  {
    id: 'dm_instagram',
    displayName: 'Jade',
    title: 'Experte DM Instagram',
    description: 'Messages prives strategiques, engagement followers, conversion par DM',
    visibility: 'coming_soon',
    minPlan: 'solo',
    gradientFrom: '#e11d48',
    gradientTo: '#be123c',
    icon: '\u{1F4AC}',
  },
  {
    id: 'tiktok_comments',
    displayName: 'Axel',
    title: 'Expert TikTok Engagement',
    description: 'Commentaires strategiques, engagement communaute, conversion TikTok',
    visibility: 'coming_soon',
    minPlan: 'solo',
    gradientFrom: '#000000',
    gradientTo: '#1a1a2e',
    icon: '\u{1F3B5}',
  },
  {
    id: 'chatbot',
    displayName: 'Max',
    title: 'Chatbot Site Web',
    description: 'Accueil visiteurs, capture leads, reponses automatiques, qualification prospects',
    visibility: 'coming_soon',
    minPlan: 'solo',
    gradientFrom: '#7c3aed',
    gradientTo: '#5b21b6',
    icon: '\u{1F916}',
  },

  // ── PACK FONDATEURS (149EUR) ─── Tous les agents ───
  {
    id: 'commercial',
    displayName: 'Leo',
    title: 'Assistant Prospection',
    description: 'Recherche de clients, suivi commercial, relances automatiques, scoring prospects',
    visibility: 'coming_soon',
    minPlan: 'fondateurs',
    gradientFrom: '#3b82f6',
    gradientTo: '#2563eb',
    icon: '\u{1F91D}',
  },
  {
    id: 'email',
    displayName: 'Hugo',
    title: 'Expert Email Marketing',
    description: 'Campagnes email, sequences automatiques, newsletters, relances intelligentes',
    visibility: 'coming_soon',
    minPlan: 'fondateurs',
    gradientFrom: '#06b6d4',
    gradientTo: '#0891b2',
    icon: '\u{1F4E7}',
  },
  {
    id: 'ads',
    displayName: 'Felix',
    title: 'Expert Publicite',
    description: 'Campagnes Meta Ads, Google Ads, optimisation budgets pub, ROAS',
    visibility: 'coming_soon',
    minPlan: 'fondateurs',
    gradientFrom: '#ef4444',
    gradientTo: '#dc2626',
    icon: '\u{1F4E2}',
  },
  {
    id: 'comptable',
    displayName: 'Louis',
    title: 'Expert Finance',
    description: 'Suivi tresorerie, previsions, optimisation fiscale, metriques SaaS',
    visibility: 'coming_soon',
    minPlan: 'fondateurs',
    gradientFrom: '#0e7490',
    gradientTo: '#155e75',
    icon: '\u{1F4B0}',
  },
  {
    id: 'rh',
    displayName: 'Sara',
    title: 'Expert Juridique & RH',
    description: 'Droit du travail, RGPD, contrats, obligations sociales, recrutement',
    visibility: 'coming_soon',
    minPlan: 'fondateurs',
    gradientFrom: '#d946ef',
    gradientTo: '#a21caf',
    icon: '\u2696\uFE0F',
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
];

export function getVisibleAgents(plan: string): ClientAgent[] {
  const planOrder = ['gratuit', 'sprint', 'solo', 'solo_promo', 'fondateurs', 'standard', 'business', 'elite'];
  const userPlanIndex = planOrder.indexOf(plan || 'gratuit');

  return CLIENT_AGENTS
    .filter(a => a.visibility !== 'background')
    .map(a => {
      const requiredIndex = planOrder.indexOf(a.minPlan);
      const isAccessible = userPlanIndex >= requiredIndex;
      return {
        ...a,
        visibility: a.visibility === 'coming_soon' ? 'coming_soon' : (isAccessible ? 'active' : 'coming_soon'),
      } as ClientAgent;
    });
}
