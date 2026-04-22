/**
 * Agent knowledge enrichment campaign.
 *
 * Generates fresh cross-niche + vertical-specific knowledge for every
 * agent in the platform, prioritised by plan tier so Créateur agents
 * are enriched first (they serve the highest-volume clients), then Pro,
 * then everyone else including temporarily-disabled agents — we keep
 * their knowledge warm so the day we reactivate them they pick up where
 * they left off, plus benefit from continuous learning accumulated
 * during the pause.
 *
 * For each agent we run three enrichment passes:
 *   1. GENERAL knowledge — broad principles of the domain (e.g. for
 *      content agent: "best practices for Instagram engagement 2026")
 *   2. NICHED knowledge — mid-tier, per business family
 *      (restaurants, coaches, boutiques...)
 *   3. HYPER-NICHED — very specific (e.g. "late-night bistros in Lyon",
 *      "barbershops catering to Arab clientele", "wine shops in Marais")
 *
 * Each enrichment item is stored in agent_knowledge with an embedding
 * so it's immediately retrievable by other agents via vector search.
 */
import Anthropic from '@anthropic-ai/sdk';
import { SupabaseClient } from '@supabase/supabase-js';

const ENRICHMENT_BRIEFS: Record<string, {
  domain: string;
  niches: string[];
  hyperNiches: string[];
}> = {
  content: {
    domain: 'social media content creation, Instagram/TikTok/LinkedIn posting, visual design, copywriting, hashtags, engagement optimization, audience psychology',
    niches: [
      'restaurants and food service',
      'coaches and freelancers',
      'retail boutiques and fashion',
      'beauty and hairdressing',
      'wine shops and gourmet food',
      'florists',
      'professional services (law, accounting, consulting)',
      'real estate agencies',
    ],
    hyperNiches: [
      'Parisian bistros serving lunch',
      'yoga studios opening in summer',
      'independent wine shops with natural selection',
      'coffee shops with remote-work vibe',
      'specialty tea houses',
      'vintage clothing boutiques',
      'organic grocery stores',
      'pilates studios for women 35+',
    ],
  },
  dm_instagram: {
    domain: 'Instagram direct messaging, cold outreach to businesses, DM templates that convert, response patterns, handling objections, converting curious followers into paying customers',
    niches: [
      'restaurants',
      'fitness coaches',
      'e-commerce brands',
      'local service businesses',
    ],
    hyperNiches: [
      'pitching a restaurant that just opened',
      'following up a coach who left you on read',
      'recovering a 3-week-silent thread',
      'DMing a prospect who reacted to your story',
    ],
  },
  email: {
    domain: 'cold email copywriting, follow-up sequences, subject lines, personalization tokens, deliverability, click rates, reply rates, objection handling',
    niches: [
      'restaurant outreach campaigns',
      'B2B SaaS prospects',
      'local retail shop owners',
      'professional service firms',
    ],
    hyperNiches: [
      'first-touch emails to cafe owners in Paris',
      'weekend-follow-up for freelance designers',
      'reactivation emails for prospects gone cold 90 days',
    ],
  },
  commercial: {
    domain: 'prospect qualification, BANT scoring, source enrichment, deduplication, lead scoring rubrics, handling no-shows, CRM hygiene',
    niches: [
      'Parisian restaurant prospects',
      'Lyon coach prospects',
      'Marseille boutique prospects',
    ],
    hyperNiches: [
      'qualifying a restaurant with 4.8+ Google rating',
      'scoring a freelance coach with < 500 IG followers',
      'flagging low-quality boutique prospects',
    ],
  },
  marketing: {
    domain: 'marketing analytics, funnel optimisation, attribution, content performance metrics, A/B testing, ROI calculation, cross-channel lift',
    niches: [
      'Instagram analytics for SMBs',
      'email performance by business type',
      'DM conversion funnels',
    ],
    hyperNiches: [
      'analysing reels vs carousels for restaurants',
      'attributing Google reviews lift from DMs',
      'late-day email open rates for coaches',
    ],
  },
  seo: {
    domain: 'SEO article writing, keyword research, local SEO, Google My Business optimization, backlink strategy, technical SEO, schema.org markup',
    niches: [
      'local SEO for physical businesses',
      'B2B SaaS SEO',
      'E-commerce SEO',
    ],
    hyperNiches: [
      'ranking a restaurant on "restaurant italien Lyon 6"',
      'ranking a coach on "coach perte de poids Paris 15"',
      'ranking a boutique on "robe mariage Marais"',
    ],
  },
  gmaps: {
    domain: 'Google Business Profile optimization, review response strategy, photo guidelines, post scheduling, Q&A management, directory consistency',
    niches: ['restaurants', 'service businesses', 'retail shops'],
    hyperNiches: [
      'responding to negative review on a 4.7 restaurant',
      'encouraging 5-star reviews after a service call',
      'scheduling GMB posts for holiday weekends',
    ],
  },
  chatbot: {
    domain: 'website chatbot conversation design, intent detection, lead capture through chat, handling pricing questions, escalation rules, conversion optimisation',
    niches: ['SaaS website chatbots', 'local service sites', 'B2B consulting sites'],
    hyperNiches: [
      'handling "is it free?" on a SaaS site',
      'booking flow through chat for a salon',
      'qualifying enterprise leads on a B2B site',
    ],
  },
  onboarding: {
    domain: 'client onboarding flows, completion rates, activation milestones, time-to-first-value, dossier completion nudges, data collection minimization',
    niches: ['marketing SaaS onboarding', 'agency onboarding', 'B2B tool onboarding'],
    hyperNiches: [
      'onboarding a restaurant with no IG presence',
      'onboarding a coach with messy brand assets',
      'onboarding a boutique with Shopify data',
    ],
  },
  retention: {
    domain: 'churn prediction, reactivation campaigns, win-back sequences, NPS surveys, usage-based nudges, expansion revenue signals',
    niches: ['SaaS retention', 'subscription service retention'],
    hyperNiches: [
      'saving a Créateur client at day 25 of 30',
      'upselling a Pro at 80% credit usage',
      'reactivating a 60-day dormant client',
    ],
  },
  // --- DISABLED agents: keep enriching during the pause ---
  ads: {
    domain: 'Meta Ads + Google Ads campaigns, audience targeting, creative testing, bid optimisation, UTM tracking, attribution',
    niches: ['local Facebook ads', 'Google Search Ads', 'Instagram Reels ads'],
    hyperNiches: ['ads for a Lyon restaurant opening', 'lead ads for a fitness coach'],
  },
  rh: {
    domain: 'French labour law, employment contracts, HR compliance, SIRH processes, RGPD/GDPR, convention collective, rupture conventionnelle',
    niches: ['SMB HR compliance', 'restaurant labour law', 'freelance contracts'],
    hyperNiches: ['hiring a first employee in a restaurant', 'extras contracts for events'],
  },
  comptable: {
    domain: 'French SMB accounting, VAT, business plan generation, financial forecasting, SIRET management, tax optimisation',
    niches: ['SAS/SARL tax optimisation', 'restaurant P&L', 'freelance accounting'],
    hyperNiches: ['first-year SAS fiscal strategy', 'auto-entrepreneur threshold planning'],
  },
  whatsapp: {
    domain: 'WhatsApp Business API, broadcast lists, template messages, rich media handling, CTWA ads',
    niches: ['retail WhatsApp support', 'restaurant booking via WhatsApp'],
    hyperNiches: ['responding to DM on WhatsApp after IG ad click'],
  },
  tiktok_comments: {
    domain: 'TikTok comment strategy, viral comment tactics, moderation rules, engagement pyramid',
    niches: ['restaurant TikTok presence', 'beauty TikTok'],
    hyperNiches: ['commenting on food reviewer videos', 'engaging in local-business TikTok'],
  },
  linkedin: {
    domain: 'LinkedIn thought leadership, long-form posts, comment engagement, InMail strategy, newsletter conversion',
    niches: ['B2B LinkedIn lead gen', 'personal-brand LinkedIn for founders'],
    hyperNiches: ['LinkedIn posts for a solo marketing consultant', 'newsletter growth for a startup founder'],
  },
};

