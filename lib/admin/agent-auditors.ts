/**
 * Agent-specific supervision auditors.
 *
 * An audit is an ACTIVE drill — distinct from the passive anomaly
 * detector (which fires alerts off thresholds). An audit captures a
 * full snapshot of state for one (agent, user_id) pair and runs a set
 * of supervisor-grade checks tailored to the agent's job.
 *
 * Output : findings (each with severity + evidence + suggested fix)
 * + a single severity (max of finding severities) + a metrics snapshot.
 *
 * The admin reviews the audit, picks resolutions :
 *   - mutualise_to_knowledge  → write to agent_knowledge so the fix
 *                               propagates to all clients sharing the
 *                               same business_type / pattern
 *   - manual_fix              → admin makes the change, audit closed
 *   - auto_fix                → audit triggers a registered auto-fix
 *                               handler (e.g. reset_token, restart_cron)
 *   - no_action_needed        → false positive, archive
 *
 * Every audit row stays in agent_audits forever — it's the supervision
 * memory. "X happened to client Y in March, was mutualised, never
 * happened again" is exactly the trail the founder asked for.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type Severity = 'green' | 'amber' | 'red';

export interface Finding {
  code: string;            // machine-readable, stable: 'cadence_violation', 'success_drop_7d'
  severity: Severity;
  title: string;           // human-readable, one sentence
  detail: string;          // 1-2 lines of context
  evidence?: Record<string, any>; // numbers backing the finding
  suggested_fix?: string;  // one-line recommendation
  mutualisable: boolean;   // can this be promoted to agent_knowledge?
}

export interface Recommendation {
  kind: 'mutualise_to_knowledge' | 'manual_fix' | 'auto_fix' | 'no_action';
  label: string;
  detail: string;
  knowledge_payload?: { summary: string; content: string; business_type?: string; category: string };
}

export interface AuditResult {
  severity: Severity;     // overall = max of findings
  findings: Finding[];
  recommendations: Recommendation[];
  metrics: Record<string, any>; // snapshot of KPIs at audit time
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

const maxSeverity = (sevs: Severity[]): Severity => {
  if (sevs.includes('red')) return 'red';
  if (sevs.includes('amber')) return 'amber';
  return 'green';
};

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600 * 1000).toISOString();
const daysAgo = (d: number) => hoursAgo(d * 24);

async function fetchAgentLogs(
  supabase: SupabaseClient,
  agent: string,
  userId: string,
  sinceIso: string,
  limit = 500,
): Promise<any[]> {
  const { data } = await supabase
    .from('agent_logs')
    .select('id, action, status, duration_ms, data, error_message, created_at')
    .eq('agent', agent)
    .eq('user_id', userId)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}

// Stable error fingerprint that strips uuids/numbers/urls so different
// instances of the same problem aggregate together.
function fingerprintError(action: string, raw: string): string {
  let s = (raw || '').toLowerCase();
  s = s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<uuid>');
  s = s.replace(/\b\d{4,}\b/g, '<n>');
  s = s.replace(/https?:\/\/\S+/g, '<url>');
  return `${action}::${s.substring(0, 160)}`;
}

// ────────────────────────────────────────────────────────────
// Generic checks (apply to every agent)
// ────────────────────────────────────────────────────────────

async function runGenericChecks(
  supabase: SupabaseClient,
  agent: string,
  userId: string,
  client: any,
): Promise<{ findings: Finding[]; metrics: Record<string, any> }> {
  const logs7 = await fetchAgentLogs(supabase, agent, userId, daysAgo(7));
  const logs30 = await fetchAgentLogs(supabase, agent, userId, daysAgo(30));

  const ok7 = logs7.filter(l => l.status === 'success' || l.status === 'ok').length;
  const err7 = logs7.filter(l => l.status === 'error' || l.status === 'failed').length;
  const ok30 = logs30.filter(l => l.status === 'success' || l.status === 'ok').length;
  const err30 = logs30.filter(l => l.status === 'error' || l.status === 'failed').length;

  const successRate7 = logs7.length ? Math.round((ok7 / logs7.length) * 100) : null;
  const successRate30 = logs30.length ? Math.round((ok30 / logs30.length) * 100) : null;

  // Latency
  const durations = logs7.map(l => l.duration_ms).filter((d: any): d is number => typeof d === 'number');
  const avgMs = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;
  const p95Ms = durations.length ? durations.sort((a, b) => a - b)[Math.floor(durations.length * 0.95)] : null;

  // Recurring errors (≥3x same fingerprint in 7d)
  const errBuckets = new Map<string, { count: number; sample: string; action: string }>();
  for (const l of logs7) {
    if (l.status !== 'error' && l.status !== 'failed') continue;
    const raw = l.error_message || l.data?.error || '';
    if (!raw) continue;
    const fp = fingerprintError(l.action || '_', raw);
    const cur = errBuckets.get(fp);
    if (cur) cur.count += 1;
    else errBuckets.set(fp, { count: 1, sample: raw.substring(0, 240), action: l.action || '_' });
  }
  const recurring = [...errBuckets.values()].filter(b => b.count >= 3);

  // Recency
  const lastRun = logs30[0]?.created_at || null;
  const hoursSinceRun = lastRun ? (Date.now() - new Date(lastRun).getTime()) / 3600000 : null;

  // Anomalies in flight (anomaly_alerts has no `status` column — open = no resolved_at)
  const { data: anomalies } = await supabase
    .from('anomaly_alerts')
    .select('id, severity, kind, title')
    .eq('agent', agent)
    .eq('user_id', userId)
    .is('resolved_at', null);

  const findings: Finding[] = [];

  // → Success drop
  if (successRate7 !== null && successRate7 < 70) {
    findings.push({
      code: 'success_rate_low_7d',
      severity: successRate7 < 50 ? 'red' : 'amber',
      title: `Taux de succès faible sur 7j : ${successRate7}%`,
      detail: `${err7} erreur(s) sur ${logs7.length} exécution(s). Tendance à surveiller.`,
      evidence: { successRate7, ok7, err7, totalRuns7: logs7.length, successRate30 },
      suggested_fix: 'Vérifier les erreurs récurrentes ci-dessous + tokens/quota.',
      mutualisable: false,
    });
  }

  // → Recurring same-fingerprint errors
  for (const r of recurring) {
    findings.push({
      code: 'recurring_error',
      severity: r.count >= 10 ? 'red' : 'amber',
      title: `Erreur récurrente : ${r.action} (×${r.count} sur 7j)`,
      detail: r.sample,
      evidence: { count: r.count, action: r.action, sample: r.sample },
      suggested_fix: 'Mutualiser cette résolution dans le pool de connaissance.',
      mutualisable: true,
    });
  }

  // → Inactivity
  if (hoursSinceRun !== null && hoursSinceRun > 72) {
    findings.push({
      code: 'inactivity_72h',
      severity: hoursSinceRun > 168 ? 'red' : 'amber',
      title: `Agent inactif depuis ${Math.round(hoursSinceRun / 24)} jour(s)`,
      detail: `Dernier run : ${lastRun}. Vérifier scheduling + budget plan.`,
      evidence: { hoursSinceRun, lastRun },
      suggested_fix: 'Trigger manual run pour reconstruire la cadence.',
      mutualisable: false,
    });
  }

  // → Latency anomaly
  if (p95Ms && p95Ms > 120000) {
    findings.push({
      code: 'latency_p95_high',
      severity: p95Ms > 240000 ? 'red' : 'amber',
      title: `P95 latence ${Math.round(p95Ms / 1000)}s — anormalement haute`,
      detail: 'Plusieurs runs prennent > 2 min. Probable timeout API externe.',
      evidence: { p95Ms, avgMs },
      suggested_fix: 'Vérifier la santé des APIs amont (Gemini, Meta, Stripe).',
      mutualisable: true,
    });
  }

  // → Active anomalies (replicated for visibility)
  for (const a of anomalies || []) {
    findings.push({
      code: `open_anomaly_${a.kind}`,
      severity: a.severity === 'P0' ? 'red' : a.severity === 'P1' ? 'amber' : 'green',
      title: `Anomalie ouverte : ${a.title}`,
      detail: `kind=${a.kind}, sev=${a.severity}`,
      evidence: { anomaly_id: a.id, kind: a.kind, severity: a.severity },
      suggested_fix: 'Voir l\'onglet Anomalies pour le détail.',
      mutualisable: false,
    });
  }

  return {
    findings,
    metrics: {
      runs_7d: logs7.length,
      runs_30d: logs30.length,
      errors_7d: err7,
      errors_30d: err30,
      success_rate_7d: successRate7,
      success_rate_30d: successRate30,
      avg_latency_ms: avgMs,
      p95_latency_ms: p95Ms,
      last_run_at: lastRun,
      hours_since_last_run: hoursSinceRun,
      active_anomalies: (anomalies || []).length,
      recurring_error_fingerprints: recurring.length,
    },
  };
}

// ────────────────────────────────────────────────────────────
// Agent-specific deep checks
// ────────────────────────────────────────────────────────────

async function auditContent(supabase: SupabaseClient, userId: string, client: any, generic: any): Promise<{ findings: Finding[]; metrics: Record<string, any> }> {
  const findings: Finding[] = [];
  const metrics: Record<string, any> = {};

  // Format mix vs sector (Léna quality bar)
  const { data: posts30 } = await supabase
    .from('content_calendar')
    .select('format, status, published_at, source, parent_post_id, visual_url')
    .eq('user_id', userId)
    .gte('created_at', daysAgo(30));

  const totalPosts = posts30?.length || 0;
  const published = (posts30 || []).filter((p: any) => p.status === 'published');
  const reels = published.filter((p: any) => p.format === 'reel' || p.format === 'video');
  const carrousels = published.filter((p: any) => p.format === 'carrousel');
  const stories = published.filter((p: any) => p.format === 'story');
  const photos = published.filter((p: any) => p.format === 'post' || p.format === 'image');
  const failed = (posts30 || []).filter((p: any) => p.status === 'publish_failed').length;

  metrics.posts_total_30d = totalPosts;
  metrics.posts_published_30d = published.length;
  metrics.posts_failed_30d = failed;
  metrics.format_reels = reels.length;
  metrics.format_carrousels = carrousels.length;
  metrics.format_stories = stories.length;
  metrics.format_photos = photos.length;

  // Story cadence — at least 1 every 48h ideal
  const lastStory = stories.sort((a: any, b: any) => (b.published_at || '').localeCompare(a.published_at || ''))[0];
  const hoursSinceStory = lastStory?.published_at
    ? (Date.now() - new Date(lastStory.published_at).getTime()) / 3600000
    : Infinity;
  metrics.hours_since_last_story = isFinite(hoursSinceStory) ? Math.round(hoursSinceStory) : null;
  if (published.length > 0 && (hoursSinceStory > 72 || stories.length === 0)) {
    findings.push({
      code: 'story_silence',
      severity: stories.length === 0 ? 'amber' : (hoursSinceStory > 168 ? 'red' : 'amber'),
      title: stories.length === 0 ? 'Aucune story publiée sur 30j' : `Silence story depuis ${Math.round(hoursSinceStory / 24)}j`,
      detail: 'La stratégie story (teaser + recycle library) doit alimenter le slot story chaque 24-48h.',
      evidence: { stories_count: stories.length, hours_since_last_story: hoursSinceStory },
      suggested_fix: 'Vérifier le cron story-library-recycle + le post-publish teaser.',
      mutualisable: true,
    });
  }

  // Asset reuse rate
  const visualUrls = published.map((p: any) => p.visual_url).filter(Boolean);
  const uniqueVisuals = new Set(visualUrls).size;
  const reuseRate = visualUrls.length > 0 ? (1 - uniqueVisuals / visualUrls.length) * 100 : 0;
  metrics.asset_reuse_rate_pct = Math.round(reuseRate);
  if (reuseRate > 25 && published.length >= 10) {
    findings.push({
      code: 'asset_reuse_high',
      severity: reuseRate > 40 ? 'red' : 'amber',
      title: `Taux de réutilisation visuel ${Math.round(reuseRate)}% — feed monotone`,
      detail: 'Les mêmes visuels reviennent. Audit qualité Léna : recommande de varier la base.',
      evidence: { reuseRate, uniqueVisuals, totalVisuals: visualUrls.length },
      suggested_fix: 'Forcer Léna à puiser dans des i2i bases différentes (cron next batch).',
      mutualisable: true,
    });
  }

  // Failure rate at publish
  const publishFailRate = totalPosts > 0 ? (failed / totalPosts) * 100 : 0;
  metrics.publish_fail_rate_pct = Math.round(publishFailRate);
  if (failed >= 3 && publishFailRate > 15) {
    findings.push({
      code: 'publish_fail_rate_high',
      severity: publishFailRate > 30 ? 'red' : 'amber',
      title: `${failed} échec(s) de publication sur 30j (${Math.round(publishFailRate)}%)`,
      detail: 'Plusieurs publications n\'ont pas abouti. Vérifier les tokens IG/TT + les visuels.',
      evidence: { failed, total: totalPosts, rate: publishFailRate },
      suggested_fix: 'Inspecter publish_diagnostic dans content_calendar.',
      mutualisable: true,
    });
  }

  // Feed balance — reels >= 30% of published
  if (published.length >= 10) {
    const reelRate = (reels.length / published.length) * 100;
    metrics.reel_share_pct = Math.round(reelRate);
    if (reelRate < 20) {
      findings.push({
        code: 'reel_share_low',
        severity: 'amber',
        title: `Reels = ${Math.round(reelRate)}% du feed — sous le seuil 30%`,
        detail: 'L\'algo IG/TT favorise les reels. Augmenter la part.',
        evidence: { reelRate, target: 30 },
        suggested_fix: 'Ajuster la format mix dans le sector playbook.',
        mutualisable: true,
      });
    }
  }

  return { findings, metrics };
}

async function auditDmInstagram(supabase: SupabaseClient, userId: string, client: any): Promise<{ findings: Finding[]; metrics: Record<string, any> }> {
  const findings: Finding[] = [];
  const metrics: Record<string, any> = {};

  // DM funnel
  const { count: convsTotal } = await supabase.from('instagram_conversations').select('id', { count: 'exact', head: true }).eq('user_id', userId);
  const { count: convsReplied7 } = await supabase.from('instagram_conversations').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('last_outbound_at', daysAgo(7));
  metrics.conversations_total = convsTotal || 0;
  metrics.conversations_replied_7d = convsReplied7 || 0;

  // 24h window compliance — sends with messaging_type=MESSAGE_TAG should be flagged
  const { data: outsideWindow } = await supabase
    .from('instagram_messages')
    .select('id, status, created_at')
    .eq('user_id', userId)
    .eq('messaging_type', 'MESSAGE_TAG')
    .gte('created_at', daysAgo(7));
  const tagsUsed = (outsideWindow || []).length;
  metrics.message_tag_sends_7d = tagsUsed;
  if (tagsUsed > 5) {
    findings.push({
      code: 'human_agent_overuse',
      severity: tagsUsed > 20 ? 'red' : 'amber',
      title: `${tagsUsed} send(s) hors-24h en mode Human Agent`,
      detail: 'Volume élevé d\'envois hors fenêtre — risque Meta rate-limit.',
      evidence: { tagsUsed },
      suggested_fix: 'Inciter à répondre dans les 24h, ou ralentir la cadence.',
      mutualisable: true,
    });
  }

  // Auto-mode toggle history — was auto OFF for long stretches?
  const { data: aiToggles } = await supabase
    .from('instagram_conversation_state')
    .select('user_id, ai_active, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(20);
  const inactiveConvs = (aiToggles || []).filter((t: any) => t.ai_active === false).length;
  metrics.conversations_with_ai_off = inactiveConvs;
  if (inactiveConvs > (convsTotal || 0) * 0.5 && (convsTotal || 0) >= 4) {
    findings.push({
      code: 'ai_off_too_many_convs',
      severity: 'amber',
      title: `IA désactivée sur ${inactiveConvs} conversations`,
      detail: 'Beaucoup de prises en main humaines — soit le client préfère manuel, soit Jade rate des replies.',
      evidence: { inactiveConvs, totalConvs: convsTotal },
      suggested_fix: 'Discuter avec le client : régler la qualité ou accepter le pattern.',
      mutualisable: false,
    });
  }

  return { findings, metrics };
}

async function auditEmail(supabase: SupabaseClient, userId: string, client: any): Promise<{ findings: Finding[]; metrics: Record<string, any> }> {
  const findings: Finding[] = [];
  const metrics: Record<string, any> = {};

  const { data: emails } = await supabase
    .from('email_sends')
    .select('id, status, opened_at, replied_at, bounced_at, created_at')
    .eq('user_id', userId)
    .gte('created_at', daysAgo(30));

  const total = emails?.length || 0;
  const opened = (emails || []).filter((e: any) => e.opened_at).length;
  const replied = (emails || []).filter((e: any) => e.replied_at).length;
  const bounced = (emails || []).filter((e: any) => e.bounced_at).length;
  metrics.emails_sent_30d = total;
  metrics.open_rate_pct = total ? Math.round((opened / total) * 100) : null;
  metrics.reply_rate_pct = total ? Math.round((replied / total) * 100) : null;
  metrics.bounce_rate_pct = total ? Math.round((bounced / total) * 100) : null;

  if (total >= 20) {
    const openRate = (opened / total) * 100;
    if (openRate < 10) {
      findings.push({
        code: 'open_rate_low',
        severity: openRate < 5 ? 'red' : 'amber',
        title: `Open rate ${Math.round(openRate)}% — sous le seuil 10%`,
        detail: 'Probable problème de réputation domaine ou de sujet d\'email.',
        evidence: { openRate, opened, total },
        suggested_fix: 'Vérifier Brevo deliverability + revoir les sujets.',
        mutualisable: true,
      });
    }
    const bounceRate = (bounced / total) * 100;
    if (bounceRate > 5) {
      findings.push({
        code: 'bounce_rate_high',
        severity: bounceRate > 15 ? 'red' : 'amber',
        title: `Bounce rate ${Math.round(bounceRate)}% — qualité liste à revoir`,
        detail: 'Trop de hard-bounces dégrade la réputation du domaine.',
        evidence: { bounceRate, bounced, total },
        suggested_fix: 'Vérifier la source d\'enrichissement Léo et purger.',
        mutualisable: true,
      });
    }
  }

  return { findings, metrics };
}

async function auditCommercial(supabase: SupabaseClient, userId: string, client: any): Promise<{ findings: Finding[]; metrics: Record<string, any> }> {
  const findings: Finding[] = [];
  const metrics: Record<string, any> = {};

  const { data: prospects } = await supabase
    .from('crm_prospects')
    .select('id, source, email, phone, status, created_at')
    .eq('user_id', userId)
    .gte('created_at', daysAgo(30));

  const total = prospects?.length || 0;
  const withEmail = (prospects || []).filter((p: any) => p.email && p.email.includes('@')).length;
  const withPhone = (prospects || []).filter((p: any) => p.phone && p.phone.length > 5).length;

  metrics.prospects_added_30d = total;
  metrics.with_email_pct = total ? Math.round((withEmail / total) * 100) : null;
  metrics.with_phone_pct = total ? Math.round((withPhone / total) * 100) : null;

  if (total >= 20) {
    const enrichRate = (withEmail / total) * 100;
    if (enrichRate < 40) {
      findings.push({
        code: 'enrichment_rate_low',
        severity: enrichRate < 20 ? 'red' : 'amber',
        title: `Enrichissement email ${Math.round(enrichRate)}% — sous le seuil 40%`,
        detail: 'Beaucoup de prospects sans email = pipeline Hugo bloqué en aval.',
        evidence: { enrichRate, withEmail, total },
        suggested_fix: 'Vérifier les sources Léo + activer l\'enrichissement deep.',
        mutualisable: true,
      });
    }
  }

  // Source distribution
  const bySource: Record<string, number> = {};
  for (const p of prospects || []) bySource[p.source || 'unknown'] = (bySource[p.source || 'unknown'] || 0) + 1;
  metrics.source_distribution = bySource;

  return { findings, metrics };
}

async function auditGeneric(supabase: SupabaseClient, agent: string, userId: string): Promise<{ findings: Finding[]; metrics: Record<string, any> }> {
  return { findings: [], metrics: {} };
}

const AGENT_AUDITORS: Record<string, (supabase: SupabaseClient, userId: string, client: any, generic: any) => Promise<{ findings: Finding[]; metrics: Record<string, any> }>> = {
  content: auditContent,
  dm_instagram: auditDmInstagram,
  email: auditEmail,
  commercial: auditCommercial,
};

// ────────────────────────────────────────────────────────────
// Public entry point
// ────────────────────────────────────────────────────────────

export async function runAgentAudit(
  supabase: SupabaseClient,
  agent: string,
  userId: string,
): Promise<AuditResult> {
  // Fetch client snapshot
  const { data: client } = await supabase
    .from('profiles')
    .select('id, email, subscription_plan, business_type, city, scheduling_paused_at, instagram_business_account_id, tiktok_open_id, managed_email_from')
    .eq('id', userId)
    .maybeSingle();

  const generic = await runGenericChecks(supabase, agent, userId, client);
  const specific = AGENT_AUDITORS[agent]
    ? await AGENT_AUDITORS[agent](supabase, userId, client, generic)
    : await auditGeneric(supabase, agent, userId);

  const allFindings = [...generic.findings, ...specific.findings];
  const severity = maxSeverity(allFindings.map(f => f.severity));

  // Build recommendations from findings
  const recommendations: Recommendation[] = [];
  const mutualisable = allFindings.filter(f => f.mutualisable && f.severity !== 'green');
  if (mutualisable.length > 0) {
    recommendations.push({
      kind: 'mutualise_to_knowledge',
      label: `Mutualiser ${mutualisable.length} pattern(s) dans le pool`,
      detail: 'Sauvegarde la résolution dans agent_knowledge pour que les autres clients en bénéficient.',
      knowledge_payload: {
        category: 'error_pattern',
        business_type: client?.business_type || undefined,
        summary: mutualisable[0].title,
        content: mutualisable.map(m => `${m.code}: ${m.detail}${m.suggested_fix ? ' → ' + m.suggested_fix : ''}`).join('\n\n'),
      },
    });
  }
  if (allFindings.some(f => f.code === 'inactivity_72h')) {
    recommendations.push({
      kind: 'auto_fix',
      label: 'Trigger run immédiat',
      detail: 'Lance l\'agent maintenant pour relancer la cadence.',
    });
  }
  if (severity === 'green' && allFindings.length === 0) {
    recommendations.push({
      kind: 'no_action',
      label: 'Aucune action requise',
      detail: 'Agent en bonne santé sur cet client.',
    });
  } else if (recommendations.length === 0) {
    recommendations.push({
      kind: 'manual_fix',
      label: 'Investigation manuelle requise',
      detail: 'Les findings nécessitent une vérification cas par cas.',
    });
  }

  return {
    severity,
    findings: allFindings,
    recommendations,
    metrics: { ...generic.metrics, ...specific.metrics, client_plan: client?.subscription_plan, business_type: client?.business_type },
  };
}
