import { assessPostCoherence, jugerAvecVision, type CoherenceVerdict } from './post-coherence-qc';

/**
 * Réécrit la légende et les hashtags d'un post À PARTIR DE SON IMAGE.
 *
 * Fondateur 2026-07-31 : « les visuels, s'ils passent très bien le contrôle
 * qualité, peuvent être réutilisés malgré les mauvaises descriptions à changer,
 * et hashtags aussi ».
 *
 * C'est le bon sens économique : l'image est la partie chère (génération,
 * contrôle qualité, parfois plusieurs tentatives), le texte est la partie
 * gratuite. Jeter un visuel réussi parce que sa légende part dans le décor,
 * c'est jeter le coûteux pour cause de défaut sur le gratuit.
 *
 * Le sens de l'écriture est donc INVERSÉ par rapport à la génération normale :
 * d'habitude Léna écrit un brief puis fabrique l'image qui va avec. Ici l'image
 * existe déjà et fait foi — le texte doit s'y plier, jamais l'inverse. C'est ce
 * qui garantit qu'on ne recrée pas le hors-sujet qu'on est en train de réparer.
 */

const MODEL = 'claude-sonnet-4-6';

export interface RepairResult {
  caption: string;
  hashtags: string[];
  /** Vérification après réécriture — le post repasse le contrôle ? */
  verdict: CoherenceVerdict | null;
}

const SYSTEM = `Tu es rédacteur pour KeiroAI, un outil qui publie automatiquement le contenu des commerces de proximité (restaurants, salons, boutiques, artisans, PME).

On te donne UNE IMAGE déjà produite et validée. Tu écris la légende et les hashtags QUI VONT AVEC.

RÈGLE CARDINALE : l'image fait foi. Tu écris à partir de ce que tu VOIS. Tu n'écris jamais un texte auquel l'image devrait ressembler — c'est exactement l'erreur qu'on est en train de réparer.

CE QUE TU NE FAIS JAMAIS :
⛔ Inventer un client identifiable : pas de prénom, pas de nom de commerce, pas de ville précise présentés comme un cas réel. « Marie, fleuriste à Lyon, a doublé ses réservations » est interdit.
⛔ Annoncer un chiffre aberrant : pas de « +500% en 2 semaines », pas de « ×10 de chiffre d'affaires », pas de « 12h économisées par semaine ».
⛔ Citer une étude ou un sondage qui n'existe pas (« on a interrogé 847 commerçants »).
⛔ Parler d'un métier ou d'un lieu qu'on ne voit pas sur l'image.

CE QUE TU PEUX FAIRE, et qui marche mieux :
✅ Décrire ce que l'image montre et en tirer l'enseignement utile au commerçant.
✅ Un ordre de grandeur plausible et présenté comme tel (« publier régulièrement, c'est mécaniquement plus de gens qui te voient »).
✅ Un cas SANS identité (« un commerce qui passe de 2 à 8 publications par semaine »).
✅ Une projection assumée (« si tu t'y mets 10 minutes par semaine… »).

L'ACCROCHE — c'est 80% du travail :
La PREMIÈRE LIGNE est souvent la SEULE que le lecteur verra : sur Instagram elle est seule visible avant « plus », sur TikTok elle joue dans les trois premières secondes.
✅ Pose une tension, une surprise, un chiffre concret, ou nomme le problème du lecteur : « Une fuite qui goutte, c'est 10 litres par jour dans le vide. »
⛔ Ne commence jamais par une généralité (« Le marketing digital est essentiel »), par toi (« Chez nous, nous… »), ni par l'annonce de ce que tu vas dire.

L'ACTUALITÉ — seulement si le lien tient vraiment :
Tu peux t'appuyer sur une saison, un événement ou une tendance, à condition que le rapprochement apporte quelque chose au lecteur.
✅ « Canicule annoncée : nos glaces sortent à -18°, elles tiennent le trajet jusqu'à chez toi. »
⛔ « Le Tour de France passe. Nous aussi on avance ! » — si la phrase marche en changeant de métier, le lien est forcé et le lecteur sent l'opportunisme. Mieux vaut aucune actualité qu'une actualité plaquée.

FORME :
- 3 à 6 lignes, aérées par des sauts de ligne. Tutoiement, ton direct, zéro jargon.
- Jamais le mot « IA » dans la légende.
- Une seule invitation à agir à la fin, simple.
- 5 à 8 hashtags, tous justifiés par l'image ou le texte. Pas de hashtag de ville ou de métier si l'image ne le montre pas. Pas de # dans le tableau, juste les mots.

Réponds UNIQUEMENT via l'outil.`;

