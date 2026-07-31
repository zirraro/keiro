import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Métriques unifiées du client, pour la grille de statistiques configurable.
 *
 * Un seul endpoint plutôt que d'aller piocher dans chaque panneau : les
 * panneaux renvoient des formes différentes par agent, ce qui rendrait toute
 * personnalisation ingérable. Ici, chaque identifiant du catalogue
 * (lib/stats/catalog.ts) correspond à une valeur calculée sur les mêmes 30
 * jours glissants.
 *
 * Une métrique qu'on ne sait pas calculer est ABSENTE de la réponse — la
 * grille ne l'affiche donc pas. Mieux vaut une tuile en moins qu'une tuile qui
 * ment.
 *
 * GET  → { ok, metrics: { id: number }, prefs: string[], businessType }
 * POST → enregistre la sélection du client { stats: string[] }
 */

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET() {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ ok: false, error: 'Connexion requise' }, { status: 401 });

  const sb = admin();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const sinceDay = since.slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const metrics: Record<string, number> = {};

  // ── Contenu et engagement ───────────────────────────────────────
  try {
    const { data: posts } = await sb
      .from('content_calendar')
      .select('status, format, engagement_data, published_at, scheduled_date')
      .eq('user_id', user.id)
      .gte('scheduled_date', sinceDay)
      .limit(2000);

    const rows = posts || [];
    const published = rows.filter(p => p.status === 'published');
    metrics.posts_published = published.length;
    metrics.posts_scheduled = rows.filter(p => ['approved', 'draft'].includes(p.status) && String(p.scheduled_date) >= today).length;

    let reach = 0, views = 0, likes = 0, comments = 0, saves = 0, best = 0;
    for (const p of published) {
      const e = (p.engagement_data as any) || {};
      const r = Number(e.reach) || Number(e.impressions) || 0;
      reach += r;
      views += Number(e.views) || Number(e.play_count) || 0;
      likes += Number(e.like_count) || 0;
      comments += Number(e.comments_count) || 0;
      saves += Number(e.saved) || 0;
      if (r > best) best = r;
    }
    metrics.reach_total = reach;
    metrics.views_total = views;
    metrics.likes_total = likes;
    metrics.comments_total = comments;
    metrics.saves_total = saves;
    metrics.best_post_reach = best;
    if (reach > 0) metrics.engagement_rate = Math.round(((likes + comments + saves) / reach) * 1000) / 10;
    if (published.length > 0) {
      const vids = published.filter(p => ['reel', 'video'].includes(String(p.format))).length;
      metrics.video_share = Math.round((vids / published.length) * 100);
    }
  } catch { /* métrique absente plutôt que fausse */ }

  // ── DM et commentaires ──────────────────────────────────────────
  try {
    const { count: sent } = await sb.from('dm_queue').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('status', 'sent').gte('updated_at', since);
    const { count: pending } = await sb.from('dm_queue').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('status', 'pending');
    if (sent != null) metrics.dm_conversations = sent;
    if (pending != null) metrics.dm_pending = pending;
  } catch { /* ignore */ }

  // ── Activité des agents (journal) ───────────────────────────────
  try {
    const { data: logs } = await sb.from('agent_logs')
      .select('agent, action, status, data')
      .eq('user_id', user.id).gte('created_at', since).limit(3000);
    const rows = logs || [];
    metrics.actions_done = rows.filter(l => l.status === 'success' || l.status === 'ok').length;
    metrics.agents_active = new Set(rows.map(l => l.agent)).size;
    metrics.dm_auto_replied = rows.filter(l => /auto_reply|dm_replied/.test(String(l.action))).length;
    metrics.comments_answered = rows.filter(l => /comment/.test(String(l.action))).length;
    metrics.reviews_answered = rows.filter(l => /review|avis/.test(String(l.action))).length;
    metrics.wa_messages_sent = rows.filter(l => l.agent === 'whatsapp').length;
    // Mails triés par Hugo : on additionne les résultats réels des tris.
    const triage = rows.filter(l => /mailbox|triage/.test(String(l.action)));
    const cleaned = triage.reduce((s, l) => {
      const d: any = l.data || {};
      return s + (Number(d.trashed) || 0) + (Number(d.archived) || 0) + (Number(d.labeled) || 0);
    }, 0);
    if (cleaned > 0) metrics.inbox_cleaned = cleaned;
  } catch { /* ignore */ }

  // ── Prospection et CRM ──────────────────────────────────────────
  try {
    const { data: prospects } = await sb.from('crm_prospects')
      .select('status, temperature, created_at')
      .eq('user_id', user.id).limit(5000);
    const rows = prospects || [];
    metrics.prospects_found = rows.filter(p => String(p.created_at) >= since).length;
    metrics.prospects_hot = rows.filter(p => p.temperature === 'hot').length;
    const contacted = rows.filter(p => !['nouveau', 'a_contacter', null, ''].includes(String(p.status)));
    const replied = rows.filter(p => ['repondu', 'interesse', 'demo'].includes(String(p.status)));
    const won = rows.filter(p => ['client', 'gagne', 'signe'].includes(String(p.status)));
    metrics.prospects_contacted = contacted.length;
    metrics.prospects_replied = replied.length;
    metrics.clients_converted = won.length;
    if (contacted.length > 0) metrics.conversion_rate = Math.round((won.length / contacted.length) * 1000) / 10;
  } catch { /* ignore */ }

  // ── Emails ──────────────────────────────────────────────────────
  try {
    const { data: acts } = await sb.from('crm_activities')
      .select('type, created_at, crm_prospects!inner(user_id)')
      .eq('crm_prospects.user_id', user.id).gte('created_at', since).limit(3000);
    const rows = acts || [];
    metrics.emails_sent = rows.filter(a => a.type === 'email').length;
    metrics.emails_replied = rows.filter(a => /repl|repons/.test(String(a.type))).length;
    const opened = rows.filter(a => /open/.test(String(a.type))).length;
    if (metrics.emails_sent > 0) metrics.emails_opened_rate = Math.round((opened / metrics.emails_sent) * 1000) / 10;
  } catch { /* ignore */ }

  // ── Crédits ─────────────────────────────────────────────────────
  try {
    const { data: tx } = await sb.from('credit_transactions')
      .select('amount').eq('user_id', user.id).lt('amount', 0).gte('created_at', since).limit(3000);
    metrics.credits_used = (tx || []).reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
  } catch { /* ignore */ }

  // ── Préférences d'affichage + type de commerce ──────────────────
  let prefs: string[] = [];
  let businessType: string | null = null;
  try {
    const { data: dossier } = await sb.from('business_dossiers').select('business_type').eq('user_id', user.id).maybeSingle();
    businessType = dossier?.business_type || null;
    const { data: cfg } = await sb.from('org_agent_configs').select('config')
      .eq('user_id', user.id).eq('agent_id', 'dashboard')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    const saved = (cfg?.config as any)?.stats;
    if (Array.isArray(saved)) prefs = saved;
  } catch { /* ignore */ }

  return NextResponse.json({ ok: true, metrics, prefs, businessType });
}

export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ ok: false, error: 'Connexion requise' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const stats = Array.isArray(body?.stats) ? body.stats.filter((s: any) => typeof s === 'string').slice(0, 12) : null;
  if (!stats) return NextResponse.json({ ok: false, error: 'stats requis' }, { status: 400 });

  const sb = admin();
  try {
    const { data: existing } = await sb.from('org_agent_configs').select('id, config')
      .eq('user_id', user.id).eq('agent_id', 'dashboard')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    const next = { ...((existing?.config as any) || {}), stats, updated_at: new Date().toISOString() };
    if (existing?.id) await sb.from('org_agent_configs').update({ config: next }).eq('id', existing.id);
    else await sb.from('org_agent_configs').insert({ user_id: user.id, agent_id: 'dashboard', config: next });
    return NextResponse.json({ ok: true, stats });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'échec' }, { status: 500 });
  }
}
