/**
 * Contrôle de la voix des reels : ce qui est PRONONCÉ doit être irréprochable.
 *
 * ── Pourquoi ──
 *
 * Fondateur, 2026-08-11 : « le contrôle qualité sur les textes, les titres et
 * la voix, en plus de la pertinence du lien fort avec le sujet », puis « en
 * français pour nos clients, tous a priori pour le moment ils sont tous
 * français ».
 *
 * Le contrôle des reels existait, mais il ne regardait que TROIS IMAGES
 * extraites du montage. Rien ne vérifiait ce qu'on entend. Or une voix ratée
 * est plus grave qu'une image tiède : on ne la survole pas, on l'entend en
 * entier, et elle sort du téléphone d'un commerçant devant ses clients.
 *
 * ── Les trois défauts qui arrivent vraiment ──
 *
 * 1. LA PONCTUATION LUE À VOIX HAUTE. La synthèse vocale prononce ce qu'on lui
 *    donne. Un texte destiné à l'écrit — emojis, hashtags, astérisques de mise
 *    en forme, adresses web — devient « emoji feu, dièse boulangerie, étoile
 *    étoile ». Personne ne l'entend avant le client. C'est le défaut le plus
 *    fréquent et le moins cher à supprimer : il se corrige sans le moindre
 *    appel de modèle.
 *
 * 2. LA LANGUE QUI DÉRAPE. Les modèles glissent vers l'anglais sur une
 *    tournure marketing. Une voix anglaise sur le compte d'un commerçant
 *    français est éliminatoire — et invisible dans un contrôle d'image.
 *
 * 3. LA LONGUEUR QUI NE TOMBE PAS JUSTE. Un texte trop long pour la durée du
 *    montage est coupé au milieu d'un mot ; trop court, la vidéo finit en
 *    silence. On parle à peu près 2,5 mots par seconde en français.
 *
 * ── Le coût, qui est une contrainte au même titre que la qualité ──
 *
 * Fondateur : « attention au coût, ça nous coûte aussi de vérifier la qualité
 * de tout cela en plus des générations. »
 *
 * Ce contrôle est donc ENTIÈREMENT DÉTERMINISTE : aucun appel de modèle, aucun
 * centime. Il attrape les trois défauts ci-dessus par des règles, et il les
 * attrape AVANT l'appel à la synthèse — qui, lui, est facturé au caractère.
 * Nettoyer avant d'appeler fait donc baisser la facture en même temps que ça
 * monte la qualité.
 *
 * ── Ce qu'on fait quand c'est mauvais ──
 *
 * Règle du fondateur : « ne jamais laisser passer de la mauvaise qualité, mais
 * toujours publier pour livrer le client. » Les deux tiennent parce que la voix
 * est un PLUS : un reel sans voix, avec sa musique, reste un bon reel. Une voix
 * en anglais, non. On renonce donc à la voix plutôt qu'au reel.
 */

export interface VerdictVoix {
  /** Le texte réellement à prononcer, nettoyé. */
  texte: string;
  /** Peut-on synthétiser ? Faux = on publie le reel sans voix. */
  utilisable: boolean;
  /** Ce qui a été corrigé ou ce qui bloque, en clair. */
  motifs: string[];
}

