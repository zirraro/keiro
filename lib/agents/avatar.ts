/**
 * Agent Avatar System — Ultra-personalized identities for each AI agent.
 *
 * Each agent has:
 * - A unique name, title, and avatar image
 * - Personality traits (tone, verbosity, emoji usage, humor, expertise, language style)
 * - Custom admin instructions injected into prompts
 * - 5-minute in-memory cache for performance
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getOrgAgentConfig } from '../tenant';

// ─── Types ─────────────────────────────────────────────────────

export interface AgentPersonality {
  tone: string;                     // e.g. "confiant, stratégique, visionnaire"
  verbosity: 'concis' | 'normal' | 'détaillé';
  emoji_usage: 'aucun' | 'subtil' | 'modéré' | 'expressif';
  humor_level: 'aucun' | 'léger' | 'modéré' | 'blagueur';
  expertise_focus: string[];        // e.g. ["stratégie", "growth"]
  language_style: string;           // e.g. "professionnel tutoiement"
  signature_catchphrase: string;    // e.g. "On scale. 🚀"
}

export type AvatarAnimation = 'idle' | 'wave' | 'thinking' | 'talking' | 'none';

export interface AgentAvatarConfig {
  id: string;
  display_name: string;
  title: string;
  avatar_url: string | null;
  avatar_3d_url: string | null;
  animation_type: AvatarAnimation;
  gradient_from: string;
  gradient_to: string;
  badge_color: string;
  personality: AgentPersonality;
  custom_instructions: string;
  is_active: boolean;
}

// ─── Default Fallbacks ─────────────────────────────────────────

const DEFAULT_PERSONALITY: AgentPersonality = {
  tone: 'professionnel',
  verbosity: 'concis',
  emoji_usage: 'subtil',
  humor_level: 'aucun',
  expertise_focus: [],
  language_style: 'professionnel tutoiement',
  signature_catchphrase: '',
};

const DEFAULT_AVATARS: Record<string, Pick<AgentAvatarConfig, 'display_name' | 'title' | 'gradient_from' | 'gradient_to' | 'badge_color'>> = {
  ceo: { display_name: 'Noah', title: 'Stratège en Chef', gradient_from: '#7c3aed', gradient_to: '#4338ca', badge_color: '#7c3aed' },
  commercial: { display_name: 'Léo', title: 'Lead Scraper & Pipeline', gradient_from: '#2563eb', gradient_to: '#0891b2', badge_color: '#2563eb' },
  email: { display_name: 'Hugo', title: 'Expert Prospection Email', gradient_from: '#059669', gradient_to: '#10b981', badge_color: '#059669' },
  content: { display_name: 'Léna', title: 'Créative Contenu & Publication', gradient_from: '#db2777', gradient_to: '#e11d48', badge_color: '#db2777' },
  seo: { display_name: 'Oscar', title: 'Architecte SEO & Référencement', gradient_from: '#d97706', gradient_to: '#ea580c', badge_color: '#d97706' },
  onboarding: { display_name: 'Clara', title: 'Spécialiste Activation', gradient_from: '#0891b2', gradient_to: '#2563eb', badge_color: '#0891b2' },
  retention: { display_name: 'Théo', title: 'Gardien Fidélisation', gradient_from: '#7c3aed', gradient_to: '#a855f7', badge_color: '#8b5cf6' },
  marketing: { display_name: 'Ami', title: 'Marketing Intelligence Coach', gradient_from: '#0d9488', gradient_to: '#059669', badge_color: '#0d9488' },
  ops: { display_name: 'Jade', title: 'Pilote Publication Auto', gradient_from: '#525252', gradient_to: '#404040', badge_color: '#525252' },
  ads: { display_name: 'Félix', title: 'Expert Publicité & Funnels', gradient_from: '#dc2626', gradient_to: '#ea580c', badge_color: '#dc2626' },
  rh: { display_name: 'Sara', title: 'Spécialiste RH & Juridique', gradient_from: '#475569', gradient_to: '#334155', badge_color: '#475569' },
};

// ─── Cache ─────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  data: AgentAvatarConfig;
  timestamp: number;
}

const avatarCache = new Map<string, CacheEntry>();

/**
 * Build cache key. When orgId is provided, key is `${orgId}:${agentId}`.
 * When not provided, key is just `agentId` (backwards compatible).
 */
