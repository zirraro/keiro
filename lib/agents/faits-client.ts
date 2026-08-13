import { callLlmWithFallback } from '@/lib/agents/llm-fallback';

/**
 * Ce que le client annonce dans un chat, mis à disposition de TOUS les agents.
 *
 * ── Le problème ──
 *
 * Fondateur, 2026-08-13 : « le client doit pouvoir dire dans le chat "publie
 * sur tel plat que je viens d'ajouter", ou décrire ses nouveaux horaires, une
 * fermeture exceptionnelle, un rabais, la nouvelle carte. Léna, Jade, Stella,
 * Théo et Hugo doivent tous reconnaître l'information et agir dessus. »
 *
 * Jusqu'ici, ce que le client disait à un agent restait chez cet agent. Il
 * annonçait sa fermeture du lundi à Théo, et Jade répondait « à lundi ! » en
 * message privé le soir même. Ce n'est pas une erreur d'agent : aucun d'eux
 * n'avait l'information.
 *
 * ── Pourquoi ce n'est pas une directive ──
 *
 * `extract-directive` capture déjà des RÈGLES durables de style — « jamais de
 * rouge », « montre des gens ». Un fait est d'une autre nature : il est daté,
 * il périme, et il doit être connu de tous EN MÊME TEMPS. Une règle se discute,
 * un fait s'applique.
 *
 * ── Le principe ──
 *
 * Écrire une fois, lire partout. Chaque message du client passe par une lecture
 * courte qui en extrait les faits ; chaque agent qui produit quelque chose lit
 * les faits encore valables avant d'écrire. Aucun agent n'a besoin de savoir
 * qu'un autre a été prévenu.
 */

export type TypeFait = 'horaires' | 'fermeture' | 'nouveaute' | 'offre' | 'evenement' | 'info';

export interface FaitClient {
  type: TypeFait;
  enonce: string;
  details?: Record<string, any> | null;
  valide_du?: string | null;
  valide_jusqu_au?: string | null;
}

/**
 * Repérage gratuit avant d'appeler un modèle.
 *
 * La très grande majorité des messages de chat ne contiennent aucun fait —
 * « ok merci », « tu peux refaire ce visuel ? ». Les faire tous passer devant un
 * modèle coûterait plus cher que le service ne rapporte. Ce filtre laisse
 * passer large : un faux positif coûte un appel à un dixième de centime, un
 * faux négatif coûte une information perdue.
 */
const INDICES = /\b(horaire|ouvre|ouvert|ferm|cong[ée]|vacances|f[ée]ri[ée]|nouveau|nouvelle|nouveaut[ée]|ajout|carte|menu|plat|produit|promo|remise|rabais|r[ée]duction|solde|offre|[ée]v[ée]nement|soir[ée]e|anniversaire|inaugur|livraison|prix|tarif)/i;

export function peutContenirUnFait(message: string): boolean {
  return INDICES.test(message || '');
}

/**
 * Extrait les faits d'un message client. Renvoie [] si le message n'en contient
 * pas — c'est le cas le plus fréquent et ce n'est pas un échec.
 */
export async function extraireFaits(input: {
  message: string;
  agentId: string;
  aujourdhui: string;      // AAAA-MM-JJ, passé par l'appelant
  metier?: string | null;
}): Promise<FaitClient[]> {
  if (!peutContenirUnFait(input.message)) return [];

  const system = `Tu lis le message d'un commerçant à son assistant et tu en extrais les FAITS que toute l'équipe doit connaître.

Un FAIT est une information vérifiable sur le commerce : horaires, fermeture, nouveauté (plat, produit, carte), offre commerciale, événement. Il a souvent une date.
Ce n'est PAS un fait : une préférence de style, une demande de correction, une question, une humeur, un remerciement.

Aujourd'hui : ${input.aujourdhui}.${input.metier ? ` Métier : ${input.metier}.` : ''}

Règles :
· N'invente RIEN. Si une date n'est pas dite, laisse le champ vide — ne la déduis pas.
· « la semaine prochaine », « lundi », « jusqu'à fin août » : calcule les dates réelles à partir d'aujourd'hui.
· Un énoncé par fait, court, au présent, compréhensible SANS le message d'origine. « Fermé le lundi 18 août » et non « oui je ferme ce jour-là ».
· Si le message ne contient aucun fait, renvoie un tableau vide. C'est le cas normal.

Réponds UNIQUEMENT par un tableau JSON :
[{"type":"horaires|fermeture|nouveaute|offre|evenement|info","enonce":"...","valide_du":"AAAA-MM-JJ ou null","valide_jusqu_au":"AAAA-MM-JJ ou null","details":{}}]`;

  try {
    const res = await callLlmWithFallback({
      system,
      message: input.message.slice(0, 1500),
      claudeModel: 'claude-haiku-4-5-20251001',
      maxTokens: 700,
      callTag: 'faits_client_extraction',
    });
    const brut = (res.text || '').trim();
    const debut = brut.indexOf('[');
    const fin = brut.lastIndexOf(']');
    if (debut < 0 || fin <= debut) return [];
    const parsed = JSON.parse(brut.slice(debut, fin + 1));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((f: any) => f && typeof f.enonce === 'string' && f.enonce.trim().length > 4)
      .slice(0, 5)
      .map((f: any) => ({
        type: (['horaires', 'fermeture', 'nouveaute', 'offre', 'evenement', 'info'].includes(f.type) ? f.type : 'info') as TypeFait,
        enonce: String(f.enonce).trim().slice(0, 400),
        details: f.details && typeof f.details === 'object' ? f.details : null,
        valide_du: /^\d{4}-\d{2}-\d{2}$/.test(String(f.valide_du || '')) ? f.valide_du : null,
        valide_jusqu_au: /^\d{4}-\d{2}-\d{2}$/.test(String(f.valide_jusqu_au || '')) ? f.valide_jusqu_au : null,
      }));
  } catch {
    return [];
  }
}

