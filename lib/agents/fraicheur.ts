import { detectEvent, isPostWithinEventWindow } from './event-calendar';
import { callLlmWithFallback } from './llm-fallback';

/**
 * Un post écrit aujourd'hui doit rester vrai le jour où il sort.
 *
 * ── Ce qu'on répare (fondateur, ouvert depuis le 6 juillet) ──
 *
 * « Les posts DÉJÀ planifiés avec de l'actu périmée ne sont pas rafraîchis. »
 * La génération, elle, a été corrigée : on ne parle plus d'un événement passé,
 * on respecte les délais d'anticipation. Mais le calendrier porte encore des
 * contenus écrits des semaines plus tôt, et personne ne les relit avant qu'ils
 * ne partent.
 *
 * Mesure du 2026-08-11 sur les 288 publications programmées :
 *
 *   · 23 % contiennent une référence temporelle écrite au moment de la
 *     génération — « aujourd'hui », « ce soir », « cette semaine » ;
 *   · « Les soldes commencent aujourd'hui » était programmé le 18 août, six
 *     semaines après le début des soldes et deux après leur fin ;
 *   · « La canicule arrive » avait été écrit le 21 juin pour sortir le 30 août ;
 *   · « +2,4 % d'inflation en mai » devait partir le 13 août.
 *
 * Aucun de ces posts n'est rattrapé par les garde-fous existants :
 * `event-calendar` sait juger un événement DATÉ (Tour de France, Cannes), pas
 * une phrase qui dit « demain ». Et le balayage de `planning-cadence` ne lit
 * que l'accroche, avec sept événements écrits en dur.
 *
 * ── Le principe : réparer, pas jeter ──
 *
 * Un post dont seule la date cloche est un bon post mal daté. Le mettre au
 * rebut gaspille une génération déjà payée et laisse un trou dans le planning.
 * On réécrit donc la partie fausse, et on ne renonce que lorsque le sujet
 * ENTIER repose sur quelque chose qui n'est plus vrai.
 *
 * ── Pourquoi deux étages ──
 *
 * Le repérage est déterministe et gratuit : il tourne sur tout le calendrier
 * sans appeler un modèle. Seuls les posts qu'il signale — un sur quatre —
 * passent devant un modèle, et seulement à l'approche de leur date. Le
 * fondateur veut « de la très bonne qualité sur tous les réseaux même en
 * contrôlant les coûts » : c'est exactement l'arbitrage, la dépense va là où
 * il y a un doute réel.
 *
 * Le repérage ne DÉCIDE rien, il présélectionne. « Aujourd'hui, 80 % des
 * clients cherchent en ligne » contient « aujourd'hui » sans être daté pour
 * autant — c'est une généralité, elle sera vraie dans six mois. Trancher cela
 * demande de comprendre la phrase ; c'est le travail du second étage.
 */

export type FamillePeremption =
  | 'temps_relatif'      // « demain », « ce soir », « cette semaine »
  | 'evenement_passe'    // un événement daté, hors de sa fenêtre à la parution
  | 'saison_decalee'     // la canicule annoncée pour un post de novembre
  | 'chiffre_date';      // « +2,4 % d'inflation en mai »

export interface ReperePerissable {
  famille: FamillePeremption;
  /** Le fragment exact qui a déclenché le repérage. */
  extrait: string;
  /** Ce qu'il faudra vérifier — sert de consigne au second étage. */
  aVerifier: string;
}

/**
 * Formulations qui désignent un moment précis RELATIF au jour d'écriture.
 * Elles sont écrites une fois et lues des semaines plus tard : c'est la
 * famille la plus fréquente, et la seule qu'aucun calendrier ne peut attraper.
 */
