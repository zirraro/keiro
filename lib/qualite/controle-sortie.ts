import { createClient } from '@supabase/supabase-js';
import { callLlmWithFallback } from '@/lib/agents/llm-fallback';
import { critereDe } from './criteres';
import { noterVerdict, consignesQualite } from './memoire';

/**
 * Le contrôle qualité de TOUT ce qui sort de KeiroAI et qu'un humain va lire.
 *
 * ── Ce qu'on répare ──
 *
 * Fondateur, 2026-08-11 : « il faut aussi des contrôles qualité sur les mails
 * envoyés, sur les DM préparés ou pris en charge en réponse auto, sur Stella,
 * sur les documents émis dans Sara et dans Louis, sur les avis préparés dans
 * Théo — on vérifie tout ce qui part de KeiroAI. »
 *
 * Le contenu PUBLIÉ avait son contrôle depuis des mois. Tout le reste partait
 * sans relecture : un mail de prospection, une réponse d'avis Google affichée
 * publiquement sous la fiche du commerçant, un contrat de travail. Ce sont
 * pourtant les sorties les plus engageantes — un post raté se noie dans un
 * fil, une réponse d'avis reste.
 *
 * ── Le principe : anticiper, pas constater ──
 *
 * « Si le résultat est moyen, déjà anticiper que ce n'est pas bon et sortir
 * quelque chose de meilleur. » Le contrôle ne se contente donc pas de juger :
 * quand la note est sous le seuil, il DEMANDE une meilleure version dans le
 * même appel, et c'est elle qui part. Constater un défaut sans le corriger ne
 * sert qu'à faire des statistiques.
 *
 * ── Trois étages, du gratuit au payant ──
 *
 * 1. Déterministe (0 €) : client inventé, langue, texte vide, marques de
 *    fabrique oubliées. Ça attrape les fautes grossières sans rien dépenser.
 * 2. Un seul appel de modèle qui juge ET réécrit. Deux appels séparés
 *    coûteraient le double pour le même résultat.
 * 3. La mémoire partagée, injectée dans le prompt : ce qui a déjà été reproché
 *    sur cet agent, chez tous les clients.
 *
 * ── Ce qu'on fait quand c'est mauvais ──
 *
 * La règle du fondateur tient en une phrase : « ne jamais laisser passer de la
 * mauvaise qualité, mais toujours publier pour livrer le client. » Les deux
 * tiennent parce qu'on RÉÉCRIT au lieu de bloquer. On ne retient que si même
 * la réécriture échoue, et seulement pour les tâches où un mauvais envoi coûte
 * plus cher que pas d'envoi du tout — une réponse d'avis Google est publique
 * et définitive, un brief interne ne l'est pas.
 */

export interface VerdictQualite {
  /** Le contenu à utiliser : l'original, ou la version améliorée. */
  contenu: string;
  /** Peut-on l'envoyer ? Faux = on retient et on prévient. */
  envoyable: boolean;
  note: number;
  noteApres?: number;
  defauts: string[];
  reecrit: boolean;
}

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/** Mots outils français — leur absence en nombre trahit une autre langue. */
const MOTS_FR = /\b(le|la|les|un|une|des|du|de|et|est|tu|vous|on|votre|pour|avec|dans|sur|qui|que|pas|ce|il|elle|nous|mais|par|au|aux|se|sa|son|ses|en)\b/gi;
const MOTS_EN = /\b(the|and|your|you|with|for|this|that|is|are|our|we|they|of|to|in|on|it|from|have|will)\b/gi;

