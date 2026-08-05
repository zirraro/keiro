/**
 * La fiche enrichie d'un prospect, telle que les agents la lisent.
 *
 * Le scoring ne sert pas qu'à trier une tournée. Une fois la fiche remplie,
 * Jade sait qu'elle écrit à un compte de 600 abonnés muet depuis quatre mois,
 * et Hugo sait que l'établissement est noté 4,6 avec des avis de la semaine.
 * Ce sont exactement les détails qui font la différence entre un message
 * personnalisé et un publipostage déguisé.
 *
 * ── La règle qui structure ce module ──
 *
 * On ne fournit que des faits VÉRIFIÉS, et on dit explicitement ce qu'on
 * ignore. C'est la leçon des messages privés qui inventaient des détails de
 * profil : un modèle à qui l'on demande d'être précis sans lui donner de
 * matière comble le vide, et le prospect s'en aperçoit immédiatement. Mieux
 * vaut un message générique honnête qu'un message personnalisé faux.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface FicheProspect {
  nom?: string | null;
  ville?: string | null;
  note?: number | null;
  avis?: number | null;
  derniereAvisLe?: string | null;
  site?: string | null;
  instagram?: string | null;
  igStatut?: string | null;
  igFollowers?: number | null;
  igMediaCount?: number | null;
  igJoursDepuisPost?: number | null;
  classe?: string | null;
  score?: number | null;
  notes?: string | null;
}

/**
 * Met la fiche en texte pour un prompt d'agent.
 *
 * Chaque ligne n'apparaît que si la donnée existe. Une fiche vide produit un
 * bloc explicite — « on ne sait rien de ce prospect » — plutôt qu'un silence
 * que le modèle interpréterait comme une invitation à broder.
 */
export function ficheEnTexte(f: FicheProspect): string {
  const l: string[] = [];
  const ajouter = (v: any, ligne: string) => { if (v !== null && v !== undefined && v !== '') l.push(ligne); };

  ajouter(f.nom, `- Établissement : ${f.nom}`);
  ajouter(f.ville, `- Ville : ${f.ville}`);

  if (typeof f.note === 'number' && typeof f.avis === 'number') {
    l.push(`- Réputation : ${f.note}/5 sur ${f.avis} avis Google`);
  }
  if (f.derniereAvisLe) {
    const j = Math.floor((Date.now() - new Date(f.derniereAvisLe).getTime()) / 86400000);
    if (Number.isFinite(j)) {
      l.push(`- Dernier avis reçu il y a ${j} jour${j > 1 ? 's' : ''}${j < 30 ? ' — établissement clairement actif' : ''}`);
    }
  }

  l.push(f.site ? `- Site web : ${f.site}` : `- Aucun site web`);

  if (f.igStatut === 'professional') {
    const bits: string[] = [`compte @${String(f.instagram || '').replace(/^@/, '')}`];
    if (typeof f.igFollowers === 'number') bits.push(`${f.igFollowers} abonnés`);
    if (typeof f.igMediaCount === 'number') bits.push(`${f.igMediaCount} publications`);
    l.push(`- Instagram : ${bits.join(', ')}`);
    if (typeof f.igJoursDepuisPost === 'number') {
      const j = f.igJoursDepuisPost;
      const lecture = j > 90 ? 'compte à l\'abandon'
        : j > 30 ? 'publication très irrégulière'
        : j < 7 ? 'compte tenu à jour — probablement accompagné, sois prudent'
        : 'publication régulière';
      l.push(`- Dernière publication il y a ${j} jour${j > 1 ? 's' : ''} — ${lecture}`);
    }
  } else if (f.igStatut === 'private_or_personal') {
    l.push(`- Instagram : compte personnel ou privé — impossible d'en lire le contenu, n'invente RIEN à son sujet`);
  } else if (f.igStatut === 'not_found') {
    l.push(`- Instagram : aucun compte professionnel trouvé`);
  }

  ajouter(f.notes, `- Notes internes : ${String(f.notes).slice(0, 400)}`);

  if (!l.length) {
    return [
      '',
      'FICHE PROSPECT — vide',
      "On ne sait rien de ce prospect. Écris un message honnêtement générique : n'invente aucun détail sur son activité, son compte ou sa clientèle.",
    ].join('\n');
  }

  return [
    '',
    'FICHE PROSPECT — faits vérifiés, à utiliser pour personnaliser',
    ...l,
    '',
    "RÈGLE : tu ne peux t'appuyer QUE sur ces éléments. Tout ce qui n'y figure pas, tu ne le sais pas — ne le devine pas, ne l'invente pas. Un détail faux se repère immédiatement et coûte le prospect. Si la fiche est trop maigre pour personnaliser, écris court et juste plutôt que long et inventé.",
  ].join('\n');
}

