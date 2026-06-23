/**
 * STRATÉGIE DE PORTÉE — source unique pour donner de la visibilité au contenu
 * d'un client, surtout un compte NEUF (TikTok/Instagram) qui part de zéro.
 *
 * 2026-06-23 — Founder : « pars du principe d'un client qui vient de créer un
 * TikTok, sans image native → on génère en IA (déclaré), et s'il dépose des
 * images on peut poster SANS retouche pour l'authenticité, ou les retravailler/
 * s'en inspirer. Il faut une vraie stratégie de portée — le client voit le
 * nombre de vues de ce qu'on poste pour lui, il doit être satisfait. »
 *
 * Leçon @Mushu (cf. enquête 2026-06-23) : un compte jeune bombardé de contenu
 * IA non déclaré via API se fait supprimer (0 vue durable). La parade :
 * déclarer l'IA, prioriser le média RÉEL, démarrer doucement (warming), feel
 * natif (son tendance), et mesurer/communiquer la portée en toute transparence.
 */

export type AccountStage = 'fresh' | 'warming' | 'established';

/** Étape du compte selon le nb de publications déjà faites sur la plateforme. */
export function getAccountStage(publishedCount: number): AccountStage {
  if (publishedCount < 7) return 'fresh';        // ~1ère semaine : confiance à bâtir
  if (publishedCount < 21) return 'warming';     // ~3 semaines : montée progressive
  return 'established';
}

export interface ReachPlan {
  stage: AccountStage;
  dailyCap: number;              // publications/jour conseillées sur la plateforme
  preferPrepareMode: boolean;    // TikTok: déposer en brouillon (inbox) → le client
                                 // ajoute un SON TENDANCE in-app (top facteur de reach)
  preferRealMedia: boolean;      // prioriser le média réel client (authenticité)
  notes: string;                 // garde-fous appliqués
}

/**
 * Plan de portée par étape + plateforme. Compte neuf = lent + natif + son
 * tendance ; compte établi = cadence normale, l'algo nous connaît.
 */
export function reachPlan(stage: AccountStage, platform: 'tiktok' | 'instagram'): ReachPlan {
  if (stage === 'fresh') {
    return {
      stage, dailyCap: 1,
      preferPrepareMode: platform === 'tiktok',   // son tendance ajouté par le client
      preferRealMedia: true,
      notes: 'Compte neuf : 1 post/jour, feel natif, son tendance (TikTok prepare), média réel prioritaire, AUCUN hashtag reach-bait (#fyp/#pourtoi), niche constante pour que l\'algo classe le compte.',
    };
  }
  if (stage === 'warming') {
    return {
      stage, dailyCap: platform === 'tiktok' ? 1 : 2,
      preferPrepareMode: platform === 'tiktok',
      preferRealMedia: true,
      notes: 'Montée progressive : on garde le son tendance + média réel, on densifie doucement, on double sur les formats qui ont déjà capté des vues.',
    };
  }
  return {
    stage, dailyCap: platform === 'tiktok' ? 2 : 2,
    preferPrepareMode: false,
    preferRealMedia: false,   // mix libre média réel / IA déclarée
    notes: 'Compte établi : cadence normale selon le plan, mix média réel + IA déclarée, on optimise sur la rétention et l\'engagement (commentaires).',
  };
}

/**
 * PRIORITÉ DE SOURCE DE CONTENU (founder). Le média réel du client passe AVANT
 * l'IA — surtout sur un compte neuf : authentique, aucun label IA, meilleure
 * confiance algo. L'IA (toujours déclarée AIGC) prend le relais quand il n'y a
 * pas d'asset, et on peut aussi RETRAVAILLER / s'inspirer du média réel.
 */
export function contentSourcePriority(hasClientMedia: boolean, stage: AccountStage): string {
  if (hasClientMedia) {
    return stage === 'established'
      ? 'Média réel client (brut OU retravaillé) en mix avec de l\'IA déclarée. Le brut reste valorisé pour l\'authenticité.'
      : 'PRIORITÉ au média réel client : poster BRUT (sans retouche) pour l\'authenticité d\'un compte neuf, ou légèrement retravaillé. L\'IA déclarée seulement en complément.';
  }
  return 'Pas d\'asset client → 100% généré par IA, TOUJOURS déclaré AIGC (is_aigc=true). Réalisme max, hook fort, mouvement dynamique, son tendance.';
}

/** Principes de portée (compacts) à injecter dans la génération de contenu. */
export function buildReachStrategyBlock(stage: AccountStage, platform: 'tiktok' | 'instagram', hasClientMedia: boolean): string {
  const p = reachPlan(stage, platform);
  return [
    `STRATÉGIE DE PORTÉE (compte ${stage} sur ${platform}) :`,
    `- Source de contenu : ${contentSourcePriority(hasClientMedia, stage)}`,
    `- Cadence : ${p.dailyCap} post(s)/jour. ${p.notes}`,
    `- Hook dans la 1ère seconde (rétention = clé du reach). Sous-titres lisibles, vertical plein cadre.`,
    `- Déclencher l'engagement (question, avis clivant) = signal de portée fort.`,
    `- Jamais le mot "IA" dans la légende. Jamais #fyp/#pourtoi (reach-bait pénalisé).`,
  ].join('\n');
}

/** Note de cadrage des attentes pour le brief client d'un compte neuf (le
 *  client voit ses vues → on explique le cold-start au lieu de le subir). */
export function coldStartBriefNote(stage: AccountStage, platform: 'tiktok' | 'instagram'): string | null {
  if (stage === 'established') return null;
  const plat = platform === 'tiktok' ? 'TikTok' : 'Instagram';
  if (stage === 'fresh') {
    return `🌱 Ton compte ${plat} démarre : les premières semaines, l'algorithme "teste" ton compte et les vues montent doucement, c'est NORMAL. On publie régulièrement, natif et soigné, pour installer la confiance — c'est ce qui débloque la portée ensuite.`;
  }
  return `📈 Ton compte ${plat} prend ses marques : on densifie le rythme et on capitalise sur les formats qui ont déjà accroché. La portée se construit semaine après semaine.`;
}