/** Ce qui ne doit JAMAIS sortir, quel que soit l'agent. Gratuit à détecter. */
function defautsEvidents(contenu: string): string[] {
  const d: string[] = [];
  const t = String(contenu || '');

  if (t.replace(/\s/g, '').length < 20) d.push('texte vide ou trop court');

  // Marques de fabrique oubliées : un crochet vide ou un « lorem » qui part
  // chez un client, c'est le défaut le plus visible et le plus évitable.
  if (/\[(à compléter|insérer|nom|prénom|xxx|todo)\]/i.test(t)) d.push('champ à compléter laissé tel quel');
  if (/\blorem ipsum\b/i.test(t)) d.push('texte de remplissage');
  if (/\{\{|\}\}|\$\{/.test(t)) d.push('variable de gabarit non remplacée');

  // Règle fondateur : jamais « IA » dans ce que lit le client final.
  if (/\b(assistant|stratège|agent|r[ée]dacteur)\s+IA\b/i.test(t)) d.push("le mot « IA » apparaît dans la signature ou le rôle");

  const mots = t.split(/\s+/).filter(Boolean).length;
  if (mots >= 25) {
    const fr = (t.match(MOTS_FR) || []).length;
    const en = (t.match(MOTS_EN) || []).length;
    if (en > fr) d.push("le texte ne semble pas être en français");
  }

  return d;
}

const SYSTEME_BASE = `Tu es relecteur en chef. On te soumet un texte qu'un agent s'apprête à ENVOYER à un vrai destinataire, au nom d'un commerçant. Ton travail : dire s'il part en l'état, et sinon en écrire une meilleure version.

Sois EXIGEANT. Ce texte engage le commerçant : il sera lu par son client, son prospect ou son salarié.

Note sur 10 :
  9-10 : on envoie sans hésiter
  7-8  : correct, ça peut partir
  5-6  : passable — ça sent l'automatique, ça n'apporte rien
  0-4  : ne doit pas partir

QUAND LA NOTE EST SOUS LE SEUIL, ÉCRIS UNE MEILLEURE VERSION. Elle doit :
· corriger précisément les défauts que tu as relevés, pas réécrire pour réécrire ;
· garder l'intention, la langue, le destinataire et les faits du texte d'origine ;
· n'inventer AUCUNE information absente de l'original.

Réponds UNIQUEMENT par un objet JSON, sans texte autour :
{"note":0-10,"defauts":["..."],"meilleure_version":"… ou chaîne vide si la note est au-dessus du seuil"}`;

/**
 * Contrôle un contenu avant envoi, et l'améliore s'il est moyen.
 *
 * Ne lève jamais : sur une panne du contrôle, le contenu d'origine part tel
 * quel. On ne suspend pas la livraison d'un client sur une défaillance de
 * notre côté — c'est la même règle que pour le contenu publié.
 */
export async function controlerSortie(input: {
  agent: string;
  tache: string;
  contenu: string;
  /** Ce que le relecteur doit savoir : le message d'origine, le dossier… */
  contexte?: string;
  userId?: string | null;
}): Promise<VerdictQualite> {
  const { agent, tache, contenu, contexte, userId } = input;
  const critere = critereDe(tache);
  const base: VerdictQualite = { contenu, envoyable: true, note: 10, defauts: [], reecrit: false };

  const evidents = defautsEvidents(contenu);

  let supabase: any = null;
  try { supabase = sb(); } catch { /* pas de base : on contrôle quand même */ }

  let memoire = '';
  if (supabase) {
    try { memoire = await consignesQualite(supabase, agent, tache, userId); } catch { /* sans mémoire */ }
  }

  let note = 10, defauts: string[] = [...evidents], meilleure = '';
  try {
    const message = [
      `TÂCHE : ${critere.libelle}`,
      `SEUIL D'ACCEPTATION : ${critere.seuil}/10`,
      '',
      critere.exigences,
      memoire ? `\n${memoire}` : '',
      evidents.length ? `\nDÉFAUTS DÉJÀ REPÉRÉS AUTOMATIQUEMENT (à corriger impérativement) :\n${evidents.map(d => `· ${d}`).join('\n')}` : '',
      contexte ? `\nCONTEXTE :\n${contexte.slice(0, 2000)}` : '',
      '',
      'TEXTE À RELIRE :',
      contenu.slice(0, 6000),
    ].filter(Boolean).join('\n');

    const res = await callLlmWithFallback({
      system: SYSTEME_BASE, message,
      claudeModel: 'claude-haiku-4-5-20251001',
      maxTokens: 2000, callTag: `qc_${tache}`,
    });
    const json = (res.text || '').replace(/^[\s\S]*?\{/, '{').replace(/\}[^}]*$/, '}');
    const v = JSON.parse(json);
    note = Math.max(0, Math.min(10, Number(v?.note) ?? 10));
    if (Array.isArray(v?.defauts)) defauts = [...evidents, ...v.defauts.map((x: any) => String(x).slice(0, 200))];
    meilleure = String(v?.meilleure_version || '').trim();
  } catch {
    // Contrôle indisponible. On laisse partir l'original — sauf si le contrôle
    // gratuit avait déjà relevé quelque chose de grossier, auquel cas on ne
    // fait pas semblant de ne pas l'avoir vu.
    if (evidents.length && critere.bloquantSiEchec) {
      return { contenu, envoyable: false, note: 4, defauts: evidents, reecrit: false };
    }
    return base;
  }

  if (note >= critere.seuil && !evidents.length) {
    void noterVerdict(supabase, { agent, tache, userId, note, defauts: [], reecrit: false, bloque: false, extrait: contenu.slice(0, 200) });
    return { contenu, envoyable: true, note, defauts: [], reecrit: false };
  }

  // ── Sous le seuil : on prend la meilleure version ──
  const utilisable = meilleure
    && meilleure.length >= Math.min(40, contenu.length * 0.4)
    && defautsEvidents(meilleure).length === 0;

  if (utilisable) {
    void noterVerdict(supabase, {
      agent, tache, userId, note, defauts, reecrit: true, noteApres: Math.max(note, critere.seuil),
      bloque: false, extrait: contenu.slice(0, 200),
    });
    return { contenu: meilleure, envoyable: true, note, noteApres: critere.seuil, defauts, reecrit: true };
  }

  // La réécriture n'a rien donné. On retient seulement là où un mauvais envoi
  // coûte plus cher que pas d'envoi du tout.
  const bloque = critere.bloquantSiEchec;
  void noterVerdict(supabase, { agent, tache, userId, note, defauts, reecrit: false, bloque, extrait: contenu.slice(0, 200) });
  return { contenu, envoyable: !bloque, note, defauts, reecrit: false };
}
