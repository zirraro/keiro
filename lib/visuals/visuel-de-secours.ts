import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Le dernier recours : changer le VISUEL plutôt que réécrire encore.
 *
 * Consigne du fondateur (2026-08-08) : « si au-delà de 3 on n'a rien qui passe
 * le contrôle qualité même à 7, on doit trouver une solution pour sortir
 * quelque chose quand même. Image brute si disponible, ou banque d'images
 * disponible et surtout pertinente — ça va se jouer dans la description
 * ensuite, mais l'image doit être en lien avec le business. »
 *
 * ── Pourquoi c'est le bon geste ──
 *
 * Après trois réécritures recalées, le message d'échec du code le disait déjà
 * lui-même : « le problème vient probablement du visuel ». Continuer à
 * réécrire un texte pour une image ratée ne peut pas aboutir — on s'acharne
 * sur la mauvaise moitié du post.
 *
 * On change donc d'image, en descendant une échelle de préférence :
 *
 *   1. UNE VRAIE PHOTO DU CLIENT. Toujours la meilleure : c'est son commerce,
 *      son matériel, ses produits. Aucune génération ne fera mieux qu'une photo
 *      authentique de son lieu, et c'est exactement le naturel recherché.
 *   2. UNE PHOTO DE BANQUE PERTINENTE. Moins bien, mais réelle, et cadrée sur
 *      son métier. Mieux qu'un créneau vide.
 *
 * ── La pertinence prime sur la beauté ──
 *
 * Une image splendide sans rapport avec le commerce est pire qu'une image
 * ordinaire qui montre son métier : le lecteur ne comprend pas ce qu'il
 * regarde, et le compte perd en lisibilité. On filtre donc sur le lien au
 * métier avant de regarder la qualité.
 *
 * ── Ce que ça ne remplace pas ──
 *
 * C'est un filet, pas une méthode. Le fondateur l'a dit : « normalement nos
 * prompts adaptatifs nous font sortir direct de super posts qui passent le
 * contrôle 90 % du temps. » Si ce recours devient fréquent, c'est la
 * génération qu'il faut corriger, pas le filet qu'il faut élargir — d'où la
 * trace systématique.
 */

export interface VisuelSecours {
  url: string;
  origine: 'photo_client' | 'banque';
  /** Ce que l'image montre, pour réécrire la légende dessus. */
  description: string;
}

/** Mots du métier, pour juger la pertinence d'une image. */
function motsDuMetier(businessType?: string | null): string[] {
  const t = String(businessType || '').toLowerCase();
  const base = t.split(/[^a-zà-ÿ]+/).filter(w => w.length > 3);
  const PAR_METIER: Record<string, string[]> = {
    restaurant: ['plat', 'assiette', 'cuisine', 'salle', 'table', 'service', 'chef'],
    boulangerie: ['pain', 'four', 'viennoiserie', 'fournée', 'vitrine', 'pâte'],
    coiffeur: ['coupe', 'cheveux', 'salon', 'couleur', 'brushing', 'fauteuil'],
    institut: ['soin', 'cabine', 'visage', 'ongles', 'massage'],
    garage: ['véhicule', 'atelier', 'moteur', 'pont', 'réparation'],
    fleuriste: ['bouquet', 'fleur', 'composition', 'atelier'],
    hotel: ['chambre', 'accueil', 'lit', 'petit-déjeuner', 'réception'],
  };
  for (const [cle, mots] of Object.entries(PAR_METIER)) {
    if (t.includes(cle)) return [...base, ...mots];
  }
  return base;
}

/** Une image du client colle-t-elle à son métier et au sujet du post ? */
function pertinence(analyse: any, legende: string | null, mots: string[]): number {
  const texte = [
    analyse?.summary, analyse?.ambiance,
    Array.isArray(analyse?.visible_elements) ? analyse.visible_elements.join(' ') : '',
    legende || '',
  ].join(' ').toLowerCase();
  if (!texte.trim()) return 0;
  return mots.filter(m => texte.includes(m)).length;
}

/**
 * Cherche un visuel de remplacement, du plus authentique au plus générique.
 *
 * Renvoie `null` si rien de pertinent n'existe : publier une image sans
 * rapport serait pire que ne rien publier, et c'est le seul cas où on accepte
 * de laisser le créneau vide.
 */
export async function trouverVisuelDeSecours(
  supabase: SupabaseClient,
  userId: string,
  businessType?: string | null,
  sujet?: string | null,
): Promise<VisuelSecours | null> {
  // Le métier n'est pas toujours disponible dans la portée appelante : on le
  // relit alors depuis le dossier client. Sans lui, la pertinence ne peut pas
  // être jugée et on publierait n'importe quelle image.
  let metier = businessType;
  if (!metier) {
    try {
      const { data } = await supabase
        .from('business_dossiers')
        .select('business_type')
        .eq('user_id', userId)
        .maybeSingle();
      metier = (data as any)?.business_type || null;
    } catch { /* dossier illisible : on continue avec le sujet seul */ }
  }

  const mots = [...motsDuMetier(metier), ...String(sujet || '').toLowerCase().split(/[^a-zà-ÿ]+/).filter(w => w.length > 3)];

  // ── 1. Les photos du client ──
  try {
    const { data: uploads } = await supabase
      .from('agent_uploads')
      .select('file_url, ai_analysis, caption')
      .eq('user_id', userId)
      .or('file_type.ilike.image/%,file_url.ilike.%.jpg,file_url.ilike.%.jpeg,file_url.ilike.%.png,file_url.ilike.%.webp')
      .is('archived_at', null)
      .not('ai_analysis', 'is', null)
      .order('created_at', { ascending: false })
      .limit(60);

    const classees = (uploads || [])
      .map((u: any) => ({ u, score: pertinence(u.ai_analysis, u.caption, mots) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);

    if (classees.length) {
      const gagnant = classees[0].u;
      const a = gagnant.ai_analysis || {};
      return {
        url: gagnant.file_url,
        origine: 'photo_client',
        description: [a.summary, a.ambiance, Array.isArray(a.visible_elements) ? a.visible_elements.join(', ') : '']
          .filter(Boolean).join(' — ').slice(0, 400) || gagnant.caption || 'photo du commerce',
      };
    }
  } catch (e: any) {
    console.warn('[VisuelSecours] lecture des photos client échouée :', e?.message);
  }

  // ── 2. La banque d'images ──
  // Réelle, libre de droits, et cadrée sur le métier. Moins bien qu'une photo
  // du client, mais infiniment mieux qu'un créneau vide.
  try {
    const { searchPixabayImages } = await import('@/lib/stock/pixabay');
    const requete = [metier, sujet].filter(Boolean).join(' ').slice(0, 60) || String(metier || 'commerce');
    const imgs = await searchPixabayImages({ query: requete, count: 6 });
    if (imgs?.length) {
      return {
        url: (imgs[0] as any).largeImageURL || (imgs[0] as any).webformatURL,
        origine: 'banque',
        description: `photo réelle illustrant ${metier || 'le commerce'}${sujet ? ` — ${sujet}` : ''}`,
      };
    }
  } catch (e: any) {
    console.warn('[VisuelSecours] banque d\'images indisponible :', e?.message);
  }

  // Rien de pertinent : on préfère un créneau vide à une image hors-sujet.
  return null;
}