const TOOL = {
  name: 'reecriture',
  description: 'Légende et hashtags réécrits à partir de l\'image',
  input_schema: {
    type: 'object' as const,
    properties: {
      caption: { type: 'string', description: 'La légende complète, avec ses sauts de ligne' },
      hashtags: { type: 'array', items: { type: 'string' }, description: 'Entre 5 et 8 hashtags SANS le caractère #' },
    },
    required: ['caption', 'hashtags'],
  },
};

async function fetchImageBase64(url: string): Promise<{ data: string; mediaType: string } | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 2000) return null;
    const isPng = buf[0] === 0x89 && buf.subarray(1, 4).toString('latin1') === 'PNG';
    const isWebp = buf.subarray(8, 12).toString('latin1') === 'WEBP';
    return { data: buf.toString('base64'), mediaType: isPng ? 'image/png' : isWebp ? 'image/webp' : 'image/jpeg' };
  } catch {
    return null;
  }
}

/**
 * Réécrit un post autour de son image, puis REPASSE le contrôle de cohérence.
 *
 * On revérifie systématiquement : une réécriture non contrôlée ne vaut pas
 * mieux que le texte qu'elle remplace, et c'est précisément ce qui a produit
 * le stock qu'on répare aujourd'hui.
 *
 * Renvoie `null` si la réécriture n'a pas pu se faire — le post reste alors en
 * l'état, jamais publié à l'aveugle.
 */
export async function repairPostText(input: {
  visualUrl: string;
  platform?: string;
  format?: string;
  /** Ce que le contrôle a vu sur l'image, pour cadrer la réécriture. */
  imageDescription?: string;
  /** Le sujet d'origine, utile quand l'image reste ambiguë. */
  originalCaption?: string;
}): Promise<RepairResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !input.visualUrl) return null;

  const img = await fetchImageBase64(input.visualUrl);
  if (!img) return null;

  const contexte = [
    `Réseau : ${input.platform || 'instagram'} · format : ${input.format || 'post'}`,
    input.imageDescription ? `\nCe que montre l'image : ${input.imageDescription}` : '',
    input.originalCaption
      ? `\nAncienne légende, à titre indicatif SEULEMENT — elle était hors-sujet, ne la recopie pas :\n"${input.originalCaption.slice(0, 500)}"`
      : '',
    '\nÉcris la légende et les hashtags qui correspondent à CETTE image.',
  ].join('\n');

  try {
    const sortie = await jugerAvecVision({
      system: SYSTEM, tool: TOOL, imageBase64: img.data, mediaType: img.mediaType,
      texte: contexte, maxTokens: 1200,
    });
    if (!sortie?.caption) return null;
    const use = { input: sortie };

    const caption = String(use.input.caption).trim();
    const hashtags = (Array.isArray(use.input.hashtags) ? use.input.hashtags : [])
      .map((h: any) => '#' + String(h).replace(/^#+/, '').trim())
      .filter((h: string) => h.length > 1)
      .slice(0, 8);

    const verdict = await assessPostCoherence({
      visualUrl: input.visualUrl, caption, hashtags,
      platform: input.platform, format: input.format,
    });

    // Un contrôle indisponible n'est pas un verdict : on renvoie null pour
    // que l'appelant sache qu'il n'a rien vérifié.
    return { caption, hashtags, verdict: verdict && 'pass' in verdict ? verdict : null };
  } catch {
    return null;
  }
}
