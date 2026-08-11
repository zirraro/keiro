/**
 * Les charges qu'aucun compteur d'API ne voit — et sans lesquelles la marge
 * annoncée est fausse.
 *
 * ── Pourquoi ──
 *
 * Fondateur, 2026-08-11 : « compte absolument toutes les dépenses dans les
 * marges, internes et utilisation client donc externe, il faut que ce soient
 * mes marges exhaustives. »
 *
 * Le rapport de marge ne comptait que les appels d'API. Il ignorait le serveur,
 * la base, l'envoi d'e-mails, le nom de domaine et la commission du paiement —
 * c'est-à-dire tout ce qui se paie qu'on ait un client ou zéro. Une marge de
 * 96 % annoncée sur un compte à 4,40 € d'API devient tout autre chose quand on
 * ajoute 40 € de charges fixes réparties sur trois clients.
 *
 * ── La règle qui change tout : la marge dépend du NOMBRE de clients ──
 *
 * Une charge fixe ne se divise pas par plan, elle se divise par client. À un
 * client, le serveur mange l'abonnement entier. À cinquante, il ne se voit
 * plus. Une marge par plan n'a donc aucun sens si on ne dit pas à combien de
 * clients elle est calculée — c'est le piège classique du SaaS qui se croit
 * rentable sur le papier.
 *
 * On expose donc la marge AU NOMBRE ACTUEL de clients, et le nombre de clients
 * à partir duquel le plan devient réellement rentable.
 *
 * ── Sur l'exactitude des montants ──
 *
 * Ceux marqués `confirme: false` sont des ordres de grandeur, pas des relevés.
 * Ils sont là pour que le calcul existe et soit corrigeable en une ligne,
 * plutôt que d'attendre des chiffres exacts en publiant une marge fausse. À
 * remplacer par les vrais montants des factures.
 */

export interface ChargeFixe {
  nom: string;
  /** Montant mensuel en euros. */
  eurParMois: number;
  /** Faux = ordre de grandeur à confirmer sur facture. */
  confirme: boolean;
  note?: string;
}

/**
 * Charges mensuelles indépendantes du nombre de clients.
 *
 * Google Places n'y figure PAS : c'est de la prospection commerciale, elle
 * varie avec l'effort commercial et non avec le service rendu aux clients. Elle
 * est déjà suivie à part dans le rapport (poste « prospection »), et la mêler
 * ici ferait porter aux clients le coût de la conquête.
 */
export const CHARGES_FIXES: ChargeFixe[] = [
  // Montants donnés par le fondateur le 2026-08-11.
  { nom: 'VPS OVH (app + worker)', eurParMois: 5, confirme: true },
  { nom: 'Supabase', eurParMois: 25, confirme: true },
  { nom: 'Brevo (e-mails)', eurParMois: 0, confirme: true, note: 'plan gratuit' },
  { nom: 'Nom de domaine', eurParMois: 1.5, confirme: false, note: 'amorti sur 12 mois' },

  // ── Les charges de SOCIÉTÉ, que l'infrastructure fait oublier ──
  //
  // Fondateur : « coûts de sociétés et charges fixes/variables ». Elles ne
  // passent par aucune API, donc aucun compteur ne les voit — et elles pèsent
  // plus lourd que le serveur. L'expert-comptable seul coûte vingt fois le VPS.
  { nom: 'Expert-comptable', eurParMois: 100, confirme: false, note: 'ordre de grandeur pour une petite structure — à remplacer par le devis réel' },
  { nom: 'Compte bancaire pro', eurParMois: 10, confirme: false },
  { nom: 'Assurance RC professionnelle', eurParMois: 15, confirme: false },
];

/**
 * Commission Stripe sur les cartes européennes : 1,5 % + 0,25 €.
 *
 * Elle se prélève à CHAQUE mensualité, donc elle est variable par client et non
 * fixe — sur un abonnement à 49 €, elle coûte près d'un euro par mois, soit
 * davantage que bien des postes d'API.
 */
export function fraisStripeEur(prixEur: number): number {
  return prixEur * 0.015 + 0.25;
}

export const TOTAL_CHARGES_FIXES_EUR = CHARGES_FIXES.reduce((s, c) => s + c.eurParMois, 0);

export interface MargeExhaustive {
  plan: string;
  prixEur: number;
  /** Coût des API imputable à un client de ce plan. */
  coutVariableEur: number;
  fraisPaiementEur: number;
  /** Part des charges fixes portée par ce client, au nombre actuel de clients. */
  partChargesFixesEur: number;
  coutTotalEur: number;
  margeEur: number;
  margePct: number;
  /** Nombre de clients à partir duquel ce plan atteint la marge visée. */
  clientsPourMargeCible: number;
}

/**
 * La marge réelle d'un plan, tout compris.
 *
 * `nbClients` est le nombre de clients PAYANTS qui se partagent les charges
 * fixes. À zéro on retombe sur 1 pour éviter une division par zéro : la marge
 * affichée est alors celle du premier client, qui porte tout — ce qui est
 * exactement la réalité du départ, et il vaut mieux la voir.
 */
export function margeExhaustive(
  plan: string,
  prixEur: number,
  coutVariableEur: number,
  nbClients: number,
  margeCiblePct = 80,
): MargeExhaustive {
  const clients = Math.max(1, nbClients);
  const fraisPaiement = fraisStripeEur(prixEur);
  const partFixes = TOTAL_CHARGES_FIXES_EUR / clients;
  const coutTotal = coutVariableEur + fraisPaiement + partFixes;
  const marge = prixEur - coutTotal;

  // À combien de clients ce plan tient-il la marge visée ? On résout
  //   (prix - variable - frais - fixes/N) / prix ≥ cible
  // en N. Si le coût variable seul dépasse déjà la cible, aucun volume ne
  // sauve le plan : c'est le prix ou le coût qu'il faut revoir, et le dire
  // vaut mieux que d'afficher un nombre de clients inatteignable.
  const resteApresVariable = prixEur * (1 - margeCiblePct / 100) - coutVariableEur - fraisPaiement;
  const clientsCible = resteApresVariable > 0
    ? Math.ceil(TOTAL_CHARGES_FIXES_EUR / resteApresVariable)
    : Infinity;

  return {
    plan,
    prixEur,
    coutVariableEur: Math.round(coutVariableEur * 100) / 100,
    fraisPaiementEur: Math.round(fraisPaiement * 100) / 100,
    partChargesFixesEur: Math.round(partFixes * 100) / 100,
    coutTotalEur: Math.round(coutTotal * 100) / 100,
    margeEur: Math.round(marge * 100) / 100,
    margePct: prixEur > 0 ? Math.round((marge / prixEur) * 100) : 0,
    clientsPourMargeCible: Number.isFinite(clientsCible) ? clientsCible : -1,
  };
}