/**
 * Enregistre les faits. Un fait d'horaires ou de fermeture ARCHIVE les
 * précédents du même type : le dernier mot du client fait foi, et deux jeux
 * d'horaires contradictoires dans le pool seraient pires que pas d'horaires du
 * tout. Les nouveautés et les offres, elles, s'accumulent — un commerce peut
 * avoir trois nouveautés en même temps.
 */
export async function consignerFaits(
  supabase: any,
  input: { userId: string; agentId: string; message: string; faits: FaitClient[] },
): Promise<number> {
  if (!input.faits.length) return 0;
  const maintenant = new Date().toISOString();
  let ecrits = 0;

  for (const f of input.faits) {
    try {
      if (f.type === 'horaires' || f.type === 'fermeture') {
        await supabase
          .from('faits_client')
          .update({ archive_le: maintenant, updated_at: maintenant })
          .eq('user_id', input.userId)
          .eq('type', f.type)
          .is('archive_le', null);
      }
      const { error } = await supabase.from('faits_client').insert({
        user_id: input.userId,
        type: f.type,
        enonce: f.enonce,
        details: f.details ?? null,
        valide_du: f.valide_du ?? null,
        valide_jusqu_au: f.valide_jusqu_au ?? null,
        agent_source: input.agentId,
        message_source: input.message.slice(0, 800),
        created_at: maintenant,
        updated_at: maintenant,
      });
      if (!error) ecrits++;
    } catch { /* un fait perdu ne doit pas casser la conversation */ }
  }
  return ecrits;
}

/**
 * Les faits encore valables, prêts à coller dans le prompt de n'importe quel
 * agent.
 *
 * Renvoie '' quand il n'y a rien — l'appelant colle sans condition et le prompt
 * reste inchangé pour les clients qui n'ont rien annoncé.
 */
export async function faitsPourPrompt(
  supabase: any,
  userId: string | null | undefined,
  opts?: { types?: TypeFait[]; max?: number },
): Promise<string> {
  if (!userId) return '';
  try {
    const aujourdhui = new Date().toISOString().slice(0, 10);
    let q = supabase
      .from('faits_client')
      .select('type, enonce, valide_du, valide_jusqu_au, created_at')
      .eq('user_id', userId)
      .is('archive_le', null)
      .or(`valide_jusqu_au.is.null,valide_jusqu_au.gte.${aujourdhui}`)
      .order('created_at', { ascending: false })
      .limit(opts?.max ?? 12);
    if (opts?.types?.length) q = q.in('type', opts.types);

    const { data } = await q;
    if (!data?.length) return '';

    const ETIQUETTE: Record<string, string> = {
      horaires: 'Horaires', fermeture: 'Fermeture', nouveaute: 'Nouveauté',
      offre: 'Offre', evenement: 'Événement', info: 'Info',
    };

    const lignes = data.map((f: any) => {
      const p: string[] = [`· ${ETIQUETTE[f.type] || 'Info'} — ${f.enonce}`];
      if (f.valide_du || f.valide_jusqu_au) {
        p.push(`  (${f.valide_du ? `du ${f.valide_du}` : ''}${f.valide_jusqu_au ? ` au ${f.valide_jusqu_au}` : ''})`.replace('( au', '(jusqu\'au'));
      }
      return p.join('\n');
    });

    return [
      '',
      '━━━ CE QUE LE CLIENT A ANNONCÉ (valable aujourd\'hui) ━━━',
      'Informations données par le commerçant lui-même dans ses échanges avec',
      "l'équipe. Elles PRIMENT sur toute autre source : dossier, historique,",
      'suppositions. Si l\'une contredit ce que tu allais dire, c\'est elle qui a',
      'raison.',
      ...lignes,
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
    ].join('\n');
  } catch {
    return '';
  }
}
