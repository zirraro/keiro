/**
 * Doctrine « réveil cross-canal » (founder 2026-06-26).
 *
 * Un prospect mort / perdu peut être réchauffé UNE SEULE FOIS, et seulement sur
 * un canal JAMAIS essayé. Exemple : mort sur l'email → on a le droit de tenter
 * le DM, puis le téléphone. Une fois mort sur TOUS les canaux disponibles → mort
 * définitif : on ne le recontacte plus nulle part.
 *
 * La règle « 1 fois par canal » est automatique : dès qu'un canal a été essayé
 * (timestamp / statut posé sur la fiche), il n'est plus « frais » → pas de 2e
 * tentative dessus. Voir [[feedback_channel_coordination]] et
 * [[feedback_crm_never_delete]].
 */

export type ContactChannel = 'email' | 'dm' | 'phone' | 'linkedin';

export function isDeadProspect(p: any): boolean {
  return p?.temperature === 'dead' || p?.status === 'perdu' || p?.status === 'lost';
}

/** A-t-on de quoi joindre le prospect sur ce canal ? */
export function channelAvailable(p: any, c: ContactChannel): boolean {
  switch (c) {
    case 'email': return !!p?.email;
    case 'dm': return !!p?.instagram;                       // IG DM = seul DM auto
    case 'phone': return !!(p?.phone || p?.whatsapp_phone);
    case 'linkedin': return !!p?.linkedin_url;
    default: return false;
  }
}

/** Ce canal a-t-il DÉJÀ été essayé (≥1 touch) ? Dérivé des champs de la fiche. */
export function channelTried(p: any, c: ContactChannel): boolean {
  switch (c) {
    case 'email': return !!p?.email_sequence_status;
    case 'dm': return (!!p?.dm_status && p.dm_status !== 'none') || !!p?.dm_sent_at || !!p?.dm_followed_at;
    case 'phone': return !!p?.last_call_at || !!p?.phone_called_at;
    case 'linkedin': return false;                          // pas de tracking auto → géré à la main
    default: return false;
  }
}

// Canaux dont on sait suivre les tentatives (pour décider de la finalité).
// LinkedIn exclu : non traçable en auto, sinon un prospect ne serait jamais "mort définitif".
const TRACKED: ContactChannel[] = ['email', 'dm', 'phone'];
// Canaux qu'on peut DÉCLENCHER automatiquement (réveil auto). Phone/LinkedIn = manuels.
const AUTO: ContactChannel[] = ['email', 'dm'];

/** Canaux dispo ET jamais essayés (par défaut sur les canaux traçables). */
export function untriedChannels(p: any, scope: ContactChannel[] = TRACKED): ContactChannel[] {
  return scope.filter(c => channelAvailable(p, c) && !channelTried(p, c));
}

/** Mort définitif = mort + plus aucun canal traçable dispo non-essayé → on ne le touche plus. */
export function isFinalDead(p: any): boolean {
  return isDeadProspect(p) && untriedChannels(p, TRACKED).length === 0;
}

/**
 * Peut-on réveiller ce prospect mort sur CE canal auto, une seule fois ?
 * Conditions : mort, pas opt-out, canal auto dispo & jamais essayé, ET déjà
 * essayé sur un AUTRE canal (sinon ce n'est pas un "réveil" mais un 1er contact).
 */
export function canReviveOn(p: any, c: ContactChannel): boolean {
  if (!isDeadProspect(p)) return false;        // vivant → logique normale
  if (p?.no_outbound) return false;            // opt-out → jamais, même en réveil
  if (!AUTO.includes(c)) return false;         // phone/linkedin = manuels
  if (!channelAvailable(p, c) || channelTried(p, c)) return false;
  return TRACKED.some(x => x !== c && channelTried(p, x));
}