export const PRIORITY_ORDER = [
  // Créateur first
  'content', 'dm_instagram', 'email', 'commercial', 'gmaps', 'marketing', 'onboarding',
  // Pro second
  'seo',
  // Business third
  'chatbot', 'retention',
  // Disabled last (still kept warm)
  'ads', 'rh', 'comptable', 'whatsapp', 'tiktok_comments', 'linkedin',
];

function claude() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY missing');
  return new Anthropic({ apiKey: key });
}

async function generateEnrichmentForAgent(
  agentId: string,
  tier: 'general' | 'niched' | 'hyper',
  topic: string,
): Promise<Array<{ content: string; summary: string }>> {
  const brief = ENRICHMENT_BRIEFS[agentId];
  if (!brief) return [];

  const scopeLabel = tier === 'general' ? 'general principles' : tier === 'niched' ? 'niche-specific tactics' : 'hyper-specific playbook items';
  const res = await claude().messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2500,
    system: `You are an elite expert in ${brief.domain}. Your output is saved to a RAG knowledge base so other AI agents can retrieve it later. Write 5-8 DISTINCT, ACTIONABLE, PROFESSIONAL knowledge items — no fluff, no marketing speak. Each item must be a concrete tactic, metric, pattern, or playbook an agent can apply immediately.

Format (strict JSON array, no markdown fences):
[
  { "summary": "one-line hook (< 90 chars) describing the item", "content": "the full item, 2-4 sentences, concrete, actionable, cite numbers/benchmarks when relevant" },
  ...
]`,
    messages: [{
      role: 'user',
      content: `Generate ${scopeLabel} for the "${agentId}" agent on the topic: "${topic}". Return strict JSON array only.`,
    }],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')
    .trim();

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x: any) => x && typeof x.summary === 'string' && typeof x.content === 'string');
  } catch {
    return [];
  }
}