/** Mots outils français fréquents — leur absence trahit une autre langue. */
const MOTS_FR = /\b(le|la|les|un|une|des|du|de|et|est|tu|vous|on|ton|ta|tes|votre|pour|avec|dans|sur|qui|que|plus|pas|ce|cette|c'est|il|elle|nous|mais|par|au|aux|se|sa|son|ses|en|y)\b/gi;

/** Mots outils anglais — leur présence en nombre trahit un dérapage. */
const MOTS_EN = /\b(the|and|your|you|with|for|this|that|is|are|our|we|they|of|to|in|on|it|from|have|will|can|about|more)\b/gi;

/**
 * Tout ce qui n'a pas à être PRONONCÉ.
 *
 * L'ordre compte : on retire les blocs entiers (adresses web, hashtags) avant
 * de nettoyer les caractères isolés, sinon on laisse des morceaux d'URL.
 */
function nettoyer(brut: string): { texte: string; motifs: string[] } {
  const motifs: string[] = [];
  let t = String(brut || '');

  const avant = t;

  // Adresses web et e-mails : « double v é double v é point » à l'oral.
  t = t.replace(/https?:\/\/\S+|www\.\S+|\S+@\S+\.\S+/gi, ' ');
  if (t !== avant) motifs.push('adresse web ou e-mail retirée (elle serait épelée)');

  // Hashtags : le dièse est prononcé, et une suite de hashtags est illisible
  // à l'oral. On garde le mot, on retire le dièse.
  const avantTag = t;
  t = t.replace(/#(\w+)/g, '$1');
  if (t !== avantTag) motifs.push('dièse des hashtags retiré');

  // Emojis et symboles décoratifs : prononcés littéralement par la synthèse.
  const avantEmoji = t;
  t = t.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu, ' ');
  if (t !== avantEmoji) motifs.push('emojis retirés (ils seraient prononcés)');

  // Mise en forme écrite : astérisques, soulignés, puces, guillemets doublés.
  const avantMarkdown = t;
  t = t.replace(/[*_`~|]+/g, ' ').replace(/^\s*[-•–]\s*/gm, ' ');
  if (t !== avantMarkdown) motifs.push('marques de mise en forme retirées');

  // Espaces multiples et ponctuation orpheline laissée par les retraits.
  t = t.replace(/\s{2,}/g, ' ').replace(/\s+([,.!?;:])/g, '$1').trim();

  return { texte: t, motifs };
}

/** Le texte est-il bien dans la langue attendue ? */
function langueCoherente(texte: string, langueAttendue: string): boolean {
  const lang = String(langueAttendue || 'fr').slice(0, 2).toLowerCase();
  if (lang !== 'fr') return true;   // on ne juge que le français, seul cas réel aujourd'hui

  const mots = texte.split(/\s+/).filter(Boolean).length;
  // Sous une dizaine de mots, le comptage n'a aucune valeur statistique : une
  // accroche de cinq mots peut légitimement n'en contenir aucun de la liste.
  if (mots < 10) return true;

  const fr = (texte.match(MOTS_FR) || []).length;
  const en = (texte.match(MOTS_EN) || []).length;
  // On exige une présence réelle de français ET qu'il domine largement.
  return fr >= 2 && fr > en;
}

/** En français, on prononce à peu près deux mots et demi par seconde. */
const MOTS_PAR_SECONDE = 2.5;

/**
 * Contrôle et nettoie un texte destiné à être prononcé.
 *
 * `dureeSec` est facultative : sans elle, on ne juge pas la longueur — mieux
 * vaut ne pas juger que juger sur une durée inventée.
 */
export function controlerVoix(input: {
  texte: string;
  langue?: string;
  dureeSec?: number;
}): VerdictVoix {
  const { texte: nettoye, motifs } = nettoyer(input.texte);
  const langue = input.langue || 'fr';

  if (!nettoye || nettoye.replace(/[^\p{L}]/gu, '').length < 8) {
    return { texte: nettoye, utilisable: false, motifs: [...motifs, 'texte vide ou trop court une fois nettoyé'] };
  }

  if (!langueCoherente(nettoye, langue)) {
    return {
      texte: nettoye,
      utilisable: false,
      motifs: [...motifs, `la narration ne semble pas être en ${langue === 'fr' ? 'français' : langue} — on publie le reel sans voix plutôt qu'avec une voix dans la mauvaise langue`],
    };
  }

  // La longueur : on avertit, on ne bloque pas. Un texte un peu long vaut
  // mieux qu'un reel muet, et le montage sait s'adapter.
  const mots = nettoye.split(/\s+/).filter(Boolean).length;
  if (input.dureeSec && input.dureeSec > 0) {
    const capacite = input.dureeSec * MOTS_PAR_SECONDE;
    if (mots > capacite * 1.35) motifs.push(`texte long pour ${input.dureeSec} s (${mots} mots, ~${Math.round(capacite)} tiennent) — risque de coupure`);
    else if (mots < capacite * 0.4) motifs.push(`texte court pour ${input.dureeSec} s (${mots} mots) — la fin risque d'être silencieuse`);
  }

  return { texte: nettoye, utilisable: true, motifs };
}
