/**
 * Client notification helper — HIGH VALUE notifications only.
 *
 * SEND NOTIFICATIONS FOR:
 * - Publication confirmed (post publié sur Instagram/TikTok)
 * - Prospect replied to email (reprends la main!)
 * - DM prospect hot (5+ échanges, score >= 60)
 * - Batch prospects imported (>= 10)
 * - Batch posts published
 *
 * DO NOT SEND FOR:
 * - Individual emails sent (too noisy)
 * - Each CRM activity (too noisy)
 * - Agent routine tasks (logs are enough)
 *
 * BILINGUAL SUPPORT (2026-04-19):
 * Each notification is now written with both FR and EN copy so the UI can
 * render in the user's locale. The legacy `title`/`message` columns stay
 * populated (always FR) for backwards compat with older consumers; new
 * consumers should read `title_fr`/`title_en` + `message_fr`/`message_en`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const AGENT_NAMES: Record<string, string> = {
  content: 'Léna',
  email: 'Hugo',
  commercial: 'Léo',
  dm_instagram: 'Jade',
  seo: 'Oscar',
  gmaps: 'Théo',
  marketing: 'Ami',
  ceo: 'Noah',
  onboarding: 'Clara',
  chatbot: 'Max',
  retention: 'Théo',
  comptable: 'Louis',
  instagram_comments: 'Jade',
  tiktok_comments: 'Axel',
};

type Bilingual = string | { fr: string; en: string };

function pickFr(v: Bilingual | undefined): string {
  if (!v) return '';
  return typeof v === 'string' ? v : v.fr;
}

function pickEn(v: Bilingual | undefined): string {
  if (!v) return '';
  return typeof v === 'string' ? v : v.en;
}

export async function notifyClient(
  supabase: SupabaseClient,
  opts: {
    userId: string;
    agent: string;
    type?: 'info' | 'alert' | 'action' | 'brief';
    /** FR text, or {fr, en} object for explicit bilingual copy. String = FR only, EN falls back to FR at display time. */
    title: Bilingual;
    /** Same shape as title. */
    message: Bilingual;
    data?: Record<string, any>;
  }
) {
  try {
    const agentName = AGENT_NAMES[opts.agent] || opts.agent;
    const titleFr = pickFr(opts.title);
    const titleEn = pickEn(opts.title) || titleFr;
    const messageFr = pickFr(opts.message);
    const messageEn = pickEn(opts.message) || messageFr;

    await supabase.from('client_notifications').insert({
      user_id: opts.userId,
      agent: opts.agent,
      type: opts.type || 'info',
      // Legacy columns — always FR for backwards compat
      title: `${agentName}: ${titleFr}`,
      message: messageFr,
      // Localised columns — picked by the UI based on user locale
      title_fr: `${agentName}: ${titleFr}`,
      message_fr: messageFr,
      title_en: `${agentName}: ${titleEn}`,
      message_en: messageEn,
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
  const captionPreview = (opts.caption || '').substring(0, 100);
  await notifyClient(supabase, {
    userId,
    agent: 'content',
    type: success ? 'info' : 'alert',
    title: success
      ? { fr: `Post publié sur ${opts.platform}`, en: `Post published on ${opts.platform}` }
      : { fr: `Échec publication ${opts.platform}`, en: `Failed to publish on ${opts.platform}` },
    message: success
      ? {
          fr: `${captionPreview}${opts.permalink ? `\n${opts.permalink}` : ''}`,
          en: `${captionPreview}${opts.permalink ? `\n${opts.permalink}` : ''}`,
        }
      : {
          fr: `Erreur : ${opts.error || 'Publication échouée'}`,
          en: `Error: ${opts.error || 'Publication failed'}`,
        },
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
    title: opts.count === 1
      ? { fr: `Email envoyé à ${opts.company || 'prospect'}`, en: `Email sent to ${opts.company || 'prospect'}` }
      : { fr: `${opts.count} emails envoyés`, en: `${opts.count} emails sent` },
    message: opts.count === 1
      ? {
          fr: `Sujet : "${opts.subject || ''}"\nVia ${opts.provider}`,
          en: `Subject: "${opts.subject || ''}"\nVia ${opts.provider}`,
        }
      : {
          fr: `${opts.count} emails envoyés via ${opts.provider}`,
          en: `${opts.count} emails sent via ${opts.provider}`,
        },
    data: { count: opts.count, provider: opts.provider },
  });
}

export async function notifyProspection(
  supabase: SupabaseClient,
  userId: string,
  opts: { imported: number; zones: string[]; source: string }
) {
  if (opts.imported === 0) return;
  const zones = opts.zones.slice(0, 3).join(', ');
  await notifyClient(supabase, {
    userId,
    agent: 'commercial',
    type: 'info',
    title: {
      fr: `${opts.imported} nouveaux prospects trouvés`,
      en: `${opts.imported} new prospects found`,
    },
    message: {
      fr: `${opts.imported} prospects importés depuis ${opts.source} (${zones})`,
      en: `${opts.imported} prospects imported from ${opts.source} (${zones})`,
    },
    data: { imported: opts.imported, zones: opts.zones, source: opts.source },
  });
}
