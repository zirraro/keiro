/**
 * Per-client margin calculation and safety block.
 *
 * Why this exists: quotas protect the *worst case per feature* but a client
 * could still combine feature usage in a way that eats the margin target.
 * Example: 5 videos × 15s + 30 images + 10 min TTS + max DMs is fine
 * individually but adds up to €8 COGS on a €49 plan (= 84% GM — ok).
 * However if Seedance rates jump or an edge case mis-meters, we need a
 * second safety net that looks at the WHOLE COGS bill this month vs the
 * plan revenue and hard-blocks further generation below 60% margin.
 *
 * Philosophy: quotas = normal guard, margin block = circuit-breaker.
 * A client hitting the 60% block is rare enough that it should prompt a
 * manual review (and an upsell call) — we flag it in the admin dashboard.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { PLAN_CREDITS } from './constants';

function admin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/**
 * Approximate AI cost per operation in EUR. These track real API pricing
 * as of Q2 2026. If a provider jumps 2× we update here, not every endpoint.
 */
export const OP_COST_EUR = {
  image_generated: 0.025,      // Seedream 4.5 per image
  video_per_second: 0.03,      // Seedance base rate — multiply by duration
  tts_per_second: 0.0025,      // ElevenLabs minute ≈ €0.15
  dm_sent: 0.002,              // Jade DM generation (Haiku)
  email_sent: 0.005,           // Hugo sequence step
  chatbot_session: 0.015,      // Max chatbot 3-msg session (Haiku)
  agent_chat: 0.007,           // Agent chat message (Gemini thinking)
  seo_article: 0.10,           // Oscar SEO article (Sonnet long-form)
  analytics_report: 0.015,     // Ami daily brief (Sonnet)
  review_reply: 0.005,         // Théo Google review response
} as const;

/** Plan HT revenue in EUR for margin calculation. */
const PLAN_REVENUE_HT: Record<string, number> = {
  free: 0,
  createur: 49,
  pro: 99,
  fondateurs: 149,
  business: 199,
  elite: 999,
  agence: 499,
  admin: 0,
};

/**
 * Fixed per-client infra amortisation estimate. Grows slowly with scale but
 * at 50-200 clients a €2/client figure is conservative.
 */
const INFRA_PER_CLIENT_EUR = 2.5;

/** Hard-block threshold: if live margin drops below this, refuse further generation. */
export const MARGIN_BLOCK_THRESHOLD = 0.60;
/** Warning threshold: surfaced in admin dashboard (yellow). */
export const MARGIN_WARN_THRESHOLD = 0.70;

export type MarginSnapshot = {
  userId: string;
  plan: string;
  revenueHT: number;
  cogs: {
    images: number;
    videos: number;
    tts: number;
    dms: number;
    emails: number;
    chatbot: number;
    agent_chat: number;
    analytics: number;
    seo: number;
    reviews: number;
    infra: number;
    total: number;
  };
  margin_abs: number;      // revenue - cogs
  margin_pct: number;      // 0..1
  status: 'healthy' | 'warn' | 'blocked';
};