const TEMPS_RELATIF = new RegExp(
  '\\b('
  + "aujourd['’]hui|demain|apr[eè]s-demain|hier|avant-hier"
  + '|ce soir|ce matin|ce midi|cette nuit'
  + '|ce week-?end|cette semaine|ce mois-ci'
  + '|la semaine prochaine|le mois prochain|le week-?end prochain'
  + '|dans \\d+ (?:jours?|semaines?|mois)'
  + '|d[eè]s (?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|demain)'
  + '|ce (?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)'
  + '|en ce moment|ces jours-ci|maintenant m[eê]me'
  + ')\\b',
  'i',
);

/**
 * Saisons et mots qui n'ont de sens qu'à certains mois. La valeur liste les
 * mois (1-12) où la mention reste plausible.
 *
 * Bornes larges à dessein : une glace en septembre n'a rien d'absurde, une
 * canicule en novembre si. On ne signale que le franchement décalé — un
 * repérage trop bavard coûte des appels de modèle pour rien.
 */
const SAISONNIER: Array<{ motif: RegExp; mois: number[]; quoi: string }> = [
  { motif: /\bcanicule|forte chaleur|\bplein soleil\b/i, mois: [6, 7, 8, 9], quoi: 'la canicule' },
  { motif: /\bmaillot de bain\b|\bbronzage\b|\bplage\b/i, mois: [5, 6, 7, 8, 9], quoi: "l'été" },
  { motif: /\bneige\b|\bski\b|\bstation de ski\b|\bpatinoire\b/i, mois: [12, 1, 2, 3], quoi: "l'hiver" },
  { motif: /\bno[eë]l\b|\br[eé]veillon\b|\bsapin\b|\bmarch[eé] de no[eë]l\b/i, mois: [11, 12], quoi: 'Noël' },
  { motif: /\bnouvel an\b|\bbonne ann[eé]e\b|\bbonnes r[eé]solutions\b/i, mois: [12, 1], quoi: "le nouvel an" },
  { motif: /\brentr[eé]e\b/i, mois: [8, 9], quoi: 'la rentrée' },
  { motif: /\bhalloween\b|\bcitrouille\b/i, mois: [10], quoi: 'Halloween' },
  { motif: /\bsoldes\b/i, mois: [1, 6, 7], quoi: 'les soldes' },
  { motif: /\bblack friday\b/i, mois: [11], quoi: 'le Black Friday' },
  { motif: /\bsaint-?valentin\b/i, mois: [1, 2], quoi: 'la Saint-Valentin' },
  { motif: /\bf[eê]te des m[eè]res\b/i, mois: [5, 6], quoi: 'la fête des mères' },
  { motif: /\bf[eê]te des p[eè]res\b/i, mois: [5, 6], quoi: 'la fête des pères' },
  { motif: /\bp[aâ]ques\b/i, mois: [3, 4], quoi: 'Pâques' },
];

/** « en mai », « depuis juillet » : un chiffre accroché à un mois vieillit. */
const MOIS_NOMME = /\b(?:en|depuis|d[eè]s|fin|d[eé]but|mi-)\s+(janvier|f[eé]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[eé]cembre)\b/i;

const NOMS_MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function moisDe(dateIso: string): number {
  const m = Number(String(dateIso).slice(5, 7));
  return Number.isFinite(m) && m >= 1 && m <= 12 ? m : new Date().getUTCMonth() + 1;
}

/**
 * Repère, sans appeler le moindre modèle, ce qui pourrait avoir mal vieilli
 * dans un texte destiné à sortir le `dateParution`.
 *
 * Renvoie une liste vide quand rien ne cloche — c'est le cas des trois quarts
 * du calendrier, et ces posts-là ne coûteront rien.
 */
