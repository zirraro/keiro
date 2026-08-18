/**
 * 2026-07-20 (founder) — Banque de templates WhatsApp par métier, MULTILINGUE.
 *
 * Pour les messages que le COMMERÇANT initie (hors fenêtre 24h), WhatsApp exige
 * un template pré-approuvé par Meta, soumis PAR LANGUE. Chaque template existe
 * donc en FRANÇAIS, ESPAGNOL et ANGLAIS — les trois soumis séparément.
 *
 * Règles founder : ZÉRO emoji, ton naturel/pro, jamais « IA ». Les {{n}} sont
 * les variables remplies à l'envoi. La langue effective suit le
 * communication_language du client (fr / es / …).
 *
 * Catégories Meta : UTILITY (transactionnel) · MARKETING (promo).
 */

export type WaTemplateCategory = 'UTILITY' | 'MARKETING';
/**
 * L'anglais manquait — et pas seulement dans les textes.
 *
 * Le type n'admettait que `fr | es`, et `templateInLang` faisait
 * `lang === 'es' ? 'es' : 'fr'` : un client anglophone recevait du français
 * sans qu'aucune erreur ne soit levée. Le repli silencieux, encore.
 */
export type WaLang = 'fr' | 'es' | 'en';

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
export const META_LANG_CODE: Record<WaLang, string> = { fr: 'fr', es: 'es', en: 'en' };

// Flux transverses (métiers de service à RDV).
const APPOINTMENT_COMMON: WaTemplate[] = [
  {
    name: 'rdv_confirmation', label: 'Confirmation de rendez-vous', category: 'UTILITY',
    params: ['prénom', 'nom du commerce', 'date', 'heure'],
    langs: {
      fr: { body: 'Bonjour {{1}}, votre rendez-vous chez {{2}} est confirmé le {{3}} à {{4}}. À très bientôt.', example: ['Marie', 'Studio Éclat', 'mardi 22 juillet', '14h30'] },
      es: { body: 'Hola {{1}}, su cita en {{2}} está confirmada el {{3}} a las {{4}}. ¡Hasta pronto!', example: ['María', 'Studio Éclat', 'martes 22 de julio', '14:30'] },
      en: { body: 'Hello {{1}}, your appointment at {{2}} is confirmed for {{3}} at {{4}}. See you soon.', example: ['Marie', 'Studio Éclat', 'Tuesday 22 July', '2:30 pm'] },
    },
  },
  {
    name: 'rdv_rappel', label: 'Rappel de rendez-vous (veille)', category: 'UTILITY',
    params: ['prénom', 'nom du commerce', 'heure'],
    langs: {
      fr: { body: 'Bonjour {{1}}, petit rappel : votre rendez-vous chez {{2}} est demain à {{3}}. Répondez OUI pour confirmer ou NON pour reporter.', example: ['Marie', 'Studio Éclat', '14h30'] },
      es: { body: 'Hola {{1}}, un recordatorio: su cita en {{2}} es mañana a las {{3}}. Responda SÍ para confirmar o NO para reprogramar.', example: ['María', 'Studio Éclat', '14:30'] },
      en: { body: 'Hello {{1}}, a quick reminder: your appointment at {{2}} is tomorrow at {{3}}. Reply YES to confirm or NO to reschedule.', example: ['Marie', 'Studio Éclat', '2:30 pm'] },
    },
  },
  {
    name: 'rdv_creneau_libre', label: 'Créneau libéré / relance', category: 'UTILITY',
    params: ['prénom', 'nom du commerce', 'date', 'heure'],
    langs: {
      fr: { body: 'Bonjour {{1}}, un créneau vient de se libérer chez {{2}} le {{3}} à {{4}}. Souhaitez-vous le réserver ?', example: ['Marie', 'Studio Éclat', 'jeudi 24 juillet', '10h00'] },
      es: { body: 'Hola {{1}}, acaba de quedar libre un hueco en {{2}} el {{3}} a las {{4}}. ¿Desea reservarlo?', example: ['María', 'Studio Éclat', 'jueves 24 de julio', '10:00'] },
      en: { body: 'Hello {{1}}, a slot has just opened up at {{2}} on {{3}} at {{4}}. Would you like to take it?', example: ['Marie', 'Studio Éclat', 'Thursday 24 July', '10:00 am'] },
    },
  },
];

