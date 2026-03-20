import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Parse .env.local manually
const envContent = readFileSync('.env.local', 'utf8');
for (const line of envContent.split(/\r?\n/)) {
  const idx = line.indexOf('=');
  if (idx > 0 && !line.startsWith('#')) {
    const key = line.substring(0, idx).trim();
    const val = line.substring(idx + 1).trim();
    if (key && val) process.env[key] = val;
  }
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function audit() {
  const { count: totalProspects } = await sb.from('crm_prospects').select('id', { count: 'exact', head: true });

  const { data: prospects } = await sb.from('crm_prospects').select('status, temperature, type, email, instagram, phone, score').limit(5000);

  const byStatus = {};
  const byTemp = {};
  const byType = {};
  let noEmail = 0, noInsta = 0, noPhone = 0, noScore = 0;
  const emailCounts = {};

  for (const p of prospects || []) {
    byStatus[p.status || 'null'] = (byStatus[p.status || 'null'] || 0) + 1;
    byTemp[p.temperature || 'null'] = (byTemp[p.temperature || 'null'] || 0) + 1;
    byType[p.type || 'null'] = (byType[p.type || 'null'] || 0) + 1;
    if (p.email == null || p.email === '') noEmail++;
    if (p.instagram == null || p.instagram === '' || p.instagram === 'A_VERIFIER') noInsta++;
    if (p.phone == null || p.phone === '') noPhone++;
    if (p.score == null || p.score === 0) noScore++;
    if (p.email) {
      emailCounts[p.email] = (emailCounts[p.email] || 0) + 1;
    }
  }

  const dupes = Object.entries(emailCounts).filter(([k, v]) => v > 1);

  const { count: totalLogs } = await sb.from('agent_logs').select('id', { count: 'exact', head: true });

  const { data: logsByAgent } = await sb.from('agent_logs').select('agent').limit(10000);
  const agentCounts = {};
  for (const l of logsByAgent || []) {
    agentCounts[l.agent || 'null'] = (agentCounts[l.agent || 'null'] || 0) + 1;
  }

  const { count: learningsCount } = await sb.from('agent_logs').select('id', { count: 'exact', head: true }).eq('action', 'learning');
  const { count: feedbacksCount } = await sb.from('agent_logs').select('id', { count: 'exact', head: true }).eq('action', 'agent_feedback');

  const { data: contentStats } = await sb.from('content_calendar').select('status, platform').limit(2000);
  const contentByStatus = {};
  const contentByPlatform = {};
  for (const c of contentStats || []) {
    contentByStatus[c.status || 'null'] = (contentByStatus[c.status || 'null'] || 0) + 1;
    contentByPlatform[c.platform || 'null'] = (contentByPlatform[c.platform || 'null'] || 0) + 1;
  }

  // DM queue stats
  const { count: dmTotal } = await sb.from('dm_queue').select('id', { count: 'exact', head: true });
  const { data: dmByStatus } = await sb.from('dm_queue').select('status').limit(5000);
  const dmStats = {};
  for (const d of dmByStatus || []) {
    dmStats[d.status || 'null'] = (dmStats[d.status || 'null'] || 0) + 1;
  }

  // Onboarding queue
  const { data: obByStatus } = await sb.from('onboarding_queue').select('status').limit(5000);
  const obStats = {};
  for (const o of obByStatus || []) {
    obStats[o.status || 'null'] = (obStats[o.status || 'null'] || 0) + 1;
  }

  console.log(JSON.stringify({
    crm: { total: totalProspects, byStatus, byTemp, byType, noEmail, noInsta, noPhone, noScore, duplicateEmails: dupes.length, topDupes: dupes.slice(0, 5) },
    agentLogs: { total: totalLogs, byAgent: agentCounts, learnings: learningsCount, feedbacks: feedbacksCount },
    content: { byStatus: contentByStatus, byPlatform: contentByPlatform },
    dmQueue: { total: dmTotal, byStatus: dmStats },
    onboarding: { byStatus: obStats },
  }, null, 2));
}

audit().catch(e => console.error(e.message));
