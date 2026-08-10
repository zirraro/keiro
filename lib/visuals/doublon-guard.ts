/**
 * Garde-fou anti-doublon — dernier filet avant publication.
 *
 * ── Pourquoi ce fichier existe ──
 *
 * Le 2026-08-10, le fondateur signale que le dernier TikTok publié est le même
 * qu'un post déjà sorti. Vérification faite : « Cette tendance TikTok 2026 peut
 * doubler tes clients en une semaine » est partie le 26 juillet, le 27 juillet,
 * puis de nouveau le 10 août. Les deux premières ont fait des vues, la
 * troisième zéro — TikTok reconnaît un contenu déjà vu et ne le repousse pas.
 *
 * Le balayage du planning a montré que ce n'était pas un incident isolé :
 *   · 35 posts programmés reprenaient une accroche DÉJÀ publiée ;
 *   · 231 posts programmés faisaient doublon ENTRE EUX ;
 *   · « Le Tour de France débute. Ton commerce aussi. » était programmé CINQ
 *     fois le 13 septembre.
 *
 * L'origine est multiple — recyclage du pool, republication inter-réseaux,
 * générations successives sur un même sujet d'actualité — et c'est justement
 * pour ça que le contrôle ne peut pas vivre dans une seule de ces sources. Il
 * vit ici, sur le chemin par lequel TOUTE publication passe forcément.
 *
 * ── Ce qu'on compare ──
 *
 * L'accroche d'abord, parce que c'est elle qui porte l'idée et que c'est sur
 * elle que l'algorithme comme le lecteur reconnaissent du déjà-vu. Une simple
 * égalité de chaînes ne suffirait pas : « Le Tour de France débute. Ton
 * commerce aussi. » et la même phrase sans l'emoji sont le même post. On
 * normalise donc (accents, ponctuation, emoji, casse) puis on mesure le
 * recouvrement des mots.
 *
 * Le média ensuite : deux accroches différentes posées sur la même vidéo
 * restent un doublon aux yeux de la plateforme, et c'est exactement ce qui
 * arrivait avec le pool recyclé.
 *
 * ── Ce qu'on ne fait PAS ──
 *
 * On ne bloque pas définitivement et on ne supprime rien : le post repasse en
 * brouillon avec le motif écrit en clair, donc le client le retrouve et peut
 * le réécrire. Le principe posé par le fondateur — « jamais un échec où on
 * s'arrête là » — s'applique : retenir un doublon, c'est protéger la portée du
 * compte, pas refuser de livrer.
 *
 * Aucun appel d'IA : déterministe, donc le garde-fou tourne même quand le
 * crédit d'IA est épuisé, et il est testable hors ligne.
 */

/** Fenêtre de recherche. Au-delà, un sujet peut légitimement revenir. */
const FENETRE_JOURS = 120;

/**
 * Seuil de recouvrement des mots au-delà duquel deux accroches sont « le même
 * post ». 0,82 laisse passer une vraie reformulation (angle neuf sur un même
 * sujet, ce que la stratégie événementielle demande) mais attrape la
 * republication et les variantes cosmétiques.
 */
const SEUIL_RECOUVREMENT = 0.82;

/** Mots trop fréquents pour porter du sens dans une comparaison d'accroches. */
const MOTS_VIDES = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'et', 'ou', 'a', 'as',
  'au', 'aux', 'en', 'ce', 'cet', 'cette', 'ces', 'ton', 'ta', 'tes', 'son',
  'sa', 'ses', 'tu', 'il', 'elle', 'on', 'que', 'qui', 'quoi', 'pour', 'par',
  'sur', 'dans', 'avec', 'sans', 'plus', 'pas', 'ne', 'est', 'sont', 'c',
  'y', 'se', 'si', 'mais', 'donc', 'tout', 'tous', 'toute', 'toutes',
]);

/**
 * Ramène une accroche à sa substance : minuscules, sans accents, sans emoji,
 * sans ponctuation. « Le Tour de France débute. Ton commerce aussi. 🚴‍♀️ » et
 * « Le Tour de France débute. Ton commerce aussi. » donnent la même chaîne.
 */
