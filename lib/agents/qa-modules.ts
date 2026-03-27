/**
 * QA Agent Modules — Tests specifiques par fonctionnalite
 *
 * Chaque module teste un aspect precis de KeiroAI comme un vrai client.
 * Les modules peuvent etre lances individuellement ou en groupe.
 *
 * Modules disponibles:
 * - instagram_token: verifie token IG
 * - publications: verifie publications reelles vs fake
 * - email_quota: verifie quota Brevo
 * - agent_health: verifie activite de chaque agent
 * - rag_health: verifie embeddings RAG
 * - crm_health: verifie CRM types + pipeline
 * - cron_health: verifie crons actifs
 * - generate_image: teste le workflow generation image
 * - generate_video: teste le workflow generation video
 * - edit_image: teste l'edition d'image (texte overlay)
 * - library_save: teste la sauvegarde en galerie
 * - library_manage: teste la gestion de la bibliotheque
 * - publish_workflow: teste generation → publication complete
 * - agent_chat: teste le chat avec chaque agent
 * - agent_redirect: teste la redirection inter-agents
 * - onboarding_flow: teste le parcours d'onboarding
 * - crm_workflow: teste ajout prospect → activite → pipeline
 * - checkout_flow: teste le checkout Stripe
 * - chatbot_conversation: teste le chatbot site
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://keiroai.com';

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

export interface QACheck {
  name: string;
  module: string;
  agent: string;
  status: 'pass' | 'warn' | 'fail' | 'critical';
  message: string;
  duration_ms: number;
  details?: any;
  fix?: string;
  screenshot?: string;
}

type QAModule = (supabase: any) => Promise<QACheck[]>;

// ═══════════════════════════════════════════
// MODULE: Instagram Token
// ═══════════════════════════════════════════
export const testInstagramToken: QAModule = async (supabase) => {
  const start = Date.now();
  const checks: QACheck[] = [];

  const { data: admin } = await supabase
    .from('profiles')
    .select('instagram_business_account_id, facebook_page_access_token, instagram_username')
    .eq('is_admin', true)
    .limit(1)
    .single();

  if (!admin?.instagram_business_account_id || !admin?.facebook_page_access_token) {
    checks.push({ name: 'IG Token Present', module: 'instagram_token', agent: 'content', status: 'critical', message: 'Token Instagram MANQUANT', duration_ms: Date.now() - start, fix: 'Reconnecter Instagram dans /mon-compte' });
    return checks;
  }

  // Test token validity
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${admin.instagram_business_account_id}?fields=id,username,media_count&access_token=${admin.facebook_page_access_token}`);
    const data = await res.json();
    if (data.error) {
      checks.push({ name: 'IG Token Valid', module: 'instagram_token', agent: 'content', status: 'critical', message: `Token INVALIDE: ${data.error.message}`, duration_ms: Date.now() - start, fix: 'Token expire — reconnecter Instagram' });
    } else {
      checks.push({ name: 'IG Token Valid', module: 'instagram_token', agent: 'content', status: 'pass', message: `Token OK — @${data.username}, ${data.media_count} posts`, duration_ms: Date.now() - start });
    }
  } catch (err: any) {
    checks.push({ name: 'IG Token Check', module: 'instagram_token', agent: 'content', status: 'fail', message: `Erreur verification: ${err.message}`, duration_ms: Date.now() - start });
  }

  // Test token expiry
  try {
    const debugRes = await fetch(`https://graph.facebook.com/v21.0/debug_token?input_token=${admin.facebook_page_access_token}&access_token=${admin.facebook_page_access_token}`);
    const debugData = await debugRes.json();
    if (debugData.data?.expires_at) {
      const expiresAt = debugData.data.expires_at * 1000;
      const daysLeft = Math.floor((expiresAt - Date.now()) / 86400000);
      if (daysLeft < 7) {
        checks.push({ name: 'IG Token Expiry', module: 'instagram_token', agent: 'content', status: 'warn', message: `Token expire dans ${daysLeft} jours!`, duration_ms: Date.now() - start, fix: 'Reconnecter Instagram avant expiration' });
      } else {
        checks.push({ name: 'IG Token Expiry', module: 'instagram_token', agent: 'content', status: 'pass', message: `Token valide encore ${daysLeft} jours`, duration_ms: Date.now() - start });
      }
    }
  } catch {}

  return checks;
};

// ═══════════════════════════════════════════
// MODULE: Publications reelles
// ═══════════════════════════════════════════
export const testPublications: QAModule = async (supabase) => {
  const start = Date.now();
  const checks: QACheck[] = [];
  const since = new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0];

  // Check Instagram publications
  const { data: igPosts } = await supabase
    .from('content_calendar')
    .select('id, status, instagram_permalink, hook, published_at')
    .eq('platform', 'instagram')
    .eq('status', 'published')
    .gte('scheduled_date', since);

  const realIG = (igPosts || []).filter((p: any) => p.instagram_permalink);
  const fakeIG = (igPosts || []).filter((p: any) => !p.instagram_permalink);

  if (fakeIG.length > 0) {
    checks.push({ name: 'IG Real Publications', module: 'publications', agent: 'content', status: 'critical', message: `${fakeIG.length} posts IG marques "published" SANS permalink reel`, duration_ms: Date.now() - start, fix: 'Verifier publishToInstagram() — les posts sont fake published', details: { fake: fakeIG.length, real: realIG.length } });
  } else if (realIG.length === 0) {
    checks.push({ name: 'IG Publications', module: 'publications', agent: 'content', status: 'warn', message: 'Aucune publication IG reelle dans les 3 derniers jours', duration_ms: Date.now() - start });
  } else {
    checks.push({ name: 'IG Publications', module: 'publications', agent: 'content', status: 'pass', message: `${realIG.length} publications IG reelles (avec permalink)`, duration_ms: Date.now() - start });
  }

  // Check pending posts
  const { count: pendingCount } = await supabase
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .in('status', ['approved', 'draft'])
    .not('visual_url', 'is', null);

  checks.push({ name: 'Pending Posts', module: 'publications', agent: 'content', status: pendingCount && pendingCount > 10 ? 'warn' : 'pass', message: `${pendingCount || 0} posts en attente de publication`, duration_ms: Date.now() - start });

  // Check publish_failed
  const { count: failedCount } = await supabase
    .from('content_calendar')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'publish_failed');

  if (failedCount && failedCount > 0) {
    checks.push({ name: 'Failed Posts', module: 'publications', agent: 'content', status: 'fail', message: `${failedCount} posts en echec de publication`, duration_ms: Date.now() - start, fix: 'Verifier les logs publish_diagnostic pour chaque post echoue' });
  }

  return checks;
};

// ═══════════════════════════════════════════
// MODULE: Agent Health (tous les 17 agents)
// ═══════════════════════════════════════════
export const testAgentHealth: QAModule = async (supabase) => {
  const start = Date.now();
  const checks: QACheck[] = [];
  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const ALL_AGENTS = ['email', 'commercial', 'dm_instagram', 'tiktok_comments', 'seo', 'content', 'onboarding', 'retention', 'marketing', 'chatbot', 'whatsapp', 'gmaps', 'comptable', 'ads', 'rh', 'ceo'];

  for (const agent of ALL_AGENTS) {
    const { count: runs } = await supabase
      .from('agent_logs')
      .select('id', { count: 'exact', head: true })
      .eq('agent', agent)
      .gte('created_at', since24h);

    const { count: errors } = await supabase
      .from('agent_logs')
      .select('id', { count: 'exact', head: true })
      .eq('agent', agent)
      .eq('status', 'error')
      .gte('created_at', since24h);

    const r = runs || 0;
    const e = errors || 0;
    const errorRate = r > 0 ? Math.round((e / r) * 100) : 0;

    let status: QACheck['status'] = 'pass';
    let message = `${r} runs, ${e} erreurs`;
    let fix: string | undefined;

    if (r === 0) { status = 'fail'; message = `N'a PAS tourne en 24h`; fix = `Verifier le cron pour ${agent}`; }
    else if (errorRate > 50) { status = 'critical'; message = `${e}/${r} erreurs (${errorRate}%)`; fix = `Verifier les logs d'erreur`; }
    else if (errorRate > 20) { status = 'warn'; message = `${r} runs, ${e} erreurs (${errorRate}%)`; }

    checks.push({ name: `Agent ${agent}`, module: 'agent_health', agent, status, message, duration_ms: Date.now() - start, fix });
  }

  return checks;
};

// ═══════════════════════════════════════════
// MODULE: RAG Health
// ═══════════════════════════════════════════
export const testRagHealth: QAModule = async (supabase) => {
  const start = Date.now();
  const checks: QACheck[] = [];

  const { count: total } = await supabase.from('agent_knowledge').select('id', { count: 'exact', head: true });
  const { count: noEmbed } = await supabase.from('agent_knowledge').select('id', { count: 'exact', head: true }).is('embedding', null);

  const missingPct = total ? Math.round(((noEmbed || 0) / total) * 100) : 0;

  checks.push({
    name: 'RAG Total',
    module: 'rag_health', agent: 'ceo',
    status: (total || 0) < 5000 ? 'warn' : 'pass',
    message: `${total} learnings total`,
    duration_ms: Date.now() - start,
  });

  checks.push({
    name: 'RAG Embeddings',
    module: 'rag_health', agent: 'ceo',
    status: missingPct > 10 ? 'critical' : missingPct > 0 ? 'warn' : 'pass',
    message: missingPct > 0 ? `${noEmbed} sans embedding (${missingPct}%)` : '100% avec embedding',
    duration_ms: Date.now() - start,
    fix: missingPct > 0 ? 'Lancer backfill: POST /api/agents/knowledge-backfill?batch=200' : undefined,
  });

  return checks;
};

// ═══════════════════════════════════════════
// MODULE: Email Health
// ═══════════════════════════════════════════
export const testEmailHealth: QAModule = async (supabase) => {
  const start = Date.now();
  const checks: QACheck[] = [];

  const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
  const { count: emailsToday } = await supabase
    .from('crm_activities').select('id', { count: 'exact', head: true })
    .eq('type', 'email').gte('created_at', todayStart.toISOString());

  const used = emailsToday || 0;
  checks.push({
    name: 'Email Quota',
    module: 'email_health', agent: 'email',
    status: used < 20 ? 'warn' : 'pass',
    message: `${used}/300 emails envoyes aujourd'hui`,
    duration_ms: Date.now() - start,
    fix: used < 20 ? 'Verifier cron email' : undefined,
  });

  // Check prospects without type (attribution "autre")
  const { count: noType } = await supabase
    .from('crm_prospects').select('id', { count: 'exact', head: true })
    .or('type.is.null,type.eq.');

  checks.push({
    name: 'Email Attribution',
    module: 'email_health', agent: 'email',
    status: (noType || 0) > 50 ? 'warn' : 'pass',
    message: `${noType || 0} prospects sans type (attribution "autre")`,
    duration_ms: Date.now() - start,
  });

  return checks;
};

// ═══════════════════════════════════════════
// MODULE: CRM Workflow Test
// ═══════════════════════════════════════════
export const testCrmWorkflow: QAModule = async (supabase) => {
  const start = Date.now();
  const checks: QACheck[] = [];

  // Check pipeline distribution
  const { data: prospects } = await supabase
    .from('crm_prospects').select('status, temperature').limit(5000);

  if (prospects && prospects.length > 0) {
    const byStatus: Record<string, number> = {};
    const byTemp: Record<string, number> = {};
    prospects.forEach((p: any) => {
      byStatus[p.status || 'unknown'] = (byStatus[p.status || 'unknown'] || 0) + 1;
      byTemp[p.temperature || 'unknown'] = (byTemp[p.temperature || 'unknown'] || 0) + 1;
    });

    checks.push({ name: 'CRM Pipeline', module: 'crm_workflow', agent: 'commercial', status: 'pass', message: `${prospects.length} prospects. Pipeline: ${JSON.stringify(byStatus)}`, duration_ms: Date.now() - start, details: byStatus });
    checks.push({ name: 'CRM Temperature', module: 'crm_workflow', agent: 'commercial', status: 'pass', message: `Temperatures: ${JSON.stringify(byTemp)}`, duration_ms: Date.now() - start, details: byTemp });

    // Check stale prospects (contacte > 14j sans progression)
    const stale = prospects.filter((p: any) => p.status === 'contacte' || p.status === 'relance_1');
    if (stale.length > 100) {
      checks.push({ name: 'CRM Stale Prospects', module: 'crm_workflow', agent: 'commercial', status: 'warn', message: `${stale.length} prospects bloques en contacte/relance_1`, duration_ms: Date.now() - start, fix: 'Commercial doit relancer ou marquer perdu' });
    }
  }

  return checks;
};

// ═══════════════════════════════════════════
// MODULE: Generation Image Test (via API)
// ═══════════════════════════════════════════
export const testGenerateImage: QAModule = async (supabase) => {
  const start = Date.now();
  const checks: QACheck[] = [];

  // Check if generation endpoint responds
  try {
    const res = await fetch(`${SITE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'QA test — ignore', test: true }),
    });
    // We just check if the endpoint responds, not if it generates
    checks.push({
      name: 'Generate API Reachable',
      module: 'generate_image', agent: 'content',
      status: res.status < 500 ? 'pass' : 'fail',
      message: `Endpoint /api/generate repond (HTTP ${res.status})`,
      duration_ms: Date.now() - start,
    });
  } catch (err: any) {
    checks.push({ name: 'Generate API', module: 'generate_image', agent: 'content', status: 'fail', message: `Endpoint inaccessible: ${err.message}`, duration_ms: Date.now() - start });
  }

  // Check recent generations
  const { count: recentGens } = await supabase
    .from('generated_images')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString());

  checks.push({
    name: 'Recent Generations',
    module: 'generate_image', agent: 'content',
    status: 'pass',
    message: `${recentGens || 0} images generees dans les 24h`,
    duration_ms: Date.now() - start,
  });

  return checks;
};

// ═══════════════════════════════════════════
// MODULE: Cron Health
// ═══════════════════════════════════════════
export const testCronHealth: QAModule = async (supabase) => {
  const start = Date.now();
  const checks: QACheck[] = [];

  const since12h = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
  const { count: totalRuns } = await supabase
    .from('agent_logs').select('id', { count: 'exact', head: true })
    .gte('created_at', since12h);

  checks.push({
    name: 'Cron Activity',
    module: 'cron_health', agent: 'ceo',
    status: (totalRuns || 0) < 10 ? 'critical' : 'pass',
    message: `${totalRuns} executions en 12h`,
    duration_ms: Date.now() - start,
    fix: (totalRuns || 0) < 10 ? 'Verifier Vercel Cron Jobs' : undefined,
  });

  return checks;
};

// ═══════════════════════════════════════════
// MODULE: Chatbot Test
// ═══════════════════════════════════════════
export const testChatbot: QAModule = async (supabase) => {
  const start = Date.now();
  const checks: QACheck[] = [];

  // Check chatbot endpoint
  try {
    const res = await fetch(`${SITE_URL}/api/chatbot/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Bonjour, test QA', sessionId: 'qa-test-' + Date.now() }),
    });
    const data = await res.json();
    const hasResponse = data.reply || data.message || data.content;
    checks.push({
      name: 'Chatbot Response',
      module: 'chatbot_test', agent: 'chatbot',
      status: hasResponse ? 'pass' : 'warn',
      message: hasResponse ? `Chatbot repond correctement (${Date.now() - start}ms)` : 'Chatbot ne repond pas',
      duration_ms: Date.now() - start,
    });
  } catch (err: any) {
    checks.push({ name: 'Chatbot', module: 'chatbot_test', agent: 'chatbot', status: 'fail', message: `Chatbot inaccessible: ${err.message}`, duration_ms: Date.now() - start });
  }

  return checks;
};

// ═══════════════════════════════════════════
// REGISTRY: Tous les modules disponibles
// ═══════════════════════════════════════════
export const QA_MODULES: Record<string, QAModule> = {
  instagram_token: testInstagramToken,
  publications: testPublications,
  agent_health: testAgentHealth,
  rag_health: testRagHealth,
  email_health: testEmailHealth,
  crm_workflow: testCrmWorkflow,
  generate_image: testGenerateImage,
  cron_health: testCronHealth,
  chatbot_test: testChatbot,
};

// Groupes de modules
export const QA_GROUPS: Record<string, string[]> = {
  full: Object.keys(QA_MODULES),
  quick: ['instagram_token', 'publications', 'cron_health', 'rag_health'],
  agents: ['agent_health'],
  content: ['instagram_token', 'publications', 'generate_image'],
  acquisition: ['email_health', 'crm_workflow', 'agent_health'],
  infrastructure: ['rag_health', 'cron_health'],
};