function monthStartISO(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

/**
 * Compute a client's live margin based on this-month logs in agent_logs.
 * This is an ESTIMATE — actual API costs come from provider invoices at
 * month-end. Used for live UI + safety blocks, not accounting.
 */
export async function computeClientMargin(userId: string): Promise<MarginSnapshot> {
  const sb = admin();
  const since = monthStartISO();

  const { data: profile } = await sb
    .from('profiles')
    .select('subscription_plan, is_admin')
    .eq('id', userId)
    .single();

  const plan = profile?.is_admin ? 'admin' : (profile?.subscription_plan || 'free');
  const revenueHT = PLAN_REVENUE_HT[plan] ?? 0;

  // Pull all usage events for this user this month in a single query.
  const { data: logs } = await sb
    .from('agent_logs')
    .select('action, data, created_at')
    .contains('data', { user_id: userId })
    .gte('created_at', since);

  const rows = logs ?? [];
  let imgCount = 0;
  let videoSec = 0;
  let ttsSec = 0;
  let dmCount = 0;
  let emailCount = 0;
  let chatbotCount = 0;
  let agentChatCount = 0;
  let analyticsCount = 0;
  let seoCount = 0;
  let reviewCount = 0;

  for (const r of rows) {
    switch (r.action) {
      case 'image_generated':
        imgCount++;
        break;
      case 'video_generated':
        videoSec += r.data?.duration || 5;
        break;
      case 'tts_generated':
        ttsSec += r.data?.seconds || 0;
        break;
      case 'dm_sent':
        dmCount++;
        break;
      case 'email_sent':
        emailCount++;
        break;
      case 'chatbot_session':
        chatbotCount++;
        break;
      case 'chat': // agent chat
        agentChatCount++;
        break;
      case 'report':
      case 'analytics':
        analyticsCount++;
        break;
      case 'seo_article':
        seoCount++;
        break;
      case 'review_reply':
        reviewCount++;
        break;
    }
  }

  const cogs = {
    images: imgCount * OP_COST_EUR.image_generated,
    videos: videoSec * OP_COST_EUR.video_per_second,
    tts: ttsSec * OP_COST_EUR.tts_per_second,
    dms: dmCount * OP_COST_EUR.dm_sent,
    emails: emailCount * OP_COST_EUR.email_sent,
    chatbot: chatbotCount * OP_COST_EUR.chatbot_session,
    agent_chat: agentChatCount * OP_COST_EUR.agent_chat,
    analytics: analyticsCount * OP_COST_EUR.analytics_report,
    seo: seoCount * OP_COST_EUR.seo_article,
    reviews: reviewCount * OP_COST_EUR.review_reply,
    infra: INFRA_PER_CLIENT_EUR,
    total: 0,
  };
  cogs.total = cogs.images + cogs.videos + cogs.tts + cogs.dms + cogs.emails
    + cogs.chatbot + cogs.agent_chat + cogs.analytics + cogs.seo + cogs.reviews + cogs.infra;

  const margin_abs = revenueHT - cogs.total;
  const margin_pct = revenueHT > 0 ? margin_abs / revenueHT : 1;

  const status: MarginSnapshot['status'] = plan === 'admin' || plan === 'free'
    ? 'healthy'
    : margin_pct < MARGIN_BLOCK_THRESHOLD
      ? 'blocked'
      : margin_pct < MARGIN_WARN_THRESHOLD
        ? 'warn'
        : 'healthy';

  return {
    userId,
    plan,
    revenueHT,
    cogs,
    margin_abs,
    margin_pct,
    status,
  };
}

/**
 * Gate function called by generation endpoints right before firing a paid
 * provider call. Returns `blocked=true` when this client's running COGS
 * would push margin below MARGIN_BLOCK_THRESHOLD. Admins and free-plan
 * users bypass (free plan has its own limits, admin is internal).
 */
export async function isMarginSafe(userId: string): Promise<{
  safe: boolean;
  snapshot: MarginSnapshot;
  message?: string;
}> {
  const snap = await computeClientMargin(userId);
  if (snap.status === 'blocked') {
    return {
      safe: false,
      snapshot: snap,
      message: `Protection marge: tes coûts ce mois (€${snap.cogs.total.toFixed(2)}) dépassent 40% de ton abonnement (€${snap.revenueHT}). Contacte le support ou passe au plan supérieur.`,
    };
  }
  return { safe: true, snapshot: snap };
}

/**
 * Aggregate margin snapshot across all paying clients — used by the admin
 * dashboard to show the live margin table + red/yellow/green flags.
 */
export async function listAllClientMargins(): Promise<MarginSnapshot[]> {
  const sb = admin();
  const { data } = await sb
    .from('profiles')
    .select('id, subscription_plan')
    .not('subscription_plan', 'is', null)
    .neq('subscription_plan', 'free');

  if (!data || data.length === 0) return [];
  // Compute margins in parallel but cap concurrency to avoid hammering PG.
  const out: MarginSnapshot[] = [];
  const concurrency = 10;
  for (let i = 0; i < data.length; i += concurrency) {
    const slice = data.slice(i, i + concurrency);
    const results = await Promise.all(slice.map(r => computeClientMargin(r.id)));
    out.push(...results);
  }
  return out.sort((a, b) => a.margin_pct - b.margin_pct); // worst first
}
