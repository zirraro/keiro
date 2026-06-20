import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { detectSector, buildProspectAccroche, SECTORS } from '@/lib/agents/sales-playbook';

// KeiroAI's own showcase library (the agency account) — source of "what we do
// for a business like yours" examples to attach to a prospect's DM.
const AGENCY_UID = 'd7d3ae4a-c420-40e1-b2c9-b983d960d1fb';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * Jade — DM PREP (préparation uniquement, jamais d'auto-send à froid).
 * Pour les prospects d'un client, génère un DM personnalisé prêt à
 * copier/coller depuis les accroches du playbook (signal observé → accroche).
 * Le founder/client envoie à la main → doctrine inbound-only respectée.
 *
 * POST { userId } (CRON) — ou GET ?user_id= . Retourne les prospects priorisés
 * avec un suggested_dm. Aucune écriture, aucun envoi.
 */
function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function handle(userId: string | undefined) {
  const supabase = sb();
  let q = supabase
    .from('crm_prospects')
    .select('*')
    .not('instagram', 'is', null).neq('instagram', '')
    .not('status', 'in', '("dead","lost","blocked")')
    .gte('score', 20)
    .order('score', { ascending: false, nullsFirst: false })
    .limit(40);
  if (userId) q = q.eq('user_id', userId);
  const { data: rows, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Load the agency's showcase reels once → map sector-label → example URL, to
  // attach "what we do for a business like yours" to each prospect's DM.
  const showcaseByLabel: Record<string, string> = {};
  try {
    const { data: vids } = await supabase
      .from('my_videos').select('title, video_url')
      .eq('user_id', AGENCY_UID).not('video_url', 'is', null).limit(200);
    for (const v of vids || []) {
      const m = (v.title || '').match(/^\[([^\]]+)\]/);
      if (m && v.video_url && !showcaseByLabel[m[1]]) showcaseByLabel[m[1]] = v.video_url;
    }
  } catch { /* showcase optional */ }

  const out = (rows || []).map((r: any) => {
    // Infer sector from business_type, else from the company name (enrichment:
    // ne jamais rester "autre" si le nom donne l'info).
    const sector = detectSector(r.business_type || r.company || '');
    // Pick the accroche from the strongest available signal.
    let signal: 'compte_dormant' | 'avis_sans_reponse' | 'creux_saisonnier' = 'creux_saisonnier';
    const lastDays = r.last_post_date ? Math.round((Date.now() - new Date(r.last_post_date).getTime()) / 86400000) : null;
    if (lastDays != null && lastDays > 14) signal = 'compte_dormant';
    else if ((r.google_reviews || 0) >= 10) signal = 'avis_sans_reponse';
    let suggested_dm = buildProspectAccroche({
      firstName: r.owner_first_name || undefined, sector, signal,
      lastPostDate: r.last_post_date ? new Date(r.last_post_date).toLocaleDateString('fr-FR') : undefined,
      reviewsCount: r.google_reviews || undefined, rating: r.google_rating || undefined,
    });
    // Attach a same-sector showcase example ("voilà ce qu'on fait pour un X comme toi").
    const label = SECTORS[sector]?.label || '';
    const showcase_url = showcaseByLabel[label] || undefined;
    if (showcase_url) suggested_dm += `\n\nTiens, un exemple de ce qu'on fait pour un ${label.toLowerCase()} comme vous : ${showcase_url}`;
    return {
      id: r.id, company: r.company, instagram: r.instagram, score: r.score,
      temperature: r.temperature, sector, signal, suggested_dm, showcase_url,
    };
  });

  return NextResponse.json({
    ok: true, count: out.length,
    note: "Préparation uniquement — copie/colle et envoie à la main (jamais d'auto-send à froid).",
    prospects: out,
  });
}

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  const body = await req.json().catch(() => ({}));
  // CRON or trusted call.
  if (cronSecret && auth === `Bearer ${cronSecret}`) return handle(body.userId);
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (cronSecret && auth === `Bearer ${cronSecret}`) {
    return handle(req.nextUrl.searchParams.get('user_id') || undefined);
  }
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}