export async function enrichAgentKnowledge(
  supabase: SupabaseClient,
  agentId: string,
  options: { skipGeneral?: boolean; skipNiched?: boolean; skipHyper?: boolean } = {},
): Promise<{ agent: string; inserted: number; tiers: Record<string, number> }> {
  const brief = ENRICHMENT_BRIEFS[agentId];
  if (!brief) return { agent: agentId, inserted: 0, tiers: {} };

  let inserted = 0;
  const tiers: Record<string, number> = { general: 0, niched: 0, hyper: 0 };

  const run = async (tier: 'general' | 'niched' | 'hyper', topics: string[]) => {
    for (const topic of topics) {
      try {
        const items = await generateEnrichmentForAgent(agentId, tier, topic);
        if (items.length === 0) continue;
        const rows = items.map(item => ({
          agent: agentId,
          content: item.content,
          summary: item.summary,
          category: 'learning',
          confidence: tier === 'general' ? 0.55 : tier === 'niched' ? 0.65 : 0.75,
          source: 'enrichment_campaign',
          created_by: 'system',
        }));
        const { error } = await supabase.from('agent_knowledge').insert(rows);
        if (!error) {
          inserted += rows.length;
          tiers[tier] += rows.length;
        }
      } catch (err: any) {
        console.error(`[enrichment] ${agentId} ${tier} "${topic}":`, err?.message);
      }
    }
  };

  if (!options.skipGeneral) await run('general', [brief.domain]);
  if (!options.skipNiched) await run('niched', brief.niches);
  if (!options.skipHyper) await run('hyper', brief.hyperNiches);

  // Kick the embedding backfill so the new rows get vectors within minutes.
  try {
    const url = process.env.NEXT_PUBLIC_SITE_URL || 'https://keiroai.com';
    fetch(`${url}/api/agents/knowledge-backfill?batch=100`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.CRON_SECRET}` },
    }).catch(() => {});
  } catch { /* non-blocking */ }

  return { agent: agentId, inserted, tiers };
}

export async function runEnrichmentCampaign(
  supabase: SupabaseClient,
  filter: { agents?: string[]; maxAgents?: number } = {},
): Promise<Array<{ agent: string; inserted: number; tiers: Record<string, number> }>> {
  const target = (filter.agents && filter.agents.length > 0)
    ? filter.agents
    : PRIORITY_ORDER;
  const limited = filter.maxAgents ? target.slice(0, filter.maxAgents) : target;

  const results: Array<{ agent: string; inserted: number; tiers: Record<string, number> }> = [];
  for (const agentId of limited) {
    const r = await enrichAgentKnowledge(supabase, agentId);
    results.push(r);
  }
  return results;
}
