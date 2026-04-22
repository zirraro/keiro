/**
 * Agent knowledge enrichment campaign — "Super Elite" mode.
 *
 * Mission: every agent becomes a genuine domain expert that can also
 * cross-pollinate with the other agents' domains. Three knowledge tiers
 * plus a cross-agent connection layer:
 *
 *   1. GENERAL      — broad principles, best practices, metrics, rules
 *   2. NICHED       — per business family (restaurants, coaches, …)
 *   3. HYPER-NICHED — hyper-specific playbook items
 *   4. CROSS        — explicit bridges to other agents' domains
 *                     (e.g. content ↔ email: email subject lines that
 *                      convert become content hooks)
 *
 * Each tier runs multiple "angle passes" so a single topic is enriched
 * from several professional perspectives (strategist / tactician /
 * optimizer / analyst / creative) — that's where the depth comes from.
 *
 * Depth settings:
 *   - shallow: 1 angle per topic, niches only    (~50/agent, fast)
 *   - medium:  2 angles, full niche list         (~120/agent, default)
 *   - deep:    5 angles + cross-connections      (~400/agent, super elite)
 */
import Anthropic from '@anthropic-ai/sdk';
import { SupabaseClient } from '@supabase/supabase-js';

const ENRICHMENT_BRIEFS: Record<string, {
  domain: string;
  niches: string[];
  hyperNiches: string[];
  crossAgents?: string[]; // other agents whose domains intersect
}> = {
  content: {
    domain: 'social media content creation, Instagram/TikTok/LinkedIn posting, visual design, copywriting, hashtags, engagement optimization, audience psychology, trend surfing, content pillars, scroll-stopping hooks, platform algorithms',
    niches: [
      'restaurants and food service (bistros, cafes, gastronomy)',
      'coaches and freelancers (fitness, business, nutrition, life)',
      'retail boutiques (fashion, decor, gifts, vintage)',
      'beauty and hairdressing (salons, barbers, estheticians, nails)',
      'wine shops and gourmet food (cavistes, fromageries, épiceries fines)',
      'florists and event stylists',
      'professional services (lawyers, accountants, therapists, consultants)',
      'real estate agencies',
      'hotels and hospitality',
      'health practitioners (kiné, ostéo, doctors, dentists)',
      'artisans (plumbers, electricians, menuisiers)',
      'automotive (garages, car dealers, bikes)',
    ],
    hyperNiches: [
      'Parisian bistros serving seasonal lunch menus',
      'yoga studios opening summer retreat programs',
      'independent natural wine shops',
      'coffee shops with remote-work ambience',
      'specialty tea houses with Japanese imports',
      'vintage clothing boutiques pricing under €60',
      'organic grocery stores with local producers',
      'pilates studios for women 35+',
      'Brazilian jiu-jitsu gyms',
      'kids birthday venues',
      'pop-up restaurants (food truck, dark kitchen)',
      'boulangeries with viennoiserie specialty',
      'barbershops catering to male grooming',
      'wedding photographers',
      'ceramic / pottery ateliers',
    ],
    crossAgents: ['marketing', 'dm_instagram', 'email', 'seo'],
  },
  dm_instagram: {
    domain: 'Instagram direct messaging, cold outreach to businesses, DM templates that convert, response patterns, handling objections, converting curious followers into paying customers, personalization at scale, voice memos, story replies',
    niches: [
      'restaurants',
      'fitness coaches',
      'e-commerce brands',
      'local service businesses',
      'beauty salons',
      'B2B SaaS',
      'freelance consultants',
    ],
    hyperNiches: [
      'pitching a restaurant that just opened',
      'following up a coach who left you on read',
      'recovering a 3-week-silent thread',
      'DMing a prospect who reacted to your story',
      'opening conversation with a salon owner',
      'handling "send me more info"',
      'handling "not interested right now"',
      'booking a discovery call through DMs',
      'referrals from existing customers via DM',
    ],
    crossAgents: ['commercial', 'email', 'content'],
  },
  email: {
    domain: 'cold email copywriting, follow-up sequences, subject lines, personalization tokens, deliverability, SPF/DKIM/DMARC, click rates, reply rates, objection handling, sender reputation, segmentation',
    niches: [
      'restaurant outreach campaigns',
      'B2B SaaS prospects',
      'local retail shop owners',
      'professional service firms',
      'coaches and consultants',
      'real estate agencies',
      'hotels and hospitality',
    ],
    hyperNiches: [
      'first-touch emails to cafe owners',
      'weekend follow-up for freelance designers',
      'reactivation emails for prospects gone cold 90 days',
      'meeting confirmation emails',
      'pre-demo warm-up sequences',
      'post-demo follow-up with ROI calc',
      'referral request emails to happy customers',
      'win-back emails for churned clients',
      'holiday / seasonal campaigns (Black Friday, summer)',
    ],
    crossAgents: ['commercial', 'dm_instagram', 'retention'],
  },
  commercial: {
    domain: 'prospect qualification, BANT scoring, lead enrichment, deduplication, lead scoring rubrics, handling no-shows, CRM hygiene, pipeline reviews, MQL/SQL conversion, geographic targeting, ICP definition',
    niches: [
      'French SMB prospects (Paris, Lyon, Marseille, Bordeaux)',
      'restaurant chain prospects',
      'independent coach prospects',
      'boutique e-commerce prospects',
      'professional services prospects',
    ],
    hyperNiches: [
      'qualifying a restaurant with 4.8+ Google rating',
      'scoring a freelance coach with < 500 IG followers',
      'flagging low-quality boutique prospects',
      'identifying franchise vs independent',
      'detecting serial signups / fake emails',
      'finding LinkedIn profiles for B2B targeting',
      'cross-referencing IG + Google Maps + website',
    ],
    crossAgents: ['email', 'dm_instagram', 'marketing'],
  },
  marketing: {
    domain: 'marketing analytics, funnel optimisation, attribution, content performance metrics, A/B testing, ROI calculation, cross-channel lift, brand positioning, competitor analysis, customer journey mapping',
    niches: [
      'Instagram analytics for SMBs',
      'email performance by business type',
      'DM conversion funnels',
      'multi-touch attribution',
      'weekly and monthly reporting',
    ],
    hyperNiches: [
      'analysing reels vs carousels for restaurants',
      'attributing Google reviews lift from DMs',
      'late-day email open rates for coaches',
      'detecting content pillar fatigue',
      'correlating story views to DM replies',
      'weekly engagement rate trending',
      'CAC by channel by business type',
    ],
    crossAgents: ['content', 'email', 'dm_instagram', 'commercial', 'seo'],
  },
  seo: {
    domain: 'SEO article writing, keyword research, local SEO, Google My Business optimization, backlink strategy, technical SEO, schema.org markup, E-E-A-T signals, Core Web Vitals, internal linking',
    niches: [
      'local SEO for physical businesses',
      'B2B SaaS SEO',
      'E-commerce SEO',
      'medical / legal / professional SEO (YMYL)',
      'news and editorial SEO',
    ],
    hyperNiches: [
      'ranking a restaurant on "restaurant italien Lyon 6"',
      'ranking a coach on "coach perte de poids Paris 15"',
      'ranking a boutique on "robe mariage Marais"',
      'featured snippet optimization for local queries',
      'Google Business Profile post scheduling for SEO',
      'fixing duplicate category page issues',
      'programmatic local landing pages',
    ],
    crossAgents: ['content', 'gmaps', 'marketing'],
  },
  gmaps: {
    domain: 'Google Business Profile optimization, review response strategy, photo guidelines, post scheduling, Q&A management, directory consistency, service area definition, attribute optimization',
    niches: ['restaurants', 'service businesses', 'retail shops', 'professional practices', 'multi-location businesses'],
    hyperNiches: [
      'responding to a negative review on a 4.7-rated restaurant',
      'encouraging 5-star reviews after a service call',
      'scheduling GMB posts for holiday weekends',
      'handling competitor-bombing fake reviews',
      'weekly photo rotation strategy',
      'Q&A seeding to prevent competitor hijacking',
      'address change notification to Google',
    ],
    crossAgents: ['seo', 'marketing', 'content'],
  },
  chatbot: {
    domain: 'website chatbot conversation design, intent detection, lead capture through chat, handling pricing questions, escalation rules, conversion optimisation, multi-turn context, persona consistency',
    niches: ['SaaS website chatbots', 'local service sites', 'B2B consulting sites', 'e-commerce product help'],
    hyperNiches: [
      'handling "is it free?" on a SaaS site',
      'booking flow through chat for a salon',
      'qualifying enterprise leads on a B2B site',
      'handling frustrated customers in checkout',
      'reactivating abandoned cart via chat',
      'cross-selling inside a support conversation',
    ],
    crossAgents: ['marketing', 'commercial', 'retention'],
  },
  onboarding: {
    domain: 'client onboarding flows, completion rates, activation milestones, time-to-first-value, dossier completion nudges, data collection minimization, progressive profiling',
    niches: ['marketing SaaS onboarding', 'agency onboarding', 'B2B tool onboarding', 'creator platform onboarding'],
    hyperNiches: [
      'onboarding a restaurant with no IG presence',
      'onboarding a coach with messy brand assets',
      'onboarding a boutique with Shopify data',
      'onboarding multi-location chains',
      'onboarding solo founders in 48h',
      'recovering stalled onboarding at day 3',
    ],
    crossAgents: ['retention', 'marketing', 'chatbot'],
  },
  retention: {
    domain: 'churn prediction, reactivation campaigns, win-back sequences, NPS surveys, usage-based nudges, expansion revenue signals, cohort analysis, customer success playbooks',
    niches: ['SaaS retention', 'subscription service retention', 'freemium-to-paid conversion'],
    hyperNiches: [
      'saving a Créateur client at day 25 of 30',
      'upselling a Pro at 80% credit usage',
      'reactivating a 60-day dormant client',
      'detecting silent churn signals',
      'win-back offers by prior spend tier',
      'converting a free trial into paid on day 6',
    ],
    crossAgents: ['marketing', 'email', 'onboarding'],
  },
  // --- Disabled agents: keep enriching during the pause ---
  ads: {
    domain: 'Meta Ads + Google Ads campaigns, audience targeting, creative testing, bid optimisation, UTM tracking, attribution, lookalike audiences, creative refresh cadence',
    niches: ['local Facebook ads', 'Google Search Ads', 'Instagram Reels ads', 'retargeting', 'lead ads'],
    hyperNiches: [
      'ads for a Lyon restaurant opening',
      'lead ads for a fitness coach',
      'retargeting abandoned cart on a Shopify store',
      'boosting best-performing organic posts',
      'local awareness ads for a boutique',
    ],
    crossAgents: ['marketing', 'content', 'commercial'],
  },
  rh: {
    domain: 'French labour law, employment contracts, HR compliance, SIRH processes, RGPD/GDPR, convention collective, rupture conventionnelle, onboarding of new hires, disciplinary procedures',
    niches: ['SMB HR compliance', 'restaurant labour law', 'freelance contracts', 'apprentice contracts', 'extra staff for events'],
    hyperNiches: [
      'hiring a first employee in a restaurant',
      'extras contracts for events',
      'dismissing an employee on trial period',
      'handling a maternity leave replacement',
      'setting up mutuelle collective',
    ],
    crossAgents: ['comptable'],
  },
  comptable: {
    domain: 'French SMB accounting, VAT, business plan generation, financial forecasting, SIRET management, tax optimisation, budget planning, cash-flow management',
    niches: ['SAS/SARL tax optimisation', 'restaurant P&L', 'freelance accounting', 'e-commerce bookkeeping'],
    hyperNiches: [
      'first-year SAS fiscal strategy',
      'auto-entrepreneur threshold planning',
      'restaurant margin analysis by dish',
      'quarterly VAT filing workflow',
      'year-end closing for small businesses',
    ],
    crossAgents: ['rh'],
  },
  whatsapp: {
    domain: 'WhatsApp Business API, broadcast lists, template messages, rich media handling, CTWA ads, conversation limits, opt-in management',
    niches: ['retail WhatsApp support', 'restaurant booking via WhatsApp', 'e-commerce order confirmations'],
    hyperNiches: [
      'responding to DM on WhatsApp after IG ad click',
      'booking confirmations for a hair salon',
      'appointment reminders 24h before',
      'handling mass broadcast to 500+ contacts',
    ],
    crossAgents: ['dm_instagram', 'chatbot'],
  },
  tiktok_comments: {
    domain: 'TikTok comment strategy, viral comment tactics, moderation rules, engagement pyramid, stitching and duet responses',
    niches: ['restaurant TikTok presence', 'beauty TikTok', 'coach TikTok'],
    hyperNiches: [
      'commenting on food reviewer videos',
      'engaging in local-business TikTok',
      'pinning strategic comments on own videos',
      'handling trolls without amplifying them',
    ],
    crossAgents: ['content', 'dm_instagram'],
  },
  linkedin: {
    domain: 'LinkedIn thought leadership, long-form posts, comment engagement, InMail strategy, newsletter conversion, personal brand building, Sales Navigator, groups',
    niches: ['B2B LinkedIn lead gen', 'personal-brand LinkedIn for founders', 'thought leadership for consultants'],
    hyperNiches: [
      'LinkedIn posts for a solo marketing consultant',
      'newsletter growth for a startup founder',
      'InMail sequences for enterprise prospects',
      'leveraging LinkedIn Live for events',
      'handling viral post moderation',
    ],
    crossAgents: ['content', 'commercial'],
  },
};