const REVIEW_REQUEST: WaTemplate = {
  name: 'demande_avis', label: 'Demande d’avis (après passage)', category: 'UTILITY',
  params: ['prénom', 'nom du commerce', 'lien avis'],
  langs: {
    fr: { body: 'Bonjour {{1}}, merci de votre visite chez {{2}} ! Si vous avez un instant, votre avis nous aide beaucoup : {{3}} Merci !', example: ['Marie', 'Studio Éclat', 'https://g.page/r/xxxx'] },
    es: { body: 'Hola {{1}}, ¡gracias por su visita a {{2}}! Si tiene un momento, su opinión nos ayuda mucho: {{3}} ¡Gracias!', example: ['María', 'Studio Éclat', 'https://g.page/r/xxxx'] },
    en: { body: 'Hello {{1}}, thank you for visiting {{2}}. If you have a moment, a review helps us a lot: {{3}} Thank you.', example: ['Marie', 'Studio Éclat', 'https://g.page/r/xxxx'] },
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
          en: { body: 'Hello {{1}}, your table at {{2}} is booked for {{3}} at {{4}} for {{5}} people. We look forward to welcoming you.', example: ['Julien', 'La Table d’Olivier', 'Saturday 26 July', '8:00 pm', '4'] },
        },
      },
      {
        name: 'resa_rappel', label: 'Rappel de réservation', category: 'UTILITY',
        params: ['prénom', 'nom du resto', 'jour', 'heure'],
        langs: {
          fr: { body: 'Bonjour {{1}}, rappel de votre table chez {{2}} ce {{3}} à {{4}}. Répondez OUI pour confirmer, NON pour annuler.', example: ['Julien', 'La Table d’Olivier', 'soir', '20h00'] },
          es: { body: 'Hola {{1}}, recordatorio de su mesa en {{2}} este {{3}} a las {{4}}. Responda SÍ para confirmar, NO para cancelar.', example: ['Julien', 'La Table d’Olivier', 'noche', '20:00'] },
          en: { body: 'Hello {{1}}, a reminder about your table at {{2}} this {{3}} at {{4}}. Reply YES to confirm, NO to cancel.', example: ['Julien', 'La Table d’Olivier', 'evening', '8:00 pm'] },
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
          en: { body: 'Hello {{1}}, your stay at {{2}} is confirmed from {{3}} to {{4}} ({{5}}). Check-in from {{6}}. Have a good trip.', example: ['Sophie', 'Hôtel du Parc', '2 August', '5 August', 'double room', '3:00 pm'] },
        },
      },
      {
        name: 'checkin_rappel', label: 'Rappel arrivée (veille)', category: 'UTILITY',
        params: ['prénom', 'nom hôtel', 'heure'],
        langs: {
          fr: { body: 'Bonjour {{1}}, nous avons hâte de vous accueillir demain à {{2}}. Le check-in se fait à partir de {{3}}. Un besoin particulier ?', example: ['Sophie', 'Hôtel du Parc', '15h00'] },
          es: { body: 'Hola {{1}}, deseamos recibirle mañana en {{2}}. La entrada es a partir de las {{3}}. ¿Alguna necesidad especial?', example: ['Sophie', 'Hôtel du Parc', '15:00'] },
          en: { body: 'Hello {{1}}, we look forward to welcoming you tomorrow at {{2}}. Check-in opens at {{3}}. Anything you need?', example: ['Sophie', 'Hôtel du Parc', '3:00 pm'] },
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
          en: { body: 'Hello {{1}}, your order {{2}} at {{3}} is confirmed. We will let you know as soon as it is ready.', example: ['Léa', '#1042', 'Maison Blanche'] },
        },
      },
      {
        name: 'commande_prete', label: 'Commande prête à retirer', category: 'UTILITY',
        params: ['prénom', 'n° commande', 'nom boutique', 'horaires'],
        langs: {
          fr: { body: 'Bonjour {{1}}, votre commande {{2}} est prête à être retirée chez {{3}} ({{4}}). À bientôt.', example: ['Léa', '#1042', 'Maison Blanche', '10h-19h'] },
          es: { body: 'Hola {{1}}, su pedido {{2}} está listo para recoger en {{3}} ({{4}}). Hasta pronto.', example: ['Léa', '#1042', 'Maison Blanche', '10h-19h'] },
          en: { body: 'Hello {{1}}, your order {{2}} is ready for collection at {{3}} ({{4}}). See you soon.', example: ['Léa', '#1042', 'Maison Blanche', '10am-7pm'] },
        },
      },
      {
        name: 'retour_stock', label: 'Article de nouveau disponible', category: 'MARKETING',
        params: ['prénom', 'nom article', 'nom boutique'],
        langs: {
          fr: { body: 'Bonjour {{1}}, bonne nouvelle : {{2}} est de nouveau disponible chez {{3}}. Souhaitez-vous que nous le mettions de côté ?', example: ['Léa', 'le sac en cuir camel', 'Maison Blanche'] },
          es: { body: 'Hola {{1}}, buenas noticias: {{2}} vuelve a estar disponible en {{3}}. ¿Desea que se lo reservemos?', example: ['Léa', 'el bolso de cuero camel', 'Maison Blanche'] },
          en: { body: 'Hello {{1}}, good news: {{2}} is back in stock at {{3}}. Would you like us to set one aside for you?', example: ['Léa', 'the camel leather bag', 'Maison Blanche'] },
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
          fr: { body: 'Bonjour {{1}}, nous avons bien reçu votre demande concernant {{2}}. Référence : {{3}}. Nous revenons vers vous sous {{4}}. À très vite.', example: ['Marc', 'votre lave-linge', 'SAV-2087', '24h'] },
          es: { body: 'Hola {{1}}, hemos recibido su solicitud sobre {{2}}. Referencia: {{3}}. Le responderemos en un plazo de {{4}}. Hasta pronto.', example: ['Marc', 'su lavadora', 'SAV-2087', '24h'] },
          en: { body: 'Hello {{1}}, we have received your request about {{2}}. Reference: {{3}}. We will get back to you within {{4}}. See you soon.', example: ['Marc', 'your washing machine', 'SAV-2087', '24 hours'] },
        },
      },
      {
        name: 'sav_pret', label: 'Réparation terminée', category: 'UTILITY',
        params: ['prénom', 'produit', 'référence', 'nom commerce', 'horaires'],
        langs: {
          fr: { body: 'Bonjour {{1}}, votre {{2}} (dossier {{3}}) est réparé et prêt. Vous pouvez le récupérer chez {{4}} aux horaires {{5}}. À très vite.', example: ['Marc', 'lave-linge', 'SAV-2087', 'ElectroPro', '9h-18h'] },
          es: { body: 'Hola {{1}}, su {{2}} (expediente {{3}}) está reparado y listo. Puede recogerlo en {{4}} en horario {{5}}. Hasta pronto.', example: ['Marc', 'lavadora', 'SAV-2087', 'ElectroPro', '9h-18h'] },
          en: { body: 'Hello {{1}}, your {{2}} (case {{3}}) has been repaired and is ready. You can collect it from {{4}}, open {{5}}. See you soon.', example: ['Marc', 'washing machine', 'SAV-2087', 'ElectroPro', '9am-6pm'] },
        },
      },
      {
        name: 'sav_devis', label: 'Devis SAV à valider', category: 'UTILITY',
        params: ['prénom', 'objet', 'montant/détail'],
        langs: {
          fr: { body: 'Bonjour {{1}}, voici le devis pour {{2}} : {{3}}. Répondez OK pour lancer la réparation, ou posez-nous vos questions.', example: ['Marc', 'la réparation du lave-linge', '89€ TTC, pièce + main d’œuvre'] },
          es: { body: 'Hola {{1}}, aquí tiene el presupuesto para {{2}}: {{3}}. Responda OK para iniciar la reparación, o escríbanos sus preguntas.', example: ['Marc', 'la reparación de la lavadora', '89€ IVA incl., pieza + mano de obra'] },
          en: { body: 'Hello {{1}}, here is the quote for {{2}}: {{3}}. Reply OK to go ahead, or send us your questions.', example: ['Marc', 'the washing machine repair', '£89 incl. VAT, parts and labour'] },
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
          en: { body: 'Hello {{1}}, your test drive of the {{2}} at {{3}} is confirmed for {{4}} at {{5}}. Please bring your licence. See you soon.', example: ['Thomas', 'Peugeot 3008', 'Auto Prestige', 'Friday 25', '11:00 am'] },
        },
      },
      {
        name: 'vehicule_dispo', label: 'Véhicule correspondant disponible', category: 'MARKETING',
        params: ['prénom', 'type véhicule', 'nom concession', 'prix/détail'],
        langs: {
          fr: { body: 'Bonjour {{1}}, un {{2}} correspondant à votre recherche vient d’arriver chez {{3}} ({{4}}). Souhaitez-vous le voir ?', example: ['Thomas', 'SUV diesel 2022', 'Auto Prestige', '24 900€, 38 000 km'] },
          es: { body: 'Hola {{1}}, acaba de llegar a {{3}} un {{2}} que coincide con su búsqueda ({{4}}). ¿Desea verlo?', example: ['Thomas', 'SUV diésel 2022', 'Auto Prestige', '24.900€, 38.000 km'] },
          en: { body: 'Hello {{1}}, a {{2}} matching your search has just arrived at {{3}} ({{4}}). Would you like to see it?', example: ['Thomas', '2022 diesel SUV', 'Auto Prestige', '£24,900, 38,000 km'] },
        },
      },
      {
        name: 'revision_rappel', label: 'Rappel révision / entretien', category: 'UTILITY',
        params: ['prénom', 'nom garage'],
        langs: {
          fr: { body: 'Bonjour {{1}}, la révision de votre véhicule est bientôt due. Souhaitez-vous un rendez-vous chez {{2}} ? À très vite.', example: ['Thomas', 'Garage Central'] },
          es: { body: 'Hola {{1}}, la revisión de su vehículo se acerca. ¿Desea una cita en {{2}}? Hasta pronto.', example: ['Thomas', 'Garage Central'] },
          en: { body: 'Hello {{1}}, your vehicle is due for a service soon. Would you like to book a slot at {{2}}? See you soon.', example: ['Thomas', 'Garage Central'] },
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
          en: { body: 'Hello {{1}}, we have a slot left {{2}} at {{3}} with {{4}}. Interested?', example: ['Camille', 'this Thursday 4pm', 'Studio Éclat', '15% off the cut'] },
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
          en: { body: 'Hello {{1}}, following your visit to {{2}}, how are you feeling? Do get in touch if you have any questions.', example: ['Paul', 'Léa Martin Practice'] },
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
          fr: { body: 'Bonjour {{1}}, votre visite du bien {{2}} avec {{3}} est confirmée le {{4}} à {{5}}. Adresse : {{6}}. À très vite.', example: ['Nadia', 'T3 rue des Lilas', 'Agence Horizon', 'samedi 26', '11h00', '12 rue des Lilas'] },
          es: { body: 'Hola {{1}}, su visita del inmueble {{2}} con {{3}} está confirmada el {{4}} a las {{5}}. Dirección: {{6}}. Hasta pronto.', example: ['Nadia', 'piso 3 hab. calle Lilas', 'Agence Horizon', 'sábado 26', '11:00', '12 calle Lilas'] },
          en: { body: 'Hello {{1}}, your viewing of {{2}} with {{3}} is confirmed for {{4}} at {{5}}. Address: {{6}}. See you soon.', example: ['Nadia', 'the 2-bed on rue des Lilas', 'Agence Horizon', 'Saturday 26', '11:00 am', '12 rue des Lilas'] },
        },
      },
      {
        name: 'bien_match', label: 'Nouveau bien correspondant', category: 'MARKETING',
        params: ['prénom', 'nom agence', 'descriptif bien'],
        langs: {
          fr: { body: 'Bonjour {{1}}, un bien correspondant à votre recherche vient d’arriver chez {{2}} : {{3}}. Souhaitez-vous une visite ?', example: ['Nadia', 'Agence Horizon', 'T3 65m² avec balcon, 249 000€'] },
          es: { body: 'Hola {{1}}, acaba de llegar a {{2}} un inmueble que encaja con su búsqueda: {{3}}. ¿Desea una visita?', example: ['Nadia', 'Agence Horizon', 'piso 65m² con balcón, 249.000€'] },
          en: { body: 'Hello {{1}}, a property matching your search has just come in at {{2}}: {{3}}. Would you like a viewing?', example: ['Nadia', 'Agence Horizon', '2-bed 65m² with balcony, £249,000'] },
        },
      },
    ],
  },
  /**
   * ── Trois familles ajoutées le 16 août, par anticipation ──
   *
   * Fondateur : « des templates par anticipation des besoins de nos clients
   * selon leur activité et leur cible ». Les neuf familles existantes
   * couvraient le RDV, la table, la chambre, la commande et le SAV — mais pas
   * trois usages qui reviennent tout le temps chez nos cibles :
   *
   *   · l'alimentaire de quartier vit sur la commande à retirer, pas sur le
   *     rendez-vous : boulangerie, primeur, caviste, fromager ;
   *   · le sport et le coaching ont leur propre grammaire — la séance, l'absence
   *     qu'on prévient, l'abonnement qui arrive à échéance ;
   *   · l'associatif n'était nulle part, alors que c'est un client réel. Le
   *     Repère de l'Autisme envoie des accompagnants souffler des parents
   *     quelques heures : il lui faut confirmer un créneau de répit, rappeler
   *     la veille, et appeler des bénévoles. Le ton y compte plus qu'ailleurs —
   *     on écrit à des parents fatigués, pas à des clients.
   */
  alimentaire: {
    match: ['boulangerie', 'pâtisserie', 'patisserie', 'primeur', 'caviste', 'fromager', 'boucherie', 'épicerie', 'epicerie', 'chocolaterie', 'glacier'],
    templates: [
      {
        name: 'commande_jour_confirmee', label: 'Commande du jour confirmée', category: 'UTILITY',
        params: ['prénom', 'détail commande', 'nom commerce', 'jour', 'heure de retrait'],
        langs: {
          fr: { body: 'Bonjour {{1}}, votre commande ({{2}}) chez {{3}} est notée pour {{4}}, à retirer à partir de {{5}}. À tout à l’heure.', example: ['Claire', '2 pains de campagne, 6 croissants', 'Fournil Saint-Pierre', 'samedi', '8h00'] },
          es: { body: 'Hola {{1}}, su pedido ({{2}}) en {{3}} queda anotado para el {{4}}, a recoger a partir de las {{5}}. Hasta luego.', example: ['Claire', '2 panes de pueblo, 6 cruasanes', 'Fournil Saint-Pierre', 'sábado', '8:00'] },
          en: { body: 'Hello {{1}}, your order ({{2}}) at {{3}} is booked for {{4}}, ready to collect from {{5}}. See you then.', example: ['Claire', '2 country loaves, 6 croissants', 'Fournil Saint-Pierre', 'Saturday', '8:00 am'] },
        },
      },
      {
        name: 'commande_a_retirer', label: 'Commande prête (alimentaire)', category: 'UTILITY',
        params: ['prénom', 'nom commerce', 'heure de fermeture'],
        langs: {
          fr: { body: 'Bonjour {{1}}, votre commande est prête chez {{2}}. Nous fermons à {{3}} — dites-nous si vous préférez la garder pour demain.', example: ['Claire', 'Fournil Saint-Pierre', '19h30'] },
          es: { body: 'Hola {{1}}, su pedido está listo en {{2}}. Cerramos a las {{3}}: díganos si prefiere recogerlo mañana.', example: ['Claire', 'Fournil Saint-Pierre', '19:30'] },
          en: { body: 'Hello {{1}}, your order is ready at {{2}}. We close at {{3}} — let us know if you would rather collect it tomorrow.', example: ['Claire', 'Fournil Saint-Pierre', '7:30 pm'] },
        },
      },
      {
        name: 'arrivage_saison', label: 'Arrivage / produit de saison', category: 'MARKETING',
        params: ['prénom', 'produit', 'nom commerce', 'durée de disponibilité'],
        langs: {
          fr: { body: 'Bonjour {{1}}, {{2}} vient d’arriver chez {{3}}. C’est une petite quantité, disponible {{4}}. On vous en met de côté ?', example: ['Claire', 'la première fournée de galettes', 'Fournil Saint-Pierre', 'jusqu’à dimanche'] },
          es: { body: 'Hola {{1}}, {{2}} acaba de llegar a {{3}}. Es poca cantidad, disponible {{4}}. ¿Le reservamos algo?', example: ['Claire', 'la primera hornada de roscones', 'Fournil Saint-Pierre', 'hasta el domingo'] },
          en: { body: 'Hello {{1}}, {{2}} has just come in at {{3}}. Small batch, available {{4}}. Shall we set some aside for you?', example: ['Claire', 'the first batch of galettes', 'Fournil Saint-Pierre', 'until Sunday'] },
        },
      },
      REVIEW_REQUEST,
    ],
  },
  sport: {
    match: ['sport', 'salle de sport', 'fitness', 'coach sportif', 'yoga', 'pilates', 'crossfit', 'danse', 'musculation', 'club'],
    templates: [
      {
        name: 'seance_confirmee', label: 'Séance confirmée', category: 'UTILITY',
        params: ['prénom', 'type de séance', 'nom du club', 'jour', 'heure'],
        langs: {
          fr: { body: 'Bonjour {{1}}, votre séance de {{2}} chez {{3}} est confirmée {{4}} à {{5}}. Pensez à votre serviette.', example: ['Yanis', 'renforcement', 'Studio Move', 'mardi', '18h30'] },
          es: { body: 'Hola {{1}}, su sesión de {{2}} en {{3}} está confirmada el {{4}} a las {{5}}. No olvide su toalla.', example: ['Yanis', 'tonificación', 'Studio Move', 'martes', '18:30'] },
          en: { body: 'Hello {{1}}, your {{2}} session at {{3}} is confirmed for {{4}} at {{5}}. Remember your towel.', example: ['Yanis', 'strength', 'Studio Move', 'Tuesday', '6:30 pm'] },
        },
      },
      {
        name: 'seance_manquee', label: 'Séance manquée — reprise en douceur', category: 'UTILITY',
        params: ['prénom', 'nom du club'],
        langs: {
          fr: { body: 'Bonjour {{1}}, on ne vous a pas vu cette semaine chez {{2}}. Un créneau vous conviendrait mieux ? Dites-nous, on s’adapte.', example: ['Yanis', 'Studio Move'] },
          es: { body: 'Hola {{1}}, no le hemos visto esta semana en {{2}}. ¿Le vendría mejor otro horario? Díganos y nos adaptamos.', example: ['Yanis', 'Studio Move'] },
          en: { body: 'Hello {{1}}, we missed you at {{2}} this week. Would another time slot suit you better? Tell us and we will adapt.', example: ['Yanis', 'Studio Move'] },
        },
      },
      {
        name: 'abonnement_echeance', label: 'Abonnement à échéance', category: 'UTILITY',
        params: ['prénom', 'nom du club', 'date de fin'],
        langs: {
          fr: { body: 'Bonjour {{1}}, votre abonnement chez {{2}} arrive à échéance le {{3}}. Souhaitez-vous le reconduire ? Répondez OUI et on s’occupe de tout.', example: ['Yanis', 'Studio Move', '31 août'] },
          es: { body: 'Hola {{1}}, su abono en {{2}} vence el {{3}}. ¿Desea renovarlo? Responda SÍ y nos encargamos de todo.', example: ['Yanis', 'Studio Move', '31 de agosto'] },
          en: { body: 'Hello {{1}}, your membership at {{2}} ends on {{3}}. Would you like to renew? Reply YES and we will take care of it.', example: ['Yanis', 'Studio Move', '31 August'] },
        },
      },
    ],
  },
  association: {
    match: ['association', 'assoc', 'répit', 'repit', 'aidants', 'bénévole', 'benevole', 'accompagnement', 'solidarité', 'solidarite', 'caritatif', 'handicap', 'autisme'],
    templates: [
      {
        name: 'creneau_repit_confirme', label: 'Créneau d’accompagnement confirmé', category: 'UTILITY',
        params: ['prénom', 'nom de l’association', 'jour', 'heure de début', 'heure de fin', 'prénom de l’accompagnant'],
        langs: {
          fr: { body: 'Bonjour {{1}}, votre créneau avec {{2}} est confirmé {{3}}, de {{4}} à {{5}}. {{6}} sera présent. Si quelque chose change, écrivez-nous, c’est sans souci.', example: ['Sandrine', 'Le Repère de l’Autisme', 'mercredi', '14h00', '17h00', 'Karim'] },
          es: { body: 'Hola {{1}}, su franja con {{2}} está confirmada el {{3}}, de {{4}} a {{5}}. {{6}} estará presente. Si algo cambia, escríbanos sin problema.', example: ['Sandrine', 'Le Repère de l’Autisme', 'miércoles', '14:00', '17:00', 'Karim'] },
          en: { body: 'Hello {{1}}, your slot with {{2}} is confirmed for {{3}}, from {{4}} to {{5}}. {{6}} will be there. If anything changes, just write to us — it is no trouble.', example: ['Sandrine', 'Le Repère de l’Autisme', 'Wednesday', '2:00 pm', '5:00 pm', 'Karim'] },
        },
      },
      {
        name: 'creneau_repit_rappel', label: 'Rappel de créneau (veille)', category: 'UTILITY',
        params: ['prénom', 'nom de l’association', 'heure'],
        langs: {
          fr: { body: 'Bonjour {{1}}, petit rappel : {{2}} passe demain à {{3}}. Répondez OUI si c’est bon, ou NON si vous préférez reporter — aucun souci.', example: ['Sandrine', 'Le Repère de l’Autisme', '14h00'] },
          es: { body: 'Hola {{1}}, un recordatorio: {{2}} pasa mañana a las {{3}}. Responda SÍ si le va bien, o NO si prefiere aplazarlo, sin problema.', example: ['Sandrine', 'Le Repère de l’Autisme', '14:00'] },
          en: { body: 'Hello {{1}}, a quick reminder: {{2}} is coming tomorrow at {{3}}. Reply YES if that still works, or NO if you would rather postpone — no problem at all.', example: ['Sandrine', 'Le Repère de l’Autisme', '2:00 pm'] },
        },
      },
      {
        name: 'appel_benevoles', label: 'Appel aux bénévoles', category: 'UTILITY',
        params: ['prénom', 'nom de l’association', 'jour', 'créneau horaire'],
        langs: {
          fr: { body: 'Bonjour {{1}}, {{2}} cherche un renfort {{3}} sur {{4}}. Si vous êtes disponible, répondez OUI — sinon aucun souci, on relaie.', example: ['Marion', 'Le Repère de l’Autisme', 'samedi', '9h-12h'] },
          es: { body: 'Hola {{1}}, {{2}} busca apoyo el {{3}} en el horario {{4}}. Si está disponible, responda SÍ; si no, sin problema, seguimos buscando.', example: ['Marion', 'Le Repère de l’Autisme', 'sábado', '9h-12h'] },
          en: { body: 'Hello {{1}}, {{2}} is looking for extra help on {{3}}, {{4}}. If you are free, reply YES — if not, no problem, we will keep asking around.', example: ['Marion', 'Le Repère de l’Autisme', 'Saturday', '9am-12pm'] },
        },
      },
      {
        name: 'demarche_admin_suivi', label: 'Suivi de démarche administrative', category: 'UTILITY',
        params: ['prénom', 'nom de la démarche', 'nom de l’association', 'prochaine étape'],
        langs: {
          fr: { body: 'Bonjour {{1}}, concernant {{2}} : {{3}} a avancé le dossier. Prochaine étape — {{4}}. On vous tient au courant, vous n’avez rien à faire pour l’instant.', example: ['Sandrine', 'le dossier MDPH', 'Le Repère de l’Autisme', 'la réponse de la commission, sous 6 semaines'] },
          es: { body: 'Hola {{1}}, sobre {{2}}: {{3}} ha avanzado el expediente. Siguiente paso: {{4}}. Le mantenemos informada, de momento no tiene que hacer nada.', example: ['Sandrine', 'el expediente de discapacidad', 'Le Repère de l’Autisme', 'la respuesta de la comisión, en 6 semanas'] },
          en: { body: 'Hello {{1}}, about {{2}}: {{3}} has moved the file forward. Next step — {{4}}. We will keep you posted; there is nothing for you to do right now.', example: ['Sandrine', 'the disability support file', 'Le Repère de l’Autisme', 'the panel’s response, within 6 weeks'] },
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
          en: { body: 'Hello {{1}}, your quote from {{2}} is ready: {{3}}. Reply OK to approve, or send us your questions.', example: ['Karim', 'Plomberie Durand', '£320 incl. VAT, work within 48 hours'] },
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

/**
 * Corps + exemple d'un template dans la langue voulue.
 *
 * L'ancienne version faisait `lang === 'es' ? 'es' : 'fr'` : tout ce qui
 * n'était pas espagnol devenait français, silencieusement. Un client anglophone
 * recevait sa confirmation de réservation en français, et rien ne le signalait.
 *
 * On accepte les étiquettes réelles rencontrées en base — `en`, `en-GB`,
 * `en_US`, `EN` — parce que la langue du client vient de plusieurs endroits
 * (onboarding, réglages, en-tête du navigateur) et qu'ils ne s'accordent pas
 * sur la casse ni sur le suffixe régional.
 */
export function templateInLang(t: WaTemplate, lang: WaLang | string | null | undefined): WaTemplateLang {
  const base = String(lang || '').toLowerCase().split(/[-_]/)[0];
  const l: WaLang = base === 'es' ? 'es' : base === 'en' ? 'en' : 'fr';
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
