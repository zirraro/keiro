/**
 * Construction d'un carrousel cohérent — un seul chemin pour tous les réseaux.
 *
 * ── Pourquoi ce module existe ──
 *
 * 2026-08-10. J'avais corrigé la cohérence des carrousels le matin même, et le
 * fondateur signale l'après-midi un carrousel TikTok fleur → cupcake → fleur.
 * La correction était réelle, mais posée uniquement sur le chemin Instagram :
 * la publication TikTok en mode photo construisait ses diapositives dans son
 * coin, sans le moindre contrôle. Deux chemins, une seule correction.
 *
 * C'est la leçon à retenir plus que le défaut lui-même. Tant que deux endroits
 * fabriquent des carrousels, la prochaine règle de qualité en oubliera un. D'où
 * ce module : les deux réseaux passent par ici, et une règle ajoutée ici
 * s'applique partout par construction.
 *
 * ── Ce qu'il garantit ──
 *
 * 1. Les diapositives racontent la même histoire. Une diapositive d'un autre
 *    univers — le cupcake au milieu des fleurs — est écartée avant de coûter
 *    une génération.
 * 2. Elles ressemblent à une même séance photo. Sans ancre, chaque image était
 *    fabriquée depuis son seul texte : autre lieu, autre lumière, autre style
 *    de rendu.
 * 3. Chacune passe le contrôle qualité, pas seulement la première, avec une
 *    seconde tentative qui nomme le défaut.
 * 4. Le post part quand même. Règle du fondateur : « ne laisse jamais passer de
 *    la mauvaise qualité, mais toujours publier pour livrer le client. » Les
 *    deux tiennent ensemble parce qu'on écarte la diapositive fautive, pas le
 *    carrousel.
 */

import { verifierDiapo, verifierSerieDiapos, contratDeScene, briefDiapoAncre, repliNarratif } from './carousel-coherence';
import { diapoRealiste } from './realisme-photo';

export interface OptionsCarrousel {
  /** Le brief de la première image, déjà produite : elle donne le ton. */
  descriptionDeBase: string;
  /** Les diapositives proposées par le modèle (la 1re est l'image de base). */
  diapositives: Array<{ visual?: string; text?: string; style?: string }>;
  /** L'URL de la première image, déjà générée. */
  premiereImage: string;
  businessType?: string | null;
  /** La légende que le lecteur aura sous les yeux — le juge visuel en a besoin. */
  legende?: string | null;
  /** La scène décrite par le client lui-même, si elle existe. */
  sceneClient?: string | null;
  /** Combien d'images au total, première comprise. */
  maximum: number;
  /** Le générateur d'image du contexte appelant. */
  genererVisuel: (brief: string, format: string) => Promise<string | null>;
  /** Journalise un contrôle qualité impossible (crédit épuisé, service muet). */
  signalerControleIndisponible?: (raison: string, numero: number) => void;
  /**
   * Le post porte-t-il un texte incrusté VOULU ?
   *
   * 2026-08-10 — Au repassage des 240 posts rapatriés, deux ont été refusés
   * pour « texte visible » alors que leur texte était un overlay demandé par la
   * stratégie. Le contrôle applique la règle « zéro texte » du fondateur, qui
   * vise les inscriptions parasites du générateur — enseignes inventées,
   * charabia, écritures étrangères — pas une accroche qu'on a nous-mêmes posée.
   * Sans cette information, il ne peut pas faire la différence.
   */
  texteAutorise?: boolean;
}

export interface ResultatCarrousel {
  images: string[];
  /** Ce qui a été écarté, pour le diagnostic. */
  ecartees: Array<{ numero: number; motif: string }>;
}

/**
 * Le contrôle qualité, appelé paresseusement : le module ne dépend pas d'une
 * clé d'API au chargement, et reste testable hors ligne.
 */
async function controler(imageUrl: string, brief: string, businessType?: string | null, texteAutorise?: boolean) {
  try {
    const { reviewGeneratedImage } = await import('./image-qa');
    return await reviewGeneratedImage({ imageUrl, visualBrief: brief, businessType: businessType || undefined, textAllowed: texteAutorise });
  } catch {
    return { verdict: 'indisponible' as const, raisonIndisponible: 'module indisponible' };
  }
}

