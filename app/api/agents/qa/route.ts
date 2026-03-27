import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { escalateAgentError } from '@/lib/agents/error-escalation';

export const runtime = 'nodejs';
export const maxDuration = 300;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://keiroai.com';
const ADMIN_EMAIL = 'contact@keiroai.com';

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

interface QACheck {
  name: string;
  agent: string;
  status: 'pass' | 'warn' | 'fail' | 'critical';
  message: string;
  details?: any;
  fix?: string;
}

/**
 * POST /api/agents/qa
 * Agent QA supra elite — teste tous les agents et fonctionnalites
 * Auth: CRON_SECRET ou admin user
 * ?mode=full (complet) | quick (rapide) | agents (agents seulement)
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const mode = new URL(req.url).searchParams.get('mode') || 'full';
  const now = new Date();
  const checks: QACheck[] = [];

  console.log(`[QA Agent] Starting ${mode} check at ${now.toISOString()}`);

  // ═══ CHECK 1: Instagram Token ═══
  try {
    const { data: admin } = await supabase
      .from('profiles')
      .select('instagram_business_account_id, facebook_page_access_token')
      .eq('is_admin', true)
      .limit(1)
      .single();

    if (!admin?.instagram_business_account_id || !admin?.facebook_page_access_token) {
      checks.push({ name: 'Instagram Token', agent: 'content', status: 'critical', message: 'Token Instagram MANQUANT dans le profil admin', fix: 'Reconnecter Instagram dans /mon-compte → Integrations' });
    } else {
      // Verify token validity
      try {
        const igRes = await fetch(`https://graph.facebook.com/v21.0/${admin.instagram_business_account_id}?fields=id&access_token=${admin.facebook_page_access_token}`);
        if (igRes.ok) {
          checks.push({ name: 'Instagram Token', agent: 'content', status: 'pass', message: 'Token Instagram valide' });
        } else {
          checks.push({ name: 'Instagram Token', agent: 'content', status: 'critical', message: 'Token Instagram EXPIRE ou INVALIDE', fix: 'Reconnecter Instagram — le token a expire' });
        }
      } catch {
        checks.push({ name: 'Instagram Token', agent: 'content', status: 'warn', message: 'Impossible de verifier le token Instagram' });
      }
    }
  } catch { checks.push({ name: 'Instagram Token', agent: 'content', status: 'warn', message: 'Erreur verification token' }); }

  // ═══ CHECK 2: Publications reelles vs fake ═══
  try {
    const since = new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0];
    const { data: published } = await supabase
      .from('content_calendar')
      .select('id, platform, status, instagram_permalink')
      .eq('status', 'published')
      .gte('scheduled_date', since);

    const fakePublished = (published || []).filter(p => p.platform === 'instagram' && !p.instagram_permalink);
    if (fakePublished.length > 0) {
      checks.push({ name: 'Fake Publications', agent: 'content', status: 'critical', message: `${fakePublished.length} posts marques "published" SANS preuve reelle (pas de permalink)`, fix: 'Reset ces posts en "approved" et verifier publishToInstagram()', details: { count: fakePublished.length } });
    } else {
      checks.push({ name: 'Publications', agent: 'content', status: 'pass', message: 'Toutes les publications ont une preuve reelle' });
    }

    // Count posts by status
    const { data: allPosts } = await supabase
      .from('content_calendar')
      .select('status, platform')
      .gte('scheduled_date', since);

    const statusCount: Record<string, number> = {};
    (allPosts || []).forEach((p: any) => { statusCount[p.status] = (statusCount[p.status] || 0) + 1; });
    checks.push({ name: 'Content Calendar', agent: 'content', status: 'pass', message: `Posts 3j: ${JSON.stringify(statusCount)}`, details: statusCount });
  } catch { checks.push({ name: 'Publications', agent: 'content', status: 'warn', message: 'Erreur verification publications' }); }

  // ═══ CHECK 3: Email quota et delivrabilite ═══
  try {
    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);
    const { count: emailsToday } = await supabase
      .from('crm_activities')
      .select('id', { count: 'exact', head: true })
      .eq('type', 'email')
      .gte('created_at', todayStart.toISOString());

    const quota = 300;
    const used = emailsToday || 0;
    if (used < 50) {
      checks.push({ name: 'Email Quota', agent: 'email', status: 'warn', message: `Seulement ${used}/${quota} emails envoyes aujourd'hui — sous-utilisation du quota`, fix: 'Verifier que le cron email tourne correctement' });
    } else {
      checks.push({ name: 'Email Quota', agent: 'email', status: 'pass', message: `${used}/${quota} emails envoyes aujourd'hui` });
    }
  } catch { checks.push({ name: 'Email Quota', agent: 'email', status: 'warn', message: 'Erreur verification quota email' }); }

  // ═══ CHECK 4: Agent activity (tous les agents ont tourne?) ═══
  try {
    const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const ALL_AGENTS = ['email', 'commercial', 'dm_instagram', 'tiktok_comments', 'seo', 'content', 'onboarding', 'retention', 'marketing', 'chatbot', 'whatsapp', 'gmaps', 'comptable', 'ads', 'rh', 'ceo'];

    for (const agent of ALL_AGENTS) {
      const { count } = await supabase
        .from('agent_logs')
        .select('id', { count: 'exact', head: true })
        .eq('agent', agent)
        .gte('created_at', since24h);

      const runs = count || 0;
      if (runs === 0) {
        checks.push({ name: `Agent ${agent}`, agent, status: 'fail', message: `Agent ${agent} n'a PAS tourne dans les 24h`, fix: `Verifier le cron scheduler pour l'agent ${agent}` });
      } else {
        // Check for errors
        const { count: errors } = await supabase
          .from('agent_logs')
          .select('id', { count: 'exact', head: true })
          .eq('agent', agent)
          .eq('status', 'error')
          .gte('created_at', since24h);

        const errorRate = runs > 0 ? Math.round(((errors || 0) / runs) * 100) : 0;
        if (errorRate > 50) {
          checks.push({ name: `Agent ${agent}`, agent, status: 'critical', message: `Agent ${agent}: ${errors}/${runs} erreurs (${errorRate}%)`, fix: `Verifier les logs d'erreur de l'agent ${agent}` });
        } else if (errorRate > 20) {
          checks.push({ name: `Agent ${agent}`, agent, status: 'warn', message: `Agent ${agent}: ${runs} runs, ${errors} erreurs (${errorRate}%)` });
        } else {
          checks.push({ name: `Agent ${agent}`, agent, status: 'pass', message: `Agent ${agent}: ${runs} runs, ${errors || 0} erreurs` });
        }
      }
    }
  } catch { checks.push({ name: 'Agent Activity', agent: 'ceo', status: 'warn', message: 'Erreur verification activite agents' }); }

  // ═══ CHECK 5: RAG Health ═══
  try {
    const { count: totalKnowledge } = await supabase
      .from('agent_knowledge')
      .select('id', { count: 'exact', head: true });

    const { count: withEmbedding } = await supabase
      .from('agent_knowledge')
      .select('id', { count: 'exact', head: true })
      .not('embedding', 'is', null);

    const { count: withoutEmbedding } = await supabase
      .from('agent_knowledge')
      .select('id', { count: 'exact', head: true })
      .is('embedding', null);

    const missingPct = totalKnowledge ? Math.round(((withoutEmbedding || 0) / totalKnowledge) * 100) : 0;

    if (missingPct > 10) {
      checks.push({ name: 'RAG Embeddings', agent: 'ceo', status: 'critical', message: `${withoutEmbedding} learnings sans embedding (${missingPct}%) — agents aveugles`, fix: 'Lancer le backfill: POST /api/agents/knowledge-backfill?batch=200' });
    } else if (missingPct > 0) {
      checks.push({ name: 'RAG Embeddings', agent: 'ceo', status: 'warn', message: `${withoutEmbedding} learnings sans embedding (${missingPct}%)` });
    } else {
      checks.push({ name: 'RAG Embeddings', agent: 'ceo', status: 'pass', message: `${totalKnowledge} learnings, 100% avec embedding` });
    }
  } catch { checks.push({ name: 'RAG Health', agent: 'ceo', status: 'warn', message: 'Erreur verification RAG' }); }

  // ═══ CHECK 6: CRM Health ═══
  try {
    const { count: totalProspects } = await supabase
      .from('crm_prospects')
      .select('id', { count: 'exact', head: true });

    const { count: noType } = await supabase
      .from('crm_prospects')
      .select('id', { count: 'exact', head: true })
      .or('type.is.null,type.eq.');

    if ((noType || 0) > 10) {
      checks.push({ name: 'CRM Types', agent: 'commercial', status: 'warn', message: `${noType} prospects sans type de commerce — attribution "autre"`, fix: 'Lancer la recategorisation automatique des prospects sans type' });
    } else {
      checks.push({ name: 'CRM Types', agent: 'commercial', status: 'pass', message: `${totalProspects} prospects, ${noType || 0} sans type` });
    }
  } catch { checks.push({ name: 'CRM Health', agent: 'commercial', status: 'warn', message: 'Erreur verification CRM' }); }

  // ═══ CHECK 7: Cron Health ═══
  try {
    const since12h = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
    const { count: cronRuns } = await supabase
      .from('agent_logs')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since12h);

    if ((cronRuns || 0) < 10) {
      checks.push({ name: 'Cron Health', agent: 'ceo', status: 'critical', message: `Seulement ${cronRuns} executions en 12h — les crons ne tournent peut-etre pas`, fix: 'Verifier les crons dans Vercel Dashboard → Cron Jobs' });
    } else {
      checks.push({ name: 'Cron Health', agent: 'ceo', status: 'pass', message: `${cronRuns} executions en 12h — crons actifs` });
    }
  } catch { checks.push({ name: 'Cron Health', agent: 'ceo', status: 'warn', message: 'Erreur verification crons' }); }

  // ═══ SCORE GLOBAL ═══
  const critical = checks.filter(c => c.status === 'critical').length;
  const fail = checks.filter(c => c.status === 'fail').length;
  const warn = checks.filter(c => c.status === 'warn').length;
  const pass = checks.filter(c => c.status === 'pass').length;
  const total = checks.length;
  const score = Math.max(0, Math.round(((pass * 10 + warn * 5) / (total * 10)) * 100));

  // ═══ SAVE TO RAG ═══
  const issuesSummary = checks.filter(c => c.status !== 'pass').map(c => `${c.status.toUpperCase()} ${c.name}: ${c.message}`).join('. ');
  if (issuesSummary) {
    await supabase.from('agent_knowledge').insert({
      content: `QA_REPORT ${now.toISOString().split('T')[0]}: Score ${score}/100. ${critical} critical, ${fail} fail, ${warn} warn. Issues: ${issuesSummary.substring(0, 500)}`,
      summary: `QA Report: score ${score}/100, ${critical} critical, ${fail} fail`,
      agent: 'ceo',
      category: 'learning',
      confidence: 0.85,
      source: 'qa_agent',
      created_by: 'system',
    });
  }

  // ═══ ESCALATE CRITICAL ISSUES ═══
  for (const check of checks.filter(c => c.status === 'critical')) {
    await escalateAgentError({
      agent: check.agent,
      action: `qa_${check.name.toLowerCase().replace(/\s/g, '_')}`,
      error: check.message,
      context: check.fix || '',
    }).catch(() => {});
  }

  // ═══ SEND REPORT EMAIL ═══
  const BREVO_KEY = process.env.BREVO_API_KEY;
  if (BREVO_KEY) {
    const checksHtml = checks.map(c => {
      const color = c.status === 'pass' ? '#22c55e' : c.status === 'warn' ? '#f59e0b' : c.status === 'fail' ? '#ef4444' : '#dc2626';
      const icon = c.status === 'pass' ? '✅' : c.status === 'warn' ? '⚠️' : '🔴';
      return `<tr><td style="padding:4px 8px;">${icon}</td><td style="padding:4px 8px;">${c.name}</td><td style="padding:4px 8px;color:${color};font-weight:bold;">${c.status.toUpperCase()}</td><td style="padding:4px 8px;font-size:12px;">${c.message}</td>${c.fix ? `<td style="padding:4px 8px;font-size:11px;color:#3b82f6;">${c.fix}</td>` : '<td></td>'}</tr>`;
    }).join('');

    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'accept': 'application/json', 'api-key': BREVO_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'KeiroAI QA Agent', email: 'contact@keiroai.com' },
        to: [{ email: ADMIN_EMAIL }],
        subject: `${critical > 0 ? '🔴' : score >= 80 ? '✅' : '⚠️'} QA Report — Score ${score}/100 | ${critical} critical, ${fail} fail`,
        htmlContent: `<div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
          <div style="background:linear-gradient(135deg,#0c1a3a,#1e3a5f);color:white;padding:20px;border-radius:12px 12px 0 0;">
            <h2 style="margin:0;">🧪 QA Agent Report — Score ${score}/100</h2>
            <p style="margin:4px 0 0;color:#a0aec0;font-size:13px;">${now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} — Mode: ${mode}</p>
          </div>
          <div style="background:white;padding:20px;border:1px solid #e5e7eb;">
            <div style="display:flex;gap:16px;margin-bottom:16px;">
              <div style="flex:1;background:#f0fdf4;padding:12px;border-radius:8px;text-align:center;"><div style="font-size:24px;font-weight:bold;color:#22c55e;">${pass}</div><div style="font-size:11px;">Pass</div></div>
              <div style="flex:1;background:#fefce8;padding:12px;border-radius:8px;text-align:center;"><div style="font-size:24px;font-weight:bold;color:#f59e0b;">${warn}</div><div style="font-size:11px;">Warn</div></div>
              <div style="flex:1;background:#fef2f2;padding:12px;border-radius:8px;text-align:center;"><div style="font-size:24px;font-weight:bold;color:#ef4444;">${fail + critical}</div><div style="font-size:11px;">Fail/Critical</div></div>
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr style="background:#f9fafb;"><th style="padding:6px 8px;text-align:left;"></th><th style="padding:6px 8px;text-align:left;">Check</th><th style="padding:6px 8px;text-align:left;">Status</th><th style="padding:6px 8px;text-align:left;">Details</th><th style="padding:6px 8px;text-align:left;">Fix</th></tr></thead><tbody>${checksHtml}</tbody></table>
          </div>
          <div style="background:#f9fafb;padding:12px;text-align:center;color:#9ca3af;font-size:11px;border-radius:0 0 12px 12px;">KeiroAI QA Agent — Rapport automatique</div>
        </div>`,
      }),
    }).catch(() => {});
  }

  // ═══ LOG ═══
  await supabase.from('agent_logs').insert({
    agent: 'qa',
    action: `qa_check_${mode}`,
    status: critical > 0 ? 'error' : 'success',
    data: { score, critical, fail, warn, pass, total, checks },
    created_at: now.toISOString(),
  });

  console.log(`[QA Agent] Complete: score ${score}/100, ${critical} critical, ${fail} fail, ${warn} warn, ${pass} pass`);

  return NextResponse.json({
    ok: true,
    score,
    summary: { critical, fail, warn, pass, total },
    checks,
  });
}

/**
 * GET /api/agents/qa — Dernier rapport QA
 */
export async function GET() {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('agent_logs')
    .select('data, created_at')
    .eq('agent', 'qa')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  return NextResponse.json(data || { message: 'Aucun rapport QA disponible' });
}
