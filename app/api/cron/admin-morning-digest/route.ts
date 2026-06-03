import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ADMIN_EMAIL = 'contact@keiroai.com';

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/**
 * GET /api/cron/admin-morning-digest
 *
 * Morning admin report — fires once at ~6h30 Paris BEFORE the client
 * briefs go out (~7h). Focused on overnight failures + token revocation
 * + connection issues so admin (Victor) can fix BEFORE clients open
 * their mail.
 *
 * Pair with /api/cron/admin-health-digest which fires at ~22h Paris
 * AFTER the day's catch-up runs. Together: only 2 admin reports per
 * day, both naming explicitly which clients are affected.
 *
 * Founder ask 2026-05-27: "il ne doit y en avoir que 2, 1 le matin
 * et 1 le soir admin et si il remarque un soucis execution agent ou
 * revocation token typiquement il faut indiquer quel client en plus
 * de la recommendation de l'action".
 *
 * Auth: CRON_SECRET only.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = sb();
  const since12h = new Date(Date.now() - 12 * 3600 * 1000).toISOString();

  // ── 1. Token / connection health (revoked, expired soon, disconnected) ──
  // Load all paying clients and check each social network connection.
  const { data: clients } = await supabase
    .from('profiles')
    .select('id, email, first_name, subscription_plan, instagram_username, instagram_business_account_id, instagram_igaa_token, facebook_page_access_token, tiktok_username, tiktok_access_token, tiktok_token_expiry, linkedin_username, linkedin_access_token, scheduling_paused_at, scheduling_paused_reason')
    .not('subscription_plan', 'is', null)
    .neq('subscription_plan', 'free');

  type TokenIssue = {
    client_id: string;
    client_email: string;
    plan: string;
    issue_type: 'ig_disconnected' | 'ig_token_revoked' | 'tt_disconnected' | 'tt_token_expiring' | 'li_disconnected' | 'scheduling_paused';
    network: 'instagram' | 'tiktok' | 'linkedin' | 'platform';
    detail: string;
  };
  const tokenIssues: TokenIssue[] = [];
  for (const c of clients || []) {
    // Instagram — has business account but no working token
    if (c.instagram_business_account_id && !c.instagram_igaa_token && !c.facebook_page_access_token) {
      tokenIssues.push({
        client_id: c.id,
        client_email: c.email || c.id.substring(0, 8),
        plan: c.subscription_plan,
        issue_type: 'ig_token_revoked',
        network: 'instagram',
        detail: 'Compte IG configuré mais aucun token valide (révoqué ou jamais autorisé)',
      });
    }
    // TikTok — has username but no token
    if (c.tiktok_username && !c.tiktok_access_token) {
      tokenIssues.push({
        client_id: c.id,
        client_email: c.email || c.id.substring(0, 8),
        plan: c.subscription_plan,
        issue_type: 'tt_disconnected',
        network: 'tiktok',
        detail: 'TikTok configuré mais déconnecté',
      });
    }
    // TikTok token expiring soon (within 7 days)
    if (c.tiktok_access_token && c.tiktok_token_expiry) {
      const expiryDate = new Date(c.tiktok_token_expiry);
      const daysUntilExpiry = Math.floor((expiryDate.getTime() - Date.now()) / 86400000);
      if (daysUntilExpiry <= 7 && daysUntilExpiry > 0) {
        tokenIssues.push({
          client_id: c.id,
          client_email: c.email || c.id.substring(0, 8),
          plan: c.subscription_plan,
          issue_type: 'tt_token_expiring',
          network: 'tiktok',
          detail: `Token TikTok expire dans ${daysUntilExpiry} jour(s)`,
        });
      } else if (daysUntilExpiry <= 0) {
        tokenIssues.push({
          client_id: c.id,
          client_email: c.email || c.id.substring(0, 8),
          plan: c.subscription_plan,
          issue_type: 'tt_disconnected',
          network: 'tiktok',
          detail: 'Token TikTok EXPIRÉ',
        });
      }
    }
    // LinkedIn — has username but no token
    if (c.linkedin_username && !c.linkedin_access_token) {
      tokenIssues.push({
        client_id: c.id,
        client_email: c.email || c.id.substring(0, 8),
        plan: c.subscription_plan,
        issue_type: 'li_disconnected',
        network: 'linkedin',
        detail: 'LinkedIn configuré mais déconnecté',
      });
    }
    // Scheduling pause (worst case)
    if (c.scheduling_paused_at) {
      tokenIssues.push({
        client_id: c.id,
        client_email: c.email || c.id.substring(0, 8),
        plan: c.subscription_plan,
        issue_type: 'scheduling_paused',
        network: 'platform',
        detail: c.scheduling_paused_reason || 'Scheduling en pause',
      });
    }
  }

  // ── 2. Overnight agent execution failures (last 12h) ──
  const { data: errorLogs } = await supabase
    .from('agent_logs')
    .select('agent, user_id, action, data, created_at')
    .eq('status', 'error')
    .gte('created_at', since12h)
    .order('created_at', { ascending: false })
    .limit(500);

  // Group by agent + first 60 chars of error signature so similar errors collapse
  const failureGroups: Record<string, {
    agent: string;
    signature: string;
    count: number;
    clients: Map<string, string>;
    sample_action: string;
    sample_error: string;
    first_seen: string;
    last_seen: string;
  }> = {};

  // Build a user_id → email map for fast lookups
  const userIdToEmail = new Map<string, string>();
  for (const c of clients || []) {
    if (c.email) userIdToEmail.set(c.id, c.email);
  }

  for (const log of errorLogs || []) {
    const errStr = String((log.data as any)?.error || (log.data as any)?.detail || '').slice(0, 60);
    if (!errStr || !log.agent) continue;
    const key = `${log.agent}::${errStr}`;
    if (!failureGroups[key]) {
      failureGroups[key] = {
        agent: log.agent,
        signature: errStr,
        count: 0,
        clients: new Map(),
        sample_action: log.action || '',
        sample_error: errStr,
        first_seen: log.created_at,
        last_seen: log.created_at,
      };
    }
    const g = failureGroups[key];
    g.count++;
    // 2026-06-02 fix: cron-level logs have log.user_id=null but the
    // payload usually carries user_id. Fall back to data.user_id /
    // data.client_id / data.target_user_id so "Clients concernés (0)"
    // stops appearing on every cron failure.
    const userIdFromLog = log.user_id
      || (log.data as any)?.user_id
      || (log.data as any)?.client_id
      || (log.data as any)?.target_user_id
      || null;
    if (userIdFromLog) {
      g.clients.set(userIdFromLog, userIdToEmail.get(userIdFromLog) || userIdFromLog.substring(0, 8));
    }
    if (log.created_at > g.last_seen) g.last_seen = log.created_at;
    if (log.created_at < g.first_seen) g.first_seen = log.created_at;
  }

  const failures = Object.values(failureGroups)
    .filter(g => g.count >= 2) // Filter noise: only groups with ≥2 errors
    .sort((a, b) => b.count - a.count);

  // ── 3. Credit / budget health (Google Places + Anthropic + OpenAI) ──
  // Founder ask 2026-05-27: "on verifie peut-être les credits google et
  // anthropic / openai pour savoir si on doit ajouter ou pas".
  type CreditAlert = {
    service: 'google_places' | 'anthropic' | 'openai' | 'brevo';
    severity: 'P0' | 'P1' | 'P2';
    detail: string;
    recommendation: string[];
  };
  const creditAlerts: CreditAlert[] = [];

  const todayStr = new Date().toISOString().slice(0, 10);
  const monthStartStr = todayStr.slice(0, 8) + '01';

  // Google Places — sum of estimated_cost_eur this month + today
  try {
    const { data: placesMonth } = await supabase
      .from('places_spend_daily')
      .select('day, estimated_cost_eur, text_search_calls, details_calls, pool_hits')
      .gte('day', monthStartStr)
      .order('day', { ascending: false });

    const monthSpend = (placesMonth || []).reduce((s, r: any) => s + (Number(r.estimated_cost_eur) || 0), 0);
    const todaySpend = (placesMonth || []).find((r: any) => r.day === todayStr)?.estimated_cost_eur || 0;
    const DAILY_BUDGET_EUR = Number(process.env.PLACES_DAILY_BUDGET_EUR || 15);
    const MONTHLY_BUDGET_EUR = Number(process.env.PLACES_MONTHLY_BUDGET_EUR || 350);

    if (monthSpend >= MONTHLY_BUDGET_EUR * 0.9) {
      creditAlerts.push({
        service: 'google_places',
        severity: monthSpend >= MONTHLY_BUDGET_EUR ? 'P0' : 'P1',
        detail: `Google Places : ${monthSpend.toFixed(2)}€ / ${MONTHLY_BUDGET_EUR}€ mensuel (${Math.round((monthSpend / MONTHLY_BUDGET_EUR) * 100)}%)`,
        recommendation: [
          'Augmenter PLACES_MONTHLY_BUDGET_EUR dans l\'env du VPS',
          'Vérifier le pool partage (pool_hits ratio) — augmenter le TTL si bas',
          'Top-up le compte Google Cloud Billing si nécessaire',
        ],
      });
    }
    if (todaySpend >= DAILY_BUDGET_EUR * 0.9) {
      creditAlerts.push({
        service: 'google_places',
        severity: 'P1',
        detail: `Cap journalier presque atteint : ${Number(todaySpend).toFixed(2)}€ / ${DAILY_BUDGET_EUR}€ aujourd'hui`,
        recommendation: [
          'Léo va se mettre en pause automatique aujourd\'hui',
          'Si critique : augmenter DAILY_BUDGET temporairement',
        ],
      });
    }
  } catch { /* table maybe missing — non-fatal */ }

  // Anthropic / OpenAI — read external_cost_uploads for the current
  // month if available. Neither vendor exposes a live balance API,
  // so we rely on the most recent uploaded bill estimate.
  try {
    const { data: externalCosts } = await supabase
      .from('external_cost_uploads')
      .select('service, billing_period, total_cost_eur, uploaded_at')
      .gte('billing_period', monthStartStr.slice(0, 7))
      .order('uploaded_at', { ascending: false })
      .limit(20);

    const MONTHLY_LIMITS_EUR: Record<string, number> = {
      anthropic: Number(process.env.ANTHROPIC_MONTHLY_BUDGET_EUR || 800),
      openai: Number(process.env.OPENAI_MONTHLY_BUDGET_EUR || 300),
      brevo: Number(process.env.BREVO_MONTHLY_BUDGET_EUR || 60),
    };

    const byService: Record<string, number> = {};
    for (const c of externalCosts || []) {
      const svc = (c.service || '').toLowerCase();
      byService[svc] = (byService[svc] || 0) + (Number(c.total_cost_eur) || 0);
    }

    for (const [svc, spent] of Object.entries(byService)) {
      const limit = MONTHLY_LIMITS_EUR[svc];
      if (!limit) continue;
      const pct = Math.round((spent / limit) * 100);
      if (pct >= 90) {
        creditAlerts.push({
          service: svc as any,
          severity: pct >= 100 ? 'P0' : 'P1',
          detail: `${svc.toUpperCase()} : ${spent.toFixed(2)}€ / ${limit}€ mensuel (${pct}%)`,
          recommendation: [
            `Top-up le solde ${svc} avant épuisement`,
            `Vérifier la console ${svc} pour les usages aberrants`,
            'Si dépassement : envisager rate-limit côté agents',
          ],
        });
      }
    }
  } catch { /* non-fatal */ }

  // Skip the digest entirely if nothing to report
  if (tokenIssues.length === 0 && failures.length === 0 && creditAlerts.length === 0) {
    return NextResponse.json({ ok: true, sent: false, message: 'Morning health check passed — nothing to report.' });
  }

  // ── 3. Recommendations per issue type ──
  const TOKEN_RECOMMENDATIONS: Record<string, string[]> = {
    ig_disconnected: [
      'Contacter le client pour reconnecter Instagram via /assistant',
      'Vérifier si le client a révoqué les permissions Meta côté facebook.com/settings/business_integrations',
      'Envoyer un email automatique au client avec lien de reconnexion',
    ],
    ig_token_revoked: [
      'Token IG révoqué — purger les tokens en DB et notifier le client',
      'Implémenter le refresh proactif des tokens (cron 7j avant expiration)',
      'Envoyer email "Reconnecte ton Instagram" au client + lien direct OAuth',
    ],
    tt_disconnected: [
      'Token TikTok manquant — déclencher le flow re-OAuth côté client',
      'Vérifier que TikTok n\'a pas changé son OAuth scope',
    ],
    tt_token_expiring: [
      'Implémenter refresh automatique du token TikTok (refresh_token disponible)',
      'Cron de monitoring qui refresh tous les tokens à 30j d\'expiration',
    ],
    li_disconnected: [
      'Token LinkedIn manquant — proposer reconnexion via /assistant',
      'LinkedIn tokens durent 60j max, prévoir refresh ou notification',
    ],
    scheduling_paused: [
      'Scheduling en pause — investiguer la raison (token ? quota ? business_dossiers incomplet ?)',
      'Reset scheduling_paused_at après fix pour reprendre les publications',
    ],
  };

  const AGENT_FAILURE_REC: Array<{ match: RegExp; rec: string[] }> = [
    {
      match: /api[_\s]?key|env\s*var/i,
      rec: ['Vérifier la variable d\'env en production sur le VPS', 'Ajouter un health-check au boot'],
    },
    {
      match: /timeout|ETIMEDOUT/i,
      rec: ['Augmenter le timeout côté agent', 'Paralléliser ou retry exponential-backoff'],
    },
    {
      match: /rate.?limit|429/i,
      rec: ['Réduire la fréquence d\'appel à l\'API tierce', 'Bucket par client'],
    },
    {
      match: /token|oauth|401|unauthorized/i,
      rec: ['Implémenter refresh automatique des tokens', 'Notifier client si refresh échoue'],
    },
    {
      match: /database|supabase|postgres|column.*does not exist|relation.*does not exist|constraint/i,
      rec: ['Vérifier les migrations appliquées', 'Auditer les CHECK constraints qui rejettent silencieusement'],
    },
    {
      match: /network|fetch failed|ENOTFOUND|ECONNREFUSED/i,
      rec: ['Vérifier statut de l\'API tierce', 'Ajouter circuit breaker'],
    },
  ];
  function recommendForFailure(signature: string): string[] {
    for (const r of AGENT_FAILURE_REC) {
      if (r.match.test(signature)) return r.rec;
    }
    return ['Investiguer manuellement — consulter pm2 logs keiro-app', 'Reproduire en local avec le même payload'];
  }

  // ── 4. Build HTML ──
  const SEV_COLOR: Record<string, { bg: string; border: string }> = {
    P0: { bg: '#fef2f2', border: '#dc2626' },
    P1: { bg: '#fff7ed', border: '#ea580c' },
    P2: { bg: '#f9fafb', border: '#6b7280' },
  };

  // Group token issues by type
  const tokenByType: Record<string, TokenIssue[]> = {};
  for (const ti of tokenIssues) {
    if (!tokenByType[ti.issue_type]) tokenByType[ti.issue_type] = [];
    tokenByType[ti.issue_type].push(ti);
  }

  const TOKEN_TITLES: Record<string, { title: string; severity: 'P0' | 'P1' | 'P2' }> = {
    ig_disconnected: { title: 'Instagram déconnecté', severity: 'P1' },
    ig_token_revoked: { title: 'Token Instagram révoqué', severity: 'P0' },
    tt_disconnected: { title: 'TikTok déconnecté', severity: 'P1' },
    tt_token_expiring: { title: 'Token TikTok expire bientôt', severity: 'P2' },
    li_disconnected: { title: 'LinkedIn déconnecté', severity: 'P1' },
    scheduling_paused: { title: 'Scheduling en pause', severity: 'P0' },
  };

  const tokenBlocks = Object.entries(tokenByType).map(([type, list]) => {
    const meta = TOKEN_TITLES[type] || { title: type, severity: 'P2' as const };
    const sev = SEV_COLOR[meta.severity];
    const clientList = list.map(c => `<li><strong>${c.client_email}</strong> (plan ${c.plan}) — ${c.detail}</li>`).join('');
    const recs = TOKEN_RECOMMENDATIONS[type] || ['Investigation manuelle'];
    return `
<div style="background:${sev.bg};border-left:4px solid ${sev.border};border-radius:8px;padding:14px;margin:10px 0;">
  <div style="font-size:11px;color:${sev.border};font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;">
    ${meta.severity} · ${list[0].network}
  </div>
  <div style="font-size:14px;color:#1f2937;font-weight:bold;margin:6px 0;">
    ${meta.title} — ${list.length} client${list.length > 1 ? 's' : ''}
  </div>
  <ul style="font-size:12px;color:#4b5563;margin:8px 0 0;padding-left:18px;">${clientList}</ul>
  <div style="margin-top:10px;">
    <div style="font-size:11px;font-weight:bold;color:#059669;">Action recommandée :</div>
    <ul style="margin:4px 0 0;padding-left:18px;font-size:12px;color:#374151;">
      ${recs.map(r => `<li>${r}</li>`).join('')}
    </ul>
  </div>
</div>`;
  }).join('');

  const failureBlocks = failures.map(f => {
    const recs = recommendForFailure(f.signature);
    const clientList = Array.from(f.clients.values()).slice(0, 25).join(', ');
    const extra = f.clients.size > 25 ? ` (+${f.clients.size - 25})` : '';
    return `
<div style="background:#fff7ed;border-left:4px solid #ea580c;border-radius:8px;padding:14px;margin:10px 0;">
  <div style="font-size:11px;color:#ea580c;font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;">
    Agent ${f.agent} · ${f.count} échec${f.count > 1 ? 's' : ''} en 12h
  </div>
  <div style="font-size:13px;color:#1f2937;font-weight:bold;margin:6px 0;">
    ${f.sample_action} — ${f.signature}
  </div>
  <div style="background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:8px 10px;margin:8px 0;">
    <div style="font-size:10px;font-weight:bold;color:#374151;text-transform:uppercase;letter-spacing:0.3px;">Clients concernés (${f.clients.size})</div>
    <div style="font-size:11px;color:#1f2937;margin-top:4px;line-height:1.5;">${clientList}${extra}</div>
  </div>
  <div style="margin-top:8px;">
    <div style="font-size:11px;font-weight:bold;color:#059669;">Action recommandée :</div>
    <ul style="margin:4px 0 0;padding-left:18px;font-size:12px;color:#374151;">
      ${recs.map(r => `<li>${r}</li>`).join('')}
    </ul>
  </div>
</div>`;
  }).join('');

  const creditBlocks = creditAlerts.map(a => {
    const sev = SEV_COLOR[a.severity];
    return `
<div style="background:${sev.bg};border-left:4px solid ${sev.border};border-radius:8px;padding:14px;margin:10px 0;">
  <div style="font-size:11px;color:${sev.border};font-weight:bold;text-transform:uppercase;letter-spacing:0.5px;">
    ${a.severity} · ${a.service}
  </div>
  <div style="font-size:14px;color:#1f2937;font-weight:bold;margin:6px 0;">
    ${a.detail}
  </div>
  <div style="margin-top:8px;">
    <div style="font-size:11px;font-weight:bold;color:#059669;">Action recommandée :</div>
    <ul style="margin:4px 0 0;padding-left:18px;font-size:12px;color:#374151;">
      ${a.recommendation.map(r => `<li>${r}</li>`).join('')}
    </ul>
  </div>
</div>`;
  }).join('');

  const totalP0 = Object.entries(tokenByType).filter(([t]) => TOKEN_TITLES[t]?.severity === 'P0').reduce((sum, [, list]) => sum + list.length, 0)
    + creditAlerts.filter(a => a.severity === 'P0').length;
  const totalIssues = tokenIssues.length + failures.length + creditAlerts.length;

  const adminHtml = `<div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;">
    <div style="background:#0c1a3a;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0;">
      <h2 style="margin:0;font-size:18px;">☀️ Service Health — Rapport matin</h2>
      <div style="font-size:12px;color:#a0aec0;margin-top:6px;">
        ${tokenIssues.length} problème${tokenIssues.length !== 1 ? 's' : ''} de connexion · ${failures.length} type${failures.length !== 1 ? 's' : ''} d'erreur agent · ${totalP0 > 0 ? `<strong style="color:#fca5a5;">${totalP0} P0</strong>` : 'pas de P0'}
      </div>
    </div>
    <div style="background:#fff;border:1px solid #e5e7eb;border-top:0;padding:20px 22px;">
      ${totalP0 > 0 ? `<div style="background:#fef2f2;border:2px solid #dc2626;border-radius:10px;padding:14px;margin:0 0 16px;">
        <strong style="color:#991b1b;font-size:14px;">🚨 ${totalP0} bloquant${totalP0 > 1 ? 's' : ''} à fixer AVANT les briefs clients (7h)</strong>
        <div style="font-size:12px;color:#7f1d1d;margin-top:4px;">Sans fix, ces clients vont voir leur agent ne pas exécuter aujourd'hui.</div>
      </div>` : ''}

      ${creditAlerts.length > 0 ? `<h3 style="font-size:14px;color:#374151;margin:16px 0 8px;">💳 Crédits & budgets externes</h3>${creditBlocks}` : ''}
      ${tokenIssues.length > 0 ? `<h3 style="font-size:14px;color:#374151;margin:20px 0 8px;">🔌 Tokens & connexions</h3>${tokenBlocks}` : ''}
      ${failures.length > 0 ? `<h3 style="font-size:14px;color:#374151;margin:20px 0 8px;">⚙️ Erreurs d'exécution d'agents (12h)</h3>${failureBlocks}` : ''}

      <div style="background:#f0fdf4;border-left:4px solid #16a34a;padding:14px;border-radius:8px;margin-top:18px;">
        <strong style="color:#166534;font-size:12px;">📋 Workflow</strong>
        <ol style="font-size:11px;color:#14532d;margin:6px 0 0;padding-left:18px;">
          <li>Reviewer chaque bloc avec son <strong>client identifié</strong> et son <strong>action recommandée</strong></li>
          <li>Pour les tokens : contacter / notifier les clients listés</li>
          <li>Pour les erreurs agent : demander à Claude d'implémenter la solution proposée</li>
          <li>Console live : <a href="${process.env.NEXT_PUBLIC_BASE_URL || 'https://www.keiroai.com'}/admin/service-health" style="color:#059669;">/admin/service-health</a></li>
        </ol>
      </div>
    </div>
    <div style="background:#f9fafb;padding:10px;text-align:center;color:#9ca3af;font-size:10px;border-radius:0 0 12px 12px;">
      Rapport matin · fenêtre 12h · prochain rapport ce soir vers 22h
    </div>
  </div>`;

  // 2026-06-03 — Multi-provider fallback (Brevo API → Resend → Brevo SMTP)
  const subject = totalP0 > 0
    ? `🚨 P0 KeiroAI matin — ${totalP0} bloquant${totalP0 > 1 ? 's' : ''} avant briefs clients`
    : totalIssues > 0
      ? `⚠️ KeiroAI matin — ${totalIssues} point${totalIssues > 1 ? 's' : ''} à surveiller`
      : `☀️ KeiroAI matin — RAS`;
  const { sendEmailWithFallback } = await import('@/lib/email/send-with-fallback');
  const result = await sendEmailWithFallback({
    to: ADMIN_EMAIL,
    subject,
    html: adminHtml,
    fromName: 'Admin Health Morning',
    fromEmail: 'contact@keiroai.com',
    tags: ['admin_morning_digest', totalP0 > 0 ? 'p0' : 'p1'],
  });
  const sent = result.ok;
  if (!sent) console.error('[AdminMorningDigest] All providers failed:', result.error);
  else console.log(`[AdminMorningDigest] Sent via ${result.provider}`);

  return NextResponse.json({
    ok: true,
    sent,
    summary: {
      token_issues: tokenIssues.length,
      failure_types: failures.length,
      total_issues: totalIssues,
      p0_count: totalP0,
    },
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
