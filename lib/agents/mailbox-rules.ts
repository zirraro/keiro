/**
 * Règles de tri de boîte mail — précision.
 *
 * Retour fondateur (2026-07-30) : « les analyses et le filtre/rangement de Hugo
 * ne sont pas super, il peut être amélioré, plus précis ».
 *
 * Trois défauts corrigés ici :
 *
 * 1. ORDRE DES OPÉRATIONS. On nettoyait AVANT de ranger : un mail de client
 *    tombé dans l'onglet Promotions partait à la corbeille avant que le
 *    rangement ait pu le protéger. Désormais : PROTÉGER → RANGER → NETTOYER.
 *
 * 2. GRANULARITÉ. « category:promotions → corbeille » est trop brutal :
 *    l'onglet Promotions contient des reçus Stripe, des confirmations de
 *    commande, des offres fournisseurs. On distingue maintenant le vrai
 *    marketing du reste, par expéditeur ET par objet.
 *
 * 3. « À TRAITER ». S'appuyer sur l'importance calculée par Gmail ne suffit
 *    pas : ce qui compte pour un commerçant, c'est qu'un humain attende une
 *    réponse. On cible les messages de la Principale, non lus, qui ne viennent
 *    pas d'un automate.
 *
 * Tout est exprimé en opérateurs de recherche Gmail : c'est déterministe,
 * gratuit, et ça marche sur 100 000 messages là où un modèle en traiterait 25.
 */

/** Expéditeurs jamais touchés : automates de facturation, banques, État. */
const ADMIN_SENDERS = [
  // Banques / paiement / compta
  'stripe.com', 'qonto.com', 'shine.fr', 'revolut.com', 'paypal.com', 'sumup.com', 'zettle.com',
  'creditagricole.fr', 'bnpparibas.com', 'societegenerale.fr', 'lcl.fr', 'banquepopulaire.fr',
  'caisse-epargne.fr', 'boursorama.com', 'fortuneo.fr', 'n26.com', 'pennylane.com', 'indy.fr',
  // État / social / impôts
  'impots.gouv.fr', 'dgfip.finances.gouv.fr', 'urssaf.fr', 'ameli.fr', 'net-entreprises.fr',
  'service-public.fr', 'greffe-tc.fr', 'infogreffe.fr', 'pole-emploi.fr', 'francetravail.fr',
  // Énergie / télécom / assurances (factures récurrentes)
  'edf.fr', 'engie.fr', 'totalenergies.fr', 'orange.fr', 'sfr.fr', 'free.fr', 'bouyguestelecom.fr',
  'axa.fr', 'maif.fr', 'macif.fr', 'allianz.fr', 'generali.fr',
];

/** Objets qui signalent un document à conserver, en français et en anglais. */
const ADMIN_SUBJECTS = [
  'facture', 'invoice', 'reçu', 'recu', 'receipt', 'devis', 'quote', 'avoir', 'credit note',
  'virement', 'transfer', 'prélèvement', 'prelevement', 'direct debit', 'échéance', 'echeance',
  'relevé', 'releve', 'statement', 'bulletin de paie', 'payslip', 'cotisation', 'contribution',
  'attestation', 'certificate', 'contrat', 'contract', 'mise en demeure', 'rappel de paiement',
  'payment reminder', 'taxe', 'tax', 'tva', 'vat', 'bilan', 'comptable',
];

/** Marketing véritable — c'est CE qui part à la corbeille, rien d'autre. */
const MARKETING_SUBJECTS = [
  'newsletter', 'promo', 'promotion', 'soldes', 'sale', 'black friday', 'cyber monday',
  'offre spéciale', 'offre speciale', 'special offer', 'réduction', 'reduction', 'discount',
  '% de remise', 'code promo', 'promo code', 'dernière chance', 'last chance', 'ne manquez pas',
  "don't miss", 'exclusivité', 'exclusive', 'webinar', 'webinaire', 'inscrivez-vous',
  'découvrez notre', 'discover our', 'nouveauté', 'new arrival', 'flash', 'déstockage',
];

/** Expéditeurs automatiques : jamais une vraie personne qui attend une réponse. */
const NOREPLY_PATTERNS = ['noreply', 'no-reply', 'donotreply', 'do-not-reply', 'nepasrepondre', 'ne-pas-repondre', 'notification', 'mailer-daemon', 'postmaster'];

const orQuery = (field: string, values: string[]) => `${field}:(${values.map(v => (v.includes(' ') ? `"${v}"` : v)).join(' OR ')})`;

export interface MailboxPlan {
  /** Étape 1 — ranger et protéger ce qui compte. */
  file: Array<{ folder: string; query: string; why: string }>;
  /** Étape 2 — nettoyer ce qui reste, en épargnant tout ce qui a été rangé. */
  clean: Array<{ action: 'trash' | 'archive'; query: string; why: string }>;
}

/**
 * Construit le plan de tri pour ce client.
 *
 * @param crmClients   adresses des clients connus (CRM)
 * @param crmProspects adresses des prospects connus (CRM)
 * @param protectedSenders adresses/domaines que le client a explicitement protégés
 */
