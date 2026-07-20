/**
 * 2026-07-20 (founder) — Banque de templates WhatsApp par métier.
 *
 * Pour les messages que le COMMERÇANT initie (hors fenêtre 24h), WhatsApp
 * exige un template pré-approuvé par Meta. Ce catalogue fournit des modèles
 * prêts à soumettre, par type de business (hôtel, resto, boutique, SAV, auto…),
 * pour les flux clés : confirmation, rappel, devis, produit prêt, avis, etc.
 *
 * Chaque template respecte les règles founder : ZÉRO emoji, ton naturel/pro,
 * jamais « IA ». Les {{n}} sont les variables remplies à l'envoi.
 *
 * Catégories Meta : UTILITY (transactionnel : confirmation, rappel, statut) —
 * approuvé vite, moins cher. MARKETING (promo, nouveauté) — plus encadré.
 */

export type WaTemplateCategory = 'UTILITY' | 'MARKETING';

export interface WaTemplate {
  name: string;              // nom technique (snake_case, unique) soumis à Meta
  label: string;             // libellé lisible pour le client
  category: WaTemplateCategory;
  language: string;          // 'fr'
  body: string;              // corps avec {{1}}, {{2}}…
  params: string[];          // description de chaque variable, dans l'ordre
  example: string[];         // exemple de valeurs (requis par Meta)
}

// Flux transverses réutilisables (tous métiers de service à RDV).
const APPOINTMENT_COMMON: WaTemplate[] = [
  {
    name: 'rdv_confirmation',
    label: 'Confirmation de rendez-vous',
    category: 'UTILITY', language: 'fr',
    body: 'Bonjour {{1}}, votre rendez-vous chez {{2}} est confirmé le {{3}} à {{4}}. À très bientôt.',
    params: ['prénom du client', 'nom du commerce', 'date', 'heure'],
    example: ['Marie', 'Studio Éclat', 'mardi 22 juillet', '14h30'],
  },
  {
    name: 'rdv_rappel',
    label: 'Rappel de rendez-vous (veille)',
    category: 'UTILITY', language: 'fr',
    body: 'Bonjour {{1}}, petit rappel : votre rendez-vous chez {{2}} est demain à {{3}}. Répondez OUI pour confirmer ou NON pour reporter.',
    params: ['prénom', 'nom du commerce', 'heure'],
    example: ['Marie', 'Studio Éclat', '14h30'],
  },
  {
    name: 'rdv_annulation_client',
    label: 'Créneau libéré / relance',
    category: 'UTILITY', language: 'fr',
    body: 'Bonjour {{1}}, un créneau vient de se libérer chez {{2}} le {{3}} à {{4}}. Souhaitez-vous le réserver ?',
    params: ['prénom', 'nom du commerce', 'date', 'heure'],
    example: ['Marie', 'Studio Éclat', 'jeudi 24 juillet', '10h00'],
  },
];

const REVIEW_REQUEST: WaTemplate = {
  name: 'demande_avis',
  label: 'Demande d’avis (après passage)',
  category: 'UTILITY', language: 'fr',
  body: 'Bonjour {{1}}, merci de votre visite chez {{2}} ! Si vous avez un instant, votre avis nous aide beaucoup : {{3}}',
  params: ['prénom', 'nom du commerce', 'lien avis'],
  example: ['Marie', 'Studio Éclat', 'https://g.page/r/xxxx'],
};