function cacheKey(agentId: string, orgId?: string): string {
  return orgId ? `${orgId}:${agentId}` : agentId;
}

function getCached(agentId: string, orgId?: string): AgentAvatarConfig | null {
  const key = cacheKey(agentId, orgId);
  const entry = avatarCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    avatarCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(agentId: string, data: AgentAvatarConfig, orgId?: string) {
  avatarCache.set(cacheKey(agentId, orgId), { data, timestamp: Date.now() });
}

export function invalidateAvatarCache(agentId?: string, orgId?: string) {
  if (agentId) {
    // Delete org-scoped key when orgId is provided
    if (orgId) {
      avatarCache.delete(cacheKey(agentId, orgId));
    }
    // Always delete the base (non-org) key for backwards compat
    avatarCache.delete(agentId);
  } else {
    avatarCache.clear();
  }
}

// ─── Data Access ───────────────────────────────────────────────

/**
 * Get avatar config for a single agent. Returns default if not found in DB.
 *
 * @param orgId - Optional organization ID for multi-tenant overrides.
 *                When provided, checks `org_agent_configs` for org-specific overrides
 *                and merges them on top of the base config (org overrides win).
 */
export async function getAgentAvatar(
  supabase: SupabaseClient,
  agentId: string,
  orgId?: string,
): Promise<AgentAvatarConfig> {
  // Check cache first (cache key includes orgId when provided)
  const cached = getCached(agentId, orgId);
  if (cached) return cached;

  const { data, error } = await supabase
    .from('agent_avatars')
    .select('*')
    .eq('id', agentId)
    .single();

  let config: AgentAvatarConfig;

  if (error || !data) {
    // Return default fallback
    const defaults = DEFAULT_AVATARS[agentId] || { display_name: agentId, title: 'Agent IA', gradient_from: '#7c3aed', gradient_to: '#4f46e5', badge_color: '#7c3aed' };
    config = {
      id: agentId,
      ...defaults,
      avatar_url: null,
      avatar_3d_url: null,
      animation_type: 'idle',
      personality: { ...DEFAULT_PERSONALITY },
      custom_instructions: '',
      is_active: true,
    };
  } else {
    const defaults = DEFAULT_AVATARS[agentId] || { gradient_from: '#7c3aed', gradient_to: '#4f46e5', badge_color: '#7c3aed' };
    config = {
      id: data.id,
      display_name: data.display_name,
      title: data.title || '',
      avatar_url: data.avatar_url,
      avatar_3d_url: data.avatar_3d_url || null,
      animation_type: data.animation_type || 'idle',
      gradient_from: data.gradient_from || defaults.gradient_from,
      gradient_to: data.gradient_to || defaults.gradient_to,
      badge_color: data.badge_color || defaults.badge_color,
      personality: { ...DEFAULT_PERSONALITY, ...(data.personality || {}) },
      custom_instructions: data.custom_instructions || '',
      is_active: data.is_active,
    };
  }

  // Multi-tenant: apply org-specific overrides when orgId is provided
  if (orgId) {
    const orgConfig = await getOrgAgentConfig(supabase, orgId, agentId);
    if (orgConfig) {
      if (orgConfig.display_name) config.display_name = orgConfig.display_name;
      if (orgConfig.custom_instructions) config.custom_instructions = orgConfig.custom_instructions;
      if (orgConfig.avatar_url) config.avatar_url = orgConfig.avatar_url;
      if (orgConfig.avatar_3d_url) config.avatar_3d_url = orgConfig.avatar_3d_url;
      if (orgConfig.is_enabled === false) config.is_active = false;
      if (orgConfig.personality_overrides) {
        config.personality = { ...config.personality, ...orgConfig.personality_overrides } as AgentPersonality;
      }
    }
  }

  setCache(agentId, config, orgId);
  return config;
}

/**
 * Get all agent avatars (for admin dashboard).
 */
export async function getAllAgentAvatars(
  supabase: SupabaseClient
): Promise<AgentAvatarConfig[]> {
  const { data, error } = await supabase
    .from('agent_avatars')
    .select('*')
    .order('id');

  if (error || !data) return [];

  return data.map((row: any) => {
    const defaults = DEFAULT_AVATARS[row.id] || { gradient_from: '#7c3aed', gradient_to: '#4f46e5', badge_color: '#7c3aed' };
    return {
      id: row.id,
      display_name: row.display_name,
      title: row.title || '',
      avatar_url: row.avatar_url,
      avatar_3d_url: row.avatar_3d_url || null,
      animation_type: row.animation_type || 'idle',
      gradient_from: row.gradient_from || defaults.gradient_from,
      gradient_to: row.gradient_to || defaults.gradient_to,
      badge_color: row.badge_color || defaults.badge_color,
      personality: { ...DEFAULT_PERSONALITY, ...(row.personality || {}) },
      custom_instructions: row.custom_instructions || '',
      is_active: row.is_active,
    };
  });
}

/**
 * Update an agent's avatar config.
 */
export async function updateAgentAvatar(
  supabase: SupabaseClient,
  agentId: string,
  updates: Partial<Omit<AgentAvatarConfig, 'id'>>,
  orgId?: string,
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('agent_avatars')
    .upsert({
      id: agentId,
      ...updates,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

  if (error) {
    return { success: false, error: error.message };
  }

  invalidateAvatarCache(agentId, orgId);
  return { success: true };
}

// ─── Prompt Injection ──────────────────────────────────────────

/**
 * Format avatar personality as a prompt block to inject into agent system prompts.
 * This is the core of the personalization — it shapes HOW each agent communicates.
 */
export function formatAvatarForPrompt(avatar: AgentAvatarConfig): string {
  const p = avatar.personality;

  let prompt = `━━━ TON IDENTITÉ ━━━
Tu es ${avatar.display_name}, ${avatar.title} chez KeiroAI.`;

  // Personality traits
  prompt += `\n\nTon style de communication :
- Ton : ${p.tone}
- Niveau de détail : ${p.verbosity}
- Emojis : ${p.emoji_usage}
- Humour : ${p.humor_level}
- Style : ${p.language_style}`;

  if (p.expertise_focus.length > 0) {
    prompt += `\n- Tes domaines d'expertise : ${p.expertise_focus.join(', ')}`;
  }

  if (p.signature_catchphrase) {
    prompt += `\n- Ta signature : "${p.signature_catchphrase}"`;
  }

  // Custom admin instructions
  if (avatar.custom_instructions) {
    prompt += `\n\nINSTRUCTIONS SPÉCIALES DU FONDATEUR :\n${avatar.custom_instructions}`;
  }

  prompt += `\n\nIMPORTANT : Reste toujours fidèle à ta personnalité. Tu ES ${avatar.display_name}. Chaque message doit refléter ton caractère unique.`;

  return prompt;
}

/**
 * Get formatted avatar prompt block for injection. Convenience wrapper.
 *
 * @param orgId - Optional organization ID for multi-tenant overrides.
 */
export async function getAvatarPromptBlock(
  supabase: SupabaseClient,
  agentId: string,
  orgId?: string,
): Promise<string> {
  const avatar = await getAgentAvatar(supabase, agentId, orgId);
  return formatAvatarForPrompt(avatar);
}

/**
 * Get avatar info for chatbot display (name + avatar URL for the widget).
 */
export async function getChatbotAvatarInfo(
  supabase: SupabaseClient,
  orgId?: string,
): Promise<{ name: string; avatarUrl: string | null; avatar3dUrl: string | null; catchphrase: string }> {
  const avatar = await getAgentAvatar(supabase, 'commercial', orgId);
  return {
    name: avatar.display_name,
    avatarUrl: avatar.avatar_url,
    avatar3dUrl: avatar.avatar_3d_url,
    catchphrase: avatar.personality.signature_catchphrase,
  };
}

/**
 * Format avatar as email signature block for agent-sent emails.
 */
export function formatAvatarForEmailSignature(avatar: AgentAvatarConfig): string {
  return `${avatar.display_name}\n${avatar.title} — KeiroAI`;
}