export const PRIORITY_ORDER = [
  'content', 'dm_instagram', 'email', 'commercial', 'gmaps', 'marketing', 'onboarding',
  'seo',
  'chatbot', 'retention',
  'ads', 'rh', 'comptable', 'whatsapp', 'tiktok_comments', 'linkedin',
];

/**
 * The "angles" through which each topic is explored. Running the same
 * topic from multiple angles is how we get real depth — a strategist
 * writes different content than a tactician or an analyst.
 */
const ANGLES = [
  { key: 'strategist', description: 'high-level strategy, positioning, long-term planning, market trends, competitive moves' },
  { key: 'tactician',  description: 'concrete playbooks, step-by-step recipes, what to do this week' },
  { key: 'optimizer',  description: 'metrics, benchmarks, A/B test results, conversion rate improvements, efficiency' },
  { key: 'analyst',    description: 'data patterns, cohort behaviour, segmentation insights, attribution, causal chains' },
  { key: 'creative',   description: 'fresh angles, novel hooks, unconventional approaches, creative formats' },
];

export type Depth = 'shallow' | 'medium' | 'deep';

function claude() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY missing');
  return new Anthropic({ apiKey: key });
}

async function generateEnrichmentPass(
  agentId: string,
  angle: typeof ANGLES[number],
  tier: 'general' | 'niched' | 'hyper',
  topic: string,
): Promise<Array<{ content: string; summary: string }>> {
  const brief = ENRICHMENT_BRIEFS[agentId];
  if (!brief) return [];

  const scopeLabel = tier === 'general' ? 'general principles' : tier === 'niched' ? 'niche-specific tactics' : 'hyper-specific playbook items';

  try {
    const res = await claude().messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2800,
      system: `You are a top-tier ${angle.key} in ${brief.domain}. Your output is saved to a RAG knowledge base so other AI agents can retrieve it later. Write 6-10 DISTINCT, ACTIONABLE, PROFESSIONAL knowledge items — no fluff, no marketing speak. Each item must be a concrete tactic, metric, pattern, or playbook an agent can apply immediately. Angle: ${angle.description}.

Format (strict JSON array, no markdown fences):
[
  { "summary": "one-line hook (< 90 chars)", "content": "2-4 sentences — concrete, actionable, cite numbers/benchmarks when relevant" },
  ...
]`,
      messages: [{
        role: 'user',
        content: `Generate ${scopeLabel} for the "${agentId}" agent on the topic: "${topic}". Speak as a ${angle.key}. Return strict JSON array only.`,
      }],
    });

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim();

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x: any) => x && typeof x.summary === 'string' && typeof x.content === 'string');
  } catch (err: any) {
    console.error(`[enrichment] ${agentId}/${angle.key}/${tier} "${topic}":`, err?.message);
    return [];
  }
}

