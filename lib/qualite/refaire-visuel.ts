/**
 * Refaire l'IMAGE quand c'est l'image qu'on reproche — pas la légende.
 *
 * ── Pourquoi ce module existe ──
 *
 * Rapport du matin du 15 août : 29 publications non livrées, et un motif qui
 * écrase tous les autres —
 *
 *     « qc_legende_reecrite: qc_coherence_bloque: L'image est hors-sujet »
 *
 * Le contrôle reproche l'IMAGE. La réparation réécrivait la LÉGENDE. Le
 * contrôle suivant retrouvait la même image, la refusait encore, et le post
 * restait bloqué. On réparait consciencieusement le mauvais côté.
 *
 * Le raisonnement d'origine se tenait pourtant : un client inventé, un chiffre
 * aberrant, ça se corrige dans le texte, et jeter un beau visuel pour une
 * légende qui ment serait payer deux fois. Mais « l'image montre une
 * boulangerie alors que l'annonceur est une agence » ne se rattrape par aucune
 * légende : réécrire le texte pour parler de boulangerie ferait publier un post
 * de boulangerie sur le compte d'une agence.
 *
 * ── Ce qu'on fait ici ──
 *
 * La légende devient la référence — elle a déjà passé le contrôle sur le fond —
 * et on redemande une image qui la serve, en disant explicitement ce que le
 * juge a reproché à la précédente. Sans ce grief, on regénérerait la même
 * erreur avec une autre graine.
 */

/**
 * Retoucher ou refaire ? La décision se prend sur le grief et sur la note.
 *
 * ── Pourquoi arbitrer plutôt que toujours regénérer ──
 *
 * Fondateur, 2026-08-15 : « pour réparer on peut utiliser de l'editing et pas
 * de la génération si c'est plus pertinent — à arbitrer selon les situations et
 * les notes peut-être. »
 *
 * Il a raison, et regénérer systématiquement a deux coûts. Le premier est
 * évident : on repaie une image entière pour corriger un détail. Le second est
 * plus sournois — on jette aussi ce qui MARCHAIT. Un visuel noté 7 dont on
 * reproche seulement la fumée en trop a déjà le bon métier, le bon geste, la
 * bonne lumière ; le regénérer, c'est rejouer aux dés tout ce qui était acquis.
 *
 * ── La règle ──
 *
 * · Le grief porte sur le SUJET (mauvais métier, hors-sujet, texte dans
 *   l'image, écran) → REFAIRE. Aucune retouche ne transforme une boulangerie
 *   en salon de coiffure, et un texte incrusté ne s'efface pas à faible force.
 *
 * · Le grief porte sur le TRAITEMENT (effets en trop, couleurs, lumière,
 *   cadrage un peu large) ET la note est déjà correcte → RETOUCHER. On garde
 *   la scène et on corrige ce qui gêne.
 *
 * La note tranche les cas ambigus : en dessous de 6, il y a trop à reprendre
 * pour espérer qu'une retouche suffise.
 */
