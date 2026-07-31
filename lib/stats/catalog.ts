/**
 * Catalogue des statistiques affichables sur la page agents.
 *
 * Demande fondateur (2026-07-31) : le client doit CHOISIR ce qu'il affiche.
 * « Un resto ne va pas forcément regarder combien de clients il a convertis,
 * une PME si. » On propose donc un jeu par défaut PERTINENT selon le type de
 * commerce, et le client coche ce qu'il veut voir.
 *
 * Chaque entrée décrit une métrique calculable — pas une intention. Si une
 * donnée n'est pas mesurable aujourd'hui, elle n'est pas dans ce catalogue :
 * afficher une case vide serait pire que ne rien afficher.
 */

export type StatUnit = 'nombre' | 'pourcentage' | 'euros' | 'note' | 'duree';

export interface StatDef {
  id: string;
  /** Ce que le client lit sur la tuile. */
  label: { fr: string; en: string };
  /** Précision affichée sous le chiffre. */
  hint: { fr: string; en: string };
  unit: StatUnit;
  /** Agent auquel la métrique se rattache (pour le regroupement du menu). */
  agent: 'content' | 'dm_instagram' | 'email' | 'commercial' | 'gmaps' | 'whatsapp' | 'global';
  /** Une hausse est-elle une bonne nouvelle ? (colorisation) */
  higherIsBetter?: boolean;
}

