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

/**
 * Mode de publication TikTok — DÉFAUT = 'auto' À TOUS LES STADES (founder 02/07).
 * Nos posts en AUTO (publication directe) SONT le produit et sont utiles — on
 * ne dit JAMAIS au client que l'auto ne sert à rien ni qu'il "faut passer en
 * manuel". Le mode 'manual' (brouillon inbox pour coller un son tendant) reste
 * disponible comme CHOIX EXPLICITE du client et se SUGGÈRE seulement comme
 * BOOSTER optionnel (cf. adviseTrendingSound), jamais comme un défaut imposé.
 */
export function recommendedPublishMode(_stage: AccountStage): 'auto' | 'manual' {
  return 'auto';
}

export interface ReachPlan {
  stage: AccountStage;
  dailyCap: number;              // publications/jour conseillées sur la plateforme
  postDirect: boolean;          // TOUJOURS true : on publie en DIRECT (public). Jamais
                                // de draft par défaut (le draft/SELF_ONLY tuerait la portée).
  adviseTrendingSound: boolean; // conseiller AU CLIENT (optionnel) de poster un EXTRA en
                                // mode draft pour ajouter un son tendance qu'on a repéré.
                                // = posts supplémentaires, comptés dans le plan (marges).
  preferRealMedia: boolean;      // prioriser le média réel client (authenticité)
  postsPerWeek: number;          // cadence HEBDO conseillée (algo 2026 : 4-5/sem compte neuf, pas du daily-burst)
  preferShortReels: boolean;     // compte neuf : reels COURTS (7-12s) → meilleur taux de complétion
  completionTarget: number;      // taux de complétion cible (0.70 = LE signal viral 2026)
  notes: string;                 // garde-fous appliqués
}

/**
 * Plan de portée par étape + plateforme. On publie TOUJOURS en DIRECT (public) :
 * le contenu IA déclaré (AIGC) ne pénalise pas la portée, il la propulse. Le
 * draft n'est qu'un CONSEIL optionnel au client pour ajouter un son tendance
 * repéré (extra, intégré au plan pour maîtriser les marges).
 */
export function reachPlan(stage: AccountStage, platform: 'tiktok' | 'instagram'): ReachPlan {
  if (stage === 'fresh') {
    return {
      stage, dailyCap: 1, postsPerWeek: 5, preferShortReels: true, completionTarget: 0.70,
      postDirect: true,
      adviseTrendingSound: platform === 'tiktok',
      preferRealMedia: true,
      notes: 'Compte neuf (algo 2026) : 4-5 posts/SEMAINE, JAMAIS en rafale (le burst sur compte froid tue la portée). Reels COURTS (7-12s) = meilleur taux de complétion (LE signal viral, cible 70%+). Hook dans les 3 premières secondes. EN DIRECT (public), feel natif, média réel prioritaire (sinon IA déclarée), niche CONSTANTE (l\'algo classe le compte), AUCUN #fyp/#pourtoi. Prérequis : compte RÉCHAUFFÉ avant (cf. accountWarmingSteps). Optionnel : son tendance en draft.',
    };
  }
  if (stage === 'warming') {
    return {
      stage, dailyCap: 1, postsPerWeek: 6, preferShortReels: true, completionTarget: 0.65,
      postDirect: true,
      adviseTrendingSound: platform === 'tiktok',
      preferRealMedia: true,
      notes: 'Montée progressive : ~1/jour max, reels encore courts, on double sur les formats qui ont DÉJÀ capté des vues. EN DIRECT, média réel + IA déclarée. Engagement (réponses aux commentaires) = signal fort.',
    };
  }
  return {
    stage, dailyCap: platform === 'tiktok' ? 2 : 2, postsPerWeek: 10, preferShortReels: false, completionTarget: 0.55,
    postDirect: true,
    adviseTrendingSound: false,
    preferRealMedia: false,   // mix libre média réel / IA déclarée
    notes: 'Compte établi : cadence normale selon le plan, EN DIRECT, mix média réel + IA déclarée, durées variées, on optimise sur la rétention et l\'engagement (commentaires).',
  };
}

/**
 * COMPORTEMENT DU COMPTE — warming (founder : "comportement du compte" pour
 * propulser un compte neuf). L'algo 2026 montre d'abord un compte FROID à la
 * plus petite audience-test ; un compte RÉCHAUFFÉ (interactions niche) obtient
 * une bien meilleure portée initiale. On ne peut PAS le faire via API (signal
 * comportemental) → c'est une routine côté CLIENT, qu'on lui présente.
 */
export function accountWarmingSteps(platform: 'tiktok' | 'instagram'): string[] {
  const net = platform === 'tiktok' ? 'TikTok' : 'Instagram';
  return [
    `Avant de publier en force, "réchauffe" le compte 5-7 jours : ouvre ${net} 20-30 min/jour et scrolle ta niche.`,
    'Like 10-15 vidéos/posts de ta niche par session, commente 2-3 fois sincèrement.',
    'Suis 5-8 comptes pertinents de ta niche/zone (voir "Comptes à suivre" dans Jade).',
    'Reste sur TA thématique en scrollant : l\'algo construit le profil d\'intérêt du compte → il te montrera ensuite à la bonne audience-test.',
    'Publie 4-5 fois/semaine (pas en rafale), reels courts, hook dès la 1ère seconde, regarde le taux de complétion grimper.',
  ];
}

/** Bloc comportement/warming prêt à afficher au client (compte neuf/warming). */
export function accountBehaviorBlock(stage: AccountStage, platform: 'tiktok' | 'instagram'): string | null {
  if (stage === 'established') return null;
  return `🔥 PROPULSER TON COMPTE ${platform === 'tiktok' ? 'TIKTOK' : 'INSTAGRAM'} (compte ${stage}) :\n- ` + accountWarmingSteps(platform).join('\n- ');
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
    `- Publication EN DIRECT (public), jamais en draft par défaut. Le contenu IA est TOUJOURS déclaré (AIGC) — ça NE réduit PAS la portée, c'est neutre et ça protège/propulse le compte.`,
    `- Cadence : ~${p.postsPerWeek} posts/SEMAINE (max ${p.dailyCap}/jour, JAMAIS en rafale). ${p.notes}`,
    p.preferShortReels ? `- DURÉE : privilégie des reels COURTS (7-12s) — le taux de COMPLÉTION (cible ${Math.round(p.completionTarget * 100)}%+) est LE signal viral 2026. Une vidéo courte vue en entier > une longue lâchée.` : `- Durées variées, mais surveille le taux de complétion (cible ${Math.round(p.completionTarget * 100)}%+).`,
    p.adviseTrendingSound ? `- Optionnel : si on repère un son tendant, CONSEILLER au client un post EXTRA en draft pour qu'il colle ce son in-app (booster). Ces extras sont comptés dans le plan (marges maîtrisées).` : '',
    `- Hook dans les 3 PREMIÈRES SECONDES (71% décident en 3s). Sous-titres lisibles, vertical plein cadre, re-watch = boost massif.`,
    `- Déclencher l'engagement (question, avis clivant) = signal de portée fort.`,
    `- Jamais le mot "IA" dans la légende. Jamais #fyp/#pourtoi (reach-bait pénalisé).`,
  ].filter(Boolean).join('\n');
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
