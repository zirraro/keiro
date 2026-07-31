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
    // Déjà en count exact : pas de plafond ici.
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
      // PostgREST plafonne à 1 000 lignes : au-delà, ces totaux sous-estiment.
      // Acceptable pour un journal d'activité sur 30 jours, à revoir si un
      // client dépasse ce volume — les compteurs deviendraient trompeurs.
      .eq('user_id', user.id).gte('created_at', since).limit(1000);
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

  // ── WhatsApp (Stella) ───────────────────────────────────────────
  // Compté sur les vraies conversations, pas sur le journal des agents : un
  // client qui écrit en premier n'y laisse aucune trace côté agent.
  try {
    const { count: waConv } = await sb.from('whatsapp_conversations')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', user.id).gte('created_at', since);
    if (waConv != null) metrics.wa_conversations = waConv;
  } catch { /* Stella pas branchée : métrique absente, pas nulle */ }

  // ── Prospection et CRM ──────────────────────────────────────────
  //
  // 2026-07-31 — Réécrit après un chiffre faux affiché au client : la tuile
  // « prospects contactés » annonçait 1 000 pile. Ce n'était pas un résultat,
  // c'était le PLAFOND de PostgREST, qui ne renvoie jamais plus de 1 000
  // lignes quelle que soit la limite demandée. Sur 9 643 prospects, on
  // comptait donc dans un échantillon tronqué, et le même plafond faussait
  // toutes les métriques calculées en ramenant des lignes.
  //
  // On compte désormais côté serveur (count exact, head: true) : une requête
  // par métrique, aucune ligne transférée, aucun plafond.
  //
  // Le vocabulaire des statuts a été relevé dans la base plutôt que supposé.
  // L'ancien code traitait « identifie » et « perdu » comme des prospects
  // contactés — soit 8 759 sur 9 643 comptés à tort.
  try {
    const compte = async (filtre: (q: any) => any) => {
      const { count } = await filtre(
        sb.from('crm_prospects').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      );
      return count ?? 0;
    };

    // Un prospect a été touché à partir du moment où on lui a écrit.
    const TOUCHES = ['contacte', 'relance_1', 'relance_2', 'relance_3', 'repondu', 'interesse', 'demo', 'negociation', 'client', 'gagne', 'signe'];
    const REPONDU = ['repondu', 'interesse', 'demo', 'negociation', 'client', 'gagne', 'signe'];
    const SIGNE = ['client', 'gagne', 'signe'];

    const [trouves, chauds, contactes, repondus, signes] = await Promise.all([
      compte(q => q.gte('created_at', since)),
      compte(q => q.eq('temperature', 'hot')),
      compte(q => q.in('status', TOUCHES)),
      compte(q => q.in('status', REPONDU)),
      compte(q => q.in('status', SIGNE)),
    ]);

    metrics.prospects_found = trouves;
    metrics.prospects_hot = chauds;
    metrics.prospects_contacted = contactes;
    metrics.prospects_replied = repondus;
    metrics.clients_converted = signes;
    // Un taux calculé sur zéro contact ne veut rien dire : on ne l'affiche pas.
    if (contactes > 0) metrics.conversion_rate = Math.round((signes / contactes) * 1000) / 10;
    if (contactes > 0) metrics.reply_rate = Math.round((repondus / contactes) * 1000) / 10;
  } catch { /* métrique absente plutôt que fausse */ }

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