async function generateCrossConnection(
  agentId: string,
  otherAgentId: string,
): Promise<Array<{ content: string; summary: string }>> {
  const a = ENRICHMENT_BRIEFS[agentId];
  const b = ENRICHMENT_BRIEFS[otherAgentId];
  if (!a || !b) return [];

  try {
    const res = await claude().messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2500,
      system: `You produce cross-agent knowledge that makes two AI agents smarter together than apart. Return 6-8 concrete patterns where agent "${agentId}" (${a.domain.split(',')[0]}) and agent "${otherAgentId}" (${b.domain.split(',')[0]}) benefit from each other's signals. Each item must describe:
- the SIGNAL one agent detects
- how the OTHER agent should use that signal in its own work
- a measurable outcome when the connection works

Format: strict JSON array, no markdown.
[
  { "summary": "one-line pattern description", "content": "2-4 sentences explaining the cross-connection in detail" }
]`,
      messages: [{
        role: 'user',
        content: `Agent A: ${agentId}\nA domain: ${a.domain}\n\nAgent B: ${otherAgentId}\nB domain: ${b.domain}\n\nGenerate the cross-connection patterns.`,
      }],
    });

    const text = res.content
      .filter((bl): bl is Anthropic.TextBlock => bl.type === 'text')
      .map(bl => bl.text)
      .join('')
      .trim();

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x: any) => x && typeof x.summary === 'string' && typeof x.content === 'string');
  } catch (err: any) {
    console.error(`[enrichment] cross ${agentId}↔${otherAgentId}:`, err?.message);
    return [];
  }
}

