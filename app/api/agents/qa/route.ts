import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { escalateAgentError } from '@/lib/agents/error-escalation';
import { QA_MODULES, QA_GROUPS, type QACheck } from '@/lib/agents/qa-modules';

export const runtime = 'nodejs';
export const maxDuration = 300;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ADMIN_EMAIL = 'contact@keiroai.com';

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * POST /api/agents/qa
 * Agent QA supra elite — teste comme un vrai client
 *
 * ?mode=full|quick|agents|content|acquisition|infrastructure
 * ?modules=instagram_token,publications,... (specifiques)
 * ?team=acquisition|content|strategy|support
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabase();
  const url = new URL(req.url);
  const mode = url.searchParams.get('mode') || 'full';
  const specificModules = url.searchParams.get('modules')?.split(',').filter(Boolean);
  const team = url.searchParams.get('team');
  const now = new Date();

  let modulesToRun: string[];
  if (specificModules?.length) {
    modulesToRun = specificModules.filter(m => QA_MODULES[m]);
  } else if (team) {
    const teamMap: Record<string, string[]> = {
      acquisition: ['email_health', 'crm_workflow', 'agent_health'],
      content: ['instagram_token', 'publications', 'generate_image'],
      strategy: ['rag_health', 'agent_health', 'cron_health'],
      support: ['chatbot_test', 'crm_workflow'],
    };
    modulesToRun = teamMap[team] || QA_GROUPS.full;
  } else {
    modulesToRun = QA_GROUPS[mode] || QA_GROUPS.full;
  }

  const allChecks: QACheck[] = [];
  for (const mod of modulesToRun) {
    try {
      const checks = await QA_MODULES[mod]?.(supabase);
      if (checks) allChecks.push(...checks);
    } catch (err: any) {
      allChecks.push({ name: `Module ${mod}`, module: mod, agent: 'qa', status: 'fail', message: `Crash: ${err.message?.substring(0, 200)}`, duration_ms: 0 });
    }
  }

  const critical = allChecks.filter(c => c.status === 'critical').length;
  const fail = allChecks.filter(c => c.status === 'fail').length;
  const warn = allChecks.filter(c => c.status === 'warn').length;
  const pass = allChecks.filter(c => c.status === 'pass').length;
  const total = allChecks.length;
  const score = total > 0 ? Math.max(0, Math.round(((pass * 10 + warn * 5) / (total * 10)) * 100)) : 0;

  // Escalate criticals
  for (const c of allChecks.filter(c => c.status === 'critical')) {
    escalateAgentError({ agent: c.agent, action: `qa_${c.module}`, error: c.message, context: c.fix || '' }).catch(() => {});
  }

  // Save RAG
  const issues = allChecks.filter(c => c.status !== 'pass');
  if (issues.length > 0) {
    await supabase.from('agent_knowledge').insert({
      content: `QA_REPORT ${now.toISOString().split('T')[0]}: Score ${score}/100. ${critical}C ${fail}F ${warn}W. ${issues.map(i => `${i.status} ${i.name}: ${i.message}`).join('. ').substring(0, 500)}`,
      summary: `QA ${mode}: ${score}/100, ${critical}C ${fail}F`,
      agent: 'ceo', category: 'learning', confidence: 0.85, source: 'qa_agent', created_by: 'system',
    });
  }

  // Email report
  const BREVO_KEY = process.env.BREVO_API_KEY;
  if (BREVO_KEY && (critical > 0 || fail > 0 || mode === 'full')) {
    const rows = allChecks.map(c => {
      const color = c.status === 'pass' ? '#22c55e' : c.status === 'warn' ? '#f59e0b' : '#dc2626';
      const icon = c.status === 'pass' ? '✅' : c.status === 'warn' ? '⚠️' : '🔴';
      return `<tr><td style="padding:3px 6px;">${icon}</td><td style="padding:3px 6px;">${c.name}</td><td style="padding:3px 6px;color:${color};font-weight:bold;font-size:11px;">${c.status}</td><td style="padding:3px 6px;font-size:12px;">${c.message}</td>${c.fix ? `<td style="padding:3px 6px;font-size:11px;color:#3b82f6;">${c.fix}</td>` : '<td></td>'}</tr>`;
    }).join('');

    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'accept': 'application/json', 'api-key': BREVO_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'KeiroAI QA Agent', email: 'contact@keiroai.com' },
        to: [{ email: ADMIN_EMAIL }],
        subject: `${critical > 0 ? '🔴' : score >= 80 ? '✅' : '⚠️'} QA ${mode} — ${score}/100 | ${critical}C ${fail}F ${warn}W`,
        htmlContent: `<div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;"><div style="background:linear-gradient(135deg,#0c1a3a,#1e3a5f);color:white;padding:16px;border-radius:12px 12px 0 0;"><h2 style="margin:0;font-size:16px;">🧪 QA Report — ${score}/100</h2><p style="margin:4px 0 0;color:#a0aec0;font-size:12px;">${now.toLocaleString('fr-FR')} | ${mode} | ${modulesToRun.length} modules</p></div><div style="background:white;padding:16px;border:1px solid #e5e7eb;"><table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="background:#f9fafb;"><th style="padding:4px;text-align:left;"></th><th style="padding:4px;text-align:left;">Check</th><th style="padding:4px;">Status</th><th style="padding:4px;text-align:left;">Details</th><th style="padding:4px;text-align:left;">Fix</th></tr></thead><tbody>${rows}</tbody></table></div><div style="background:#f9fafb;padding:8px;text-align:center;color:#9ca3af;font-size:10px;border-radius:0 0 12px 12px;">QA Agent | [${modulesToRun.join(',')}]</div></div>`,
      }),
    }).catch(() => {});
  }

  await supabase.from('agent_logs').insert({ agent: 'qa', action: `qa_${mode}`, status: critical > 0 ? 'error' : 'success', data: { score, critical, fail, warn, pass, total, modules: modulesToRun, checks: allChecks }, created_at: now.toISOString() });

  return NextResponse.json({ ok: true, score, mode, modules_run: modulesToRun, available_modules: Object.keys(QA_MODULES), available_groups: QA_GROUPS, summary: { critical, fail, warn, pass, total }, checks: allChecks });
}

export async function GET() {
  const supabase = getSupabase();
  const { data } = await supabase.from('agent_logs').select('data, created_at').eq('agent', 'qa').order('created_at', { ascending: false }).limit(1).single();
  return NextResponse.json({ last_report: data || null, available_modules: Object.keys(QA_MODULES), available_groups: QA_GROUPS });
}
