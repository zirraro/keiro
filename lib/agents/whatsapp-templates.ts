/**
 * 2026-07-20 (founder) — Banque de templates WhatsApp par métier, MULTILINGUE.
 *
 * Pour les messages que le COMMERÇANT initie (hors fenêtre 24h), WhatsApp exige
 * un template pré-approuvé par Meta, soumis PAR LANGUE. On ne parle pas qu'en
 * anglais aux clients → chaque template a une version FR ET ES (extensible).
 *
 * Règles founder : ZÉRO emoji, ton naturel/pro, jamais « IA ». Les {{n}} sont
 * les variables remplies à l'envoi. La langue effective suit le
 * communication_language du client (fr / es / …).
 *
 * Catégories Meta : UTILITY (transactionnel) · MARKETING (promo).
 */

export type WaTemplateCategory = 'UTILITY' | 'MARKETING';
export type WaLang = 'fr' | 'es';

export interface WaTemplateLang {
  body: string;       // corps avec {{1}}, {{2}}…
  example: string[];  // exemple de valeurs (requis par Meta), même ordre que params
}

export interface WaTemplate {
  name: string;              // nom technique (snake_case, unique) soumis à Meta
  label: string;            // libellé lisible (interface, FR)
  category: WaTemplateCategory;
  params: string[];         // description de chaque variable, dans l'ordre
  langs: Record<WaLang, WaTemplateLang>;  // versions par langue
}

// Codes langue Meta (soumission des templates).
export const META_LANG_CODE: Record<WaLang, string> = { fr: 'fr', es: 'es' };

// Flux transverses (métiers de service à RDV).
const APPOINTMENT_COMMON: WaTemplate[] = [
  {
    name: 'rdv_confirmation', label: 'Confirmation de rendez-vous', category: 'UTILITY',
    params: ['prénom', 'nom du commerce', 'date', 'heure'],
    langs: {
      fr: { body: 'Bonjour {{1}}, votre rendez-vous chez {{2}} est confirmé le {{3}} à {{4}}. À très bientôt.', example: ['Marie', 'Studio Éclat', 'mardi 22 juillet', '14h30'] },
      es: { body: 'Hola {{1}}, su cita en {{2}} está confirmada el {{3}} a las {{4}}. ¡Hasta pronto!', example: ['María', 'Studio Éclat', 'martes 22 de julio', '14:30'] },
    },
  },
  {
    name: 'rdv_rappel', label: 'Rappel de rendez-vous (veille)', category: 'UTILITY',
    params: ['prénom', 'nom du commerce', 'heure'],
    langs: {
      fr: { body: 'Bonjour {{1}}, petit rappel : votre rendez-vous chez {{2}} est demain à {{3}}. Répondez OUI pour confirmer ou NON pour reporter.', example: ['Marie', 'Studio Éclat', '14h30'] },
      es: { body: 'Hola {{1}}, un recordatorio: su cita en {{2}} es mañana a las {{3}}. Responda SÍ para confirmar o NO para reprogramar.', example: ['María', 'Studio Éclat', '14:30'] },
    },
  },
  {
    name: 'rdv_creneau_libre', label: 'Créneau libéré / relance', category: 'UTILITY',
    params: ['prénom', 'nom du commerce', 'date', 'heure'],
    langs: {
      fr: { body: 'Bonjour {{1}}, un créneau vient de se libérer chez {{2}} le {{3}} à {{4}}. Souhaitez-vous le réserver ?', example: ['Marie', 'Studio Éclat', 'jeudi 24 juillet', '10h00'] },
      es: { body: 'Hola {{1}}, acaba de quedar libre un hueco en {{2}} el {{3}} a las {{4}}. ¿Desea reservarlo?', example: ['María', 'Studio Éclat', 'jueves 24 de julio', '10:00'] },
    },
  },
];

