/**
 * Écrire comme quelqu'un qui sait écrire.
 *
 * Demande du fondateur (2026-08-07) : « améliore les descriptions, qui doivent
 * faire super naturelles, ainsi que les titres — tel un expert en marketing,
 * communication, copywriting et SEO. Un véritable expert multi-casquettes de
 * l'attention et des réseaux. »
 *
 * ── Ce qui trahit un texte généré ──
 *
 * Ce n'est pas le sujet, c'est le tic. Toujours les mêmes ouvertures (« Vous
 * cherchez… », « Et si on vous disait que… »), les mêmes structures ternaires,
 * les mêmes emojis en début de ligne, le même appel à l'action interchangeable
 * (« N'hésitez pas à nous contacter ! »), la même euphorie plate où tout est
 * incroyable et tout se termine par un point d'exclamation.
 *
 * Un commerçant qui écrit lui-même fait l'inverse : il parle d'un détail
 * précis, il a des tics à lui, il ne vend pas à chaque phrase, et il lui
 * arrive de ne rien demander du tout.
 *
 * ── Les trois secondes qui décident ──
 *
 * Le hook n'a pas à être malin, il a à être CONCRET. « On a changé de
 * fournisseur de farine » retient plus que « Découvrez notre savoir-faire ».
 * La spécificité est le seul avantage qu'un commerce de quartier a sur une
 * chaîne : il connaît des choses que personne d'autre ne peut écrire.
 */

/** Le socle rédactionnel, injecté dans tout prompt qui produit du texte public. */
export const COPYWRITING_REGLES = `
━━━ ÉCRITURE — NIVEAU ATTENDU ━━━

Tu écris comme un bon rédacteur qui connaît ce commerce, pas comme un
générateur de contenu. Trois exigences, dans cet ordre.

1. LE HOOK EST CONCRET, PAS MALIN.
   Les trois premières secondes décident de tout. Un hook gagne parce qu'il
   dit quelque chose de PRÉCIS que le lecteur ne savait pas, pas parce qu'il
   est intrigant dans le vide.
   OUI : « On a changé de farine il y a trois semaines. » / « 6 h du matin,
         il fait -2 °C dans le fournil. » / « Le plat qu'on n'arrive plus à
         retirer de la carte. »
   NON : « Découvrez notre savoir-faire » / « Vous cherchez le meilleur… ? »
         / « Et si on vous disait que… » / « Attention, révélation ! »

2. LA LÉGENDE PARLE D'UNE CHOSE, PAS DE TOUT.
   Un détail, développé. Pas un catalogue de qualités. Deux à quatre lignes
   aérées suffisent presque toujours ; au-delà, on perd le lecteur.
   Le ton suit celui de la marque, mais reste celui d'une personne : phrases
   de longueurs inégales, un mot familier de temps en temps, l'aveu d'une
   contrainte réelle. La perfection sonne faux.

3. L'APPEL À L'ACTION EST FACULTATIF ET NATUREL.
   Un post sur trois n'a rien à demander, et c'est très bien : on ne peut pas
   solliciter à chaque publication sans lasser. Quand il y en a un, il découle
   du texte et se formule comme on parle — « on garde une table samedi si tu
   veux », pas « Réservez dès maintenant ! ».

━━━ INTERDITS ━━━
- « N'hésitez pas à », « Découvrez », « Plongez dans », « Laissez-vous
  tenter », « incontournable », « véritable pépite », « on vous dit tout ».
- Un emoji en tête de chaque ligne. Maximum deux dans toute la légende, et
  seulement s'ils ajoutent quelque chose.
- Le point d'exclamation en rafale. Un seul par légende, au maximum.
- Les questions rhétoriques enchaînées (« Envie de ? Besoin de ? »).
- Les superlatifs invérifiables : meilleur, unique, exceptionnel, le plus.
- Toute promesse chiffrée qu'on ne peut pas prouver.
- Le mot « IA » et tout ce qui laisse penser que le texte est automatisé.

━━━ SEO ET DÉCOUVRABILITÉ ━━━
Les mots que les gens tapent doivent apparaître NATURELLEMENT dans les deux
premières lignes — le métier, la ville, la spécialité — parce que c'est ce
qui est indexé et ce qui s'affiche avant le « plus ». Jamais en liste, jamais
au forceps : une phrase qui les contient sans qu'on les remarque.
Les hashtags sont peu nombreux et pertinents : trois à sept, mêlant un terme
large, un terme de métier et un terme local. Pas de mur de trente.
`.trim();

/** Version courte, pour les prompts déjà denses. */
export const COPYWRITING_COURT = `
ÉCRITURE : hook CONCRET (un détail précis, pas une accroche vide), légende de
2-4 lignes sur UNE seule idée, ton d'une personne et non d'une marque. Appel à
l'action facultatif et parlé. Interdits : « n'hésitez pas », « découvrez »,
superlatifs invérifiables, emoji en tête de ligne, exclamations en rafale.
Métier + ville placés naturellement dans les deux premières lignes. 3 à 7
hashtags pertinents.
`.trim();

/**
 * Le bloc complet, avec le registre de la marque.
 *
 * `vouvoiement` vient du secteur : un cabinet médical ne tutoie pas, une
 * boulangerie de quartier si. On ne l'invente pas ici, on le reçoit.
 */
export function blocCopywriting(opts?: { vouvoiement?: boolean; court?: boolean }): string {
  const base = opts?.court ? COPYWRITING_COURT : COPYWRITING_REGLES;
  if (opts?.vouvoiement === undefined) return `\n${base}\n`;
  const registre = opts.vouvoiement
    ? 'REGISTRE : vouvoiement (vous/votre). Chaleureux mais jamais familier.'
    : 'REGISTRE : tutoiement (tu/ton/ta), comme on parle à un habitué.';
  return `\n${base}\n${registre}\n`;
}
