import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * La préférence de génération du client — lue par TOUS les agents.
 *
 * Demande du fondateur (2026-08-08) : « à l'onboarding et dans Clara, une
 * question qui indique une préférence pour les générations ultra naturelles,
 * qualité photographe. Trois choix : image brute, image brute améliorée, ou
 * mixte d'images et d'ambiances. Et on lui propose de dire 100 % brut, ou 50 %
 * brut et 50 % mixte, donc 0 % IA. Assure-toi que Clara transmet l'info à
 * l'agent contenu, l'agent DM, l'agent email, à Stella, à tous les agents. »
 *
 * ── Le trou que ça comble ──
 *
 * Une police d'utilisation des fichiers existait déjà (asset_usage_policy),
 * avec son mode brut / retouche légère / création libre. Mais elle est rangée
 * dans org_agent_configs sous agent_id = 'content'. Autrement dit : seule Léna
 * la lit. Jade, Hugo et Stella produisent des visuels sans jamais la voir.
 *
 * Un client qui déclare « je ne veux que mes vraies photos » voyait donc sa
 * consigne respectée sur ses publications, et ignorée partout ailleurs. C'est
 * exactement le genre d'incohérence qui fait perdre confiance : la règle est
 * appliquée une fois sur trois, sans qu'il comprenne pourquoi.
 *
 * Ce module lit la préférence à UN seul endroit et la rend disponible à tous.
 * Elle reste stockée sous 'content' — c'est là qu'elle vit depuis juillet, la
 * déplacer casserait l'existant — mais elle n'est plus réservée à Léna.
 *
 * ── La proportion, pas seulement le mode ──
 *
 * Le fondateur veut pouvoir dire « 100 % brut » ou « 50/50 ». Un mode seul ne
 * l'exprime pas : il faut une part. `part_brut` porte ce pourcentage, et le
 * mode reste ce qu'on a le droit de faire du RESTE.
 */

export type ModeGeneration = 'brut' | 'ameliore' | 'libre';

export interface PreferenceGeneration {
  /** Ce qu'on a le droit de faire des fichiers du client. */
  mode: ModeGeneration;
  /** Part des publications qui doit utiliser ses photos telles quelles (0-100). */
  partBrut: number;
  /** Mixer plusieurs de ses images dans un même visuel. */
  autoriseMixage: boolean;
  /** Ajouter des éléments qui n'étaient pas sur la photo. */
  autoriseAjout: boolean;
}

export const PREFERENCE_PAR_DEFAUT: PreferenceGeneration = {
  // Par défaut on améliore légèrement : c'est le compromis qui sert le mieux
  // un commerce sans photothèque fournie, tout en restant photographique.
  mode: 'ameliore',
  partBrut: 30,
  autoriseMixage: false,
  autoriseAjout: false,
};

/** Traduit l'ancien vocabulaire (raw/light/free) vers le nouveau. */
function normaliserMode(brut: any): ModeGeneration {
  const m = String(brut || '').toLowerCase();
  if (m === 'raw' || m === 'brut') return 'brut';
  if (m === 'free' || m === 'libre') return 'libre';
  return 'ameliore';
}

/**
 * Lit la préférence du client, quel que soit l'agent qui demande.
 *
 * On lit toujours la configuration de 'content', même pour Jade ou Stella :
 * c'est la préférence DU CLIENT, pas celle d'un agent. La dupliquer par agent
 * garantirait qu'elles divergent.
 */
export async function preferenceGeneration(
  supabase: SupabaseClient,
  userId: string,
): Promise<PreferenceGeneration> {
  try {
    const { data } = await supabase
      .from('org_agent_configs')
      .select('config, created_at')
      .eq('user_id', userId)
      .eq('agent_id', 'content')
      .order('created_at', { ascending: false })
      .limit(1);

    const p = (data?.[0]?.config as any)?.asset_usage_policy;
    if (!p) return PREFERENCE_PAR_DEFAUT;

    return {
      mode: normaliserMode(p.mode),
      partBrut: typeof p.part_brut === 'number'
        ? Math.max(0, Math.min(100, p.part_brut))
        : (normaliserMode(p.mode) === 'brut' ? 100 : PREFERENCE_PAR_DEFAUT.partBrut),
      autoriseMixage: !!p.allow_mix,
      autoriseAjout: !!p.allow_add_elements,
    };
  } catch {
    // Une préférence illisible ne doit pas bloquer une génération : on prend
    // le défaut, qui est le plus conservateur des trois modes utiles.
    return PREFERENCE_PAR_DEFAUT;
  }
}

/**
 * Le bloc injecté dans le prompt de n'importe quel agent qui produit un visuel.
 *
 * Écrit à l'impératif et sans nuance : c'est une consigne du client, pas une
 * suggestion. Un agent qui « interprète » une règle de ce type finit par la
 * contourner dès qu'elle le gêne.
 */
export function blocPreference(p: PreferenceGeneration): string {
  const lignes: string[] = [
    '=== CE QUE LE CLIENT AUTORISE SUR SES VISUELS ===',
    'Règle posée par le client lui-même. Elle prime sur toute considération esthétique.',
    '',
  ];

  if (p.mode === 'brut') {
    lignes.push(
      "MODE BRUT : tu utilises SES photos telles quelles. Recadrage et correction",
      "d'exposition acceptés, rien d'autre. Aucune génération, aucun ajout, aucun",
      "remplacement de décor. Si aucune photo utilisable n'existe pour ce sujet, tu",
      "ne publies PAS de visuel inventé — tu le signales.",
    );
  } else if (p.mode === 'ameliore') {
    lignes.push(
      "MODE AMÉLIORÉ : tu pars de SES photos et tu les améliores — lumière, netteté,",
      "cadrage, nettoyage de l'arrière-plan. Le lieu, les produits et les personnes",
      "restent les siens. Tu ne remplaces jamais son espace par un décor inventé.",
    );
  } else {
    lignes.push(
      "MODE LIBRE : tu peux composer une scène, en restant fidèle à son métier, à son",
      "lieu et à son offre réels. Rien d'inventé qui n'existe pas chez lui.",
    );
  }

  lignes.push(
    '',
    `PART DE PHOTOS BRUTES : ${p.partBrut}% des publications doivent utiliser ses vraies`,
    `photos sans transformation. ${p.partBrut >= 100
      ? 'Ici, 100 % : aucune image générée, jamais.'
      : p.partBrut === 0
        ? "Ici, aucune contrainte de ce côté."
        : `Sur dix publications, environ ${Math.round(p.partBrut / 10)} doivent être ses photos telles quelles.`}`,
    '',
    p.autoriseMixage
      ? 'MIXAGE AUTORISÉ : tu peux combiner plusieurs de ses images dans un même visuel.'
      : 'MIXAGE INTERDIT : une image, une source. Ne combine jamais deux de ses photos.',
    p.autoriseAjout
      ? "AJOUT AUTORISÉ : tu peux ajouter des éléments absents de la photo d'origine."
      : "AJOUT INTERDIT : n'ajoute aucun élément, objet ou personne absent de sa photo.",
  );

  return '\n' + lignes.join('\n') + '\n';
}

/**
 * Raccourci : lit et rend le bloc en une fois.
 *
 * C'est cette fonction que les agents appellent. Elle échoue en silence vers
 * le défaut plutôt que de lever : un prompt sans cette section reste valide,
 * une génération qui plante ne l'est pas.
 */
export async function blocPreferencePour(
  supabase: SupabaseClient,
  userId: string | null | undefined,
): Promise<string> {
  if (!userId) return '';
  const p = await preferenceGeneration(supabase, userId);
  return blocPreference(p);
}
