import { callLlmWithFallback } from '@/lib/agents/llm-fallback';
import { blocExigence } from '@/lib/visuals/exigences-reseau';

/**
 * Réparer une publication refusée, tout de suite, plutôt que la mettre de côté.
 *
 * ── Pourquoi ──
 *
 * Fondateur, 2026-08-12 : « si le client décide de publier le jour même et que
 * ça ne passe pas le contrôle, on doit quand même lui délivrer du top qualité,
 * il ne doit pas attendre et ne rien avoir. On doit délivrer vite ET top
 * qualité. »
 *
 * La relecture anticipée corrige le calendrier plusieurs jours à l'avance —
 * c'est le bon rythme pour ce qui est programmé. Mais elle ne peut rien pour
 * un client qui clique « publier » à l'instant. Jusqu'ici, dans ce cas, le
 * contrôle refusait et le client se retrouvait devant un écran qui dit non,
 * sans rien à publier.
 *
 * Refuser sans réparer, c'est protéger la qualité en sacrifiant la livraison.
 * Les deux moitiés de la règle ne tiennent ensemble que si un refus déclenche
 * une correction immédiate.
 *
 * ── Ce qu'on répare, et ce qu'on ne répare pas ──
 *
 * Le TEXTE se réécrit en quelques secondes, à partir de ce que le contrôle a
 * vu sur l'image : le nouveau texte parle du bon sujet par construction. C'est
 * l'immense majorité des refus — client inventé, chiffre aberrant, hors-sujet.
 *
 * Une IMAGE ratée, elle, se régénère en une minute au moins, et parfois pas
 * mieux. Ce module ne s'en occupe donc pas : le chemin de publication a déjà
 * sa propre échelle de secours pour ça.
 */

export interface Reparation {
  hook: string;
  caption: string;
}

/**
 * Réécrit la légende à partir de la description que le contrôle a produite.
 *
 * Renvoie `null` si la réécriture échoue ou revient trop courte — auquel cas
 * l'appelant garde l'original et signale le refus, plutôt que de publier un
 * texte amputé.
 */
export async function reparerLegende(input: {
  descriptionImage: string;
  motifs: string;
  plateforme: string;
  ancienneLegende: string;
}): Promise<Reparation | null> {
  const exigence = blocExigence(input.plateforme, { avecTexte: true });
  const system = `Tu es rédacteur en chef d'un compte de marque. Une publication a été REFUSÉE par le contrôle qualité, mais son IMAGE est bonne. Tu réécris le texte pour qu'il colle à l'image et respecte les règles.

${exigence}

RÈGLES ABSOLUES :
· Parle de CE QUI EST RÉELLEMENT SUR L'IMAGE, décrite ci-dessous. C'est le motif de refus le plus fréquent.
· N'invente JAMAIS un client, un prénom, un nom de commerce, une ville, un témoignage.
· Aucun chiffre de résultat invraisemblable. Un ordre de grandeur crédible passe, « +300 % » non.
· Pas de hashtag dans la légende.
· Première ligne = l'accroche, elle doit retenir selon le registre du réseau ci-dessus.

Réponds UNIQUEMENT par un objet JSON, sans texte autour :
{"hook":"la première ligne","caption":"la légende complète, accroche comprise"}`;

  const message = [
    `CE QUE MONTRE L'IMAGE : ${input.descriptionImage}`,
    '',
    `POURQUOI LE POST A ÉTÉ REFUSÉ : ${input.motifs}`,
    '',
    'ANCIENNE LÉGENDE (à ne PAS reprendre si elle est la cause du refus) :',
    input.ancienneLegende.slice(0, 1200) || '(vide)',
  ].join('\n');

  try {
    const res = await callLlmWithFallback({
      system, message, claudeModel: 'claude-haiku-4-5-20251001',
      maxTokens: 900, callTag: 'qc_reparation_legende',
    });
    const json = (res.text || '').replace(/^[\s\S]*?\{/, '{').replace(/\}[^}]*$/, '}');
    const v = JSON.parse(json);
    const caption = String(v?.caption || '').trim();
    if (caption.length < 40) return null;
    return { hook: String(v?.hook || '').trim(), caption };
  } catch {
    return null;
  }
}

/**
 * Écrit un brief photographique à partir de la LÉGENDE, pour régénérer l'image.
 *
 * ── Pourquoi l'inverse de la fonction ci-dessus ──
 *
 * On savait réparer un texte qui ne colle pas à l'image. On ne savait pas
 * réparer une image qui ne colle pas au texte — et c'est devenu le défaut
 * dominant : un café glacé sur une publication KeiroAI, un cocktail sur des
 * conseils marketing. Le texte était juste ; l'illustration parlait d'autre
 * chose.
 *
 * Réécrire la légende pour qu'elle parle du café glacé serait absurde : on
 * détruirait le seul élément valable pour sauver le mauvais. Quand c'est
 * l'image qui manque le sujet, c'est l'image qu'il faut refaire.
 *
 * Le brief décrit une SCÈNE, pas un concept. Un générateur d'images ne sait pas
 * illustrer « le gain de temps » ; il sait photographier une main qui repose un
 * téléphone sur un comptoir pendant qu'un client attend. C'est la traduction que
 * fait cette fonction, et c'est là que se joue la pertinence du visuel.
 *
 * Renvoie `null` en cas d'échec : l'appelant garde alors l'image d'origine et
 * signale le refus, plutôt que de publier au hasard.
 */
export async function briefVisuelDepuisLegende(input: {
  legende: string;
  motifs: string;
  metier?: string | null;
}): Promise<string | null> {
  const system = `You write photographic briefs for a brand's social media. A post was REJECTED because its image did not illustrate its text. The text is good. You describe the photograph that SHOULD accompany it.

RULES:
· Describe a SCENE that can be photographed: who, where, what object, what light, what moment. Never a concept — "efficiency" or "time saved" cannot be photographed, a hand setting a phone down on a counter while a customer waits can.
· The scene must belong to the trade${input.metier ? ` (${input.metier})` : ''} and to what the text actually says. A viewer must understand, without reading, why this image sits above this text.
· A real photograph: natural light, real materials, no 3D render, no illustration, no text or logo inside the image, no screens showing interfaces.
· One or two sentences, in English, concrete and visual. No preamble.

Reply with the brief only.`;

  const message = [
    `TEXT OF THE POST:\n${input.legende.slice(0, 900)}`,
    '',
    `WHY THE PREVIOUS IMAGE WAS REJECTED:\n${input.motifs.slice(0, 400)}`,
  ].join('\n');

  try {
    const res = await callLlmWithFallback({
      system, message, claudeModel: 'claude-haiku-4-5-20251001',
      maxTokens: 300, callTag: 'qc_brief_visuel',
    });
    const brief = (res.text || '').trim().replace(/^["'`]+|["'`]+$/g, '');
    if (brief.length < 25) return null;
    return brief.slice(0, 600);
  } catch {
    return null;
  }
}
