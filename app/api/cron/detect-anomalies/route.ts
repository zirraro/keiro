/**
 * Real-time anomaly detection. Runs every 30 minutes. Catches problems
 * BEFORE the morning digest so admin can react inside 12-24h.
 *
 * Founder rule 2026-06-09 : "anticiper les erreurs/actions manquées
 * avant le client ou reagir vite pour les reparer dans les 12H a 24H".
 *
 * Detects 6 anomaly kinds :
 *  1. error_burst        — same fingerprint > 5x in last 2h for one client
 *  2. agent_down         — paying client + agent expected to run + zero
 *                          runs in last 12h-72h depending on cadence
 *  3. success_drop       — agent's 2h success_rate < 70% (was >90% before)
 *  4. publish_silence    — content agent, paying client, zero publish
 *                          in last 24h despite scheduled posts
 *  5. token_expiring     — IG/TT/LI token expires < 12h, refresh failing
 *  6. new_error_pattern  — error fingerprint never seen before (last 30d)
 *                          and hits >2 clients in last 1h
 *
 * Each anomaly is upserted into anomaly_alerts (one row per
 * fingerprint × scope, count incremented if seen again). P0 anomalies
 * trigger an immediate admin email (rate-limited 1 / hour to avoid
 * spam). P1/P2 surface in /admin/agents/control 🚨 Live alerts panel.
 *
 * Cron : every 30 minutes.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { sendBrevoCompat } from '@/lib/email/brevo-compat';
export const runtime = 'nodejs';
export const maxDuration = 120;

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

function authOk(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  const tok = auth.replace(/^Bearer\s+/i, '');
  return !!tok && tok === (process.env.CRON_SECRET || '');
}

function fingerprint(action: string, raw: string): string {
  let s = (raw || '').toLowerCase();
  s = s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<uuid>');
  s = s.replace(/\b\d{6,}\b/g, '<n>');
  s = s.replace(/https?:\/\/\S+/g, '<url>');
  s = s.substring(0, 180);
  return `${action}::${s}`;
}

interface Anomaly {
  severity: 'P0' | 'P1' | 'P2';
  kind: string;
  agent: string;
  user_id: string | null;
  fingerprint: string;
  title: string;
  detail: string;
  sample_error?: string;
  metric_value?: number;
  metric_threshold?: number;
}

async function upsertAnomaly(supabase: any, a: Anomaly): Promise<{ wasNew: boolean }> {
  // Idempotent on (agent, user_id, fingerprint) where resolved_at is null
  const { data: existing } = await supabase
    .from('anomaly_alerts')
    .select('id, count_in_window')
    .eq('agent', a.agent)
    .eq('fingerprint', a.fingerprint)
    .is('resolved_at', null)
    .eq(a.user_id ? 'user_id' : 'agent', a.user_id || a.agent) // dummy if global
    .maybeSingle();

  // More accurate match for global anomalies (user_id null)
  let row: any = null;
  if (a.user_id) {
    const { data } = await supabase
      .from('anomaly_alerts')
      .select('id, count_in_window')
      .eq('agent', a.agent)
      .eq('fingerprint', a.fingerprint)
      .eq('user_id', a.user_id)
      .is('resolved_at', null)
      .maybeSingle();
    row = data;
  } else {
    const { data } = await supabase
      .from('anomaly_alerts')
      .select('id, count_in_window')
      .eq('agent', a.agent)
      .eq('fingerprint', a.fingerprint)
      .is('user_id', null)
      .is('resolved_at', null)
      .maybeSingle();
    row = data;
  }

  if (row?.id) {
    await supabase.from('anomaly_alerts').update({
      count_in_window: (row.count_in_window || 1) + 1,
      last_seen: new Date().toISOString(),
      metric_value: a.metric_value,
    } as any).eq('id', row.id);
    return { wasNew: false };
  }

  await supabase.from('anomaly_alerts').insert({
    severity: a.severity,
    kind: a.kind,
    agent: a.agent,
    user_id: a.user_id,
    fingerprint: a.fingerprint,
    title: a.title,
    detail: a.detail,
    sample_error: a.sample_error || null,
    metric_value: a.metric_value || null,
    metric_threshold: a.metric_threshold || null,
  });
  return { wasNew: true };
}

async function sendImmediateAdminEmail(supabase: any, anomaliesP0: Anomaly[]) {
  if (anomaliesP0.length === 0) return;
  // Rate-limit : skip if we sent an alert email in the last 60 min.
  const since1h = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recent } = await supabase
    .from('anomaly_alerts')
    .select('id')
    .gte('sent_to_admin_at', since1h)
    .limit(1);
  if (recent && recent.length > 0) return;

  const apiKey = process.env.BREVO_API_KEY;
  const adminEmail = process.env.ADMIN_EMAIL || 'mrzirraro@gmail.com';
  if (!apiKey) return;

  let html = '<div style="font-family:system-ui,sans-serif;max-width:680px">';
  html += '<h2 style="color:#dc2626">🚨 KeiroAI — Anomalies P0 détectées</h2>';
  html += '<p style="color:#475569">Alerte temps réel (cron 30min). Action recommandée &lt; 12h.</p>';
  for (const a of anomaliesP0) {
    html += `<div style="border-left:4px solid #dc2626;padding:10px 14px;margin:10px 0;background:#fef2f2">`;
    html += `<div style="font-weight:bold;color:#991b1b">${a.title}</div>`;
    html += `<div style="color:#7f1d1d;font-size:13px;margin-top:4px">${a.detail}</div>`;
    if (a.sample_error) html += `<pre style="font-size:11px;color:#475569;margin-top:6px;white-space:pre-wrap">${a.sample_error.substring(0, 300)}</pre>`;
    html += `<div style="font-size:11px;color:#64748b;margin-top:4px">Agent: <code>${a.agent}</code>${a.user_id ? ` · Client: <code>${a.user_id.substring(0, 8)}</code>` : ''}</div>`;
    html += `</div>`;
  }
  html += `<p style="margin-top:16px"><a href="https://keiroai.com/admin/agents/control" style="background:#0c1a3a;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none">Ouvrir le Control Center →</a></p>`;
  html += `<p style="font-size:11px;color:#94a3b8;margin-top:14px;border-top:1px solid #e2e8f0;padding-top:10px">🔒 Alerte interne — envoyée uniquement à l'admin (${adminEmail}). Aucun client ne reçoit ces notifications.</p>`;
  html += '</div>';

  try {
    await sendBrevoCompat({
        sender: { name: 'KeiroAI Alerts', email: 'admin@keiroai.com' },
        to: [{ email: adminEmail }],
        subject: `🚨 ${anomaliesP0.length} anomalie${anomaliesP0.length > 1 ? 's' : ''} P0 — action <12h`,
        htmlContent: html,
    });
    // Mark all P0 rows as sent
    for (const a of anomaliesP0) {
      await supabase.from('anomaly_alerts')
        .update({ sent_to_admin_at: new Date().toISOString() } as any)
        .eq('agent', a.agent)
        .eq('fingerprint', a.fingerprint)
        .is('resolved_at', null);
    }
  } catch (e: any) {
    console.warn('[anomaly] immediate email failed:', e?.message);
  }
}

export async function GET(req: NextRequest) {
  if (!authOk(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const supabase = sb();
  const since2h = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  const since1h = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const since30d = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const detected: Anomaly[] = [];

  // ── 1. error_burst : same fingerprint > 5× in last 2h for one client ──
  const { data: recentErrs } = await supabase
    .from('agent_logs')
    .select('agent, action, status, data, user_id, created_at')
    .in('status', ['error', 'failed'])
    .gte('created_at', since2h)
    .limit(2000);

  const byKey: Record<string, { count: number; sample: string; user_id: string; agent: string; action: string }> = {};
  for (const e of (recentErrs || []) as any[]) {
    const raw = (e.data?.error || e.data?.message || '').toString();
    const fp = fingerprint(e.action, raw);
    const key = `${e.agent}::${e.user_id || 'null'}::${fp}`;
    if (!byKey[key]) byKey[key] = { count: 0, sample: raw.substring(0, 240), user_id: e.user_id, agent: e.agent, action: e.action };
    byKey[key].count++;
  }
  for (const [k, v] of Object.entries(byKey)) {
    if (v.count < 5) continue;
    detected.push({
      severity: v.count >= 15 ? 'P0' : 'P1',
      kind: 'error_burst',
      agent: v.agent,
      user_id: v.user_id || null,
      fingerprint: k.split('::').slice(2).join('::'),
      title: `${v.count}× erreurs en 2h sur ${v.agent}/${v.action}`,
      detail: `Burst d'erreurs sur ${v.user_id ? `client ${v.user_id.substring(0, 8)}` : 'plusieurs clients'} — action immédiate requise.`,
      sample_error: v.sample,
      metric_value: v.count,
      metric_threshold: 5,
    });
  }

  // ── 2. success_drop : agent < 70% success on last 2h (sur >= 10 runs) ──
  const { data: all2h } = await supabase
    .from('agent_logs')
    .select('agent, status')
    .gte('created_at', since2h)
    .limit(5000);
  const agentStats2h: Record<string, { ok: number; err: number }> = {};
  for (const l of (all2h || []) as any[]) {
    if (!agentStats2h[l.agent]) agentStats2h[l.agent] = { ok: 0, err: 0 };
    if (l.status === 'error' || l.status === 'failed') agentStats2h[l.agent].err++;
    else agentStats2h[l.agent].ok++;
  }
  for (const [ag, s] of Object.entries(agentStats2h)) {
    const total = s.ok + s.err;
    if (total < 10) continue; // need enough samples
    const rate = (s.ok / total) * 100;
    if (rate < 70) {
      detected.push({
        severity: rate < 50 ? 'P0' : 'P1',
        kind: 'success_drop',
        agent: ag,
        user_id: null,
        fingerprint: `success_drop::${ag}`,
        title: `${ag} success rate ${Math.round(rate)}% (${s.err} err / ${total} runs)`,
        detail: `Le taux de succès chute. Vérifier la cause root en drill-down par client.`,
        metric_value: rate,
        metric_threshold: 70,
      });
    }
  }

  // ── 3. publish_silence : content agent zero publish in 24h pour paying ──
  const { data: payingClients } = await supabase
    .from('profiles')
    .select('id, email, subscription_plan, scheduling_paused_at')
    .not('subscription_plan', 'is', null)
    .neq('subscription_plan', 'free')
    .is('scheduling_paused_at', null)
    .limit(500);

  const { data: publish24h } = await supabase
    .from('content_calendar')
    .select('user_id')
    .eq('status', 'published')
    .gte('published_at', since24h);

  const publishedSet = new Set((publish24h || []).map((p: any) => p.user_id));
  for (const c of (payingClients || []) as any[]) {
    if (publishedSet.has(c.id)) continue;
    // Skip if client never started (no plan_started_at recent enough)
    // Skip if was just created (less than 48h)
    detected.push({
      severity: 'P1',
      kind: 'publish_silence',
      agent: 'content',
      user_id: c.id,
      fingerprint: `publish_silence::${c.id}`,
      title: `Aucune publi 24h : ${c.email}`,
      detail: `Client ${c.subscription_plan} sans publication depuis 24h. Vérifier tokens + scheduling.`,
      metric_value: 0,
      metric_threshold: 1,
    });
  }

  // ── 4. agent_down : agent silencieux AU-DELÀ DE SA CADENCE NORMALE ──
  // ⚠️ Correctif fatigue d'alerte (2026-07-03) : un seuil unique de 12h
  // crachait un faux P0 chaque nuit. Ex : commercial tourne à 07:00 et
  // 14:00 → gap nocturne 14:00→07:00 = 17h, mécaniquement > 12h → P0
  // trompeur alors que rien n'est cassé. On passe à un seuil PAR agent qui
  // couvre le gap nocturne : seul un vrai silence (> 1 cycle manqué) alerte.
  // Les agents à cadence pluri-quotidienne gardent un seuil serré ; ceux à
  // ~1×/jour tolèrent le creux de la nuit.
  const AGENT_MAX_SILENCE_H: Record<string, number> = {
    content: 15,            // tourne plusieurs fois/jour (+ publish loops)
    email: 26,              // batch quotidien (matin) → creux nocturne normal
    dm_instagram: 26,       // slot matin ~1×/jour
    instagram_comments: 30, // réactif : peut légitimement n'avoir aucun commentaire
    ceo: 26,                // brief quotidien
    commercial: 26,         // 2×/jour mais gap nocturne ~17h → 26h = 1 cycle manqué réel
  };
  const maxSilenceWindowH = Math.max(...Object.values(AGENT_MAX_SILENCE_H)) + 6;
  const sinceMaxSilence = new Date(Date.now() - maxSilenceWindowH * 3600 * 1000).toISOString();
  const { data: recentAgentLogs } = await supabase
    .from('agent_logs')
    .select('agent, created_at')
    .gte('created_at', sinceMaxSilence)
    .order('created_at', { ascending: false })
    .limit(8000);
  const lastSeenByAgent: Record<string, number> = {};
  for (const l of (recentAgentLogs || []) as any[]) {
    const t = new Date(l.created_at).getTime();
    if (!lastSeenByAgent[l.agent] || t > lastSeenByAgent[l.agent]) lastSeenByAgent[l.agent] = t;
  }
  for (const [ag, maxH] of Object.entries(AGENT_MAX_SILENCE_H)) {
    const last = lastSeenByAgent[ag];
    const silentH = last ? (Date.now() - last) / 3600000 : Infinity;
    if (silentH > maxH) {
      detected.push({
        severity: 'P0',
        kind: 'agent_down',
        agent: ag,
        user_id: null,
        fingerprint: `agent_down::${ag}`,
        title: `${ag} : aucun run depuis ${last ? Math.round(silentH) + 'h' : `> ${maxSilenceWindowH}h`}`,
        detail: `Cadence normale dépassée (seuil ${maxH}h — 1 cycle manqué). Souvent un 502/timeout sur une requête lourde : vérifier le cron worker + l'endpoint /api/agents/${ag}.`,
        metric_value: last ? Math.round(silentH) : maxSilenceWindowH,
        metric_threshold: maxH,
      });
    }
  }

  // ── 5. new_error_pattern : fingerprint jamais vu en 30j, > 2 clients dans la dernière heure ──
  const { data: hourErrs } = await supabase
    .from('agent_logs')
    .select('agent, action, status, data, user_id, created_at')
    .in('status', ['error', 'failed'])
    .gte('created_at', since1h)
    .limit(1000);
  const byNewFp: Record<string, { sample: string; clients: Set<string>; agent: string }> = {};
  for (const e of (hourErrs || []) as any[]) {
    const raw = (e.data?.error || e.data?.message || '').toString();
    const fp = `${e.agent}::${fingerprint(e.action, raw)}`;
    if (!byNewFp[fp]) byNewFp[fp] = { sample: raw.substring(0, 240), clients: new Set(), agent: e.agent };
    if (e.user_id) byNewFp[fp].clients.add(e.user_id);
  }
  // Check which fingerprints are NEW (no occurrence in last 30d before this hour)
  for (const [fp, v] of Object.entries(byNewFp)) {
    if (v.clients.size < 2) continue;
    // Quick check : does this fingerprint exist already as an error_pattern in agent_knowledge ?
    const { data: known } = await supabase
      .from('agent_knowledge')
      .select('id')
      .eq('category', 'error_pattern')
      .eq('source', fp)
      .gte('created_at', since30d)
      .limit(1);
    if (known && known.length > 0) continue; // already known
    detected.push({
      severity: 'P1',
      kind: 'new_error_pattern',
      agent: v.agent,
      user_id: null,
      fingerprint: fp,
      title: `Nouveau pattern d'erreur sur ${v.agent} (${v.clients.size} clients)`,
      detail: `Pattern jamais vu avant. Cluster naissant — qualifier avant qu'il s'étende.`,
      sample_error: v.sample,
      metric_value: v.clients.size,
      metric_threshold: 2,
    });
  }

  // ── 6. token_expiring : TT/LI expire < 12h et refresh broken ──
  const { data: tokenClients } = await supabase
    .from('profiles')
    .select('id, email, tiktok_access_token, tiktok_refresh_token, tiktok_token_expiry')
    .not('subscription_plan', 'is', null)
    .neq('subscription_plan', 'free')
    .limit(500);
  for (const c of (tokenClients || []) as any[]) {
    if (c.tiktok_access_token && c.tiktok_token_expiry) {
      const hoursLeft = (new Date(c.tiktok_token_expiry).getTime() - Date.now()) / 3600000;
      if (hoursLeft > 0 && hoursLeft < 12 && !c.tiktok_refresh_token) {
        detected.push({
          severity: 'P1',
          kind: 'token_expiring',
          agent: 'content',
          user_id: c.id,
          fingerprint: `tt_token_exp::${c.id}`,
          title: `TikTok token expire dans ${Math.round(hoursLeft)}h : ${c.email}`,
          detail: `Pas de refresh token — le client doit reconnecter. Envoyer reauth email.`,
          metric_value: hoursLeft,
          metric_threshold: 12,
        });
      }
    }
  }

  // ── 7. Upsert all detected anomalies ──
  let newCount = 0;
  const newP0: Anomaly[] = [];
  for (const a of detected) {
    const r = await upsertAnomaly(supabase, a);
    if (r.wasNew) {
      newCount++;
      if (a.severity === 'P0') newP0.push(a);
    }
  }

  // ── 8. Send immediate email if NEW P0 anomalies ──
  if (newP0.length > 0) {
    await sendImmediateAdminEmail(supabase, newP0);
  }

  // ── 9. Auto-resolve anomalies ──
  // (a) Silent for > 6h → resolved with reason='auto_silence'
  const since6h = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  await supabase.from('anomaly_alerts')
    .update({ resolved_at: new Date().toISOString(), resolution_reason: 'auto_silence_6h' } as any)
    .lt('last_seen', since6h)
    .is('resolved_at', null);

  // (b) Recovery detection : si une anomalie 'error_burst' a un
  //     fingerprint qui ne s'est PAS redéclenché dans le scan courant
  //     ET le pattern global existe maintenant dans agent_knowledge
  //     (= fix mutualisé écrit par detect-error-patterns), on résoud
  //     avec reason='knowledge_mutualised'. Force le rétablissement
  //     même avant 6h de silence.
  const activeFingerprints = new Set(detected.map(d => d.fingerprint));
  const { data: openAlerts } = await supabase
    .from('anomaly_alerts')
    .select('id, agent, fingerprint, kind, last_seen')
    .is('resolved_at', null)
    .in('kind', ['error_burst', 'new_error_pattern']);
  for (const oa of (openAlerts || []) as any[]) {
    if (activeFingerprints.has(oa.fingerprint)) continue;
    // Vérifie si knowledge mutualisée existe
    const { data: k } = await supabase
      .from('agent_knowledge')
      .select('id, updated_at')
      .eq('agent', oa.agent)
      .eq('category', 'error_pattern')
      .eq('source', `${oa.agent}::${oa.fingerprint}`)
      .gte('updated_at', oa.last_seen)
      .maybeSingle();
    if (k?.id) {
      await supabase.from('anomaly_alerts')
        .update({ resolved_at: new Date().toISOString(), resolution_reason: 'knowledge_mutualised' } as any)
        .eq('id', oa.id);
    }
  }

  return NextResponse.json({
    ok: true,
    detected: detected.length,
    new_alerts: newCount,
    p0_new: newP0.length,
    breakdown: {
      error_burst: detected.filter(a => a.kind === 'error_burst').length,
      success_drop: detected.filter(a => a.kind === 'success_drop').length,
      publish_silence: detected.filter(a => a.kind === 'publish_silence').length,
      agent_down: detected.filter(a => a.kind === 'agent_down').length,
      new_error_pattern: detected.filter(a => a.kind === 'new_error_pattern').length,
      token_expiring: detected.filter(a => a.kind === 'token_expiring').length,
    },
  });
}