export function normaliserAccroche(texte: string | null | undefined): string {
  return String(texte || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')            // accents
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '') // emoji
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Mots porteurs de sens d'une accroche normalisée. */
function motsUtiles(normalise: string): string[] {
  return normalise.split(' ').filter((m) => m.length > 2 && !MOTS_VIDES.has(m));
}

/**
 * Recouvrement de Jaccard entre deux accroches : taille de l'intersection
 * divisée par la taille de l'union. 1 = mêmes mots, 0 = rien en commun.
 */
export function recouvrement(a: string, b: string): number {
  const A = new Set(motsUtiles(a));
  const B = new Set(motsUtiles(b));
  if (A.size === 0 || B.size === 0) return 0;
  let commun = 0;
  for (const m of A) if (B.has(m)) commun++;
  return commun / (A.size + B.size - commun);
}

export interface VerdictDoublon {
  doublon: boolean;
  motif?: string;
  /** Ce qui a déclenché : accroche trop proche, ou média déjà utilisé. */
  cause?: 'accroche' | 'media';
  /** Date de la publication d'origine, pour l'écrire dans le diagnostic. */
  publieLe?: string;
  /** Id du post d'origine, pour retrouver le fil. */
  postOrigine?: string;
  /** Score de recouvrement, utile au diagnostic et aux tests. */
  score?: number;
}

export interface PostAComparer {
  id?: string;
  hook?: string | null;
  caption?: string | null;
  video_url?: string | null;
  visual_url?: string | null;
  platform?: string | null;
  format?: string | null;
  source?: string | null;
}

/** Une story, ou un recyclage de bibliothèque assumé comme tel. */
function estStory(post: PostAComparer): boolean {
  return post.format === 'story' || post.source === 'story_library_recycle';
}

/**
 * Compare un post à un historique déjà chargé. Séparé de l'accès base pour
 * pouvoir se tester sans réseau, et pour être réutilisable par le nettoyage
 * du planning comme par le contrôle avant publication.
 */
export function comparerAHistorique(
  post: PostAComparer,
  historique: Array<PostAComparer & { published_at?: string | null; platform?: string | null }>,
): VerdictDoublon {
  // Les stories sont hors sujet : elles rejouent volontairement la
  // bibliothèque du client — ses vraies photos, pas des visuels générés — et
  // elles disparaissent en 24 h. La règle du fondateur vise les reels et
  // images produits par l'IA, qui datent le compte quand ils repassent.
  if (estStory(post)) return { doublon: false };

  const accroche = normaliserAccroche(post.hook || post.caption);
  const media = post.video_url || post.visual_url || null;

  for (const ancien of historique) {
    if (ancien.id && post.id && ancien.id === post.id) continue;

    // Le média d'abord, et TOUS RÉSEAUX CONFONDUS.
    //
    // Règle du fondateur (2026-08-10) : « on poste 1 fois un reel ou une image
    // générée par IA, JAMAIS 2 fois, pour le même client ». Un visuel généré
    // est daté et reconnaissable ; le republier ailleurs ne crée pas de la
    // portée, ça donne un compte qui se répète. La contrainte porte sur le
    // client, pas sur le réseau — c'est pourquoi ce test ignore la plateforme
    // alors que celui sur l'accroche, plus bas, la respecte.
    const ancienMedia = ancien.video_url || ancien.visual_url || null;
    if (media && ancienMedia && media === ancienMedia) {
      const ailleurs = ancien.platform && post.platform && ancien.platform !== post.platform;
      return {
        doublon: true,
        cause: 'media',
        motif: ailleurs
          ? `ce média a déjà été publié sur ${ancien.platform}`
          : 'ce média a déjà été publié',
        publieLe: ancien.published_at || undefined,
        postOrigine: ancien.id,
        score: 1,
      };
    }

    // Puis l'accroche, sur le même réseau uniquement : une idée reformulée
    // pour un autre public reste légitime, la répétition mot pour mot au même
    // endroit non.
    if (post.platform && ancien.platform && post.platform !== ancien.platform) continue;

    // Une accroche trop courte ne porte pas assez de mots pour que le
    // recouvrement veuille dire quelque chose — on l'ignore plutôt que de
    // retenir un post sur un faux positif.
    if (accroche.length < 15) continue;
    const ancienneAccroche = normaliserAccroche(ancien.hook || ancien.caption);
    if (ancienneAccroche.length < 15) continue;

    const score = recouvrement(accroche, ancienneAccroche);
    if (score >= SEUIL_RECOUVREMENT) {
      return {
        doublon: true,
        cause: 'accroche',
        motif: 'cette accroche a déjà été publiée',
        publieLe: ancien.published_at || undefined,
        postOrigine: ancien.id,
        score,
      };
    }
  }

  return { doublon: false };
}

/**
 * Contrôle avant publication : ce post a-t-il déjà été publié pour ce client ?
 *
 * On charge l'historique du CLIENT, tous réseaux confondus, et c'est
 * `comparerAHistorique` qui applique la bonne portée à chaque critère : le
 * média ne repart jamais nulle part, l'accroche est jugée réseau par réseau.
 *
 * Une panne de lecture ne bloque jamais : on préfère un doublon rare à une
 * publication client suspendue par une erreur de notre côté.
 */
export async function dejaPublie(
  supabase: any,
  post: PostAComparer & { user_id?: string | null },
): Promise<VerdictDoublon> {
  try {
    const depuis = new Date(Date.now() - FENETRE_JOURS * 86400000).toISOString();
    let q = supabase
      .from('content_calendar')
      .select('id, platform, hook, caption, video_url, visual_url, published_at')
      .eq('status', 'published')
      .gte('published_at', depuis)
      .order('published_at', { ascending: false })
      .limit(600);

    if (post.user_id) q = q.eq('user_id', post.user_id);

    const { data } = await q;
    if (!data || data.length === 0) return { doublon: false };
    return comparerAHistorique(post, data);
  } catch {
    return { doublon: false };
  }
}

/** Phrase de diagnostic lisible, écrite dans publish_diagnostic. */
export function diagnostiquerDoublon(v: VerdictDoublon): string {
  const quand = v.publieLe ? ` le ${v.publieLe.slice(0, 10)}` : '';
  const detail = v.cause === 'media' ? 'média identique' : `accroche identique à ${Math.round((v.score || 0) * 100)} %`;
  return `qc_doublon: ${v.motif}${quand} (${detail}) — republier à l'identique ne fait pas de vues, la plateforme reconnaît le contenu`;
}
