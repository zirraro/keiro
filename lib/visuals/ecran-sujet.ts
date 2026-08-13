/**
 * Un écran est-il le SUJET de ce brief d'image ?
 *
 * ── Pourquoi cette règle ──
 *
 * Fondateur, depuis le 2026-08-11 : « on doit voir le métier, pas un
 * smartphone. » La consigne est écrite dans la doctrine, dans le prompt système
 * et dans celui de la route. Elle a été désobéie une dizaine de fois. Un modèle
 * qui ignore une consigne écrite trois fois ne l'appliquera pas à la quatrième :
 * on la contrôle donc au lieu de la répéter.
 *
 * ── Pourquoi un fichier à part ──
 *
 * La première version vivait dans la route, en une ligne. Elle a laissé passer
 * « A close-up photograph of a bakery counter. In the foreground, a tablet
 * screen displays a dashboard » — la tablette EST le sujet, mais elle arrivait
 * hors de la fenêtre examinée. Je ne m'en suis aperçu qu'en relisant une
 * génération, parce qu'un détecteur enfoui dans une route de huit mille lignes
 * ne se teste pas.
 *
 * Ici, il se teste. C'est la seule raison de ce fichier, et elle suffit.
 *
 * ── Ce qu'on refuse, et ce qu'on laisse passer ──
 *
 * On refuse l'écran EN POSITION DE SUJET : en tête de phrase, au premier plan,
 * en gros plan. On laisse passer l'écran de décor — « a tablet lying face down
 * in the blurred background » — parce qu'un comptoir de commerce en contient
 * légitimement, et parce que la preuve par capture reste utile dans un
 * carrousel.
 */

const MOTS_ECRAN = String.raw`smartphone|smartphones|phone|phones|tablet|tablets|laptop|laptops|computer|monitor|screen|screens|dashboard|app interface|ui mockup|mockup`;

/** Mots qui placent un objet en position de sujet dans un brief photo. */
const POSITION_SUJET = String.raw`foreground|close-?up|centre(?:d)?|center(?:ed)?|main subject|hero shot|fills the frame`;

/**
 * Vrai quand le brief fait d'un écran son sujet principal.
 *
 * Trois formes, parce que les briefs les emploient toutes :
 *   1. l'écran ouvre une phrase — « A modern tablet displaying… » ;
 *   2. un marqueur de position précède l'écran — « In the foreground, a tablet… » ;
 *   3. l'écran précède le marqueur — « a tablet screen in the foreground ».
 */
export function ecranEstLeSujet(brief: string): boolean {
  const t = String(brief || '');
  if (!t) return false;

  // 1. En tête de phrase (début du texte ou après un point).
  //    On tolère un court préambule de style : « A close-up, editorial style
  //    photograph of a tablet… » commence bien par le sujet.
  const enTete = new RegExp(String.raw`(?:^|[.!?]\s+)[^.!?]{0,40}\b(?:${MOTS_ECRAN})\b`, 'i');
  if (enTete.test(t)) return true;

  // 2. Marqueur de position, puis l'écran, dans la même phrase.
  const positionPuisEcran = new RegExp(
    String.raw`\b(?:${POSITION_SUJET})\b[^.!?]{0,90}?\b(?:${MOTS_ECRAN})\b`, 'i',
  );
  if (positionPuisEcran.test(t)) return true;

  // 3. L'écran, puis le marqueur de position.
  const ecranPuisPosition = new RegExp(
    String.raw`\b(?:${MOTS_ECRAN})\b[^.!?]{0,60}?\b(?:in the foreground|fills the frame|as the main subject)\b`, 'i',
  );
  if (ecranPuisPosition.test(t)) return true;

  return false;
}

/**
 * Les cas qui ont réellement été observés en production, gardés comme
 * référence. Le script `scripts/verifier-ecran-sujet.mjs` les rejoue : une
 * règle de qualité sans cas de test se dégrade sans que personne ne le voie.
 */
export const CAS_OBSERVES: Array<{ attendu: boolean; brief: string; vu: string }> = [
  {
    attendu: true, vu: '2026-08-13, Instagram',
    brief: 'A close-up, editorial style photograph of a bustling bakery counter. In the foreground, a tablet screen, slightly out of focus, displays a KeiroAI marketing dashboard with real-time data.',
  },
  {
    attendu: true, vu: '2026-08-13, TikTok',
    brief: 'A modern tablet displaying a clear dashboard, with a heavily condensed window in the blurred background showing bright, distorted sunlight.',
  },
  {
    attendu: true, vu: '2026-08-12, Instagram',
    brief: "A smartphone showing 'Unknown Number' call, with a blurred computer screen in the background displaying a clean, modern KeiroAI interface.",
  },
  {
    attendu: true, vu: '2026-08-12, Instagram',
    brief: "A close-up shot of a smartphone screen displaying a notification that reads 'Vous avez été retrouvé !'.",
  },
  {
    attendu: false, vu: '2026-08-13, Instagram — bon brief',
    brief: "Close-up of a baker's hands quickly arranging baguettes, with a blurred, sun-drenched street visible through the shopfront, suggesting a hot and busy day.",
  },
  {
    attendu: false, vu: 'écran de décor, légitime',
    brief: 'A florist wrapping a bouquet at her worktable, kraft paper and cut stems around her, a tablet lying face down in the blurred background.',
  },
  {
    attendu: false, vu: '2026-08-12, bon brief',
    brief: 'Two chairs and a small table on a restaurant terrace just before opening, folded napkins, long shadows on the pavement.',
  },
  {
    attendu: false, vu: 'preuve en carrousel, autorisée',
    brief: "A handwritten reservation book open on the counter, pages full, the owner's hand resting beside it in warm evening light.",
  },
];