const REVIEW_REQUEST: WaTemplate = {
  name: 'demande_avis', label: 'Demande d’avis (après passage)', category: 'UTILITY',
  params: ['prénom', 'nom du commerce', 'lien avis'],
  langs: {
    fr: { body: 'Bonjour {{1}}, merci de votre visite chez {{2}} ! Si vous avez un instant, votre avis nous aide beaucoup : {{3}}', example: ['Marie', 'Studio Éclat', 'https://g.page/r/xxxx'] },
    es: { body: 'Hola {{1}}, ¡gracias por su visita a {{2}}! Si tiene un momento, su opinión nos ayuda mucho: {{3}}', example: ['María', 'Studio Éclat', 'https://g.page/r/xxxx'] },
  },
};

export const WA_TEMPLATES: Record<string, { match: string[]; templates: WaTemplate[] }> = {
  restaurant: {
    match: ['restaurant', 'resto', 'brasserie', 'bistro', 'pizzeria', 'traiteur', 'food'],
    templates: [
      {
        name: 'resa_confirmation', label: 'Confirmation de réservation', category: 'UTILITY',
        params: ['prénom', 'nom du resto', 'date', 'heure', 'nombre de personnes'],
        langs: {
          fr: { body: 'Bonjour {{1}}, votre table chez {{2}} est réservée le {{3}} à {{4}} pour {{5}} personnes. Au plaisir de vous accueillir.', example: ['Julien', 'La Table d’Olivier', 'samedi 26 juillet', '20h00', '4'] },
          es: { body: 'Hola {{1}}, su mesa en {{2}} está reservada el {{3}} a las {{4}} para {{5}} personas. Le esperamos con gusto.', example: ['Julien', 'La Table d’Olivier', 'sábado 26 de julio', '20:00', '4'] },
        },
      },
      {
        name: 'resa_rappel', label: 'Rappel de réservation', category: 'UTILITY',
        params: ['prénom', 'nom du resto', 'jour', 'heure'],
        langs: {
          fr: { body: 'Bonjour {{1}}, rappel de votre table chez {{2}} ce {{3}} à {{4}}. Répondez OUI pour confirmer, NON pour annuler.', example: ['Julien', 'La Table d’Olivier', 'soir', '20h00'] },
          es: { body: 'Hola {{1}}, recordatorio de su mesa en {{2}} este {{3}} a las {{4}}. Responda SÍ para confirmar, NO para cancelar.', example: ['Julien', 'La Table d’Olivier', 'noche', '20:00'] },
        },
      },
      REVIEW_REQUEST,
    ],
  },
  hotel: {
    match: ['hotel', 'hôtel', 'chambre', 'hébergement', 'gîte', 'auberge', 'bnb'],
    templates: [
      {
        name: 'booking_confirmation', label: 'Confirmation de séjour', category: 'UTILITY',
        params: ['prénom', 'nom hôtel', 'date arrivée', 'date départ', 'type chambre', 'heure check-in'],
        langs: {
          fr: { body: 'Bonjour {{1}}, votre séjour à {{2}} est confirmé du {{3}} au {{4}} ({{5}}). Arrivée possible dès {{6}}. Bon voyage.', example: ['Sophie', 'Hôtel du Parc', '2 août', '5 août', 'chambre double', '15h00'] },
          es: { body: 'Hola {{1}}, su estancia en {{2}} está confirmada del {{3}} al {{4}} ({{5}}). Entrada a partir de las {{6}}. Buen viaje.', example: ['Sophie', 'Hôtel du Parc', '2 de agosto', '5 de agosto', 'habitación doble', '15:00'] },
        },
      },
      {
        name: 'checkin_rappel', label: 'Rappel arrivée (veille)', category: 'UTILITY',
        params: ['prénom', 'nom hôtel', 'heure'],
        langs: {
          fr: { body: 'Bonjour {{1}}, nous avons hâte de vous accueillir demain à {{2}}. Le check-in se fait à partir de {{3}}. Un besoin particulier ?', example: ['Sophie', 'Hôtel du Parc', '15h00'] },
          es: { body: 'Hola {{1}}, deseamos recibirle mañana en {{2}}. La entrada es a partir de las {{3}}. ¿Alguna necesidad especial?', example: ['Sophie', 'Hôtel du Parc', '15:00'] },
        },
      },
      REVIEW_REQUEST,
    ],
  },
  boutique: {
    match: ['boutique', 'magasin', 'retail', 'prêt-à-porter', 'mode', 'concept store', 'commerce', 'fleuriste', 'bijou'],
    templates: [
      {
        name: 'commande_confirmee', label: 'Confirmation de commande', category: 'UTILITY',
        params: ['prénom', 'n° commande', 'nom boutique'],
        langs: {
          fr: { body: 'Bonjour {{1}}, votre commande {{2}} chez {{3}} est confirmée. Nous vous préviendrons dès qu’elle est prête.', example: ['Léa', '#1042', 'Maison Blanche'] },
          es: { body: 'Hola {{1}}, su pedido {{2}} en {{3}} está confirmado. Le avisaremos en cuanto esté listo.', example: ['Léa', '#1042', 'Maison Blanche'] },
        },
      },
      {
        name: 'commande_prete', label: 'Commande prête à retirer', category: 'UTILITY',
        params: ['prénom', 'n° commande', 'nom boutique', 'horaires'],
        langs: {
          fr: { body: 'Bonjour {{1}}, votre commande {{2}} est prête à être retirée chez {{3}} ({{4}}). À bientôt.', example: ['Léa', '#1042', 'Maison Blanche', '10h-19h'] },
          es: { body: 'Hola {{1}}, su pedido {{2}} está listo para recoger en {{3}} ({{4}}). Hasta pronto.', example: ['Léa', '#1042', 'Maison Blanche', '10h-19h'] },
        },
      },
      {
        name: 'retour_stock', label: 'Article de nouveau disponible', category: 'MARKETING',
        params: ['prénom', 'nom article', 'nom boutique'],
        langs: {
          fr: { body: 'Bonjour {{1}}, bonne nouvelle : {{2}} est de nouveau disponible chez {{3}}. Souhaitez-vous que nous le mettions de côté ?', example: ['Léa', 'le sac en cuir camel', 'Maison Blanche'] },
          es: { body: 'Hola {{1}}, buenas noticias: {{2}} vuelve a estar disponible en {{3}}. ¿Desea que se lo reservemos?', example: ['Léa', 'el bolso de cuero camel', 'Maison Blanche'] },
        },
      },
    ],
  },
  sav: {
    match: ['sav', 'réparation', 'reparation', 'dépannage', 'depannage', 'service après-vente', 'maintenance', 'atelier'],
    templates: [
      {
        name: 'sav_recu', label: 'Demande SAV reçue', category: 'UTILITY',
        params: ['prénom', 'produit/objet', 'référence dossier', 'délai'],
        langs: {
          fr: { body: 'Bonjour {{1}}, nous avons bien reçu votre demande concernant {{2}}. Référence : {{3}}. Nous revenons vers vous sous {{4}}.', example: ['Marc', 'votre lave-linge', 'SAV-2087', '24h'] },
          es: { body: 'Hola {{1}}, hemos recibido su solicitud sobre {{2}}. Referencia: {{3}}. Le responderemos en un plazo de {{4}}.', example: ['Marc', 'su lavadora', 'SAV-2087', '24h'] },
        },
      },
      {
        name: 'sav_pret', label: 'Réparation terminée', category: 'UTILITY',
        params: ['prénom', 'produit', 'référence', 'nom commerce', 'horaires'],
        langs: {
          fr: { body: 'Bonjour {{1}}, votre {{2}} (dossier {{3}}) est réparé et prêt. Vous pouvez le récupérer chez {{4}} aux horaires {{5}}.', example: ['Marc', 'lave-linge', 'SAV-2087', 'ElectroPro', '9h-18h'] },
          es: { body: 'Hola {{1}}, su {{2}} (expediente {{3}}) está reparado y listo. Puede recogerlo en {{4}} en horario {{5}}.', example: ['Marc', 'lavadora', 'SAV-2087', 'ElectroPro', '9h-18h'] },
        },
      },
      {
        name: 'sav_devis', label: 'Devis SAV à valider', category: 'UTILITY',
        params: ['prénom', 'objet', 'montant/détail'],
        langs: {
          fr: { body: 'Bonjour {{1}}, voici le devis pour {{2}} : {{3}}. Répondez OK pour lancer la réparation, ou posez-nous vos questions.', example: ['Marc', 'la réparation du lave-linge', '89€ TTC, pièce + main d’œuvre'] },
          es: { body: 'Hola {{1}}, aquí tiene el presupuesto para {{2}}: {{3}}. Responda OK para iniciar la reparación, o escríbanos sus preguntas.', example: ['Marc', 'la reparación de la lavadora', '89€ IVA incl., pieza + mano de obra'] },
        },
      },
    ],
  },
  automobile: {
    match: ['automobile', 'auto', 'voiture', 'concession', 'garage', 'véhicule', 'vehicule', 'moto'],
    templates: [
      {
        name: 'essai_confirmation', label: 'Confirmation d’essai véhicule', category: 'UTILITY',
        params: ['prénom', 'modèle', 'nom concession', 'date', 'heure'],
        langs: {
          fr: { body: 'Bonjour {{1}}, votre essai du {{2}} chez {{3}} est confirmé le {{4}} à {{5}}. Pensez à votre permis. À bientôt.', example: ['Thomas', 'Peugeot 3008', 'Auto Prestige', 'vendredi 25', '11h00'] },
          es: { body: 'Hola {{1}}, su prueba del {{2}} en {{3}} está confirmada el {{4}} a las {{5}}. No olvide su carnet. Hasta pronto.', example: ['Thomas', 'Peugeot 3008', 'Auto Prestige', 'viernes 25', '11:00'] },
        },
      },
      {
        name: 'vehicule_dispo', label: 'Véhicule correspondant disponible', category: 'MARKETING',
        params: ['prénom', 'type véhicule', 'nom concession', 'prix/détail'],
        langs: {
          fr: { body: 'Bonjour {{1}}, un {{2}} correspondant à votre recherche vient d’arriver chez {{3}} ({{4}}). Souhaitez-vous le voir ?', example: ['Thomas', 'SUV diesel 2022', 'Auto Prestige', '24 900€, 38 000 km'] },
          es: { body: 'Hola {{1}}, acaba de llegar a {{3}} un {{2}} que coincide con su búsqueda ({{4}}). ¿Desea verlo?', example: ['Thomas', 'SUV diésel 2022', 'Auto Prestige', '24.900€, 38.000 km'] },
        },
      },
      {
        name: 'revision_rappel', label: 'Rappel révision / entretien', category: 'UTILITY',
        params: ['prénom', 'nom garage'],
        langs: {
          fr: { body: 'Bonjour {{1}}, la révision de votre véhicule est bientôt due. Souhaitez-vous un rendez-vous chez {{2}} ?', example: ['Thomas', 'Garage Central'] },
          es: { body: 'Hola {{1}}, la revisión de su vehículo se acerca. ¿Desea una cita en {{2}}?', example: ['Thomas', 'Garage Central'] },
        },
      },
    ],
  },
  beaute: {
    match: ['coiffeur', 'coiffure', 'esthétique', 'institut', 'beauté', 'barbier', 'ongles', 'spa', 'salon'],
    templates: [...APPOINTMENT_COMMON, REVIEW_REQUEST,
      {
        name: 'promo_creneau', label: 'Créneau promo dernière minute', category: 'MARKETING',
        params: ['prénom', 'jour/heure', 'nom salon', 'offre'],
        langs: {
          fr: { body: 'Bonjour {{1}}, il nous reste un créneau {{2}} chez {{3}} avec {{4}}. Ça vous tente ?', example: ['Camille', 'ce jeudi 16h', 'Studio Éclat', '-15% sur la coupe'] },
          es: { body: 'Hola {{1}}, nos queda un hueco {{2}} en {{3}} con {{4}}. ¿Le apetece?', example: ['Camille', 'este jueves 16h', 'Studio Éclat', '-15% en el corte'] },
        },
      },
    ],
  },
  sante: {
    match: ['médecin', 'medecin', 'kiné', 'kine', 'dentiste', 'praticien', 'thérapeute', 'ostéo', 'osteo', 'santé', 'cabinet'],
    templates: [...APPOINTMENT_COMMON,
      {
        name: 'suivi_patient', label: 'Message de suivi', category: 'UTILITY',
        params: ['prénom', 'nom cabinet'],
        langs: {
          fr: { body: 'Bonjour {{1}}, suite à votre venue chez {{2}}, comment vous sentez-vous ? N’hésitez pas si vous avez la moindre question.', example: ['Paul', 'Cabinet Léa Martin'] },
          es: { body: 'Hola {{1}}, tras su visita a {{2}}, ¿cómo se encuentra? No dude en escribirnos si tiene cualquier pregunta.', example: ['Paul', 'Consulta Léa Martin'] },
        },
      },
    ],
  },
  immobilier: {
    match: ['immobilier', 'agence immo', 'agent immobilier', 'mandataire'],
    templates: [
      {
        name: 'visite_confirmation', label: 'Confirmation de visite', category: 'UTILITY',
        params: ['prénom', 'référence/adresse bien', 'nom agence', 'date', 'heure', 'adresse rdv'],
        langs: {
          fr: { body: 'Bonjour {{1}}, votre visite du bien {{2}} avec {{3}} est confirmée le {{4}} à {{5}}. Adresse : {{6}}.', example: ['Nadia', 'T3 rue des Lilas', 'Agence Horizon', 'samedi 26', '11h00', '12 rue des Lilas'] },
          es: { body: 'Hola {{1}}, su visita del inmueble {{2}} con {{3}} está confirmada el {{4}} a las {{5}}. Dirección: {{6}}.', example: ['Nadia', 'piso 3 hab. calle Lilas', 'Agence Horizon', 'sábado 26', '11:00', '12 calle Lilas'] },
        },
      },
      {
        name: 'bien_match', label: 'Nouveau bien correspondant', category: 'MARKETING',
        params: ['prénom', 'nom agence', 'descriptif bien'],
        langs: {
          fr: { body: 'Bonjour {{1}}, un bien correspondant à votre recherche vient d’arriver chez {{2}} : {{3}}. Souhaitez-vous une visite ?', example: ['Nadia', 'Agence Horizon', 'T3 65m² avec balcon, 249 000€'] },
          es: { body: 'Hola {{1}}, acaba de llegar a {{2}} un inmueble que encaja con su búsqueda: {{3}}. ¿Desea una visita?', example: ['Nadia', 'Agence Horizon', 'piso 65m² con balcón, 249.000€'] },
        },
      },
    ],
  },
  service: {
    match: ['artisan', 'plombier', 'électricien', 'menuisier', 'coach', 'consultant', 'service', 'prestataire'],
    templates: [...APPOINTMENT_COMMON,
      {
        name: 'devis_pret', label: 'Devis prêt', category: 'UTILITY',
        params: ['prénom', 'nom entreprise', 'montant/détail'],
        langs: {
          fr: { body: 'Bonjour {{1}}, votre devis chez {{2}} est prêt : {{3}}. Répondez OK pour valider, ou posez-nous vos questions.', example: ['Karim', 'Plomberie Durand', '320€ TTC, intervention sous 48h'] },
          es: { body: 'Hola {{1}}, su presupuesto en {{2}} está listo: {{3}}. Responda OK para validar, o escríbanos sus preguntas.', example: ['Karim', 'Fontanería Durand', '320€ IVA incl., intervención en 48h'] },
        },
      },
    ],
  },
};

/** Templates adaptés au business_type (sinon flux service générique). */
export function getTemplatesForBusiness(businessType?: string | null): WaTemplate[] {
  if (businessType) {
    const b = businessType.toLowerCase();
    for (const v of Object.values(WA_TEMPLATES)) {
      if (v.match.some((m) => b.includes(m) || m.includes(b))) return v.templates;
    }
  }
  return WA_TEMPLATES.service.templates;
}

/** Corps + exemple d'un template dans la langue voulue (fallback FR). */
export function templateInLang(t: WaTemplate, lang: WaLang | string | null | undefined): WaTemplateLang {
  const l = (lang === 'es' ? 'es' : 'fr') as WaLang;
  return t.langs[l] || t.langs.fr;
}

/** Liste plate (sélecteur global). */
export function allTemplates(): { businessKey: string; template: WaTemplate }[] {
  const out: { businessKey: string; template: WaTemplate }[] = [];
  for (const [key, v] of Object.entries(WA_TEMPLATES)) {
    for (const t of v.templates) out.push({ businessKey: key, template: t });
  }
  return out;
}
