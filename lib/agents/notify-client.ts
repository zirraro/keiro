/**
 * Client notification helper — creates in-app notifications for agent actions.
 * These appear in the NotificationBell and agent History tab.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const AGENT_NAMES: Record<string, string> = {
  content: 'Lena',
  email: 'Hugo',
  commercial: 'Leo',
  dm_instagram: 'Jade',
  seo: 'Tom',
  gmaps: 'Theo',
  marketing: 'AMI',
  ceo: 'Noah',
  onboarding: 'Clara',
  chatbot: 'Max',
  retention: 'Eva',
  comptable: 'Louis',
  instagram_comments: 'Jade',
  tiktok_comments: 'Axel',
};

export async function notifyClient(
  supabase: SupabaseClient,
  opts: {
    userId: string;
    agent: string;
    type?: 'info' | 'alert' | 'action' | 'brief';
    title: string;
    message: string;
    data?: Record<string, any>;
  }
) {
  try {
    const agentName = AGENT_NAMES[opts.agent] || opts.agent;
    await supabase.from('client_notifications').insert({
      user_id: opts.userId,
      agent: opts.agent,
      type: opts.type || 'info',
      title: `${agentName}: ${opts.title}`,
      message: opts.message,
      data: opts.data || {},
      created_at: new Date().toISOString(),
    });
  } catch (e: any) {
    console.warn(`[notifyClient] Failed to send notification: ${e.message}`);
  }
}

/**
 * Pre-built notification templates for common agent actions.
 */
export async function notifyPublication(
  supabase: SupabaseClient,
  userId: string,
  opts: { platform: string; permalink?: string; caption?: string; status: 'published' | 'publish_failed'; error?: string }
) {
  const success = opts.status === 'published';
  await notifyClient(supabase, {
    userId,
    agent: 'content',
    type: success ? 'info' : 'alert',
    title: success ? `Post publie sur ${opts.platform}` : `Echec publication ${opts.platform}`,
    message: success
      ? `${(opts.caption || '').substring(0, 100)}${opts.permalink ? `\n${opts.permalink}` : ''}`
      : `Erreur: ${opts.error || 'Publication echouee'}`,
    data: { platform: opts.platform, permalink: opts.permalink, status: opts.status },
  });
}

export async function notifyEmailSent(
  supabase: SupabaseClient,
  userId: string,
  opts: { count: number; provider: string; company?: string; subject?: string }
) {
  await notifyClient(supabase, {
    userId,
    agent: 'email',
    type: 'info',
    title: opts.count === 1 ? `Email envoye a ${opts.company || 'prospect'}` : `${opts.count} emails envoyes`,
    message: opts.count === 1
      ? `Sujet: "${opts.subject || ''}"\nVia ${opts.provider}`
      : `${opts.count} emails envoyes via ${opts.provider}`,
    data: { count: opts.count, provider: opts.provider },
  });
}

export async function notifyProspection(
  supabase: SupabaseClient,
  userId: string,
  opts: { imported: number; zones: string[]; source: string }
) {
  if (opts.imported === 0) return;
  await notifyClient(supabase, {
    userId,
    agent: 'commercial',
    type: 'info',
    title: `${opts.imported} nouveaux prospects trouves`,
    message: `${opts.imported} prospects importes depuis ${opts.source} (${opts.zones.slice(0, 3).join(', ')})`,
    data: { imported: opts.imported, zones: opts.zones, source: opts.source },
  });
}