export const STAT_CATALOG: StatDef[] = [
  // ── Contenu (Léna) ────────────────────────────────────────────────
  { id: 'posts_published', label: { fr: 'Publications', en: 'Posts published' }, hint: { fr: 'publiées ce mois-ci', en: 'published this month' }, unit: 'nombre', agent: 'content', higherIsBetter: true },
  { id: 'posts_scheduled', label: { fr: 'À venir', en: 'Scheduled' }, hint: { fr: 'programmées', en: 'scheduled' }, unit: 'nombre', agent: 'content' },
  { id: 'reach_total', label: { fr: 'Personnes touchées', en: 'People reached' }, hint: { fr: 'sur 30 jours', en: 'over 30 days' }, unit: 'nombre', agent: 'content', higherIsBetter: true },
  { id: 'views_total', label: { fr: 'Vues', en: 'Views' }, hint: { fr: 'toutes publications', en: 'all posts' }, unit: 'nombre', agent: 'content', higherIsBetter: true },
  { id: 'likes_total', label: { fr: 'J\'aime', en: 'Likes' }, hint: { fr: 'sur 30 jours', en: 'over 30 days' }, unit: 'nombre', agent: 'content', higherIsBetter: true },
  { id: 'comments_total', label: { fr: 'Commentaires reçus', en: 'Comments received' }, hint: { fr: 'sur tes publications', en: 'on your posts' }, unit: 'nombre', agent: 'content', higherIsBetter: true },
  { id: 'saves_total', label: { fr: 'Enregistrements', en: 'Saves' }, hint: { fr: 'le signal qui compte', en: 'the signal that matters' }, unit: 'nombre', agent: 'content', higherIsBetter: true },
  { id: 'engagement_rate', label: { fr: 'Taux d\'engagement', en: 'Engagement rate' }, hint: { fr: 'interactions / portée', en: 'interactions / reach' }, unit: 'pourcentage', agent: 'content', higherIsBetter: true },
  { id: 'best_post_reach', label: { fr: 'Meilleure publication', en: 'Best post' }, hint: { fr: 'sa portée', en: 'its reach' }, unit: 'nombre', agent: 'content', higherIsBetter: true },
  { id: 'video_share', label: { fr: 'Part de vidéo', en: 'Video share' }, hint: { fr: 'dans tes publications', en: 'of your posts' }, unit: 'pourcentage', agent: 'content' },

  // ── DM et commentaires (Jade) ─────────────────────────────────────
  { id: 'dm_conversations', label: { fr: 'Conversations', en: 'Conversations' }, hint: { fr: 'ouvertes en DM', en: 'opened in DM' }, unit: 'nombre', agent: 'dm_instagram', higherIsBetter: true },
  { id: 'dm_auto_replied', label: { fr: 'DM traités', en: 'DMs handled' }, hint: { fr: 'répondus automatiquement', en: 'auto-answered' }, unit: 'nombre', agent: 'dm_instagram', higherIsBetter: true },
  { id: 'dm_pending', label: { fr: 'DM en attente', en: 'DMs waiting' }, hint: { fr: 'à traiter', en: 'to handle' }, unit: 'nombre', agent: 'dm_instagram', higherIsBetter: false },
  { id: 'comments_answered', label: { fr: 'Commentaires répondus', en: 'Comments answered' }, hint: { fr: 'par Jade', en: 'by Jade' }, unit: 'nombre', agent: 'dm_instagram', higherIsBetter: true },

  // ── Emails (Hugo) ─────────────────────────────────────────────────
  { id: 'emails_sent', label: { fr: 'Emails envoyés', en: 'Emails sent' }, hint: { fr: 'sur 30 jours', en: 'over 30 days' }, unit: 'nombre', agent: 'email' },
  { id: 'emails_opened_rate', label: { fr: 'Taux d\'ouverture', en: 'Open rate' }, hint: { fr: 'de tes emails', en: 'of your emails' }, unit: 'pourcentage', agent: 'email', higherIsBetter: true },
  { id: 'emails_replied', label: { fr: 'Réponses reçues', en: 'Replies received' }, hint: { fr: 'de vrais prospects', en: 'from real prospects' }, unit: 'nombre', agent: 'email', higherIsBetter: true },
  { id: 'inbox_cleaned', label: { fr: 'Boîte nettoyée', en: 'Inbox cleaned' }, hint: { fr: 'mails triés par Hugo', en: 'emails sorted by Hugo' }, unit: 'nombre', agent: 'email', higherIsBetter: true },
  { id: 'drafts_ready', label: { fr: 'Réponses préparées', en: 'Replies drafted' }, hint: { fr: 'à valider', en: 'to approve' }, unit: 'nombre', agent: 'email' },

  // ── Prospection et CRM (Léo) ──────────────────────────────────────
  { id: 'prospects_found', label: { fr: 'Prospects trouvés', en: 'Prospects found' }, hint: { fr: 'ce mois-ci', en: 'this month' }, unit: 'nombre', agent: 'commercial', higherIsBetter: true },
  { id: 'prospects_hot', label: { fr: 'Prospects chauds', en: 'Hot prospects' }, hint: { fr: 'à rappeler', en: 'to call back' }, unit: 'nombre', agent: 'commercial', higherIsBetter: true },
  { id: 'prospects_contacted', label: { fr: 'Prospects contactés', en: 'Prospects contacted' }, hint: { fr: 'au moins une fois', en: 'at least once' }, unit: 'nombre', agent: 'commercial', higherIsBetter: true },
  { id: 'prospects_replied', label: { fr: 'Ont répondu', en: 'Replied' }, hint: { fr: 'parmi les contactés', en: 'among those contacted' }, unit: 'nombre', agent: 'commercial', higherIsBetter: true },
  { id: 'clients_converted', label: { fr: 'Clients signés', en: 'Clients won' }, hint: { fr: 'issus de la prospection', en: 'from prospecting' }, unit: 'nombre', agent: 'commercial', higherIsBetter: true },
  { id: 'conversion_rate', label: { fr: 'Taux de conversion', en: 'Conversion rate' }, hint: { fr: 'contactés → signés', en: 'contacted → won' }, unit: 'pourcentage', agent: 'commercial', higherIsBetter: true },

  // ── Réputation et fiche Google (Théo) ─────────────────────────────
  { id: 'reviews_received', label: { fr: 'Avis reçus', en: 'Reviews received' }, hint: { fr: 'sur 30 jours', en: 'over 30 days' }, unit: 'nombre', agent: 'gmaps', higherIsBetter: true },
  { id: 'reviews_answered', label: { fr: 'Avis répondus', en: 'Reviews answered' }, hint: { fr: 'par Théo', en: 'by Théo' }, unit: 'nombre', agent: 'gmaps', higherIsBetter: true },
  { id: 'rating_average', label: { fr: 'Note moyenne', en: 'Average rating' }, hint: { fr: 'sur Google', en: 'on Google' }, unit: 'note', agent: 'gmaps', higherIsBetter: true },
  { id: 'reviews_negative', label: { fr: 'Avis à surveiller', en: 'Reviews to watch' }, hint: { fr: '3 étoiles ou moins', en: '3 stars or less' }, unit: 'nombre', agent: 'gmaps', higherIsBetter: false },

  // ── WhatsApp (Stella) ─────────────────────────────────────────────
  { id: 'wa_messages_sent', label: { fr: 'Messages WhatsApp', en: 'WhatsApp messages' }, hint: { fr: 'envoyés ce mois-ci', en: 'sent this month' }, unit: 'nombre', agent: 'whatsapp' },
  { id: 'wa_conversations', label: { fr: 'Échanges clients', en: 'Customer chats' }, hint: { fr: 'sur WhatsApp', en: 'on WhatsApp' }, unit: 'nombre', agent: 'whatsapp', higherIsBetter: true },
  { id: 'wa_reminders', label: { fr: 'Rappels de RDV', en: 'Booking reminders' }, hint: { fr: 'envoyés la veille', en: 'sent the day before' }, unit: 'nombre', agent: 'whatsapp', higherIsBetter: true },

  // ── Vue d'ensemble ────────────────────────────────────────────────
  { id: 'agents_active', label: { fr: 'Agents au travail', en: 'Agents working' }, hint: { fr: 'actifs cette semaine', en: 'active this week' }, unit: 'nombre', agent: 'global' },
  { id: 'actions_done', label: { fr: 'Actions réalisées', en: 'Actions completed' }, hint: { fr: 'par tes agents, 30 j', en: 'by your agents, 30 d' }, unit: 'nombre', agent: 'global', higherIsBetter: true },
  { id: 'credits_used', label: { fr: 'Crédits utilisés', en: 'Credits used' }, hint: { fr: 'ce mois-ci', en: 'this month' }, unit: 'nombre', agent: 'global' },
];

