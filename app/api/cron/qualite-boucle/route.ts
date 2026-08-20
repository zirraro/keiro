import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * La boucle qualité : purger les octets, garder le savoir, vérifier le juge.
 *
 * ── Ce que le fondateur a demandé, le 20 août ──
 *
 * « Si on stocke chez nous, il faut ne garder que celles qui passent le juge et
 * sont publiées ou programmées, et supprimer les nulles — sauf qu'on sait
 * pourquoi elles n'ont pas passé le juge, pour l'amélioration continue. Et même
 * celles qui passent, on note. On track ensuite les chiffres pour voir si notre
 * juge note bien en fonction de ce qui est apprécié côté client cible, sur une
 * période de 90 jours. »
 *
 * Trois idées distinctes, et la troisième est la plus importante.
 *
 * ── 1. Purger le média, jamais le motif ──
 *
 * Une vidéo refusée pèse plusieurs mégaoctets et ne servira jamais. La garder
 * coûte du stockage pour rien. Mais supprimer la LIGNE qui dit pourquoi elle a
 * été refusée, ce serait jeter exactement l'information qui fait progresser les
 * prompts — c'est le seul endroit où l'on apprend.
 *
 * On sépare donc les deux : les octets partent, le verdict reste. Un refus
 * devient une ligne de quelques centaines d'octets qu'on garde indéfiniment.
 *
 * ── 2. Noter aussi ce qui passe ──
 *
 * Un corpus qui ne contient que des échecs n'apprend rien : sans les réussites,
 * impossible de savoir ce qui distingue un 9 d'un 6. Les verdicts favorables
 * sont donc conservés au même titre.
 *
 * ── 3. Le juge lui-même doit être jugé ──
 *
 * C'est le point que je n'aurais pas eu l'idée de poser. Notre juge attribue
 * des notes ; rien ne prouve qu'elles correspondent à ce que le public du
 * client apprécie réellement. Un juge qui note bien les mauvais posts est pire
 * qu'aucun juge : il donne une fausse confiance.
 *
 * On croise donc, sur 90 jours, la note du juge et l'engagement réellement
 * mesuré. Si la corrélation est faible, ce n'est pas le contenu qu'il faut
 * corriger, c'est le juge. 90 jours parce qu'en dessous le volume de
 * publications d'un commerçant local est trop faible pour que l'écart entre
 * deux tranches de notes veuille dire quelque chose.
 */

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/** Extrait le chemin interne d'une URL publique du seau. */
function cheminDepuisUrl(url: string): string | null {
  const m = url.match(/\/storage\/v1\/object\/public\/generated-images\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const supabase = sb();
  const maintenant = Date.now();

  // ── Partie 1 : purger les médias refusés ──
  //
  // On attend 7 jours avant de supprimer. Un post refusé peut être repris par
  // la boucle de réparation ou repêché à la main ; purger le jour même
  // détruirait le matériau d'un rattrapage encore possible.
  const seuilPurge = new Date(maintenant - 7 * 86400_000).toISOString();
  let purges = 0;
  let octetsLiberes = 0;

  const { data: refuses } = await supabase
    .from('content_calendar')
    .select('id, visual_url, video_url, publish_diagnostic, status')
    .in('status', ['draft', 'skipped'])
    .not('publish_diagnostic', 'is', null)
    .lt('updated_at', seuilPurge)
    .limit(200);

  for (const p of refuses ?? []) {
    const diag = String(p.publish_diagnostic || '');
    // On ne purge QUE ce que le juge a refusé. Un post en attente de connexion
    // n'est pas mauvais : son média resservira dès le branchement du compte.
    if (!/^qc_|hard_fail|reel_qa/.test(diag)) continue;

    for (const url of [p.visual_url, p.video_url].filter(Boolean) as string[]) {
      const chemin = cheminDepuisUrl(url);
      if (!chemin) continue;
      const { error } = await supabase.storage.from('generated-images').remove([chemin]);
      if (!error) { purges++; octetsLiberes += 1; }
    }

    // Le média part, la ligne reste : le diagnostic est le savoir, pas les
    // octets. On marque explicitement pour ne pas repasser dessus.
    await supabase.from('content_calendar').update({
      visual_url: null,
      video_url: null,
      publish_diagnostic: `${diag} [media_purge]`.slice(0, 500),
    }).eq('id', p.id);
  }

  // ── Partie 2 : le juge dit-il vrai ? ──
  //
  // On compare la note attribuée AVANT publication à l'engagement obtenu
  // APRÈS. Deux tranches suffisent à répondre : si les posts bien notés ne
  // font pas mieux que les autres, la note ne mesure rien d'utile.
  const seuil90 = new Date(maintenant - 90 * 86400_000).toISOString();

  const { data: verdicts } = await supabase
    .from('agent_logs')
    .select('data, created_at')
    .eq('action', 'qc_verdict')
    .gte('created_at', seuil90)
    .limit(2000);

  const notesParPost = new Map<string, number>();
  for (const v of verdicts ?? []) {
    const d: any = v.data || {};
    const id = d.post_id;
    const note = typeof d.note === 'number' ? d.note : typeof d.score === 'number' ? d.score : null;
    if (id && note !== null) notesParPost.set(String(id), note);
  }

  const { data: publies } = await supabase
    .from('content_calendar')
    .select('id, engagement_data, published_at')
    .eq('status', 'published')
    .gte('published_at', seuil90)
    .limit(2000);

  const paires: { note: number; engagement: number }[] = [];
  for (const p of publies ?? []) {
    const note = notesParPost.get(String(p.id));
    if (note === undefined) continue;
    const e: any = p.engagement_data || {};
    const engagement = (Number(e.likes) || 0) + (Number(e.comments) || 0) + (Number(e.shares) || 0);
    paires.push({ note, engagement });
  }

  const hautes = paires.filter((x) => x.note >= 8);
  const basses = paires.filter((x) => x.note < 7);
  const moy = (l: typeof paires) => (l.length ? l.reduce((s, x) => s + x.engagement, 0) / l.length : 0);
  const engHautes = moy(hautes);
  const engBasses = moy(basses);

  // Un verdict prudent : sous 20 paires, l'écart n'est pas interprétable.
  // Le dire est plus utile que d'annoncer une corrélation inventée.
  const assezDeDonnees = hautes.length >= 10 && basses.length >= 10;
  const jugeFiable = assezDeDonnees ? engHautes > engBasses * 1.15 : null;

  const bilan = {
    medias_purges: purges,
    paires_90j: paires.length,
    notes_hautes: { n: hautes.length, engagement_moyen: Math.round(engHautes * 10) / 10 },
    notes_basses: { n: basses.length, engagement_moyen: Math.round(engBasses * 10) / 10 },
    juge_fiable: jugeFiable,
    verdict: jugeFiable === null
      ? 'pas encore assez de publications notées pour trancher'
      : jugeFiable
        ? 'les posts bien notés performent mieux — le juge mesure quelque chose de réel'
        : "ALERTE : les posts bien notés ne performent PAS mieux — c'est le juge qu'il faut corriger, pas le contenu",
  };

  try {
    await supabase.from('agent_logs').insert({
      agent: 'ops', action: 'qualite_boucle', status: jugeFiable === false ? 'warning' : 'ok',
      data: bilan, created_at: new Date().toISOString(),
    });
  } catch { /* la trace ne bloque pas le bilan */ }

  return NextResponse.json({ ok: true, ...bilan });
}
