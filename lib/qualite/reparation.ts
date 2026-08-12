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
