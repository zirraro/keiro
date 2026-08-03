/**
 * Vérifie qu'un DM personnalisé ne cite que des faits présents dans le profil
 * réellement consulté.
 *
 * Demande du fondateur (2026-08-03) : « l'hyper-personnalisation c'est très
 * bien mais les infos trouvées et données en DM doivent être correctes. Le
 * générique qui semble ciblé confirme ce que tu dis, faut juste vérifier. »
 *
 * C'est le bon arbitrage, et il mérite d'être explicite : un détail PRÉCIS mais
 * FAUX est pire qu'un générique. Le prospect ouvre son profil, ne trouve pas ce
 * qu'on décrit, et comprend qu'on a fabriqué le message — alors qu'un propos
 * général se contente d'être tiède. Plus on est spécifique, plus l'erreur coûte
 * cher, parce qu'elle devient vérifiable en trois secondes.
 *
 * On contrôle donc les NOMS PROPRES et termes distinctifs cités : produits,
 * collections, personnes, lieux. Chacun doit apparaître dans la bio ou les
 * légendes relevées. Le reste du message — tournures, promesses, questions —
 * n'affirme rien sur le prospect et n'a pas à être recoupé.
 */

export interface FactCheckVerdict {
  /** Le message peut-il être envoyé tel quel ? */
  ok: boolean;
  /** Les termes cités qu'on ne retrouve nulle part dans la source. */
  introuvables: string[];
}

/** Accents et casse retirés : « Lumière » doit matcher « lumiere ». */
function norm(s: string): string {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Mots qui ne portent aucune affirmation sur le prospect : formules de
 * politesse, vocabulaire de KeiroAI, termes génériques des réseaux. Les citer
 * n'engage rien, donc on ne cherche pas à les recouper.
 */
const NEUTRES = new Set([
  'salut', 'bonjour', 'hello', 'franchement', 'parce', 'juste', 'vraiment', 'super', 'trop',
  'instagram', 'insta', 'tiktok', 'linkedin', 'google', 'keiro', 'keiroai', 'story', 'stories',
  'post', 'posts', 'photo', 'photos', 'reel', 'reels', 'video', 'videos', 'compte', 'page',
  'profil', 'contenu', 'visuel', 'visuels', 'publication', 'publications',
  'paris', 'france', // trop courants pour constituer une affirmation vérifiable
]);

/**
 * Contrôle le message contre la source.
 *
 * `source` = tout ce qu'on a réellement observé : bio + légendes des posts.
 * On y ajoute les données CRM (nom du commerce, ville, spécialités) : elles
 * viennent de nos propres relevés, donc les citer est légitime.
 */
export function factCheckDm(input: {
  message: string;
  detail?: string | null;
  /** Bio + légendes réellement relevées sur le profil. */
  captions: string[];
  bio?: string | null;
  /** Données CRM vérifiées (nom, ville, spécialités, note Google…). */
  donneesConnues?: (string | null | undefined)[];
}): FactCheckVerdict {
  const source = norm([
    input.bio || '',
    ...(input.captions || []),
    ...(input.donneesConnues || []).filter(Boolean) as string[],
  ].join(' '));

  const texte = `${input.message || ''} ${input.detail || ''}`;

  // Un nom propre en milieu de phrase désigne presque toujours quelque chose de
  // spécifique au prospect : un produit, une collection, une personne, un lieu.
  // C'est exactement ce qui doit être vrai.
  const nomsPropres = (texte.match(/(?<![.!?]\s)(?<!^)\b[A-ZÀ-Ý][a-zà-ÿ]{2,}\b/g) || [])
    .map(w => w.trim())
    .filter(w => !NEUTRES.has(norm(w)));

  const introuvables = [...new Set(nomsPropres)].filter(w => !source.includes(norm(w)));

  return { ok: introuvables.length === 0, introuvables };
}