/** Charge et met en forme la fiche d'un prospect. */
export async function ficheProspect(
  supabase: SupabaseClient,
  prospectId: string,
): Promise<string> {
  try {
    const { data } = await supabase
      .from('crm_prospects')
      .select('company, ville, google_rating, google_reviews, last_review_date, website, instagram, ig_status, ig_followers, ig_media_count, ig_days_since_post, classe_terrain, score_terrain, business_notes')
      .eq('id', prospectId)
      .maybeSingle();
    if (!data) return '';
    return ficheEnTexte({
      nom: (data as any).company, ville: (data as any).ville,
      note: (data as any).google_rating, avis: (data as any).google_reviews,
      derniereAvisLe: (data as any).last_review_date, site: (data as any).website,
      instagram: (data as any).instagram, igStatut: (data as any).ig_status,
      igFollowers: (data as any).ig_followers, igMediaCount: (data as any).ig_media_count,
      igJoursDepuisPost: (data as any).ig_days_since_post,
      classe: (data as any).classe_terrain, score: (data as any).score_terrain,
      notes: (data as any).business_notes,
    });
  } catch {
    return '';
  }
}

/**
 * L'angle d'approche que la fiche suggère.
 *
 * Déterministe et sans appel modèle : le signal le plus fort du dossier dicte
 * l'accroche. Un compte abandonné, un commerce sans site et un compte déjà
 * tenu n'appellent pas du tout le même premier message — et laisser le modèle
 * choisir seul reviendrait à perdre l'information qu'on vient de payer.
 */
export function angleDApproche(f: FicheProspect): string | null {
  if (f.igStatut === 'professional' && typeof f.igJoursDepuisPost === 'number') {
    if (f.igJoursDepuisPost < 7) {
      return "Ce compte est tenu à jour, peut-être par un prestataire. N'attaque pas sur la régularité : parle plutôt de ce qu'ils ne font pas encore (formats, réactivité, volume).";
    }
    if (f.igJoursDepuisPost > 90 && (f.igMediaCount ?? 0) > 10) {
      return "Ils ont publié régulièrement puis se sont arrêtés. Ils SAVENT déjà que c'est utile — inutile de les convaincre, parle du temps que ça prend et de ce qui reprend la main à leur place.";
    }
    if (f.igJoursDepuisPost > 30) {
      return "Publication en pointillé. L'angle qui porte est la régularité sans effort, pas la créativité.";
    }
  }
  if (f.igStatut === 'not_found' && !f.site) {
    return "Aucune présence en ligne. Reste très concret : ce que leurs clients voient aujourd'hui quand ils les cherchent, et ce qu'ils verraient demain.";
  }
  if (typeof f.avis === 'number' && f.avis > 50 && typeof f.note === 'number' && f.note >= 4.3) {
    return "Établissement bien noté avec beaucoup d'avis : leurs clients les aiment déjà. L'angle est l'écart entre cette réputation réelle et ce qu'on en voit en ligne.";
  }
  return null;
}
