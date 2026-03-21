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

export interface AgentAvatarConfig {
  id: string;
  display_name: string;
  title: string;
  avatar_url: string | null;
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

const DEFAULT_AVATARS: Record<string, Pick<AgentAvatarConfig, 'display_name' | 'title'>> = {
  ceo: { display_name: 'Noah', title: 'Stratège en Chef' },
  commercial: { display_name: 'Léo', title: 'Lead Scraper & Pipeline' },
  email: { display_name: 'Hugo', title: 'Expert Prospection Email' },
  content: { display_name: 'Léna', title: 'Créative Contenu, Trend & Publication' },
  seo: { display_name: 'Oscar', title: 'Architecte SEO & Référencement' },
  onboarding: { display_name: 'Clara', title: 'Spécialiste Activation & Premier Contact' },
  retention: { display_name: 'Théo', title: 'Gardien Fidélisation & Relation Client' },
  marketing: { display_name: 'Ami', title: 'Marketing Intelligence Coach' },
  ops: { display_name: 'Jade', title: 'Pilote Publication Auto' },
  ads: { display_name: 'Félix', title: 'Expert Publicité & Funnels' },
  rh: { display_name: 'Sara', title: 'Spécialiste RH & Juridique' },
};

// ─── Cache ─────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  data: AgentAvatarConfig;
  timestamp: number;
}

const avatarCache = new Map<string, CacheEntry>();

function getCached(agentId: string): AgentAvatarConfig | null {
  const entry = avatarCache.get(agentId);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    avatarCache.delete(agentId);
    return null;
  }
  return entry.data;
}

function setCache(agentId: string, data: AgentAvatarConfig) {
  avatarCache.set(agentId, { data, timestamp: Date.now() });
}

export function invalidateAvatarCache(agentId?: string) {
  if (agentId) {
    avatarCache.delete(agentId);
  } else {
    avatarCache.clear();
  }
}

// ─── Data Access ───────────────────────────────────────────────

/**
 * Get avatar config for a single agent. Returns default if not found in DB.
 */
export async function getAgentAvatar(
  supabase: SupabaseClient,
  agentId: string
): Promise<AgentAvatarConfig> {
  // Check cache first
  const cached = getCached(agentId);
  if (cached) return cached;

  const { data, error } = await supabase
    .from('agent_avatars')
    .select('*')
    .eq('id', agentId)
    .single();

  if (error || !data) {
    // Return default fallback
    const defaults = DEFAULT_AVATARS[agentId] || { display_name: agentId, title: 'Agent IA' };
    const fallback: AgentAvatarConfig = {
      id: agentId,
      ...defaults,
      avatar_url: null,
      personality: { ...DEFAULT_PERSONALITY },
      custom_instructions: '',
      is_active: true,
    };
    return fallback;
  }

  const config: AgentAvatarConfig = {
    id: data.id,
    display_name: data.display_name,
    title: data.title || '',
    avatar_url: data.avatar_url,
    personality: { ...DEFAULT_PERSONALITY, ...(data.personality || {}) },
    custom_instructions: data.custom_instructions || '',
    is_active: data.is_active,
  };

  setCache(agentId, config);
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

  return data.map((row: any) => ({
    id: row.id,
    display_name: row.display_name,
    title: row.title || '',
    avatar_url: row.avatar_url,
    personality: { ...DEFAULT_PERSONALITY, ...(row.personality || {}) },
    custom_instructions: row.custom_instructions || '',
    is_active: row.is_active,
  }));
}

/**
 * Update an agent's avatar config.
 */
export async function updateAgentAvatar(
  supabase: SupabaseClient,
  agentId: string,
  updates: Partial<Omit<AgentAvatarConfig, 'id'>>
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

  invalidateAvatarCache(agentId);
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
 */
export async function getAvatarPromptBlock(
  supabase: SupabaseClient,
  agentId: string
): Promise<string> {
  const avatar = await getAgentAvatar(supabase, agentId);
  return formatAvatarForPrompt(avatar);
}

/**
 * Get avatar info for chatbot display (name + avatar URL for the widget).
 */
export async function getChatbotAvatarInfo(
  supabase: SupabaseClient
): Promise<{ name: string; avatarUrl: string | null; catchphrase: string }> {
  // The chatbot uses a composite personality — friendly & commercial
  // Default to "Chloé" (content) personality for the public chatbot
  const avatar = await getAgentAvatar(supabase, 'commercial');
  return {
    name: avatar.display_name,
    avatarUrl: avatar.avatar_url,
    catchphrase: avatar.personality.signature_catchphrase,
  };
}

/**
 * Format avatar as email signature block for agent-sent emails.
 */
export function formatAvatarForEmailSignature(avatar: AgentAvatarConfig): string {
  return `${avatar.display_name}\n${avatar.title} — KeiroAI`;
}