/**
 * Jeux par défaut selon le type de commerce.
 *
 * Le principe : montrer d'abord ce qui décide du chiffre d'affaires DANS CE
 * métier. Un restaurant vit de sa réputation et de sa visibilité locale ; une
 * PME vit de son pipeline commercial. Le client reste libre de tout changer.
 */
const DEFAULTS_BY_TYPE: Record<string, string[]> = {
  // Commerce de flux : visibilité locale + réputation + no-show
  restaurant: ['reach_total', 'posts_published', 'reviews_received', 'rating_average', 'wa_reminders', 'dm_conversations'],
  boulangerie: ['reach_total', 'posts_published', 'reviews_received', 'rating_average', 'likes_total', 'comments_total'],
  commerce: ['reach_total', 'posts_published', 'reviews_received', 'rating_average', 'views_total', 'dm_conversations'],
  coiffeur: ['reach_total', 'reviews_received', 'rating_average', 'wa_reminders', 'dm_conversations', 'posts_published'],
  institut_beaute: ['reach_total', 'reviews_received', 'rating_average', 'wa_reminders', 'dm_conversations', 'posts_published'],
  hotel: ['reach_total', 'reviews_received', 'rating_average', 'reviews_negative', 'wa_reminders', 'views_total'],

  // Services sur rendez-vous : conversations + rappels
  coach: ['dm_conversations', 'dm_auto_replied', 'reach_total', 'posts_published', 'wa_reminders', 'engagement_rate'],
  freelance: ['dm_conversations', 'emails_replied', 'prospects_contacted', 'reach_total', 'posts_published', 'engagement_rate'],

  // B2B / PME : pipeline commercial d'abord
  pme: ['prospects_found', 'prospects_contacted', 'prospects_replied', 'clients_converted', 'conversion_rate', 'emails_opened_rate'],
  agence: ['prospects_found', 'prospects_contacted', 'clients_converted', 'conversion_rate', 'reach_total', 'emails_replied'],
  b2b: ['prospects_found', 'prospects_replied', 'clients_converted', 'conversion_rate', 'emails_sent', 'emails_opened_rate'],
  immobilier: ['prospects_found', 'prospects_hot', 'clients_converted', 'reviews_received', 'reach_total', 'dm_conversations'],
};

/** Jeu générique quand le type de commerce n'est pas reconnu. */
const DEFAULT_GENERIC = ['posts_published', 'reach_total', 'dm_conversations', 'reviews_received', 'prospects_found', 'actions_done'];

/** Statistiques affichées par défaut pour ce type de commerce. */
export function defaultStatsFor(businessType: string | null | undefined): string[] {
  const t = (businessType || '').toLowerCase().trim();
  if (!t) return DEFAULT_GENERIC;
  // Correspondance souple : « restaurant italien » → restaurant.
  for (const [key, ids] of Object.entries(DEFAULTS_BY_TYPE)) {
    if (t.includes(key.replace('_', ' ')) || t.includes(key)) return ids;
  }
  if (/pme|société|societe|entreprise|industri|b2b|grossiste/.test(t)) return DEFAULTS_BY_TYPE.pme;
  if (/coach|thérapeute|therapeute|consultant|formateur/.test(t)) return DEFAULTS_BY_TYPE.coach;
  if (/resto|pizz|brasserie|traiteur|café|cafe|bar/.test(t)) return DEFAULTS_BY_TYPE.restaurant;
  if (/boutique|magasin|concept|caviste|fleur|opticien/.test(t)) return DEFAULTS_BY_TYPE.commerce;
  return DEFAULT_GENERIC;
}

export function statById(id: string): StatDef | undefined {
  return STAT_CATALOG.find(s => s.id === id);
}