export type AutoGenResult = {
  userId: string;
  generated: number;
  failed: number;
  palette: string[];
  templates: Array<{ name: string; category: string; id?: string; status: 'stored' | 'failed' }>;
};

/** How many angles to run per topic at each depth. */
const ANGLES_PER_DEPTH: Record<Depth, number> = {
  shallow: 1, // one pass, strategist only
  medium:  2, // strategist + tactician
  deep:    5, // all five angles = real depth
};

export async function enrichAgentKnowledge(
  supabase: SupabaseClient,
  agentId: string,
  depth: Depth = 'medium',
): Promise<{ agent: string; inserted: number; tiers: Record<string, number>; depth: Depth }> {
  const brief = ENRICHMENT_BRIEFS[agentId];
  if (!brief) return { agent: agentId, inserted: 0, tiers: {}, depth };

  const passCount = ANGLES_PER_DEPTH[depth];
  const chosenAngles = ANGLES.slice(0, passCount);
  let inserted = 0;
  const tiers: Record<string, number> = { general: 0, niched: 0, hyper: 0, cross: 0 };

  const insertBatch = async (items: Array<{ content: string; summary: string }>, tier: 'general' | 'niched' | 'hyper' | 'cross', confidence: number) => {
    if (items.length === 0) return 0;
    const rows = items.map(item => ({
      agent: agentId,
      content: item.content,
      summary: item.summary,
      category: tier === 'cross' ? 'cross_connection' : 'learning',
      confidence,
      source: 'enrichment_campaign',
      created_by: 'system',
    }));
    const { error } = await supabase.from('agent_knowledge').insert(rows);
    return error ? 0 : rows.length;
  };

  // Tier 1 — GENERAL knowledge from each angle
  for (const angle of chosenAngles) {
    const items = await generateEnrichmentPass(agentId, angle, 'general', brief.domain);
    const n = await insertBatch(items, 'general', 0.55);
    inserted += n; tiers.general += n;
  }

  // Tier 2 — NICHED (per niche × angles)
  for (const niche of brief.niches) {
    for (const angle of chosenAngles) {
      const items = await generateEnrichmentPass(agentId, angle, 'niched', niche);
      const n = await insertBatch(items, 'niched', 0.65);
      inserted += n; tiers.niched += n;
    }
  }

  // Tier 3 — HYPER (per hyperNiche × angles) — heaviest pass, reserved for medium+deep
  if (depth !== 'shallow') {
    for (const hyperNiche of brief.hyperNiches) {
      for (const angle of chosenAngles.slice(0, depth === 'deep' ? 3 : 1)) {
        const items = await generateEnrichmentPass(agentId, angle, 'hyper', hyperNiche);
        const n = await insertBatch(items, 'hyper', 0.75);
        inserted += n; tiers.hyper += n;
      }
    }
  }

  // Tier 4 — CROSS-AGENT connections (deep only)
  if (depth === 'deep' && brief.crossAgents) {
    for (const other of brief.crossAgents) {
      const items = await generateCrossConnection(agentId, other);
      const n = await insertBatch(items, 'cross', 0.70);
      inserted += n; tiers.cross += n;
    }
  }

  // Kick the embedding backfill so the new rows get vectors within minutes.
  try {
    const url = process.env.NEXT_PUBLIC_SITE_URL || 'https://keiroai.com';
    fetch(`${url}/api/agents/knowledge-backfill?batch=200`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.CRON_SECRET}` },
    }).catch(() => {});
  } catch { /* non-blocking */ }

  return { agent: agentId, inserted, tiers, depth };
}

export async function runEnrichmentCampaign(
  supabase: SupabaseClient,
  filter: { agents?: string[]; maxAgents?: number; depth?: Depth } = {},
): Promise<Array<{ agent: string; inserted: number; tiers: Record<string, number>; depth: Depth }>> {
  const target = (filter.agents && filter.agents.length > 0)
    ? filter.agents
    : PRIORITY_ORDER;
  const limited = filter.maxAgents ? target.slice(0, filter.maxAgents) : target;
  const depth: Depth = filter.depth || 'medium';

  const results: Array<{ agent: string; inserted: number; tiers: Record<string, number>; depth: Depth }> = [];
  for (const agentId of limited) {
    const r = await enrichAgentKnowledge(supabase, agentId, depth);
    results.push(r);
  }
  return results;
}