export function choisirModeReparation(griefs: string, note: number | null | undefined): 'refaire' | 'retoucher' {
  const g = String(griefs || '').toLowerCase();

  // Défauts de SUJET : la retouche ne peut rien pour eux.
  const surLeSujet = /hors-sujet|n['’]illustre|ne montre|autre métier|ne correspond pas|texte|enseigne|panneau|écran|lisible|vide|pictogramme|portrait/.test(g);
  if (surLeSujet) return 'refaire';

  // Défauts de TRAITEMENT : la scène est bonne, l'exécution gêne.
  const surLeTraitement = /fumée|buée|vapeur|scintill|poussière|saturé|couleur|lumière|éclairage|cadrage|coupe|flou|contraste|effet/.test(g);
  if (surLeTraitement && (note ?? 0) >= 6) return 'retoucher';

  return 'refaire';
}

export async function regenererVisuelDepuisLegende(input: {
  hook: string;
  caption: string;
  plateforme: string;
  format: string;
  /** Ce que le contrôle a reproché à l'image précédente, mot pour mot. */
  griefs: string;
  userId: string | null;
  /** L'image refusée — nécessaire pour la retouche, inutile pour la refonte. */
  visuelActuel?: string | null;
  /** La note du contrôle : elle tranche les cas ambigus. */
  note?: number | null;
}): Promise<string | null> {
  const { hook, caption, plateforme, format, griefs } = input;

  // ── Retouche : on garde la scène, on corrige ce qui gêne ──
  if (input.visuelActuel && choisirModeReparation(griefs, input.note) === 'retoucher') {
    try {
      const base = process.env.NEXT_PUBLIC_BASE_URL || 'https://keiroai.com';
      const rep = await fetch(`${base}/api/agents/content`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_visual',
          visual_description: [
            // Formulé en POSITIF : on décrit l'image voulue, pas le défaut à
            // retirer. Nommer « moins de fumée » remet la fumée dans la scène.
            `Same scene, same subject, same framing as the reference.`,
            `Natural restrained rendering: clear air, dry clean surfaces, even honest colours,`,
            `one identifiable light source with soft shadows. Fine grain, nothing polished.`,
          ].join(' '),
          reference_image_url: input.visuelActuel,
          // Force basse : on retouche, on ne réinvente pas. Au-delà, le lieu
          // change et on perd ce qu'on voulait garder.
          strength: 0.28,
          format: format === 'carrousel' ? 'carrousel' : format,
          user_id: input.userId,
        }),
      });
      const j = await rep.json().catch(() => null);
      const url = j?.visual_url || j?.url || null;
      if (url) {
        console.log('[refaire-visuel] retouche appliquée (grief de traitement, note suffisante)');
        return url;
      }
      // La retouche a échoué : on continue en refonte plutôt que d'abandonner.
    } catch { /* on bascule en refonte */ }
  }

  // Le texte est la source. On lui demande une scène, pas une illustration.
  const brief = [
    `Voici le texte d'une publication ${plateforme} déjà validé sur le fond :`,
    '',
    `ACCROCHE : ${hook}`,
    `LÉGENDE : ${String(caption).slice(0, 700)}`,
    '',
    `L'image précédente a été REFUSÉE par le contrôle qualité pour cette raison :`,
    `« ${griefs} »`,
    '',
    'Décris la scène photographique qui illustre CE texte, en corrigeant explicitement ce reproche.',
    'Une scène réelle, un geste en cours, un lieu de travail — pas une illustration conceptuelle.',
    "Si le reproche dit que l'image montrait un autre métier que celui du texte, change de métier, pas d'angle.",
    '',
    'Réponds par UNE description visuelle en anglais, sans préambule.',
  ].join('\n');

  try {
    const { callLlmWithFallback } = await import('@/lib/agents/llm-fallback');
    const r = await callLlmWithFallback({
      system: [
        'Tu es directeur photo. Tu décris des scènes réelles à photographier pour des commerces locaux.',
        '',
        'RÈGLES ABSOLUES :',
        "· Aucun texte lisible dans l'image : ni enseigne, ni panneau, ni ardoise, ni étiquette.",
        "· Le sujet est le TRAVAIL, jamais le travailleur : quelqu'un peut être dans le cadre, mais en plein geste, les yeux sur l'ouvrage. Jamais un portrait qui pose face à l'objectif.",
        "· Un écran n'est jamais le sujet.",
        '· Lumière naturelle identifiable, couleurs sobres, grain fin. Jamais de rendu 3D, jamais de peau lissée.',
        "· Pas d'effets appuyés : ni buée de trop, ni fumée théâtrale, ni poussière scintillante.",
        // Troisième couche de la même règle. Le fondateur a posé l'ordre le
        // 15 août : « régler le problème à la source, donc sur le modèle et le
        // prompt, les prompts ensuite le juge puis les prompts de réparation ».
        // Une règle qui ne vit que dans la génération se perd dès qu'on refait
        // un visuel : la réparation repartirait sur le défaut qu'elle corrige.
        "· Jamais de gros plan sur une goutte, une éclaboussure ou un liquide qui coule le long d'un verre : la physique des fluides est ce que les modèles ratent le plus visiblement. Un versement continu filmé large, ou le verre déjà plein et immobile.",
      ].join('\n'),
      message: brief,
      maxTokens: 400,
      callTag: 'qc_visuel_refait',
    });
    const description = (r.text || '').trim();
    if (!description || description.length < 30) return null;

    // On passe par la route de génération existante : c'est elle qui porte les
    // gardes (écran-sujet, scènes trop vues, définition, format). Refaire un
    // appel Seedream à côté d'elle rouvrirait tous les trous qu'elle bouche.
    const base = process.env.NEXT_PUBLIC_BASE_URL || 'https://keiroai.com';
    const rep = await fetch(`${base}/api/agents/content`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.CRON_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'generate_visual',
        visual_description: description,
        format: format === 'carrousel' ? 'carrousel' : format,
        user_id: input.userId,
      }),
    });
    const j = await rep.json().catch(() => null);
    return j?.visual_url || j?.url || null;
  } catch {
    return null;
  }
}
