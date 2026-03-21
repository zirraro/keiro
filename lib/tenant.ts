import { SupabaseClient } from '@supabase/supabase-js';

export interface OrgContext {
  id: string;
  name: string;
  slug: string;
  business_type: string | null;
  industry: string | null;
  locale: string;
  tone_preferences: Record<string, any>;
  custom_context: string | null;
  plan: string;
  is_active: boolean;
}

/**
 * Resolve org_id from a user ID (via organization_members).
 * Returns null if user has no org.
 */
export async function resolveOrgId(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('organization_members')
    .select('org_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  return data?.org_id || null;
}

/**
 * Get full org context for prompt injection and filtering.
 */
export async function getOrgContext(supabase: SupabaseClient, orgId: string): Promise<OrgContext | null> {
  const { data } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', orgId)
    .single();
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    business_type: data.business_type,
    industry: data.industry,
    locale: data.locale || 'fr',
    tone_preferences: data.tone_preferences || {},
    custom_context: data.custom_context,
    plan: data.plan || 'free',
    is_active: data.is_active !== false,
  };
}

/**
 * Get org-specific agent config overrides (for tenant customization).
 */
export async function getOrgAgentConfig(
  supabase: SupabaseClient,
  orgId: string,
  agentId: string
): Promise<{ display_name?: string; personality_overrides?: Record<string, any>; custom_instructions?: string; is_enabled?: boolean; avatar_url?: string; avatar_3d_url?: string } | null> {
  const { data } = await supabase
    .from('org_agent_configs')
    .select('*')
    .eq('org_id', orgId)
    .eq('agent_id', agentId)
    .maybeSingle();
  return data || null;
}

/**
 * List all orgs (for super-admin).
 */
export async function listOrganizations(supabase: SupabaseClient): Promise<OrgContext[]> {
  const { data } = await supabase
    .from('organizations')
    .select('*')
    .order('created_at', { ascending: false });
  return (data || []).map((d: any) => ({
    id: d.id,
    name: d.name,
    slug: d.slug,
    business_type: d.business_type,
    industry: d.industry,
    locale: d.locale || 'fr',
    tone_preferences: d.tone_preferences || {},
    custom_context: d.custom_context,
    plan: d.plan || 'free',
    is_active: d.is_active !== false,
  }));
}

/**
 * Create a new organization + assign owner.
 */
export async function createOrganization(
  supabase: SupabaseClient,
  name: string,
  slug: string,
  ownerId: string,
  extra?: { business_type?: string; industry?: string; plan?: string; custom_context?: string }
): Promise<{ org_id: string } | { error: string }> {
  const { data, error } = await supabase
    .from('organizations')
    .insert({
      name,
      slug,
      business_type: extra?.business_type || null,
      industry: extra?.industry || null,
      plan: extra?.plan || 'free',
      custom_context: extra?.custom_context || null,
    })
    .select('id')
    .single();

  if (error || !data) return { error: error?.message || 'Failed to create org' };

  // Add owner as member
  await supabase.from('organization_members').insert({
    org_id: data.id,
    user_id: ownerId,
    role: 'owner',
  });

  return { org_id: data.id };
}

/**
 * Format org context for agent prompt injection.
 */
export function formatOrgContextForPrompt(org: OrgContext): string {
  let prompt = `━━━ CONTEXTE CLIENT ━━━
Organisation : ${org.name}
Type d'activité : ${org.business_type || 'Non spécifié'}`;

  if (org.industry) prompt += `\nIndustrie : ${org.industry}`;
  if (org.custom_context) prompt += `\n\nDescription du business :\n${org.custom_context}`;
  if (org.tone_preferences && Object.keys(org.tone_preferences).length > 0) {
    prompt += `\n\nPréférences de ton : ${JSON.stringify(org.tone_preferences)}`;
  }
  prompt += `\nPlan : ${org.plan}`;

  return prompt;
}
