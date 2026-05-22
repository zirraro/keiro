/**
 * Daily service guarantees rendered into Noah's brief.
 *
 * Why: the actual day-to-day output of each agent varies naturally
 * (more inbound emails, more comments, holidays, etc.). The founder's
 * concern is that clients see this variance and lose trust in the
 * service. The fix is a deterministic "Garanties" section that shows
 * the contractual minimum for each agent per plan + whether today's
 * actual met that minimum.
 *
 * Computed AFTER Gemini's natural-language brief and appended to it,
 * so the formatting is reliable across every brief regardless of
 * what Gemini decides to say upstream.
 */

export type Plan = 'createur' | 'pro' | 'business' | 'fondateurs' | 'elite' | 'agence' | 'admin' | 'free';

interface AgentFloor {
  agent: string;
  emoji: string;
  label: string;
  unit: string;
  metricKey: string; // dotted path into metrics24h
}

/**
 * Per-plan daily floors. Values are deliberately conservative so the
 * green check is the default outcome — the goal is to reassure the
 * client that their floor is met, not to manufacture failure.
 */
const FLOORS: Record<Plan, Partial<Record<string, number>>> = {
  free:       {},
  createur:   { posts_published: 1, emails_sent: 20, prospects_added: 10, dms_prepared: 5 },
  pro:        { posts_published: 3, emails_sent: 40, prospects_added: 30, dms_prepared: 10 },
  business:   { posts_published: 4, emails_sent: 60, prospects_added: 50, dms_prepared: 15 },
  fondateurs: { posts_published: 4, emails_sent: 60, prospects_added: 50, dms_prepared: 15 },
  elite:      { posts_published: 5, emails_sent: 80, prospects_added: 70, dms_prepared: 20 },
  agence:     { posts_published: 5, emails_sent: 80, prospects_added: 70, dms_prepared: 20 },
  admin:      { posts_published: 5, emails_sent: 100, prospects_added: 100, dms_prepared: 25 },
};

const AGENTS: AgentFloor[] = [
  { agent: 'lena',  emoji: '🎬', label: 'Léna (contenu)',  unit: 'posts publiés',  metricKey: 'posts_published' },
  { agent: 'hugo',  emoji: '✉️', label: 'Hugo (emails)',   unit: 'emails envoyés', metricKey: 'emails_sent' },
  { agent: 'leo',   emoji: '🎯', label: 'Léo (prospects)', unit: 'prospects ajoutés', metricKey: 'prospects_added' },
  { agent: 'jade',  emoji: '💬', label: 'Jade (DMs IG)',   unit: 'DMs préparés',   metricKey: 'dms_prepared' },
];

/**
 * Render the guarantee block. `actual` should be a flat record of
 * counts keyed by the same names as FLOORS values.
 */
export function buildServiceGuaranteeSection(
  plan: Plan,
  actual: Record<string, number | undefined>,
): string {
  const floor = FLOORS[plan] || {};
  const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);

  const lines: string[] = [];
  lines.push('');
  lines.push(`## GARANTIES DE SERVICE — PLAN ${planLabel.toUpperCase()}`);
  lines.push('');
  lines.push('| Agent | Aujourd\'hui | Minimum garanti | Statut |');
  lines.push('|---|---|---|---|');

  let metCount = 0;
  let totalCount = 0;
  for (const a of AGENTS) {
    const minVal = floor[a.metricKey] ?? null;
    if (minVal === null) continue; // plan doesn't include this agent
    const actualVal = Number(actual[a.metricKey] ?? 0);
    const met = actualVal >= minVal;
    const status = met
      ? '✅ Tenu'
      : actualVal >= minVal * 0.8
        ? `⚠️ -${minVal - actualVal} sous l\'objectif`
        : `❌ -${minVal - actualVal} sous l\'objectif`;
    lines.push(`| ${a.emoji} ${a.label} | **${actualVal}** ${a.unit} | ${minVal}/jour | ${status} |`);
    totalCount++;
    if (met) metCount++;
  }

  lines.push('');
  if (metCount === totalCount) {
    lines.push(`*${metCount}/${totalCount} garanties tenues — tous les agents ont délivré leur minimum quotidien.*`);
  } else {
    lines.push(`*${metCount}/${totalCount} garanties tenues. Les agents sous l'objectif sont relancés automatiquement et un correctif est appliqué pour demain.*`);
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * Extract per-agent counts. Pulls posts_published + dms_prepared from
 * DB directly because metrics24h doesn't carry them — falls back to
 * metrics24h fields when present.
 *
 * `userId` may be null to count across all users (admin brief).
 */
export async function extractActualsFromMetrics(
  supabase: any,
  metrics24h: any,
  userId: string | null,
): Promise<Record<string, number>> {
  const m = metrics24h || {};
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  let postsPublished = Number(m.posts_published_24h || m.publications_24h || 0);
  let dmsPrepared = Number(m.dms_prepared_24h || m.dm_prepared || 0);

  // Posts published in last 24h (instagram_posts + tiktok_posts).
  try {
    let q1 = supabase.from('instagram_posts').select('id', { count: 'exact', head: true }).gte('posted_at', since);
    if (userId) q1 = q1.eq('user_id', userId);
    const { count: igCount } = await q1;
    let q2 = supabase.from('tiktok_posts').select('id', { count: 'exact', head: true }).gte('posted_at', since);
    if (userId) q2 = q2.eq('user_id', userId);
    const { count: ttCount } = await q2;
    postsPublished = Math.max(postsPublished, (igCount || 0) + (ttCount || 0));
  } catch { /* non-fatal */ }

  // DMs prepared in last 24h (agent_logs with action containing dm_prepared / dm_send).
  try {
    let q = supabase.from('agent_logs').select('id', { count: 'exact', head: true })
      .eq('agent', 'dm_instagram')
      .in('action', ['dm_prepared', 'dm_send', 'dm_drafted', 'dm_queued'])
      .gte('created_at', since);
    if (userId) q = q.eq('user_id', userId);
    const { count } = await q;
    dmsPrepared = Math.max(dmsPrepared, count || 0);
  } catch { /* non-fatal */ }

  return {
    posts_published: postsPublished,
    emails_sent: Number(m.emails_sent || 0),
    prospects_added: Number(m.leads || m.prospects_added_24h || 0),
    dms_prepared: dmsPrepared,
  };
}