export function reperesPerissables(texte: string, dateParution: string): ReperePerissable[] {
  const t = String(texte || '');
  if (!t.trim()) return [];
  const reperes: ReperePerissable[] = [];

  const relatif = t.match(TEMPS_RELATIF);
  if (relatif) {
    reperes.push({
      famille: 'temps_relatif',
      extrait: relatif[0],
      aVerifier: `« ${relatif[0]} » a été écrit avant la programmation : vérifie que cela désigne bien le jour de parution, et pas le jour d'écriture.`,
    });
  }

  const mois = moisDe(dateParution);
  for (const s of SAISONNIER) {
    const m = t.match(s.motif);
    if (m && !s.mois.includes(mois)) {
      reperes.push({
        famille: 'saison_decalee',
        extrait: m[0],
        aVerifier: `Le post évoque ${s.quoi} alors qu'il sort en ${NOMS_MOIS[mois - 1]}.`,
      });
    }
  }

  const moisNomme = t.match(MOIS_NOMME);
  if (moisNomme) {
    reperes.push({
      famille: 'chiffre_date',
      extrait: moisNomme[0],
      aVerifier: `« ${moisNomme[0] } » date le propos : à la parution, est-ce encore la période dont on parle ?`,
    });
  }

  // L'événement daté : `event-calendar` connaît les vraies dates de début et
  // de fin, et la fenêtre tolérée selon l'ampleur. On ne redéclare rien ici.
  const evenement = detectEvent(t);
  if (evenement && !isPostWithinEventWindow(evenement, dateParution)) {
    reperes.push({
      famille: 'evenement_passe',
      extrait: evenement.label,
      aVerifier: `Le post parle de ${evenement.label} (${evenement.start} → ${evenement.end}), hors de sa fenêtre le ${dateParution}.`,
    });
  }

  return reperes;
}

export interface VerdictFraicheur {
  /** `inchange` : le repérage était un faux positif, rien à corriger. */
  action: 'inchange' | 'reecrit' | 'irrecuperable';
  hook?: string;
  caption?: string;
  /** En clair, pour le journal du client et le diagnostic. */
  motif: string;
}

