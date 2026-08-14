import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Écrire une ligne d'historique dans le CRM, et SAVOIR si elle est passée.
 *
 * ── Pourquoi cette fonction existe ──
 *
 * Le 14 août 2026, en cherchant les chiffres d'ouverture des mails, on découvre
 * qu'ils n'existent pas : 467 mails envoyés sur la semaine, zéro ouverture
 * enregistrée dans crm_activities. Le suivi fonctionnait pourtant — la fiche du
 * prospect portait bien les dates.
 *
 * La cause : une contrainte CHECK sur la colonne `type` qui refusait 40 des 51
 * types que le code écrit. Chaque webhook faisait deux écritures ; la première
 * (la fiche) passait, la seconde (l'historique) était rejetée par la base.
 *
 * Mais la contrainte n'est que la moitié du problème. L'autre moitié, c'est
 * qu'on écrivait `await supabase.from('crm_activities').insert(...)` SANS
 * regarder ce que la base répondait. Supabase ne lève pas d'exception : il rend
 * un objet contenant `error`. Ne pas le lire, c'est transformer un refus en
 * succès apparent — et l'anomalie a tenu des mois pour cette seule raison.
 *
 * Une écriture dont on ignore le retour n'est pas une écriture, c'est un vœu.
 *
 * ── Ce qu'elle garantit ──
 *
 * L'appelant n'a rien à changer à sa logique : la fonction n'interrompt jamais
 * le flux (un historique manquant ne doit pas faire échouer un webhook, sinon
 * le fournisseur réessaie en boucle). Mais un refus laisse désormais une trace
 * visible dans les logs, avec le type fautif — de quoi le voir en une recherche
 * au lieu d'une enquête.
 */
export interface LigneActivite {
  prospect_id: string;
  type: string;
  description?: string;
  data?: Record<string, any>;
  created_at?: string;
  [autre: string]: any;
}

export async function consignerActivite(
  supabase: SupabaseClient,
  ligne: LigneActivite,
  contexte = 'CRM',
): Promise<boolean> {
  const { error } = await supabase.from('crm_activities').insert(ligne);
  if (error) {
    // 23514 = violation de contrainte CHECK. On le nomme, parce que c'est
    // précisément celui qui a coûté des mois d'historique : le message générique
    // « insert failed » n'aurait rien appris.
    const cause = error.code === '23514'
      ? `le type "${ligne.type}" est refusé par la contrainte de la table (voir supabase/migrations/20260814_crm_activities_types.sql)`
      : error.message;
    console.error(`[${contexte}] activité NON consignée (${error.code}) : ${cause}`);
    return false;
  }
  return true;
}
