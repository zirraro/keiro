/**
 * Detect recurring error patterns ACROSS clients and write them as
 * shared learnings into agent_knowledge so :
 *   (1) the admin sees the global pattern in /admin/agents/control
 *   (2) the affected agent's prompts pick up the learning automatically
 *       (Léna et al. already read agent_knowledge for their business_type)
 *
 * Founder rule 2026-06-08 :
 *   "si ca arrive pour un client ca ne doit pas se reproduire pour les
 *    autres clients car on mutualise la connaissance systematiquement".
 *
 * Logic :
 *   1. Read last 72h agent_logs where status='error' or 'failed'.
 *   2. Fingerprint each error (action + normalised message, UUIDs/numbers
 *      stripped).
 *   3. Aggregate by (agent, fingerprint) — if a fingerprint occurs ≥3
 *      times across ≥2 distinct clients, it's a SHARED pattern worth
 *      mutualising. Write/refresh a row in agent_knowledge with
 *      category='error_pattern', confidence growing with recurrence.
 *   4. If a fingerprint suddenly STOPS happening for 72h, downgrade its
 *      confidence (so dead patterns fade out).
 *
 * Schedule : daily at 04:45 UTC (before morning digest).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

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
  s = s.replace(/'[^']{0,80}'/g, "'<str>'");
  s = s.replace(/"[^"]{0,80}"/g, '"<str>"');
  s = s.substring(0, 180);
  return `${action}::${s}`;
}

function suggestFix(action: string, raw: string): string {
  const t = raw.toLowerCase();
  if (/timeout|aborted|exceeded.*deadline/.test(t)) {
    return 'Augmenter le timeout per-call ou batcher les opérations. Vérifier MAX_RUN_MS / AbortSignal.timeout dans la route.';
  }
  if (/401|unauthor|token.*revok|invalid.*token|expired/.test(t)) {
    return 'Token expiré ou révoqué. Forcer la reconnexion côté client (banner + email reauth).';
  }
  if (/429|rate.?limit/.test(t)) {
    return 'Rate limit atteint. Augmenter le backoff entre appels ou réduire le batch size.';
  }
  if (/9007|igaa/.test(t)) {
    return 'Instagram IGAA token cassé. Cf. process-ig-reauth cron + reseed du token.';
  }
  if (/duplicate|unique.*constraint|23505/.test(t)) {
    return 'Doublon en DB. Vérifier la déduplication amont (ON CONFLICT DO NOTHING ou pre-check par natural key).';
  }
  if (/no protocols|ssl|tls/.test(t)) {
    return 'TLS handshake refusé. Vérifier nginx-hardening.conf et le min TLS de la cible.';
  }
  if (/foreign.script|chinese|japanese|korean|gibberish/.test(t)) {
    return 'Texte étranger leaked. Reel/image regen avec negative prompt foreign-script renforcé (voir image-provider.ts).';
  }
  if (/json.*parse|unexpected token/.test(t)) {
    return 'Réponse LLM mal formée. Ajouter un sanitize markdown fences + retry une fois en demandant JSON strict.';
  }
  if (/quota|budget/.test(t)) {
    return 'Budget atteint (Places ou autre). Vérifier le cap quotidien et la déduplication via prospect_pool.';
  }
  return 'Lire le sample_error, identifier la cause racine, ajouter un test ou un guard dans la route correspondante.';
}

export async function GET(req: NextRequest) {
  if (!authOk(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const supabase = sb();
  const since72h = new Date(Date.now() - 72 * 3600 * 1000).toISOString();

  // ── 1. Pull all errors from the last 72h ──
  const { data: errs } = await supabase
    .from('agent_logs')
    .select('id, agent, action, status, data, user_id, created_at')
    .in('status', ['error', 'failed'])
    .gte('created_at', since72h)
    .order('created_at', { ascending: false })
    .limit(10000);

  if (!errs || errs.length === 0) {
    return NextResponse.json({ ok: true, scanned: 0, patterns: 0 });
  }

  // ── 2. Fingerprint + aggregate ──
  const byFp: Record<string, {
    fingerprint: string;
    agent: string;
    action: string;
    sample_error: string;
    sample_data: any;
    count: number;
    clients: Set<string>;
    last_seen: string;
  }> = {};

  for (const e of errs as any[]) {
    const raw = (e.data?.error || e.data?.message || e.data?.reason || '').toString();
    const fp = `${e.agent}::${fingerprint(e.action, raw)}`;
    if (!byFp[fp]) {
      byFp[fp] = {
        fingerprint: fp,
        agent: e.agent,
        action: e.action,
        sample_error: raw.substring(0, 280),
        sample_data: e.data,
        count: 0,
        clients: new Set(),
        last_seen: e.created_at,
      };
    }
    const slot = byFp[fp];
    slot.count++;
    if (e.user_id) slot.clients.add(e.user_id);
    if (e.created_at > slot.last_seen) slot.last_seen = e.created_at;
  }

  // ── 3. Promote shared patterns (≥3 incidents across ≥2 clients) ──
  const patterns = Object.values(byFp).filter(p => p.count >= 3 && p.clients.size >= 2);
  let promoted = 0;

  for (const p of patterns) {
    const summary = `${p.agent} · ${p.action} : ${p.count}× sur ${p.clients.size} clients (72h)`;
    const fix = suggestFix(p.action, p.sample_error);
    // Confidence rises with recurrence + breadth. Cap at 0.95.
    const confidence = Math.min(0.95, 0.5 + (p.clients.size * 0.1) + Math.log10(p.count + 1) * 0.15);
    const content = `Pattern : ${p.sample_error}\n\nFix suggéré : ${fix}\n\nFingerprint : ${p.fingerprint}`;

    try {
      // Upsert by fingerprint (one row per pattern, updated when seen again)
      const { data: existing } = await supabase
        .from('agent_knowledge')
        .select('id')
        .eq('agent', p.agent)
        .eq('category', 'error_pattern')
        .eq('source', p.fingerprint)
        .maybeSingle();

      if (existing?.id) {
        await supabase.from('agent_knowledge').update({
          summary,
          content,
          confidence,
          updated_at: new Date().toISOString(),
        } as any).eq('id', existing.id);
      } else {
        await supabase.from('agent_knowledge').insert({
          agent: p.agent,
          category: 'error_pattern',
          business_type: 'global', // applies to all clients
          summary,
          content,
          confidence,
          source: p.fingerprint,
          created_by: 'pattern-detector',
        });
      }
      promoted++;
    } catch (e: any) {
      console.warn('[pattern-detector] upsert error:', e?.message);
    }
  }

  // ── 4. Downgrade confidence of patterns that haven't recurred in 72h ──
  const activeFps = new Set(patterns.map(p => p.fingerprint));
  const { data: stale } = await supabase
    .from('agent_knowledge')
    .select('id, source, confidence')
    .eq('category', 'error_pattern')
    .lt('updated_at', since72h);

  let demoted = 0;
  for (const s of (stale || []) as any[]) {
    if (activeFps.has(s.source)) continue;
    const newConf = Math.max(0.1, (s.confidence || 0.5) * 0.7); // 30% decay every 72h of silence
    try {
      await supabase.from('agent_knowledge').update({ confidence: newConf } as any).eq('id', s.id);
      demoted++;
    } catch { /* swallow */ }
  }

  return NextResponse.json({
    ok: true,
    scanned: errs.length,
    unique_fingerprints: Object.keys(byFp).length,
    patterns_detected: patterns.length,
    patterns_promoted: promoted,
    patterns_demoted: demoted,
    top: patterns.slice(0, 10).map(p => ({
      agent: p.agent,
      action: p.action,
      count: p.count,
      clients: p.clients.size,
      sample: p.sample_error,
    })),
  });
}