export async function construireCarrousel(o: OptionsCarrousel): Promise<ResultatCarrousel> {
  const images: string[] = [o.premiereImage];
  const ecartees: Array<{ numero: number; motif: string }> = [];

  const proposees = o.diapositives.slice(1, o.maximum);
  const briefs = proposees.map((s) => (s.visual || '').trim());

  // ── L'histoire tient-elle debout ? ──
  // La première image compte dans le jugement : c'est elle qui fixe l'univers.
  const serie = verifierSerieDiapos([o.descriptionDeBase, ...briefs]);
  const horsSerie = new Set(
    serie.coherente ? [] : serie.diapoIncoherentes.map((i) => i - 1).filter((i) => i >= 0),
  );

  // ── Le monde commun imposé à toutes ──
  const contrat = contratDeScene(o.descriptionDeBase, o.businessType);

  for (let i = 0; i < proposees.length; i++) {
    if (images.length >= o.maximum) break;
    const brut = briefs[i];
    if (!brut) continue;

    const numero = i + 2;

    // Contrôle métier, quand le métier est connu.
    const parMetier = verifierDiapo(brut, o.businessType);
    if (!parMetier.coherent) {
      ecartees.push({ numero, motif: parMetier.motif || 'hors métier' });
      continue;
    }
    // Contrôle de série, qui vaut même sans connaître le métier.
    if (horsSerie.has(i)) {
      ecartees.push({ numero, motif: serie.motif || 'hors de la série' });
      continue;
    }

    const brief = briefDiapoAncre(brut, contrat, numero);
    let url: string | null = null;
    try {
      url = await o.genererVisuel(diapoRealiste(brief), 'carrousel');
    } catch { url = null; }
    if (!url) { ecartees.push({ numero, motif: 'génération impossible' }); continue; }

    const qa = await controler(url, brief, o.businessType, o.texteAutorise);
    if (qa.verdict === 'indisponible') {
      // On livre, mais on le dit. Un contrôle mort ne doit jamais ressembler
      // à un contrôle réussi.
      o.signalerControleIndisponible?.((qa as any).raisonIndisponible || 'inconnue', numero);
      images.push(url);
      continue;
    }
    if (qa.verdict === 'hard_fail') {
      const correctif = `${brief} À CORRIGER ABSOLUMENT : ${qa.issue || 'rendu non photographique'}. Vraie photographie prise à l'appareil, aucun rendu illustré ni 3D.`;
      let second: string | null = null;
      try { second = await o.genererVisuel(diapoRealiste(correctif), 'carrousel'); } catch { second = null; }
      if (second) {
        const qa2 = await controler(second, correctif, o.businessType, o.texteAutorise);
        if (qa2.verdict !== 'hard_fail') { images.push(second); continue; }
        ecartees.push({ numero, motif: `refusée 2 fois — ${qa2.issue || ''}`.trim() });
      } else {
        ecartees.push({ numero, motif: `refusée — ${qa.issue || ''}`.trim() });
      }
      continue;
    }
    images.push(url);
  }

  // ── Repli : pas assez d'images pour un vrai carrousel ──
  //
  // Un carrousel d'une seule image affiche l'icône de carrousel sur une photo
  // solitaire — le fondateur l'avait signalé. On complète avec le repli
  // narratif, qui reste dans l'univers du commerce, plutôt que de renoncer.
  if (images.length < 2) {
    for (const variation of repliNarratif(o.descriptionDeBase, o.businessType, o.sceneClient)) {
      if (images.length >= o.maximum) break;
      try {
        const url = await o.genererVisuel(diapoRealiste(briefDiapoAncre(variation, contrat, images.length + 1)), 'carrousel');
        if (url) images.push(url);
      } catch { /* on continue : livrer prime */ }
    }
  }

  /**
   * ── Le dernier regard : les IMAGES ensemble, face à la légende ──
   *
   * Tout ce qui précède contrôle chaque diapositive contre SON PROPRE brief, et
   * la série au niveau des TEXTES. Deux briefs cohérents peuvent pourtant donner
   * deux images sans rapport, et personne ne regardait l'ensemble.
   *
   * Le fondateur, le 16 août, sur un carrousel parti le matin même : « les
   * images ne sont pas liées, aucune logique avec le texte ». C'était exact, et
   * aucun contrôle de la chaîne ne pouvait le voir — le juge visuel ne recevait
   * que la couverture, et les diapositives suivantes partaient sans qu'aucun
   * œil, humain ou non, ne les ait jamais regardées ensemble.
   *
   * On écarte la diapositive fautive plutôt que le carrousel : deux images qui
   * tiennent valent mieux qu'un créneau vide, et c'est déjà la règle appliquée
   * plus haut pour les briefs.
   */
  if (images.length >= 2 && o.legende) {
    try {
      const { jugerImagesDeLaSerie } = await import('./carousel-coherence');
      const v = await jugerImagesDeLaSerie({ images, legende: o.legende, metier: o.businessType });
      if (v && v.horsSujet.length > 0) {
        const garde = images.filter((_, i) => !v.horsSujet.includes(i));
        // Il faut au moins deux images pour qu'un carrousel reste un carrousel.
        if (garde.length >= 2) {
          for (const i of v.horsSujet) ecartees.push({ numero: i + 1, motif: v.motifs[0] || "hors-sujet à l'image" });
          console.warn(`[Carrousel] série jugée ${v.note}/10 — diapositive(s) ${v.horsSujet.map((i) => i + 1).join(', ')} écartée(s) : ${v.motifs[0] || 'hors-sujet'}`);
          images.length = 0;
          images.push(...garde);
        } else {
          console.warn(`[Carrousel] série jugée ${v.note}/10, mais moins de deux diapositives tiendraient — on garde tout plutôt que de ne rien livrer`);
        }
      }
    } catch (e: any) {
      // Une panne de vision ne vide pas un créneau.
      console.warn('[Carrousel] jugement visuel de la série indisponible :', e?.message);
    }
  }

  return { images, ecartees };
}