const SYSTEME = `Tu es rédacteur en chef d'un compte de marque. On te soumet une publication ÉCRITE IL Y A PLUSIEURS SEMAINES et PROGRAMMÉE pour une date précise. Ton seul travail : qu'elle soit encore JUSTE le jour où elle sort.

Tu ne réécris pas pour améliorer le style. Tu ne touches QUE ce qui est devenu faux, décalé ou bizarre à la date de parution.

TROIS VERDICTS POSSIBLES :

1. "inchange" — le repérage automatique s'est trompé, rien n'est daté.
   C'est le cas le PLUS FRÉQUENT, ne le crains pas.
   « Aujourd'hui, 80 % des clients cherchent en ligne » = généralité, vraie dans six mois → inchange.
   « En ce moment, les gens veulent du fait maison » = tendance de fond → inchange.
   Un mot n'est daté que s'il désigne un MOMENT PRÉCIS.

2. "reecrit" — quelque chose est faux à la date de parution, mais le sujet du post tient toujours.
   « Les soldes commencent aujourd'hui » un jour où les soldes sont finies → on retire l'accroche aux soldes, on garde le sujet.
   « La canicule arrive » pour une parution de novembre → on parle du froid, ou on retire la météo.
   « Demain on ouvre à 7h » écrit six semaines plus tôt → « On ouvre à 7h ».
   Le plus souvent, la bonne correction est de RETIRER l'ancrage temporel, pas de le remplacer par un autre.

3. "irrecuperable" — le post n'existe QUE par l'événement passé, il n'en reste rien une fois celui-ci retiré.
   « Bonne année 2026 ! » programmé en août. « Suivez le Tour de France avec nous » deux mois après l'arrivée.
   Ne choisis ceci que si tu ne peux VRAIMENT rien sauver.

RÈGLES ABSOLUES QUAND TU RÉÉCRIS :
· Ne change RIEN d'autre que ce qui est daté. Même ton, même longueur, mêmes emojis, même tutoiement, même angle.
· L'accroche doit rester AUSSI FORTE qu'avant. Si tu lui retires sa pointe, tu as échoué : trouve une autre tension, un chiffre, une question qui pique.
· N'invente JAMAIS un client, un témoignage, un nom de commerce, une ville ou un chiffre de résultat. Aucun fait nouveau.
· Ne parle pas d'un événement à venir que tu n'as pas de raison de connaître.
· Le texte décrit une image déjà produite, que tu ne peux pas changer : reste sur le même sujet visuel.

Réponds UNIQUEMENT par un objet JSON, sans texte autour, sans balises de code :
{"action":"inchange|reecrit|irrecuperable","hook":"...","caption":"...","motif":"une phrase en français"}
Pour "inchange" et "irrecuperable", laisse hook et caption vides.`;

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/** « vendredi 18 septembre 2026 » — le modèle raisonne mal sur « 2026-09-18 ». */
function dateEnClair(dateIso: string): string {
  const d = new Date(`${String(dateIso).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateIso;
  return `${JOURS[d.getUTCDay()]} ${d.getUTCDate()} ${NOMS_MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * Second étage : soumet à un modèle le post et ce que le repérage a signalé.
 *
 * Renvoie `null` quand le contrôle n'a PAS pu être rendu (modèles injoignables,
 * réponse illisible) — à ne jamais confondre avec « rien à corriger ». Sur une
 * panne, l'appelant laisse le post tel quel : on ne dégrade pas une publication
 * sur une défaillance de notre côté.
 */
export async function rafraichirPublication(input: {
  hook: string;
  caption: string;
  plateforme: string;
  dateParution: string;
  reperes: ReperePerissable[];
}): Promise<VerdictFraicheur | null> {
  const { hook, caption, plateforme, dateParution, reperes } = input;
  if (!reperes.length) return { action: 'inchange', motif: 'aucun repère périssable' };

  const message = [
    `DATE DU JOUR : ${dateEnClair(new Date().toISOString())}`,
    `DATE DE PARUTION : ${dateEnClair(dateParution)}`,
    `RÉSEAU : ${plateforme}`,
    '',
    'CE QUE LE REPÉRAGE AUTOMATIQUE A SIGNALÉ :',
    ...reperes.map(r => `· ${r.aVerifier}`),
    '',
    'ACCROCHE :',
    hook || '(vide)',
    '',
    'LÉGENDE :',
    (caption || '(vide)').slice(0, 3000),
  ].join('\n');

  let brut: string;
  try {
    const res = await callLlmWithFallback({
      system: SYSTEME,
      message,
      // Volume : le repérage envoie ici un post sur quatre, tous les jours.
      // Haiku suffit largement pour retirer un ancrage temporel, et c'est ce
      // qui rend le contrôle tenable sur la durée.
      claudeModel: 'claude-haiku-4-5-20251001',
      maxTokens: 1200,
      callTag: 'fraicheur_post',
    });
    brut = res.text || '';
  } catch {
    return null;
  }

  // Le modèle encadre parfois sa réponse malgré la consigne.
  const json = brut.replace(/^[\s\S]*?\{/, '{').replace(/\}[^}]*$/, '}');
  let v: any;
  try { v = JSON.parse(json); } catch { return null; }

  const action = v?.action === 'reecrit' || v?.action === 'irrecuperable' ? v.action : 'inchange';
  const motif = String(v?.motif || '').slice(0, 300) || 'sans motif';

  if (action !== 'reecrit') return { action, motif };

  const nouveauHook = String(v.hook || '').trim();
  const nouvelleCaption = String(v.caption || '').trim();

  // Une réécriture qui vide le post est un échec du modèle, pas une correction.
  // On préfère laisser l'original : il sera peut-être mal daté, il ne sera pas
  // amputé. Repère mesuré : sous la moitié de la longueur d'origine, le modèle
  // a résumé au lieu de corriger.
  if (!nouvelleCaption || nouvelleCaption.length < Math.min(60, (caption || '').length * 0.5)) {
    return { action: 'inchange', motif: `réécriture écartée (texte trop court) — ${motif}` };
  }

  return {
    action: 'reecrit',
    hook: nouveauHook || hook,
    caption: nouvelleCaption,
    motif,
  };
}
