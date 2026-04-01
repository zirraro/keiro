import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { graphGET } from '@/lib/meta';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

type DiagnosticResult = {
  check: string;
  platform: 'instagram' | 'linkedin' | 'tiktok' | 'general';
  status: 'ok' | 'warning' | 'critical';
  detail: string;
};

/**
 * GET /api/cron/diagnose-social
 *
 * Daily social platforms health check (runs 07:45 UTC, before publications).
 * Checks: Instagram tokens + Meta API, LinkedIn token, TikTok token,
 * pending posts per platform, recent publish failures.
 * Logs to agent_logs and sends Resend alert on critical issues.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const checks: DiagnosticResult[] = [];
  let hasCritical = false;

  // ── 1. Check admin profile ──
  const { data: admin } = await supabase
    .from('profiles')
    .select('id, instagram_business_account_id, facebook_page_access_token, linkedin_access_token, tiktok_access_token')
    .eq('is_admin', true)
    .limit(1)
    .single();

  if (!admin) {
    checks.push({ check: 'admin_profile', platform: 'general', status: 'critical', detail: 'No admin profile found in database.' });
    hasCritical = true;
  } else {
    // ── 2. Instagram checks ──
    const hasIgId = !!admin.instagram_business_account_id;
    const hasIgToken = !!admin.facebook_page_access_token;

    if (!hasIgId || !hasIgToken) {
      checks.push({
        check: 'instagram_tokens',
        platform: 'instagram',
        status: 'critical',
        detail: `Missing: ${!hasIgId ? 'instagram_business_account_id' : ''}${!hasIgId && !hasIgToken ? ' + ' : ''}${!hasIgToken ? 'facebook_page_access_token' : ''}`,
      });
      hasCritical = true;
    } else {
      checks.push({ check: 'instagram_tokens', platform: 'instagram', status: 'ok', detail: 'Tokens present.' });

      // Test Meta Graph API
      try {
        const igAccount = await graphGET<{ id: string; username?: string }>(
          `/${admin.instagram_business_account_id}`,
          admin.facebook_page_access_token,
          { fields: 'id,username' }
        );
        checks.push({
          check: 'instagram_api',
          platform: 'instagram',
          status: 'ok',
          detail: `Meta API OK. IG: @${igAccount.username || igAccount.id}`,
        });
      } catch (err: any) {
        const errMsg = (err.message || '').substring(0, 200);
        checks.push({
          check: 'instagram_api',
          platform: 'instagram',
          status: 'critical',
          detail: `Meta Graph API failed: ${errMsg}`,
        });
        hasCritical = true;
      }
    }

    // ── 3. LinkedIn checks ──
    const hasLinkedin = !!admin.linkedin_access_token;
    if (!hasLinkedin) {
      checks.push({
        check: 'linkedin_token',
        platform: 'linkedin',
        status: 'warning',
        detail: 'No linkedin_access_token on admin profile. LinkedIn publishing disabled.',
      });
    } else {
      // Test LinkedIn token validity
      try {
        const liRes = await fetch('https://api.linkedin.com/v2/userinfo', {
          headers: { 'Authorization': `Bearer ${admin.linkedin_access_token}` },
        });
        if (liRes.ok) {
          const liData = await liRes.json();
          checks.push({
            check: 'linkedin_api',
            platform: 'linkedin',
            status: 'ok',
            detail: `LinkedIn token valid. User: ${liData.name || liData.sub || 'unknown'}`,
          });
        } else {
          const errText = await liRes.text().catch(() => '');
          checks.push({
            check: 'linkedin_api',
            platform: 'linkedin',
            status: 'critical',
            detail: `LinkedIn API returned ${liRes.status}: ${errText.substring(0, 200)}`,
          });
          hasCritical = true;
        }
      } catch (err: any) {
        checks.push({
          check: 'linkedin_api',
          platform: 'linkedin',
          status: 'critical',
          detail: `LinkedIn API call failed: ${(err.message || '').substring(0, 200)}`,
        });
        hasCritical = true;
      }
    }

    // ── 4. TikTok checks ──
    const hasTiktok = !!admin.tiktok_access_token;
    if (!hasTiktok) {
      checks.push({
        check: 'tiktok_token',
        platform: 'tiktok',
        status: 'warning',
        detail: 'No tiktok_access_token on admin profile.',
      });
    } else {
      checks.push({
        check: 'tiktok_token',
        platform: 'tiktok',
        status: 'ok',
        detail: 'TikTok access token present.',
      });
    }
  }

  // ── 5. Pending posts per platform ──
  const todayDate = new Date().toISOString().split('T')[0];
  for (const platform of ['instagram', 'linkedin', 'tiktok'] as const) {
    const { count } = await supabase
      .from('content_calendar')
      .select('id', { count: 'exact', head: true })
      .in('status', ['approved', 'draft'])
      .lte('scheduled_date', todayDate)
      .eq('platform', platform);

    const c = count || 0;
    checks.push({
      check: `pending_posts_${platform}`,
      platform,
      status: c === 0 ? 'warning' : 'ok',
      detail: c === 0
        ? `No ${platform} posts ready for today.`
        : `${c} ${platform} post(s) ready.`,
    });
  }

  // ── 6. Recent publish failures (last 24h) ──
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recentFailures } = await supabase
    .from('agent_logs')
    .select('id, action, status, data, created_at')
    .eq('agent', 'content')
    .in('action', ['publish_diagnostic', 'execute_publication'])
    .eq('status', 'error')
    .gte('created_at', yesterday)
    .order('created_at', { ascending: false })
    .limit(15);

  const failCount = (recentFailures || []).length;
  if (failCount > 3) {
    checks.push({
      check: 'recent_failures',
      platform: 'general',
      status: 'critical',
      detail: `${failCount} publish failures in last 24h. Check agent_logs for details.`,
    });
    hasCritical = true;
  } else if (failCount > 0) {
    checks.push({
      check: 'recent_failures',
      platform: 'general',
      status: 'warning',
      detail: `${failCount} publish issue(s) in last 24h.`,
    });
  } else {
    checks.push({
      check: 'recent_failures',
      platform: 'general',
      status: 'ok',
      detail: 'No publish failures in last 24h.',
    });
  }

  // ── 7. Check cron execution (did content agents run today?) ──
  const todayStart = todayDate + 'T00:00:00Z';
  const { count: contentLogsToday } = await supabase
    .from('agent_logs')
    .select('id', { count: 'exact', head: true })
    .eq('agent', 'content')
    .gte('created_at', todayStart);

  if ((contentLogsToday || 0) === 0) {
    checks.push({
      check: 'content_agent_activity',
      platform: 'general',
      status: 'warning',
      detail: 'Content agent has not run yet today. Cron may not have triggered.',
    });
  } else {
    checks.push({
      check: 'content_agent_activity',
      platform: 'general',
      status: 'ok',
      detail: `Content agent ran ${contentLogsToday} time(s) today.`,
    });
  }

  // ── Log results ──
  await supabase.from('agent_logs').insert({
    agent: 'diagnostic',
    action: 'social_health_check',
    status: hasCritical ? 'error' : 'success',
    data: {
      checks,
      has_critical: hasCritical,
      platforms_checked: ['instagram', 'linkedin', 'tiktok'],
      checked_at: new Date().toISOString(),
    },
    created_at: new Date().toISOString(),
  });

  // ── Diagnostic saved to agent_logs — no separate email (Ops handles alerts) ──
  if (hasCritical) {
    console.log(`[DiagnoseSocial] ${checks.filter(c => c.status === 'critical').length} critical issues — logged to supervision`);
    // No email — Ops agent sends alert when agents are down
    if (false) { // Disabled — was sending redundant emails
      const RESEND_API_KEY = process.env.RESEND_API_KEY;
      const criticalChecks = checks.filter(c => c.status === 'critical');
      if (RESEND_API_KEY) try { await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'KeiroAI Agents <contact@keiroai.com>',
            to: ['contact@keiroai.com'],
            subject: `ALERTE Diagnostic Social — ${criticalChecks.length} problème(s) critique(s)`,
            html: `
              <h2>Diagnostic Social — Problèmes critiques détectés</h2>
              <p>Le check quotidien de santé des réseaux sociaux a détecté des problèmes :</p>
              <ul>
                ${criticalChecks.map(c => `<li><strong>[${c.platform.toUpperCase()}] ${c.check}</strong>: ${c.detail}</li>`).join('\n')}
              </ul>
              <h3>Tous les checks :</h3>
              <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;">
                <tr><th>Platform</th><th>Check</th><th>Status</th><th>Detail</th></tr>
                ${checks.map(c => `<tr><td>${c.platform}</td><td>${c.check}</td><td style="color:${c.status === 'critical' ? 'red' : c.status === 'warning' ? 'orange' : 'green'}">${c.status.toUpperCase()}</td><td>${c.detail}</td></tr>`).join('\n')}
              </table>
              <p><strong>Action requise :</strong> Vérifiez les connexions réseaux sociaux dans les paramètres admin KeiroAI.</p>
              <hr/>
              <p style="color:#888;font-size:12px">Agent Diagnostic KeiroAI — alerte automatique</p>
            `,
          }),
        });
        console.log('[Diagnose-Social] Alert email sent');
      } catch (alertErr: any) {
        console.error('[Diagnose-Social] Failed to send alert:', alertErr.message);
      }
    }
  }

  console.log(`[Diagnose-Social] Done: ${hasCritical ? 'CRITICAL' : 'OK'} — ${checks.length} checks`);

  return NextResponse.json({
    ok: !hasCritical,
    has_critical: hasCritical,
    checks,
  });
}
