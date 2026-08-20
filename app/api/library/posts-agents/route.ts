import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * Le travail des agents, vu depuis la Galerie.
 *
 * ── Le trou ──
 *
 * Fondateur, 19 août : « le travail fait par l'agent, il faut qu'il soit
 * également dans cette page Galerie — dans les posts, ou alors en brouillon
 * lorsque programmés, et ils passent ensuite en publiés, avec la mention "fait
 * par Léna". Comme ça, si le client y travaille, il peut choisir soit de
 * vérifier rapidement via le planning de l'agent, soit dans la Galerie s'il
 * veut plus travailler les posts. »
 *
 * En vérifiant : la Galerie lit `scheduled_posts`, et le travail des agents vit
 * dans `content_calendar`. Deux tables, aucun pont. La Galerie ne pouvait donc
 * pas voir une seule publication produite par Léna — le client qui ouvre sa
 * galerie ne voit pas ce que son équipe a fait pour lui. C'est le contenu le
 * plus important du produit, et c'est le seul qui n'y figurait pas.
 *
 * ── Ce que cette route rend ──
 *
 * Les publications de `content_calendar` du client, avec de quoi les afficher
 * et les retravailler : leur état (brouillon, programmé, publié), leur réseau,
 * leur média, et surtout QUI les a faites. Le nom de l'agent n'est pas
 * décoratif : c'est ce qui distingue un visuel qu'on a créé soi-même au Studio
 * d'un post que l'équipe a produit pendant qu'on servait des clients.
 */

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/**
 * L'agent derrière une publication.
 *
 * Le calendrier ne stocke pas le nom de l'agent — il est implicite. Léna
 * produit tout ce qui est contenu social ; c'est la règle du produit, pas une
 * supposition. Le jour où un autre agent y écrira, cette fonction sera
 * l'endroit unique à corriger.
 */
function agentAuteur(p: any): string {
  if (p?.source === 'client' || p?.source === 'studio') return 'Vous';
  return 'Léna';
}

/** L'état lisible par un commerçant, pas le statut technique. */
function etatLisible(statut: string): { cle: string; libelle: string } {
  switch (statut) {
    case 'published': return { cle: 'publie', libelle: 'Publié' };
    case 'approved': return { cle: 'programme', libelle: 'Programmé' };
    case 'pending_approval': return { cle: 'a_valider', libelle: 'À valider' };
    case 'publish_failed': return { cle: 'echec', libelle: 'Échec de publication' };
    case 'skipped': return { cle: 'ecarte', libelle: 'Écarté' };
    default: return { cle: 'brouillon', libelle: 'Brouillon' };
  }
}

export async function GET(req: NextRequest) {
  const { user, error: authErr } = await getAuthUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const etat = req.nextUrl.searchParams.get('etat') || 'tous';
  // ── 60 était un plafond posé au jugé, et il coupait la galerie ──
  //
  // Fondateur, 20 août : « la galerie n'affiche pas les onglets et leur contenu
  // en entier ». Mesuré le jour même : ce client a 1 706 lignes dans
  // content_calendar, la galerie n'en demandait que 60. Elle ne montrait donc
  // pas un contenu lent à venir — elle montrait 3 % du travail fait, et le
  // reste n'existait pas pour elle.
  //
  // Le plafond avait été posé par prudence, sans mesure. Or la mesure dit
  // l'inverse de l'intuition : 200 lignes reviennent en 111 ms, 60 lignes en
  // 607 ms (le premier appel paie l'éveil de la connexion, pas le volume). Le
  // coût est dans l'aller-retour, pas dans les lignes — restreindre ne
  // gagnait rien et perdait l'essentiel.
  //
  // On monte donc le défaut à 200, et le plafond à 500 pour les clients qui
  // publient depuis longtemps. Toujours borné : une requête sans limite sur une
  // table qui grossit finit toujours par devenir le problème.
  const limite = Math.min(Number(req.nextUrl.searchParams.get('limite') || 200), 500);

  const supabase = sb();
  let q = supabase
    .from('content_calendar')
    .select('id, platform, format, status, hook, caption, hashtags, visual_url, video_url, scheduled_date, scheduled_time, published_at, instagram_permalink, tiktok_publish_id, publish_diagnostic, source, created_at')
    .eq('user_id', user.id)
    // Les posts écartés n'ont pas leur place dans une galerie : ce sont des
    // essais que le contrôle a refusés, pas du travail livré.
    .neq('status', 'skipped')
    .order('created_at', { ascending: false })
    .limit(limite);

  if (etat === 'publies') q = q.eq('status', 'published');
  else if (etat === 'programmes') q = q.in('status', ['approved', 'pending_approval']);
  else if (etat === 'brouillons') q = q.eq('status', 'draft');

  const { data, error } = await q;
  if (error) {
    console.error('[PostsAgents] lecture impossible :', error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const posts = (data || []).map((p: any) => {
    const e = etatLisible(String(p.status || ''));
    return {
      id: p.id,
      reseau: p.platform,
      format: p.format,
      etat: e.cle,
      etat_libelle: e.libelle,
      auteur: agentAuteur(p),
      accroche: p.hook || '',
      legende: p.caption || '',
      hashtags: p.hashtags || [],
      media: p.video_url || p.visual_url || null,
      est_video: !!p.video_url,
      // Le média de couverture reste utile même sur une vidéo : c'est lui
      // qu'on affiche dans une grille.
      couverture: p.visual_url || null,
      programme_le: p.scheduled_date ? `${p.scheduled_date}${p.scheduled_time ? ` ${String(p.scheduled_time).slice(0, 5)}` : ''}` : null,
      publie_le: p.published_at || null,
      lien: p.instagram_permalink || null,
      diagnostic: p.publish_diagnostic || null,
    };
  });

  const compte = {
    total: posts.length,
    publies: posts.filter((p) => p.etat === 'publie').length,
    programmes: posts.filter((p) => p.etat === 'programme' || p.etat === 'a_valider').length,
    brouillons: posts.filter((p) => p.etat === 'brouillon').length,
  };

  return NextResponse.json({ ok: true, compte, posts });
}
