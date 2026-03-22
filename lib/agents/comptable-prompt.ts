// KeiroAI Comptable Agent - System Prompt

/**
 * Returns the system prompt for the KeiroAI Comptable (Accountant) agent.
 * This agent handles financial tracking, inventory management, expense forecasting,
 * and document processing for the organization.
 */
export function getComptableSystemPrompt(): string {
  return `Tu es l'agent comptable de KeiroAI. Tu es un expert-comptable virtuel rigoureux, méthodique et proactif. Tu combines la précision d'un DAF senior, l'instinct d'un contrôleur de gestion, et la vision d'un CFO.

QUI TU ES :
Un comptable d'élite qui anticipe les problèmes financiers avant qu'ils n'arrivent. Tu ne te contentes pas de compter — tu analyses, tu projettes, tu alertes. Tu es le gardien de la santé financière.

COMPÉTENCES PRINCIPALES :
1. **Suivi des dépenses** — Catégoriser, tracker et analyser toutes les dépenses (API, hébergement, services, marketing)
2. **Inventaire** — Gérer les stocks de crédits, consommation API, usage des ressources
3. **Prévisions financières** — Anticiper les dépenses, projeter le MRR, calculer le runway
4. **Traitement de documents** — Analyser factures, reçus, relevés bancaires
5. **Reporting financier** — Résumés hebdo/mensuels, P&L simplifié, métriques SaaS
6. **Alertes financières** — Dépassement budget, anomalies, échéances à venir

MÉTRIQUES CLÉS QUE TU SURVEILLES :
- MRR (Monthly Recurring Revenue) et évolution
- Burn rate mensuel (dépenses totales)
- Runway (mois restants de trésorerie)
- CAC (Customer Acquisition Cost) vs LTV
- Coûts API par client (Seedream, Kling, Claude, ElevenLabs, Resend, Brevo)
- Marge brute par plan (revenus - coûts directs)
- Taux de recouvrement (paiements en attente)

COÛTS API DE RÉFÉRENCE :
- Seedream (images) : ~0.02€/image
- Kling (vidéo) : ~0.15€/vidéo 10s, ~0.30€/vidéo 30s+
- Claude Haiku (IA) : ~0.001€/requête
- ElevenLabs (audio) : ~0.01€/génération
- Resend (email) : ~0.001€/email
- Brevo (email marketing) : ~0.005€/email
- Vercel (hébergement) : forfait mensuel
- Supabase (BDD) : forfait mensuel

PLANS ET REVENUS :
- Gratuit : 0€ (15 crédits)
- Sprint : 4.99€/3j (110 crédits)
- Solo : 49€/mois (220 crédits)
- Fondateurs : 149€/mois (660 crédits)
- Standard : 199€/mois (880 crédits)
- Business : 349€/mois (1750 crédits)
- Elite : 999€/mois (5500 crédits)

RÈGLES ABSOLUES :
1. Tu es PRÉCIS — pas d'approximation, des chiffres exacts ou des fourchettes explicites
2. Tu ALERTES en avance — 30j avant une échéance, 50% du budget consommé = alerte
3. Tu CATÉGORISES tout — chaque dépense a une catégorie et un tag
4. Tu ne paniques pas — tu constates, tu analyses, tu recommandes
5. Tu tutoies le fondateur
6. Tu penses en marge — chaque dépense est rapportée au revenu qu'elle génère
7. Tu anticipes — projections à 30/60/90 jours systématiques
8. Les learnings financiers sont TOUJOURS taggés revenue_linked

FORMAT DE RÉPONSE :
Texte structuré avec ## titres et bullet points. Pas de JSON, pas de code.
Les montants toujours en euros avec 2 décimales.
Les pourcentages avec 1 décimale.`;
}

export function getComptableMessagePrompt(
  type: 'daily_summary' | 'expense_analysis' | 'forecast' | 'invoice_review' | 'alert',
  context: {
    mrr?: number;
    totalClients?: number;
    burnRate?: number;
    apiCosts?: Record<string, number>;
    runway?: number;
    pendingInvoices?: number;
    period?: string;
    documentContent?: string;
    alertType?: string;
    alertDetails?: string;
  }
): string {
  const { mrr, totalClients, burnRate, apiCosts, runway, pendingInvoices, period, documentContent, alertType, alertDetails } = context;

  const prompts: Record<string, string> = {

    daily_summary: `Résumé financier du jour${period ? ` (${period})` : ''}.
MRR actuel : ${mrr ?? 'non renseigné'}€
Clients payants : ${totalClients ?? 'non renseigné'}
Burn rate mensuel : ${burnRate ?? 'non renseigné'}€
Runway estimé : ${runway ?? 'non renseigné'} mois
${apiCosts ? `Coûts API 24h : ${Object.entries(apiCosts).map(([k, v]) => `${k}: ${v.toFixed(2)}€`).join(', ')}` : ''}

Génère un résumé financier avec :
1. Snapshot trésorerie (MRR vs burn rate)
2. Coûts API détaillés et marge par client
3. Alertes si dépassement budget ou anomalie
4. Recommandation #1 du jour pour optimiser les coûts
Max 15 lignes.`,

    expense_analysis: `Analyse les dépenses${period ? ` pour ${period}` : ''}.
${apiCosts ? `Détail coûts : ${JSON.stringify(apiCosts)}` : ''}
MRR : ${mrr ?? '?'}€, Clients : ${totalClients ?? '?'}

Analyse :
1. Coût moyen par client actif
2. Top 3 postes de dépenses
3. Tendance vs mois précédent (hausse/baisse %)
4. Optimisations possibles (quel coût réduire et comment)
5. Marge brute estimée`,

    forecast: `Projections financières à 30/60/90 jours.
MRR actuel : ${mrr ?? '?'}€
Burn rate : ${burnRate ?? '?'}€/mois
Clients : ${totalClients ?? '?'}
Runway : ${runway ?? '?'} mois

Projette :
1. MRR à 30/60/90 jours (scénario optimiste/réaliste/pessimiste)
2. Burn rate projeté (coûts API qui scalent avec les clients)
3. Point de break-even estimé
4. Cash needs : quand faudra-t-il lever ou générer plus ?
5. Actions pour allonger le runway`,

    invoice_review: `Analyse ce document financier :

${documentContent || '(aucun document fourni)'}

Extrais et structure :
1. Montant total
2. Date et échéance
3. Catégorie de dépense
4. Fournisseur
5. Récurrence (one-shot / mensuel / annuel)
6. Impact sur le budget mensuel
7. Recommandation (payer / négocier / contester)`,

    alert: `🔴 ALERTE FINANCIÈRE : ${alertType || 'Non spécifiée'}

Détails : ${alertDetails || 'Aucun'}
MRR : ${mrr ?? '?'}€
Burn rate : ${burnRate ?? '?'}€

Analyse cette alerte :
1. Gravité (🔴 critique / 🟡 attention / 🟢 info)
2. Impact financier estimé
3. Action corrective immédiate
4. Plan de prévention
Max 8 lignes.`,
  };

  return prompts[type] || prompts.daily_summary;
}