// Catalogue par métier. La clé est matchée sur le business_type du dossier.
export const WA_TEMPLATES: Record<string, { match: string[]; templates: WaTemplate[] }> = {
  restaurant: {
    match: ['restaurant', 'resto', 'brasserie', 'bistro', 'pizzeria', 'traiteur', 'food'],
    templates: [
      {
        name: 'resa_confirmation',
        label: 'Confirmation de réservation',
        category: 'UTILITY', language: 'fr',
        body: 'Bonjour {{1}}, votre table chez {{2}} est réservée le {{3}} à {{4}} pour {{5}} personnes. Au plaisir de vous accueillir.',
        params: ['prénom', 'nom du resto', 'date', 'heure', 'nombre de personnes'],
        example: ['Julien', 'La Table d’Olivier', 'samedi 26 juillet', '20h00', '4'],
      },
      {
        name: 'resa_rappel',
        label: 'Rappel de réservation',
        category: 'UTILITY', language: 'fr',
        body: 'Bonjour {{1}}, rappel de votre table chez {{2}} ce {{3}} à {{4}}. Répondez OUI pour confirmer, NON pour annuler.',
        params: ['prénom', 'nom du resto', 'jour', 'heure'],
        example: ['Julien', 'La Table d’Olivier', 'soir', '20h00'],
      },
      REVIEW_REQUEST,
    ],
  },
  hotel: {
    match: ['hotel', 'hôtel', 'chambre', 'hébergement', 'gîte', 'auberge', 'bnb'],
    templates: [
      {
        name: 'booking_confirmation',
        label: 'Confirmation de réservation séjour',
        category: 'UTILITY', language: 'fr',
        body: 'Bonjour {{1}}, votre séjour à {{2}} est confirmé du {{3}} au {{4}} ({{5}}). Arrivée possible dès {{6}}. Bon voyage.',
        params: ['prénom', 'nom hôtel', 'date arrivée', 'date départ', 'type chambre', 'heure check-in'],
        example: ['Sophie', 'Hôtel du Parc', '2 août', '5 août', 'chambre double', '15h00'],
      },
      {
        name: 'checkin_rappel',
        label: 'Rappel arrivée (veille)',
        category: 'UTILITY', language: 'fr',
        body: 'Bonjour {{1}}, nous avons hâte de vous accueillir demain à {{2}}. Le check-in se fait à partir de {{3}}. Un besoin particulier ?',
        params: ['prénom', 'nom hôtel', 'heure'],
        example: ['Sophie', 'Hôtel du Parc', '15h00'],
      },
      REVIEW_REQUEST,
    ],
  },
  boutique: {
    match: ['boutique', 'magasin', 'retail', 'prêt-à-porter', 'mode', 'concept store', 'commerce', 'fleuriste', 'bijou'],
    templates: [
      {
        name: 'commande_confirmee',
        label: 'Confirmation de commande',
        category: 'UTILITY', language: 'fr',
        body: 'Bonjour {{1}}, votre commande {{2}} chez {{3}} est confirmée. Nous vous préviendrons dès qu’elle est prête.',
        params: ['prénom', 'n° commande', 'nom boutique'],
        example: ['Léa', '#1042', 'Maison Blanche'],
      },
      {
        name: 'commande_prete',
        label: 'Commande prête à retirer',
        category: 'UTILITY', language: 'fr',
        body: 'Bonjour {{1}}, votre commande {{2}} est prête à être retirée chez {{3}} ({{4}}). À bientôt.',
        params: ['prénom', 'n° commande', 'nom boutique', 'horaires'],
        example: ['Léa', '#1042', 'Maison Blanche', '10h-19h'],
      },
      {
        name: 'retour_stock',
        label: 'Article de nouveau disponible',
        category: 'MARKETING', language: 'fr',
        body: 'Bonjour {{1}}, bonne nouvelle : {{2}} est de nouveau disponible chez {{3}}. Souhaitez-vous que nous le mettions de côté ?',
        params: ['prénom', 'nom article', 'nom boutique'],
        example: ['Léa', 'le sac en cuir camel', 'Maison Blanche'],
      },
    ],
  },
  sav: {
    match: ['sav', 'réparation', 'reparation', 'dépannage', 'depannage', 'service après-vente', 'maintenance', 'atelier'],
    templates: [
      {
        name: 'sav_recu',
        label: 'Demande SAV reçue',
        category: 'UTILITY', language: 'fr',
        body: 'Bonjour {{1}}, nous avons bien reçu votre demande concernant {{2}}. Référence : {{3}}. Nous revenons vers vous sous {{4}}.',
        params: ['prénom', 'produit/objet', 'référence dossier', 'délai'],
        example: ['Marc', 'votre lave-linge', 'SAV-2087', '24h'],
      },
      {
        name: 'sav_pret',
        label: 'Réparation terminée',
        category: 'UTILITY', language: 'fr',
        body: 'Bonjour {{1}}, votre {{2}} (dossier {{3}}) est réparé et prêt. Vous pouvez le récupérer chez {{4}} aux horaires {{5}}.',
        params: ['prénom', 'produit', 'référence', 'nom commerce', 'horaires'],
        example: ['Marc', 'lave-linge', 'SAV-2087', 'ElectroPro', '9h-18h'],
      },
      {
        name: 'sav_devis',
        label: 'Devis SAV à valider',
        category: 'UTILITY', language: 'fr',
        body: 'Bonjour {{1}}, voici le devis pour {{2}} : {{3}}. Répondez OK pour lancer la réparation, ou posez-nous vos questions.',
        params: ['prénom', 'objet', 'montant/détail'],
        example: ['Marc', 'la réparation du lave-linge', '89€ TTC, pièce + main d’œuvre'],
      },
    ],
  },
  automobile: {
    match: ['automobile', 'auto', 'voiture', 'concession', 'garage', 'véhicule', 'vehicule', 'moto'],
    templates: [
      {
        name: 'essai_confirmation',
        label: 'Confirmation d’essai véhicule',
        category: 'UTILITY', language: 'fr',
        body: 'Bonjour {{1}}, votre essai du {{2}} chez {{3}} est confirmé le {{4}} à {{5}}. Pensez à votre permis. À bientôt.',
        params: ['prénom', 'modèle', 'nom concession', 'date', 'heure'],
        example: ['Thomas', 'Peugeot 3008', 'Auto Prestige', 'vendredi 25', '11h00'],
      },
      {
        name: 'vehicule_dispo',
        label: 'Véhicule correspondant disponible',
        category: 'MARKETING', language: 'fr',
        body: 'Bonjour {{1}}, un {{2}} correspondant à votre recherche vient d’arriver chez {{3}} ({{4}}). Souhaitez-vous le voir ?',
        params: ['prénom', 'type véhicule', 'nom concession', 'prix/détail'],
        example: ['Thomas', 'SUV diesel 2022', 'Auto Prestige', '24 900€, 38 000 km'],
      },
      {
        name: 'revision_rappel',
        label: 'Rappel révision / entretien',
        category: 'UTILITY', language: 'fr',
        body: 'Bonjour {{1}}, la révision de votre véhicule est bientôt due. Souhaitez-vous un rendez-vous chez {{2}} ?',
        params: ['prénom', 'nom garage'],
        example: ['Thomas', 'Garage Central'],
      },
    ],
  },
  beaute: {
    match: ['coiffeur', 'coiffure', 'esthétique', 'institut', 'beauté', 'barbier', 'ongles', 'spa', 'salon'],
    templates: [...APPOINTMENT_COMMON, REVIEW_REQUEST,
      {
        name: 'promo_creneau',
        label: 'Créneau promo dernière minute',
        category: 'MARKETING', language: 'fr',
        body: 'Bonjour {{1}}, il nous reste un créneau {{2}} chez {{3}} avec {{4}}. Ça vous tente ?',
        params: ['prénom', 'jour/heure', 'nom salon', 'offre'],
        example: ['Camille', 'ce jeudi 16h', 'Studio Éclat', '-15% sur la coupe'],
      },
    ],
  },
  sante: {
    match: ['médecin', 'medecin', 'kiné', 'kine', 'dentiste', 'praticien', 'thérapeute', 'ostéo', 'osteo', 'santé', 'cabinet'],
    templates: [...APPOINTMENT_COMMON,
      {
        name: 'suivi_patient',
        label: 'Message de suivi',
        category: 'UTILITY', language: 'fr',
        body: 'Bonjour {{1}}, suite à votre venue chez {{2}}, comment vous sentez-vous ? N’hésitez pas si vous avez la moindre question.',
        params: ['prénom', 'nom cabinet'],
        example: ['Paul', 'Cabinet Léa Martin'],
      },
    ],
  },
  immobilier: {
    match: ['immobilier', 'agence immo', 'agent immobilier', 'mandataire'],
    templates: [
      {
        name: 'visite_confirmation',
        label: 'Confirmation de visite',
        category: 'UTILITY', language: 'fr',
        body: 'Bonjour {{1}}, votre visite du bien {{2}} avec {{3}} est confirmée le {{4}} à {{5}}. Adresse : {{6}}.',
        params: ['prénom', 'référence/adresse bien', 'nom agence', 'date', 'heure', 'adresse rdv'],
        example: ['Nadia', 'T3 rue des Lilas', 'Agence Horizon', 'samedi 26', '11h00', '12 rue des Lilas'],
      },
      {
        name: 'bien_match',
        label: 'Nouveau bien correspondant',
        category: 'MARKETING', language: 'fr',
        body: 'Bonjour {{1}}, un bien correspondant à votre recherche vient d’arriver chez {{2}} : {{3}}. Souhaitez-vous une visite ?',
        params: ['prénom', 'nom agence', 'descriptif bien'],
        example: ['Nadia', 'Agence Horizon', 'T3 65m² avec balcon, 249 000€'],
      },
    ],
  },
  service: {
    match: ['artisan', 'plombier', 'électricien', 'menuisier', 'coach', 'consultant', 'service', 'prestataire'],
    templates: [...APPOINTMENT_COMMON,
      {
        name: 'devis_pret',
        label: 'Devis prêt',
        category: 'UTILITY', language: 'fr',
        body: 'Bonjour {{1}}, votre devis chez {{2}} est prêt : {{3}}. Répondez OK pour valider, ou posez-nous vos questions.',
        params: ['prénom', 'nom entreprise', 'montant/détail'],
        example: ['Karim', 'Plomberie Durand', '320€ TTC, intervention sous 48h'],
      },
    ],
  },
};

/**
 * Renvoie les templates adaptés au business_type (sinon flux service générique).
 */
export function getTemplatesForBusiness(businessType?: string | null): WaTemplate[] {
  if (businessType) {
    const b = businessType.toLowerCase();
    for (const v of Object.values(WA_TEMPLATES)) {
      if (v.match.some((m) => b.includes(m) || m.includes(b))) return v.templates;
    }
  }
  return WA_TEMPLATES.service.templates;
}

/** Liste plate de tous les templates (pour un sélecteur global). */
export function allTemplates(): { businessKey: string; template: WaTemplate }[] {
  const out: { businessKey: string; template: WaTemplate }[] = [];
  for (const [key, v] of Object.entries(WA_TEMPLATES)) {
    for (const t of v.templates) out.push({ businessKey: key, template: t });
  }
  return out;
}
