/**
 * La rétention d'un reel se joue sur une horloge, pas sur une accroche.
 *
 * ── D'où vient ce module ──
 *
 * Fondateur, 18 août : « on pourra ensuite améliorer en créant des avatars et
 * de meilleurs reels ! Trouve une source de super prompts, peut-être sur
 * GitHub, un modèle open source qui parle de la viralité des vidéos TikTok et
 * Insta. »
 *
 * Source retenue : `shixinzhang/tiktok-viral-hooks` — 420 décorticages de
 * vidéos virales, 200+ familles d'accroches, mis à jour quotidiennement par
 * intégration continue, la plus haute analysée à 129,5 M de vues.
 *
 * ── Ce que la source apporte, et ce qu'elle n'apporte pas ──
 *
 * Elle n'apporte PAS des textes d'accroche : nous en avons déjà quarante-trois
 * dans `hook-knowledge.ts`, et sa licence de contenu est CC BY-NC-SA, donc
 * non commerciale — on ne recopie rien.
 *
 * Ce qu'elle apporte est sa MÉTHODE, qui relève de l'idée et non de
 * l'expression : elle audite chaque vidéo sur une horloge. Que se passe-t-il
 * dans les trois premières secondes ? Où est la rupture de rythme vers la
 * septième ? Qu'est-ce qui fait qu'on reste jusqu'au bout ?
 *
 * C'est précisément ce qui manquait chez nous. Nos reels reçoivent une bonne
 * accroche — c'est-à-dire un bon début — puis dix secondes laissées à
 * elles-mêmes. Or l'accroche fait ouvrir, la structure fait rester, et c'est
 * la durée regardée qui décide de la portée. On peut avoir la meilleure
 * première phrase et perdre le spectateur à la quatrième seconde.
 *
 * ── Pourquoi trois moments et pas un découpage fin ──
 *
 * Un plan à la seconde près produit des vidéos hachées, et nos reels font dix
 * secondes en un plan continu — règle déjà posée dans `PRECISION_VIDEO`, parce
 * que les coupes multiples trahissent la génération. Trois moments suffisent à
 * donner une direction sans casser la continuité.
 */

export type MomentReel = { a: string; consigne: string };

/**
 * L'horloge d'un reel de dix secondes.
 *
 * Formulée en POSITIF : on décrit ce qu'on veut voir, jamais ce qu'on refuse.
 * Fondateur, 15 août : « attention à la négation, le modèle de génération peut
 * ne pas comprendre, on a déjà eu le problème. » Une consigne qui nomme le
 * défaut le met dans la scène.
 */
export const HORLOGE_REEL: MomentReel[] = [
  {
    a: '0-3 s',
    consigne: "La première image montre déjà le sujet en action, cadré serré. C'est ce plan qui décide si on reste : il doit se comprendre sans son et sans texte.",
  },
  {
    a: '3-7 s',
    consigne: "Le geste progresse et révèle quelque chose qu'on ne voyait pas au début — une matière, un détail, un résultat qui se forme. La caméra accompagne d'un seul mouvement lent.",
  },
  {
    a: '7-10 s',
    consigne: "Le plan se termine sur l'état final, net et tenu : le résultat visible du geste. On finit sur une image qui se suffit, pas sur un fondu.",
  },
];

/** Le bloc à coller dans un brief vidéo. */
export function blocHorlogeReel(lang: 'fr' | 'en' = 'fr'): string {
  if (lang === 'en') {
    return [
      'RETENTION TIMELINE — a 10s reel is watched on a clock, not on its opening line:',
      '· 0-3s: the very first frame already shows the subject mid-action, tight. It must read with no sound and no text.',
      '· 3-7s: the gesture progresses and reveals something unseen at the start — a texture, a detail, a result forming. One slow camera move.',
      '· 7-10s: end on the finished state, sharp and held. Close on an image that stands alone.',
    ].join('\n');
  }
  return [
    "HORLOGE DE RÉTENTION — un reel de 10 s se regarde sur une horloge, pas sur sa première phrase :",
    ...HORLOGE_REEL.map((m) => `· ${m.a} : ${m.consigne}`),
  ].join('\n');
}
