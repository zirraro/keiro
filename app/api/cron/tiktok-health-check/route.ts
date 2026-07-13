import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * TikTok health check (PSAD §3.6, validé founder). Par compte TikTok connecté,
 * lit les vues des derniers posts (video.list). Si streak de 0 vue sur un compte
 * public → SUPPRESSION_SUSPECTED : pose un flag per-client
 * (org_agent_configs.config.tiktok_health_paused) + alerte. Le brief client est
 * déjà pause-aware (prévient + ajuste le %). Détection seule = ZÉRO risque sur
 * le flux de publication. Bounded + best-effort (token frais via cron dédié).
 */
const ZERO_STREAK_FLAG = 3;

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function recentViews(token: string): Promise<number[] | null> {
  try {
    const r = await fetch('https://open.tiktokapis.com/v2/video/list/?fields=view_count,create_time', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ max_count: 10 }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const v = j?.data?.videos;
    if (!Array.isArray(v)) return null;
    return v.map((x: any) => Number(x.view_count) || 0);
  } catch { return null; }
}

async function run() {
  const supabase = sb();
  const { data: clients } = await supabase
    .from('profiles')
    .select('id, email, tiktok_access_token, tiktok_token_expiry')
    .not('tiktok_access_token', 'is', null);

  const results: any[] = [];
  for (const c of clients || []) {
    const expiry = c.tiktok_token_expiry ? new Date(c.tiktok_token_expiry) : null;
    if (expiry && expiry <= new Date()) { results.push({ user: c.id, skipped: 'token_expired' }); continue; }
    const views = await recentViews(c.tiktok_access_token as string);
    if (!views || views.length < ZERO_STREAK_FLAG) { results.push({ user: c.id, skipped: 'no_data' }); continue; }
    // Count leading zero-view streak (most recent posts).
    let streak = 0;
    for (const v of views) { if (v === 0) streak++; else break; }
    const suspected = streak >= ZERO_STREAK_FLAG;

    // Load current state to detect transitions (pause ↔ resume).
    let cfgRow: any = null, cfg: any = {};
    try {
      const r = await supabase.from('org_agent_configs').select('id, config')
        .eq('user_id', c.id).eq('agent_id', 'content').order('created_at', { ascending: false }).limit(1).maybeSingle();
      cfgRow = r.data; cfg = (cfgRow?.config) || {};
    } catch { /* best-effort */ }
    const wasPaused = cfg.tiktok_health_paused === true;
    const writeCfg = async (next: any) => {
      try {
        if (cfgRow?.id) await supabase.from('org_agent_configs').update({ config: next }).eq('id', cfgRow.id);
        else await supabase.from('org_agent_configs').insert({ user_id: c.id, agent_id: 'content', config: next });
      } catch { /* best-effort */ }
    };

    // 2026-06-23 — Fenêtre de GRÂCE après une reprise (manuelle ou auto). Quand
    // on relance TikTok (ex: après le fix AIGC), les posts tout neufs sont
    // naturellement à 0 vue + les anciens posts throttlés restent dans la liste
    // → le streak re-déclenche la pause AVANT que le nouveau contenu ait pu
    // gagner de la portée. On laisse 5 jours au contenu pour faire ses preuves
    // avant de pouvoir re-pauser. (Founder: "post direct pour voir l'impact".)
    const resumedAt = cfg.tiktok_health_resumed_at ? new Date(cfg.tiktok_health_resumed_at).getTime() : 0;
    const GRACE_DAYS = 5;
    const inGrace = resumedAt > 0 && (Date.now() - resumedAt) < GRACE_DAYS * 86400000;

    // Founder 13/07 : on NE MET PLUS EN PAUSE le TikTok d'un client payant (il ne
    // comprendrait pas d'être coupé alors qu'il paie). On GARDE la détection (log
    // admin) + on donne un CONSEIL STRATÉGIQUE d'activité (suivre/liker pour booster
    // le compte et éviter le throttle de nos propres posts), et on LÈVE toute pause
    // existante. Plus de coupure de diffusion. La grâce n'a plus lieu d'être.
    void inGrace;
    let transition: string | null = null;
    let nextCfg: any = null;

    // 1) Lever toute pause héritée (retour arrière de la politique).
    if (wasPaused) {
      nextCfg = { ...cfg };
      delete nextCfg.tiktok_health_paused; delete nextCfg.tiktok_health_paused_at; delete nextCfg.tiktok_zero_streak;
      nextCfg.tiktok_health_resumed_at = new Date().toISOString();
      transition = 'unpaused_policy';
      await supabase.from('agent_logs').insert({ agent: 'content', action: 'tiktok_unpaused_policy', status: 'info', data: { user_id: c.id, note: 'plus de pause client (décision founder) — diffusion maintenue' }, created_at: new Date().toISOString() }).then(() => {}, () => {});
      try {
        const { notifyClient } = await import('@/lib/agents/notify-client');
        await notifyClient(supabase, { userId: c.id, agent: 'content', type: 'info',
          title: { fr: 'TikTok : publication maintenue ✅', en: 'TikTok: publishing stays on ✅' },
          message: { fr: 'On garde ta publication TikTok active. Pour booster ta portée, garde un compte VIVANT : suis quelques comptes de ta niche et like des posts régulièrement. Un compte actif est mieux distribué et protège tes propres posts. Jade te propose une liste de comptes/posts à suivre et liker.', en: 'We keep your TikTok publishing on. To boost reach, keep an ACTIVE account: follow a few niche accounts and like posts regularly. An active account is better distributed and protects your own posts. Jade suggests accounts/posts to follow & like.' },
          data: { network: 'tiktok' } }).catch(() => {});
      } catch { /* best-effort */ }
    }

    // 2) Portée faible détectée → PAS de pause : conseil d'activité (throttlé 1×/72h).
    if (suspected) {
      const base = nextCfg || { ...cfg };
      const lastTip = base.tiktok_activity_tip_at ? new Date(base.tiktok_activity_tip_at).getTime() : 0;
      transition = transition || 'low_reach_advice';
      await supabase.from('agent_logs').insert({ agent: 'content', action: 'tiktok_low_reach', status: 'info', data: { user_id: c.id, zero_streak: streak, note: 'portée faible — PAS de pause, conseil activité au client' }, created_at: new Date().toISOString() }).then(() => {}, () => {});
      if (Date.now() - lastTip > 72 * 3600 * 1000) {
        base.tiktok_activity_tip_at = new Date().toISOString();
        nextCfg = base;
        try {
          const { notifyClient } = await import('@/lib/agents/notify-client');
          await notifyClient(supabase, { userId: c.id, agent: 'content', type: 'info',
            title: { fr: 'TikTok : booste ta portée en 2 min/jour', en: 'TikTok: boost your reach in 2 min/day' },
            message: { fr: 'Tes dernières vues TikTok sont basses. Ce n\'est pas la qualité — c\'est l\'activité du compte. Ce qui marche : suis 3-5 comptes de ta niche et like quelques posts chaque jour. Un compte actif est bien mieux distribué (et ça protège tes propres posts du throttle). Jade t\'a préparé une liste de comptes/posts à suivre et liker.', en: 'Your recent TikTok views are low. It\'s not quality — it\'s account activity. What works: follow 3-5 niche accounts and like a few posts daily. An active account is far better distributed (and it protects your own posts from throttling). Jade prepared a list of accounts/posts to follow & like.' },
            data: { network: 'tiktok', zero_streak: streak } }).catch(() => {});
        } catch { /* best-effort */ }
      }
    }

    if (nextCfg) await writeCfg(nextCfg);
    results.push({ user: c.id, streak, suspected, wasPaused, transition });
  }
  return NextResponse.json({ ok: true, checked: results.length, suspected: results.filter(r => r.suspected).length, results });
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return run();
}
export async function POST(req: NextRequest) { return GET(req); }