export function buildMailboxPlan(opts: {
  crmClients?: string[];
  crmProspects?: string[];
  protectedSenders?: string[];
  folderNames?: { admin?: string; todo?: string; clients?: string; prospects?: string };
} = {}): MailboxPlan {
  const F = {
    admin: opts.folderNames?.admin || 'Factures & Admin',
    todo: opts.folderNames?.todo || 'À traiter',
    clients: opts.folderNames?.clients || 'Clients',
    prospects: opts.folderNames?.prospects || 'Prospects',
  };

  const chunk = (arr: string[], n: number) =>
    [...new Set((arr || []).filter(Boolean))].reduce<string[][]>((a, v, i) => (i % n ? a[a.length - 1].push(v) : a.push([v]), a), []);

  const file: MailboxPlan['file'] = [];

  // ── Factures & Admin : par EXPÉDITEUR (fiable) puis par OBJET (large) ──
  for (const group of chunk(ADMIN_SENDERS, 25)) {
    file.push({ folder: F.admin, query: `in:inbox ${orQuery('from', group)}`, why: 'expéditeur administratif ou bancaire connu' });
  }
  for (const group of chunk(ADMIN_SUBJECTS, 12)) {
    file.push({ folder: F.admin, query: `in:inbox ${orQuery('subject', group)}`, why: 'objet de document à conserver' });
  }

  // ── Clients et prospects : depuis le CRM ──
  for (const group of chunk(opts.crmClients || [], 30)) {
    file.push({ folder: F.clients, query: `in:inbox ${orQuery('from', group)}`, why: 'client connu du CRM' });
  }
  for (const group of chunk(opts.crmProspects || [], 30)) {
    file.push({ folder: F.prospects, query: `in:inbox ${orQuery('from', group)}`, why: 'prospect connu du CRM' });
  }

  // ── À traiter : un humain attend une réponse ──
  // Principale + non lu + PAS un automate. C'est plus fin que l'importance
  // calculée par Gmail, qui rate les vrais échanges commerciaux.
  const notAuto = NOREPLY_PATTERNS.map(p => `-from:${p}`).join(' ');
  file.push({
    folder: F.todo,
    query: `in:inbox is:unread category:primary ${notAuto} -from:me`,
    why: 'message humain non lu dans la Principale',
  });
  // Filet : ce que Gmail juge important et récent, même hors Principale.
  file.push({
    folder: F.todo,
    query: 'in:inbox is:important is:unread newer_than:30d',
    why: 'jugé important par Gmail et récent',
  });

  // ── Nettoyage — APRÈS le rangement, et en épargnant ce qui est rangé ──
  // `-has:userlabels` protège tout ce qu'on vient de classer, et `-is:starred`
  // ce que le client a marqué lui-même. On ne touche jamais la Principale.
  const spare = '-has:userlabels -is:starred -is:important -category:primary';
  const protectedFrom = [...(opts.protectedSenders || []), ...(opts.crmClients || []), ...(opts.crmProspects || [])];
  const protectQ = protectedFrom.length ? ' ' + chunk(protectedFrom, 30).map(g => `-${orQuery('from', g)}`).join(' ') : '';

  const clean: MailboxPlan['clean'] = [];

  // Corbeille : uniquement du marketing AVÉRÉ (objet explicite), pas tout
  // l'onglet Promotions — il contient des reçus et des confirmations.
  for (const group of chunk(MARKETING_SUBJECTS, 10)) {
    clean.push({
      action: 'trash',
      query: `in:inbox category:promotions older_than:14d ${orQuery('subject', group)} ${spare}${protectQ}`,
      why: 'objet marketing explicite, hors Principale, non rangé, non suivi',
    });
  }
  // Promotions anciennes ET jamais ouvertes : personne ne les lira.
  clean.push({
    action: 'trash',
    query: `in:inbox category:promotions is:unread older_than:90d ${spare}${protectQ}`,
    why: 'promotion jamais ouverte depuis plus de 3 mois',
  });

  // Archivage : le bruit informatif, qu'on conserve sans encombrer.
  clean.push({ action: 'archive', query: `in:inbox category:social older_than:14d ${spare}${protectQ}`, why: 'notification de réseau social' });
  clean.push({ action: 'archive', query: `in:inbox category:forums older_than:14d ${spare}${protectQ}`, why: 'liste de diffusion' });
  clean.push({
    action: 'archive',
    query: `in:inbox category:updates is:read older_than:60d ${spare}${protectQ}`,
    why: 'mise à jour déjà lue et ancienne',
  });
  // Promotions restantes, anciennes : archivées plutôt que supprimées — on ne
  // jette que ce dont on est sûr.
  clean.push({
    action: 'archive',
    query: `in:inbox category:promotions older_than:60d ${spare}${protectQ}`,
    why: 'promotion ancienne, archivée par prudence plutôt que supprimée',
  });

  return { file, clean };
}

/** Motifs d'expéditeurs automatiques, réutilisables par le classifieur. */
export const AUTO_SENDER_PATTERNS = NOREPLY_PATTERNS;
