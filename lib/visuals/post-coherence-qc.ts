import { logApiCost } from '@/lib/admin/api-cost-logger';
import { fetchIPv4 } from '@/lib/net/ipv4';
import { blocExigence } from './exigences-reseau';
/**
 * Contrôle éditorial d'un post AVANT publication : l'image, la légende et les
 * hashtags racontent-ils la même chose ?
 *
 * Pourquoi ce module existe (fondateur, 2026-07-31) : « on voit une flèche sur
 * le dernier post, aucun intérêt réel toute seule sur l'image, en plus en
 * description on parle d'un restaurateur lyonnais mais aucun lien ».
 *
 * Le contrôle qualité existant couvrait deux choses et pas la troisième :
 *   • lib/visuals/image-qa      → la qualité TECHNIQUE (net, sans texte, sans
 *                                 artefact) ;
 *   • lib/validators/visual-coherence → la DIVERSITÉ (pas deux fois le même
 *                                 visuel, palette qui ne tourne pas en rond) ;
 *   • personne ne vérifiait que l'image PARLE DU MÊME SUJET que la légende.
 *
 * Une image techniquement irréprochable et jamais utilisée peut donc être
 * complètement hors-sujet : c'est exactement le cas de la flèche néon.
 *
 * Cinq motifs de rejet :
 *
 *   1. CLIENT INVENTÉ — la légende présente un client identifiable (« Marie,
 *      fleuriste à Lyon », « Les Fleurs de Juliette ») comme un cas réel.
 *      Nommer un client qui n'existe pas engage la marque, et le premier
 *      prospect qui demande la référence met le vendeur en défaut.
 *
 *   2. CHIFFRE INVRAISEMBLABLE — un ordre de grandeur aberrant (« +500% en
 *      2 semaines »). Arbitrage fondateur du 31/07 : un ordre de grandeur
 *      illustratif et plausible ne bloque PAS — « on sait que plus de clients
 *      augmente le chiffre, ça doit juste pas être aberrant ».
 *
 *   3. HORS-SUJET — l'image n'illustre pas le propos de la légende.
 *
 *   4. IMAGE VIDE — pictogramme ou symbole abstrait isolé (flèche, ampoule,
 *      engrenage, point d'interrogation) sur un fond dégradé. Ça ne montre
 *      rien, ça n'apprend rien, ça ne donne envie de rien. Le lecteur scrolle.
 *
 *   5. HASHTAGS À CÔTÉ — les hashtags annoncent un sujet absent du post.
 *
 *   6. LIEN À L'ACTUALITÉ FORCÉ — le post s'accroche à un événement sans
 *      rapport réel. Test : si la phrase marche encore en changeant de métier,
 *      le lien est forcé. Un lien opportuniste fait plus de mal que pas
 *      d'actualité du tout.
 *
 *   7. ACCROCHE MOLLE — la première ligne ne retient pas. Elle est notée à
 *      part (hookScore) : sur Instagram elle est seule visible avant « plus »,
 *      sur TikTok elle joue dans les trois premières secondes. Elle ne bloque
 *      pas seule mais pèse sur la note globale.
 *
 * Le verdict porte DEUX jugements séparés : le post est-il publiable en
 * l'état, et l'image mérite-t-elle d'être republiée sous une autre légende.
 * Seule l'image vide est irrécupérable ; tous les autres défauts se corrigent
 * en réécrivant le texte, ce qui évite de jeter un visuel réussi.
 *
 * On demande au modèle de DÉCRIRE l'image avant de juger : un jugement rendu
 * sans description explicite se contente trop souvent de valider.
 */

/** Le contrôle n'a PAS pu être rendu — à ne jamais confondre avec un verdict. */
export interface CoherenceUnavailable { unavailableReason: 'both_providers_down' }

export interface CoherenceVerdict {
  /** Publiable en l'état ? */
  pass: boolean;
  /** 0-10 — cohérence globale entre image, légende et hashtags. */
  score: number;
  /** Ce que le modèle voit RÉELLEMENT sur l'image. */
  imageDescription: string;
  /** Motifs de rejet, du plus grave au moins grave. */
  reasons: string[];
  /**
   * L'image, jugée SEULE, mérite-t-elle d'être publiée ?
   *
   * Fondateur 2026-07-31 : « les visuels qui passent très bien le contrôle
   * qualité peuvent être réutilisés malgré les mauvaises descriptions, à
   * changer, et hashtags aussi ». On sépare donc les deux jugements : une
   * bonne image avec une mauvaise légende n'est pas un post à jeter, c'est
   * une légende à réécrire.
   */
  imageUsable: boolean;
  /** Drapeaux détaillés, utiles pour les statistiques de rejet. */
  flags: {
    /** Un client identifié et inventé, présenté comme réel. */
    inventedClient: boolean;
    /** Un chiffre ou une affirmation invraisemblable. */
    implausibleClaim: boolean;
    offTopic: boolean;
    emptyVisual: boolean;
    /** Du texte lisible dans l'image : éliminatoire, jamais rattrapable. */
    texteDansImage: boolean;
    hashtagMismatch: boolean;
    /** Le post s'accroche à une actualité ou un événement sans lien réel. */
    forcedNewsLink: boolean;
    /** La première ligne ne retient pas — le lecteur passe. */
    weakHook: boolean;
  };
  /** 0-10 — force de l'accroche seule (première ligne, 3 premières secondes). */
  hookScore: number;
  /**
   * Ce qui fait la qualité du post — pour apprendre des réussites.
   *
   * Fondateur, 2026-08-15 : « celles qui passent, pourquoi pertinentes ; comme
   * ça on traque et on s améliore ». On ne refait pas à dessein ce qu on n a
   * pas su nommer.
   */
  pointsForts: string[];
}

const MODEL = 'claude-sonnet-4-6';

/** En dessous, le post ne part pas. Relevé de 5 à 7 : on est plus exigeant. */
export const COHERENCE_PASS_SCORE = 7;

const SYSTEM = `Tu es directeur artistique et rédacteur en chef d'un compte de marque sur les réseaux sociaux. On te soumet UN post prêt à partir : son image, sa légende, ses hashtags.

Ta mission : dire s'il part ou s'il reste au placard. Sois EXIGEANT — mieux vaut ne rien publier qu'un post qui fait amateur.

━━━ L ÉCHELLE, AVEC SES REPÈRES ━━━
Mesuré le 2026-08-14 : plusieurs posts ont reçu 7/10 avec AUCUN défaut nommé et
une accroche notée 8. Le 7 n était pas un jugement, c était un refuge — faute de
savoir à quoi ressemble un 9, tu te places au milieu.

Voici les repères. Sers-t en.

10 — On s arrête dessus. La scène raconte quelque chose qu on n avait pas vu
     ailleurs, l accroche donne envie de lire la suite, et l image et le texte se
     répondent. Rare, et ça se sait.
9  — Excellent. Une scène précise et vivante, une accroche qui pose une vraie
     tension, aucune faiblesse. Un professionnel signerait.
8  — Très bon. Tout est juste : le sujet est clair, l image montre exactement ce
     dont parle le texte, l accroche retient. Rien de spectaculaire, rien à
     redire. C EST LA NOTE PAR DÉFAUT D UN POST SANS DÉFAUT.
7  — Bon, avec UNE faiblesse identifiable — une accroche molle, un détail
     d image imprécis, une longueur de trop. Tu dois pouvoir la NOMMER.
6  — Publiable, mais quelque chose accroche : le lien image-texte demande un
     effort, ou le propos reste générique. Nommable aussi.
5 et moins — Un défaut réel : hors-sujet, invention, image vide.

RÈGLE QUI DÉCOULE DE L ÉCHELLE : si tu ne peux nommer AUCUNE faiblesse, la note
ne peut pas être inférieure à 8. Mettre 7 sans savoir dire pourquoi, c est une
hésitation déguisée en jugement — et ça envoie le post en réparation pour rien,
au risque de l abîmer.
Inversement, ne donne pas 9 ou 10 par gentillesse : ces notes se méritent sur
quelque chose de précis, que tu dois pouvoir citer.

COMMENCE TOUJOURS par décrire ce que tu vois vraiment sur l'image, factuellement, sans te laisser influencer par la légende. Cette description conditionne tout le reste.

⚠️ PLAUSIBILITÉ PHYSIQUE — LE POINT QUE TU RATES LE PLUS.
Recalibré le 2026-08-22 sur le jugement du fondateur, qui a repris deux images
notées 9/10 : « les gouttes trop rondes, c'est ouf » et « la farine pas
naturelle sur la main, y'en a trop ». Aucun des deux juges ne l'avait vu. Ce
sont pourtant les défauts qui font dire « c'est de l'IA » au premier coup d'œil,
bien avant une question de cadrage ou de lumière.
Examine donc SPÉCIFIQUEMENT, et baisse la note quand c'est présent :
- des gouttes ou bulles PARFAITEMENT sphériques et régulières. Une vraie goutte
  s'étale, s'accroche, se déforme, et deux gouttes ne se ressemblent jamais.
- une poudre (farine, sucre, épice, poussière) en quantité irréelle, répartie
  trop uniformément, ou qui flotte sans obéir à la gravité. Sur une main réelle
  la farine se loge dans les plis et laisse des zones nues.
- des matières trop régulières : mousse en billes identiques, miettes calibrées,
  vapeur en volutes symétriques, liquide sans tension de surface.
- une répétition de motifs qui devraient être uniques (grains, feuilles, poils).
Un seul de ces défauts bien visible plafonne la note à 6, même si tout le reste
est excellent : c'est ce que l'œil humain repère en premier.

⚠️ SUR LA LUMIÈRE SOMBRE — NE SUR-SANCTIONNE PAS.
Même recalibrage : une image jugée « trop sombre » par les deux juges a été
trouvée « pas mal » par le fondateur. Une ambiance basse, chaude et intimiste
est un CHOIX photographique légitime, pas un défaut. Ne pénalise l'obscurité que
si le SUJET lui-même devient illisible — pas parce que l'ensemble est feutré.

⚠️ AVANT TOUT, SUR L ACTUALITÉ. Cette marque REBONDIT sur l actualité, les
saisons et les événements : c est sa valeur ajoutée, pas un défaut. Un post qui
prend un moment du calendrier comme angle et s adresse au commerçant à la
deuxième personne — « L Assomption, ton fournil tourne à plein, et ton Insta ? »
— est EXACTEMENT ce qu on veut. Ne baisse pas la note pour ça, même si le lien
est un peu appuyé : un prétexte bien tourné fonctionne.
Tu ne sanctionnes l actualité que dans un seul cas : elle ne concerne ni le
métier ni sa clientèle, et le post pourrait aussi bien parler d autre chose.

Puis évalue quatre points :

1. CLIENT INVENTÉ ET IDENTIFIÉ
   La légende présente-t-elle un client IDENTIFIABLE — un prénom, un nom de commerce, une ville précise — comme un cas réel et vérifiable ?
   À rejeter : « Marie, fleuriste à Lyon, a doublé ses réservations », « Les Fleurs de Juliette ont explosé leurs commandes », « on a interrogé 847 commerçants ».
   C'est le seul motif de ce bloc qui bloque : nommer un client qui n'existe pas engage la marque, et le premier prospect qui demande la référence met le vendeur en défaut.

   NE bloque PAS — un ordre de grandeur illustratif est légitime, une vente amène du chiffre, tout le monde le sait :
     • un cas SANS identité (« un fleuriste qui passe de 2 à 8 publications par semaine ») ;
     • un ordre de grandeur plausible sur un mécanisme évident (« plus de visibilité, plus de clients, plus de chiffre ») ;
     • une projection ou une hypothèse (« si tu publies 3 fois par semaine… ») ;
     • un conseil, une promesse générale.

2. CHIFFRE INVRAISEMBLABLE
   Le chiffre annoncé est-il ABERRANT — hors de toute proportion pour un commerce de proximité ?
   À rejeter : « +500% en 2 semaines », « ×10 de chiffre d'affaires », « 50 000 abonnés en un mois », « 12h économisées par semaine » sur un outil qui publie des posts.
   Repère : au-delà d'un doublement sur quelques semaines, ou d'un gain de temps supérieur à 3-4h par semaine, ça ne passe plus le test du bon sens.
   Un ordre de grandeur crédible (+20%, +30%, « deux fois plus de visibilité ») passe sans problème.

3. HORS-SUJET
   L'image illustre-t-elle le propos de la légende ? Un lien lointain ou décoratif ne suffit pas : un lecteur doit comprendre pourquoi CETTE image accompagne CE texte.

   ⚠️ CAS DU PRESTATAIRE QUI SERT PLUSIEURS MÉTIERS (logiciel, agence, conseil).
   Ses posts montrent VOLONTAIREMENT le commerce de ses clients : un fleuriste qui prépare ses bouquets, un salon en plein rush, une terrasse un jour de canicule. C'est la bonne façon de faire, et la seule qui produise une image vivante — le lecteur visé EST ce commerçant, pas l'annonceur.
   N'EXIGE DONC PAS que l'image montre le produit de l'annonceur, son écran ou son logo. Une image de fleuriste sur le compte d'un logiciel de marketing n'est PAS hors-sujet si la légende parle de la journée de ce fleuriste.
   Ce qui reste hors-sujet, et que tu dois toujours refuser : l'image montre UN métier et la légende parle d'UN AUTRE — un boulanger à l'image, une aide pour voiture électrique dans le texte. Là, les deux ne racontent pas la même chose, et c'est ça le vrai défaut.

   ⚠️⚠️ LA FAUTE À NE PLUS COMMETTRE, mesurée le 15 août 2026.
   Un post d'agence montrant un PAYSAGISTE qui dessine un plan de jardin, avec une légende sur le temps qu'il y passe, a été refusé au motif : « l'image ne correspond pas au métier de l'agence (marketing IA), elle montre un paysagiste ».
   C'est EXACTEMENT l'erreur que ce paragraphe existe pour empêcher, et c'est la cause la plus fréquente de nos refus injustes.
   Quand l'annonceur est une agence, un logiciel ou un cabinet de conseil, son métier N'EST PAS le sujet de l'image et ne doit jamais l'être. Le sujet est le métier de SON CLIENT — celui à qui le post s'adresse.
   La question à te poser n'est donc PAS « cette image montre-t-elle le métier de l'annonceur ? » (la réponse sera presque toujours non, et ce n'est pas un défaut).
   La seule question qui vaut : L'IMAGE ET LA LÉGENDE PARLENT-ELLES DU MÊME MÉTIER ? Un paysagiste à l'image et un paysagiste dans le texte : c'est juste, quel que soit l'annonceur. Un paysagiste à l'image et un boulanger dans le texte : c'est faux.

4. IMAGE VIDE
   L'image se réduit-elle à un pictogramme ou un symbole abstrait isolé — flèche, ampoule, engrenage, point d'interrogation, forme géométrique — posé sur un fond uni ou dégradé ?
   Ce type d'image ne montre rien, n'apprend rien, ne donne envie de rien. Elle est rejetée même si elle est jolie et techniquement parfaite.

   ⚠️ NE CONFONDS PAS « abstrait » et « sans produit ». Tous les métiers n'ont pas un objet à photographier, et le sujet concret change selon l'activité :
     • Commerce avec produit (restaurant, boulangerie, boutique, fleuriste, caviste) → le plat, l'étal, la vitrine, le produit en main.
     • Service à la personne (coiffeur, institut, ongles, coach, kiné) → le geste professionnel, le résultat sur la personne, le salon, la cabine.
     • Artisan (plombier, menuisier, électricien, garage, bâtiment) → les mains au travail, l'outil, le chantier, l'avant/après d'une réparation, le véhicule d'intervention.
     • PME, B2B, profession libérale (comptable, consultant, agence, bureau d'études, industrie) → l'atelier, la ligne de production, l'équipe en situation, un poste de travail, un document ou un écran LISIBLE, un graphique dont on comprend l'axe.
   Pour un service ou une PME, une personne au travail, un lieu professionnel, un outil ou un écran lisible sont des sujets PARFAITEMENT concrets. Ne pénalise jamais l'absence d'objet physique : ce qui compte est qu'on identifie une activité réelle.
   Le seul vrai critère : l'image montre-t-elle une SCÈNE ou un OBJET identifiable, ou juste un symbole décoratif ?

4 ter. LE PORTRAIT POSÉ — le « modèle de banque d'images »
   ⚠️ Ce critère est ÉLIMINATOIRE, pas une simple baisse de note. Mesuré le 15 août : la même image — un boulanger en toque, sourire face caméra, bras immobiles — a été refusée à 5/10 le matin, puis acceptée à 6/10 l'après-midi. Un jugement qui change d'avis sur la même image n'en est pas un.
   Quand tu reconnais un portrait posé, mets off_topic à true : la note seule ne suffit pas à le bloquer, et ce défaut ne doit jamais partir chez un client. Il ne peut rien en dire de vrai — ce n'est ni lui, ni son équipe, ni personne de sa boutique.

   L'image se réduit-elle au PORTRAIT d'une personne qui regarde l'objectif en souriant, sans que rien ne se passe dans ses mains ?

   ⛔ REFUSE : un boulanger en toque, bras croisés, sourire large, face caméra. Une coiffeuse qui pose devant son salon. Un artisan qui fixe l'objectif, outil à la main mais immobile.
   ✅ ACCEPTE : la même personne EN TRAIN de travailler — les mains qui façonnent, le geste en cours, le regard sur l'ouvrage. Le visage peut être visible, il n'est simplement pas le sujet.

   Pourquoi c'est un vrai défaut et pas une préférence. Un visage généré qui pose est reconnu en une seconde par n'importe quel utilisateur d'Instagram — c'est LA signature de l'image de synthèse. Et le commerçant ne peut pas le publier : ce n'est ni lui, ni son équipe, ni personne de sa boutique. Il ne peut donc rien en dire de vrai.

   Un plan de travail vaut toujours mieux qu'un portrait : on y voit le métier, pas un mannequin.

4 bis. DU TEXTE DANS L'IMAGE — ÉLIMINATOIRE
   Y a-t-il du texte LISIBLE sur l'image : une enseigne, un panneau, une ardoise, une étiquette de prix, un écran, un logo avec des mots ?
   Regarde le fond autant que le premier plan : c'est là qu'il apparaît.

   Pourquoi c'est éliminatoire et pas une simple gêne. Le texte est le seul défaut qu'on ne rattrape pas en réécrivant la légende. Il invente une enseigne que le commerce ne porte pas, un prix qu'il ne pratique pas, un mot qui souvent n'existe dans aucune langue. Un commerçant qui reçoit une photo de SA boutique avec le nom d'une autre ne publiera pas — et il aura raison.

   ✅ N'est PAS du texte : des lettres floues au troisième plan qu'on ne peut pas lire, un motif qui évoque vaguement de l'écriture sans être déchiffrable, un logo réduit à une forme.
   ⛔ EST du texte : tout mot ou nombre qu'on peut LIRE, même petit, même partiellement.

   Quand tu en vois, mets texte_dans_image à true. Ne te contente pas de le mentionner dans les raisons : c'est le drapeau qui bloque la publication.

5. HASHTAGS À CÔTÉ
   Les hashtags annoncent-ils un sujet, un métier ou un lieu absent du post ?

6. LIEN AVEC L'ACTUALITÉ — FORT OU FORCÉ ?
   Si le post s'appuie sur une actualité, un événement, une saison ou une tendance (Tour de France, rentrée, canicule, sortie d'un film, trend TikTok), demande-toi si le lien tient VRAIMENT.
   ✅ LIEN FORT — l'actualité et le métier se rejoignent naturellement, et le rapprochement apporte quelque chose :
      « Canicule annoncée : nos glaces artisanales sortent du congélateur à -18°, elles tiennent le trajet jusqu'à chez toi. »
      « Rentrée : on garde le pain au levain au chaud jusqu'à 19h pour ceux qui sortent tard du bureau. »
   ⛔ LIEN FORCÉ — l'actualité sert de prétexte, on l'aurait collée à n'importe quel métier :
      « Le Tour de France passe. Nous aussi on avance ! Découvre nos prestations. »
      « Comme les JO, on vise l'excellence. »
   Le test : si tu remplaces le métier par un autre et que la phrase marche encore, le lien est forcé. Un lien forcé fait plus de mal que pas d'actualité du tout — le lecteur sent l'opportunisme.
   Ne coche ce défaut QUE si le post invoque réellement une actualité. Un post intemporel n'est pas concerné.

7. FORCE DE L'ACCROCHE
   La PREMIÈRE ligne décide de tout. Ce qu'elle doit faire dépend du réseau — applique le registre donné en tête de message : accroche qui pose une tension sur Instagram, entrée immédiate dans le sujet sur TikTok, constat d'expertise sur LinkedIn (où un appât fait l'effet inverse de celui recherché).
   ✅ Une accroche forte pose une tension, une surprise, un chiffre concret, une question qui pique, ou nomme le problème du lecteur.
   ⛔ Une accroche faible commence par une généralité (« Le marketing digital est essentiel »), se présente (« Chez nous, nous... »), ou annonce ce que le post va dire au lieu de le dire.
   Note-la à part, sur 10.

NOTE GLOBALE sur 10 (cohérence image ↔ légende ↔ hashtags, force de l'accroche, justesse du lien avec l'actualité) :
  9-10 : image forte et parfaitement raccord, on publie sans hésiter
  7-8  : cohérent et propre, ça peut partir
  5-6  : le lien existe mais reste faible, ça sent le remplissage
  3-4  : hors-sujet ou image sans contenu
  0-2  : aucun rapport entre l'image et le texte
  Un lien à l'actualité forcé plafonne la note à 5. Une accroche molle coûte 2 points.

NOTE DE L'IMAGE SEULE, indépendamment de la légende :
  Cette image mérite-t-elle d'être publiée avec une AUTRE légende, mieux écrite ?
  Réponds oui si elle est nette, concrète, montre un sujet identifiable et donne envie de s'arrêter.
  Réponds non si elle est vide (pictogramme abstrait), floue, ratée, ou porte du texte illisible.
  Cette question est INDÉPENDANTE de la légende actuelle : une belle photo de boulangerie sous une légende hors-sujet reçoit oui.

Réponds UNIQUEMENT via l'outil.`;

const TOOL = {
  name: 'verdict',
  description: 'Verdict éditorial sur le post',
  input_schema: {
    type: 'object' as const,
    properties: {
      image_description: { type: 'string', description: "Ce que montre l'image, factuellement, en une à deux phrases" },
      score: { type: 'number', description: 'Cohérence globale sur 10' },
      invented_client: { type: 'boolean', description: 'Un client identifiable (prénom, nom de commerce, ville) est présenté comme réel alors qu\'il est inventé' },
      implausible_claim: { type: 'boolean', description: 'Un chiffre ou une affirmation aberrante, hors de toute proportion' },
      image_usable: { type: 'boolean', description: "L'image mérite d'être publiée avec une autre légende" },
      off_topic: { type: 'boolean', description: "L'image n'illustre pas le propos" },
      empty_visual: { type: 'boolean', description: 'Pictogramme ou symbole abstrait isolé, sans contenu' },
      /**
       * Le juge ne regardait pas le texte DANS l'image — trou constaté au banc.
       *
       * 14 août 2026 : sur une image portant une enseigne « SANDWICHES » bien
       * lisible, le juge a listé « texte lisible » dans ses remarques… et rendu
       * 7/10 PASSE. Il voyait le défaut, mais rien ne le rendait éliminatoire,
       * alors il le comptait comme une gêne parmi d'autres.
       *
       * Or c'est le seul défaut qu'on ne peut pas rattraper : tout le travail
       * du negative prompt vise à l'éviter, un mot inventé sur une devanture
       * fait passer le commerce pour ce qu'il n'est pas, et le texte généré est
       * souvent du charabia. Il doit bloquer, pas coûter un point.
       */
      texte_dans_image: { type: 'boolean', description: "Du texte LISIBLE apparaît dans l'image (enseigne, panneau, étiquette, ardoise, écran). Les lettres illisibles ou floues au second plan ne comptent pas." },
      hashtag_mismatch: { type: 'boolean', description: 'Les hashtags annoncent un sujet absent' },
      forced_news_link: {
        type: 'boolean',
        description: [
          "Le post parle-t-il d'une actualité SANS RAPPORT avec la clientèle de ce métier ?",
          "",
          "⚠️ REBONDIR SUR L'ACTUALITÉ EST LE MÉTIER DE CETTE MARQUE. Ce n'est jamais un défaut en soi, et un lien un peu appuyé mais BIEN TOURNÉ fonctionne très bien.",
          "Ne lève ce drapeau que si l'actualité choisie ne concerne PAS la clientèle du métier indiqué plus haut : le football pour un salon de coiffure, une célébrité pour un plombier, un sujet financier pour une boulangerie.",
          "",
          "NE le lève PAS quand :",
          "· l'actualité touche la clientèle de ce métier (people et mode pour un coiffeur, sport pour un bar, calendrier affectif pour un fleuriste) ;",
          "· c'est un sujet qui concerne TOUS les commerces — météo, vie locale, pouvoir d'achat, rentrée, jours fériés ;",
          "· le lien est une métaphore appartenant au monde du métier : une plante qui sèche pour un fleuriste, un moteur qui cale pour un garagiste.",
          "",
          "Autrement dit : tu juges la PERTINENCE pour ce commerce et sa cible, pas le degré d'accroche.",
          "",
          "ET L'IMAGE DOIT LE MONTRER. Quand le post s'appuie sur une actualité, un événement ou une saison, on doit VOIR le lien : la scène du commerce porte un signe du moment — la lumière d'un jour de canicule, les couleurs d'une saison, l'affluence d'un samedi, un détail de décor. Une actualité qui n'existe que dans le texte laisse une image muette, et le lecteur ne fait pas le rapprochement.",
        ].join('\n'),
      },
      hook_score: { type: 'number', description: "Force de la première ligne sur 10 : retient-elle le lecteur ?" },
      /**
       * Ce qui FAIT que le post tient — pas seulement ce qui cloche.
       *
       * Fondateur, 2026-08-15 : « les notes sur celles qui ne passent pas,
       * pourquoi ; et celles qui passent, pourquoi pertinentes. Comme ça on
       * traque et on s améliore. »
       *
       * Le juge ne disait rien des réussites : sur un post accepté, le tableau
       * des motifs restait vide. On savait donc pourquoi on écartait, jamais
       * pourquoi on gardait — et on ne peut pas refaire à dessein ce qu on n a
       * pas su nommer.
       */
      points_forts: { type: 'array', items: { type: 'string' }, description: "Ce qui fait la qualité de ce post, en français : l accroche qui pose une tension précise, le geste montré, le lien juste entre image et texte. UN à TROIS points, concrets et citables. À remplir MÊME quand la note est basse : un post refusé a presque toujours quelque chose de bon à garder pour la réparation." },
      reasons: { type: 'array', items: { type: 'string' }, description: "Motifs de rejet en français, du plus grave au moins grave. Vide UNIQUEMENT si le post est bon. Dès que la note est sous le seuil ou qu'un défaut est signalé, ce tableau DOIT contenir au moins un motif : un refus sans motif ne peut être ni expliqué au client ni corrigé, et il ne nous apprend rien." },
    },
    required: ['image_description', 'score', 'invented_client', 'implausible_claim', 'image_usable', 'off_topic', 'empty_visual', 'texte_dans_image', 'hashtag_mismatch', 'forced_news_link', 'hook_score', 'reasons', 'points_forts'],
  },
};


/**
 * Interroge un modèle de vision, Anthropic d'abord, Gemini en repli.
 *
 * Le repli n'est pas un luxe : quand le crédit Anthropic s'épuise, sans lui le
 * contrôle qualité s'arrête net et tout part sans vérification. Gemini rend un
 * jugement de qualité comparable sur cette tâche, et coûte moins cher.
 *
 * Renvoie l'objet structuré demandé, ou `{ __indisponible: true }` si AUCUN
 * des deux n'a pu répondre — à ne jamais confondre avec un verdict.
 */
/** Horodatage jusqu'auquel on n'essaie plus Anthropic (crédit épuisé). */
let anthropicIndisponibleJusqua = 0;

export async function jugerAvecVision(opts: {
  system: string;
  tool: { name: string; description: string; input_schema: any };
  imageBase64: string;
  mediaType: string;
  texte: string;
  maxTokens: number;
}): Promise<any | null> {
  const { system, tool, imageBase64, mediaType, texte, maxTokens } = opts;

  /**
   * ── Troisième recours : ARK, le seul joignable depuis le serveur ──
   *
   * 17 août, 08 h 21 : dernier appel Gemini réussi. Après quoi, depuis le VPS
   * uniquement, l'API répond `400 FAILED_PRECONDITION — User location is not
   * supported for the API use`. Google a cessé d'accepter l'adresse de
   * Gravelines. Le crédit Anthropic étant épuisé depuis le 1er août, les DEUX
   * fournisseurs de vision étaient morts en même temps.
   *
   * Conséquence directe et mesurée le jour même : vingt et un posts programmés,
   * un publié. Le portail retient quand la vision est hors service — c'est le
   * bon choix, sinon le garde-fou se désactive tout seul en silence — mais avec
   * les deux fournisseurs à terre, il retenait tout.
   *
   * ARK répond depuis le VPS : c'est déjà lui qui produit les images et les
   * vidéos, la route est éprouvée. Ses modèles `seed-2-0` lisent les images, et
   * bien : sur un carrousel signalé par le fondateur, la description rendue
   * était « un montage divisé : constellation digitale d'un côté, commerçant
   * derrière son comptoir de l'autre » — exactement le défaut à détecter.
   *
   * La leçon générale : deux fournisseurs ne font pas une redondance quand ils
   * peuvent tomber pour deux raisons différentes le même jour. Il en faut un
   * troisième, et de préférence sur une infrastructure qu'on utilise déjà pour
   * autre chose — donc dont on sait qu'elle répond.
   */
  try {
    const { cleArk } = await import('@/lib/agents/deepseek');
    const cle = cleArk();
    if (!cle) return null;
    const modele = process.env.ARK_VISION_MODEL || 'seed-2-0-pro-260328';
    const consigne = [
      system,
      '',
      'Réponds UNIQUEMENT par un objet JSON valide, sans texte autour et sans balise de code.',
      `Il doit respecter exactement ce schéma : ${JSON.stringify(tool.input_schema)}`,
    ].join('\n');
    const res = await fetch('https://ark.ap-southeast.bytepluses.com/api/v3/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cle}` },
      body: JSON.stringify({
        model: modele,
        messages: [
          { role: 'system', content: consigne },
          { role: 'user', content: [
            { type: 'image_url', image_url: { url: `data:${mediaType};base64,${imageBase64}` } },
            { type: 'text', text: texte },
          ] },
        ],
        max_tokens: maxTokens * 2,
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) {
      console.error('[QC] ARK vision HTTP', res.status, (await res.text()).slice(0, 200));
      return null;
    }
    const j: any = await res.json();
    try {
      const { logApiCost } = await import('@/lib/admin/api-cost-logger');
      void logApiCost({
        provider: 'ark', kind: 'qc_vision', agent: 'content',
        units: j.usage?.total_tokens || 0,
        cost_eur: ((j.usage?.prompt_tokens || 0) * 0.28 + (j.usage?.completion_tokens || 0) * 0.42) / 1e6 * 0.92,
      } as any).catch(() => {});
    } catch { /* la trace de coût ne bloque jamais un contrôle */ }
    let brut = String(j.choices?.[0]?.message?.content || '').trim();
    // Certains modèles enveloppent la réponse dans une clôture markdown.
    brut = brut.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    if (!brut) { console.error('[QC] ARK a répondu sans contenu'); return null; }
    return JSON.parse(brut);
  } catch (e: any) {
    console.error('[QC] ARK vision en échec :', e?.message);
    return null;
  }

  /**
   * ── Anthropic sort de la chaîne du juge — 21 août ──
   *
   * Fondateur : « Anthropic on n'utilise plus, on a dit — faut ajouter des
   * crédits, etc., pas pratique pour monitorer ».
   *
   * Il a raison, et l'historique lui donne doublement raison : ce recours-ci
   * est tombé en panne de crédit le 1er août sans que personne ne le sache, et
   * c'est ce qui avait rendu le juge muet pendant des jours. Un maillon qui
   * exige un rechargement manuel et dont l'épuisement ne se voit pas est un
   * maillon qui coûte plus qu'il ne rapporte.
   *
   * La chaîne devient donc ARK → Gemini. Deux fournisseurs sur deux comptes
   * distincts, tous deux surveillés par le contrôle horaire des fournisseurs
   * (api/cron/verifier-fournisseurs) qui distingue l'impayé de la clé morte.
   *
   * On ne SUPPRIME pas le code : il reste derrière un interrupteur explicite,
   * au cas où un besoin ponctuel se présente. Mais il ne s'active plus tout
   * seul, donc il ne peut plus échouer en silence.
   */
  const cleAnthropic = process.env.JUGE_ANTHROPIC === 'oui' ? process.env.ANTHROPIC_API_KEY : '';
  if (cleAnthropic && Date.now() > anthropicIndisponibleJusqua) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
      // Cet appel est compté juste en dessous, avec son étiquette et son agent.
      // Sans ce marqueur, le compteur global l'enregistre une SECONDE fois —
      // 62 doublons relevés sur une seule vague le 15 août.
      __keiroDejaCompte: true,
        headers: { 'x-api-key': cleAnthropic, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6', max_tokens: maxTokens, system,
          tools: [tool], tool_choice: { type: 'tool', name: tool.name },
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            { type: 'text', text: texte },
          ] }],
        }),
      } as any);
      if (res.ok) {
        const j = await res.json();
        // Le coût de CE module n'était pas tracé — comme les 24 autres points
        // d'appel Anthropic du produit. Résultat : le tableau de bord des coûts
        // ne voyait que 26 appels sur 14 jours, et le crédit s'est vidé sans
        // que rien ne le signale. On trace au moins ce qu'on ajoute.
        void logApiCost({
          provider: 'anthropic', kind: 'qc_coherence_vision', agent: 'content',
          units: (j.usage?.input_tokens || 0) + (j.usage?.output_tokens || 0),
          cost_eur: ((j.usage?.input_tokens || 0) * 3 + (j.usage?.output_tokens || 0) * 15) / 1e6 * 0.92,
        });
        const use = (j.content || []).find((c: any) => c.type === 'tool_use');
        if (use?.input) return use.input;
      } else {
        const corps = await res.text().catch(() => '');
        if (/credit balance|billing/i.test(corps)) {
          anthropicIndisponibleJusqua = Date.now() + 10 * 60 * 1000;
          console.warn('[QC] crédit Anthropic épuisé — bascule sur Gemini pour 10 minutes');
        } else {
          console.warn(`[QC] Anthropic refuse (${res.status}) : ${corps.slice(0, 140)} — repli Gemini`);
        }
      }
    } catch (e: any) {
      console.warn('[QC] Anthropic injoignable, repli Gemini :', e?.message);
    }
  }

  // ── 2. Gemini ──
  const cleGemini = process.env.GEMINI_API_KEY;
  // Pas de clé Gemini n'est plus une impasse : ARK prend le relais plus bas.
  if (!cleGemini) console.warn('[QC] pas de clé Gemini — on passe directement à ARK');
  try {
    const res = await fetchIPv4(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${cleGemini}`,
      {
        method: 'POST',
      // Cet appel est compté juste en dessous, avec son étiquette et son agent.
      // Sans ce marqueur, le compteur global l'enregistre une SECONDE fois —
      // 62 doublons relevés sur une seule vague le 15 août.
      __keiroDejaCompte: true,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [
            { inline_data: { mime_type: mediaType, data: imageBase64 } },
            { text: texte },
          ] }],
          generationConfig: {
            // Gemini 2.5 consomme son budget de sortie en raisonnement interne
            // avant d'écrire : avec 900 tokens il rendait une réponse vide, et
            // le contrôle croyait à un verdict sans note. On coupe le
            // raisonnement — un jugement structuré n'en a pas besoin — et on
            // double la marge.
            thinkingConfig: { thinkingBudget: 0 },
            maxOutputTokens: maxTokens * 2,
            responseMimeType: 'application/json',
            responseSchema: versSchemaGemini(tool.input_schema),
          },
        }),
      } as any,
    );
    if (!res.ok) {
      /**
       * On tombe vers ARK au lieu de rendre les armes ici.
       *
       * Ce `return null` était écrit quand Gemini était le DERNIER recours :
       * il n'y avait rien après, donc sortir ou continuer revenait au même.
       * Depuis qu'ARK existe en troisième position, il court-circuitait tout —
       * le repli était en place et inatteignable, et la production répondait
       * « les deux fournisseurs sont en échec » alors que le troisième
       * attendait dix lignes plus bas.
       *
       * Une sortie anticipée écrite pour un monde à deux recours devient un
       * piège dès qu'on en ajoute un troisième.
       */
      throw new Error(`Gemini HTTP ${res.status}`);
    }
    const j = await res.json();
    void logApiCost({
      provider: 'gemini', kind: 'qc_coherence_vision', agent: 'content',
      units: j.usageMetadata?.totalTokenCount || 0,
      cost_eur: ((j.usageMetadata?.promptTokenCount || 0) * 0.3 + (j.usageMetadata?.candidatesTokenCount || 0) * 2.5) / 1e6 * 0.92,
    } as any);
    const txt = (j.candidates?.[0]?.content?.parts || []).map((p: any) => p.text).filter(Boolean).join('');
    // Même raison que plus haut : on laisse ARK tenter sa chance.
    if (!txt) throw new Error('Gemini a répondu sans contenu');
    return JSON.parse(txt);
  } catch (e: any) {
    console.error('[QC] Gemini en échec :', e?.message);
  }

}

/**
 * Gemini n'accepte pas `additionalProperties` ni les descriptions imbriquées
 * de la même façon qu'Anthropic : on ne garde que ce qu'il comprend.
 */
function versSchemaGemini(schema: any): any {
  const conv = (s: any): any => {
    if (!s || typeof s !== 'object') return s;
    const out: any = { type: String(s.type || 'string').toUpperCase() };
    if (s.description) out.description = s.description;
    if (s.type === 'object' && s.properties) {
      out.properties = Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, conv(v)]));
      if (Array.isArray(s.required)) out.required = s.required;
    }
    if (s.type === 'array' && s.items) out.items = conv(s.items);
    return out;
  };
  return conv(schema);
}

/**
 * Exporté le 2026-08-10 : le contrôle d'image (image-qa) passe désormais par
 * la même chaîne de repli, et il a besoin de la même conversion — y compris de
 * la détection de type par les octets, parce que le parc contient des JPEG
 * nommés .png qu'Anthropic refuse quand le media_type ne correspond pas.
 */
export async function fetchImageBase64(url: string): Promise<{ data: string; mediaType: string } | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    // Un fichier minuscule n'est pas une vraie image : inutile de payer un appel.
    if (buf.length < 2000) return null;
    // On se fie aux octets, pas à l'extension : le parc contient des JPEG
    // nommés .png, et Anthropic refuse un media_type qui ne correspond pas.
    const isPng = buf[0] === 0x89 && buf.subarray(1, 4).toString('latin1') === 'PNG';
    const isWebp = buf.subarray(8, 12).toString('latin1') === 'WEBP';
    const mediaType = isPng ? 'image/png' : isWebp ? 'image/webp' : 'image/jpeg';
    return { data: buf.toString('base64'), mediaType };
  } catch {
    return null;
  }
}

/**
 * Juge un post. Renvoie `null` si le contrôle n'a PAS pu s'exécuter (clé
 * absente, image illisible, API en erreur) — à distinguer d'un rejet. Un
 * contrôle qui échoue ne doit jamais faire passer un post pour validé, ni
 * bloquer tout un calendrier parce qu'une image a disparu.
 */
export async function assessPostCoherence(input: {
  visualUrl: string;
  caption: string;
  hashtags?: string[] | null;
  platform?: string;
  format?: string;
  /**
   * Le métier du commerçant et la clientèle à qui il parle.
   *
   * Fondateur, 2026-08-13 : « on ne sacrifie pas la qualité, seulement une
   * meilleure analyse permet de savoir à qui s'adresse la génération. Et la
   * plante sèche, ça marche pour un fleuriste. »
   *
   * Le juge ne savait RIEN du métier. Il évaluait la pertinence dans le vide —
   * d'où le refus d'« une plante en plein soleil » pour parler de communication
   * qui s'assèche : excellente image pour un fleuriste, hors-sujet pour un
   * garagiste. Sans savoir pour qui, on ne peut pas juger si c'est pertinent.
   *
   * Ce n'est donc pas un assouplissement du barème : c'est le contexte qui lui
   * manquait pour appliquer le barème correctement.
   */
  metier?: string | null;
  cible?: string | null;
}): Promise<CoherenceVerdict | CoherenceUnavailable | null> {
  /**
   * ── Le juge s arretait faute de cle Anthropic, alors qu il a deux recours ──
   *
   * Cette porte exigeait ANTHROPIC_API_KEY pour seulement COMMENCER. Or le
   * credit Anthropic est epuise depuis le 1er aout, et la chaine de vision a
   * justement trois fournisseurs : Anthropic, puis Gemini, puis ARK. Les deux
   * derniers fonctionnent — mais on n arrivait jamais jusqu a eux.
   *
   * Consequence mesuree le 19 aout : le juge rendait null en silence, aucune
   * note n etait enregistree, et les posts partaient sans avoir ete juges. Le
   * fondateur : « il est cense juger a chaque sortie generee ». Il l etait, il
   * ne l etait plus, et rien ne le disait.
   *
   * C est encore une condition ecrite pour un monde a un seul fournisseur,
   * devenue un piege quand on en a ajoute deux — comme les sorties anticipees
   * corrigees le 17 aout dans ce meme fichier.
   *
   * Seule l image est indispensable : sans elle il n y a rien a juger.
   */
  if (!input.visualUrl) return null;

  const img = await fetchImageBase64(input.visualUrl);
  if (!img) return null;

  const tags = (input.hashtags || []).join(' ') || '(aucun)';
  // Le réseau ne se réduit pas à son nom. Jusqu'au 2026-08-11 le contrôle
  // recevait « Réseau : linkedin » et jugeait pourtant avec les critères
  // d'Instagram : la note de l'accroche parlait explicitement d'Instagram et
  // de TikTok, LinkedIn n'existait nulle part. On lui donne l'exigence du
  // réseau, la même que celle donnée au générateur.
  const contexte = [
    blocExigence(input.platform, { avecTexte: true }),
    '',
    ...(input.metier ? [
      `MÉTIER DU COMMERÇANT : ${String(input.metier).slice(0, 200)}`,
      ...(input.cible ? [`SA CLIENTÈLE : ${String(input.cible).slice(0, 200)}`] : []),
      "Juge la pertinence POUR CE MÉTIER et POUR CETTE CLIENTÈLE, pas dans l'absolu.",
      "Une métaphore ou une image indirecte est PERTINENTE si elle appartient au monde",
      "de ce commerce : une plante qui sèche parle à un fleuriste, un moteur qui cale à",
      "un garagiste. La même image serait hors-sujet ailleurs — c'est le métier qui",
      'tranche, pas ton goût.',
      '',
    ] : []),
    `Format : ${input.format || 'post'}`,
    '',
    'LÉGENDE :',
    (input.caption || '(vide)').slice(0, 2000),
    '',
    `HASHTAGS : ${tags}`,
  ].join('\n');

  try {
    const v = await jugerAvecVision({
      system: SYSTEM, tool: TOOL, imageBase64: img.data, mediaType: img.mediaType,
      texte: contexte, maxTokens: 900,
    });
    // Les DEUX modèles ont échoué : ce n'est plus un incident isolé sur une
    // image, c'est le contrôle qui est hors service. On le dit explicitement
    // pour que l'appelant retienne le post au lieu de publier à l'aveugle.
    if (!v) return { unavailableReason: 'both_providers_down' } as any;

    const flags = {
      inventedClient: !!v.invented_client,
      implausibleClaim: !!v.implausible_claim,
      offTopic: !!v.off_topic,
      emptyVisual: !!v.empty_visual,
      texteDansImage: !!v.texte_dans_image,
      hashtagMismatch: !!v.hashtag_mismatch,
      forcedNewsLink: !!v.forced_news_link,
      weakHook: (Number(v.hook_score) || 0) < 6,
    };
    const hookScore = Math.max(0, Math.min(10, Number(v.hook_score) || 0));
    const score = Math.max(0, Math.min(10, Number(v.score) || 0));

    // Ce qui bloque la publication EN L'ÉTAT.
    // Un client inventé et nommé bloque toujours ; un ordre de grandeur
    // illustratif ne bloque plus (arbitrage fondateur du 31/07 : « les %
    // inventés ne sont pas le plus grave, ça doit juste pas être aberrant »).
    // Un lien à l'actualité forcé bloque au même titre qu'un hors-sujet :
    // dans les deux cas le post affirme une connexion qui n'existe pas, et le
    // lecteur le sent immédiatement. Une accroche molle ne bloque pas seule —
    // elle pèse déjà sur la note globale.
    // ── Refuser sans savoir pourquoi n'est pas un contrôle ──
    //
    // 2026-08-13 : une publication notée 6/10, aucun drapeau levé, aucun motif
    // écrit — et retenue quand même, parce que le plancher est à 7. Le
    // fondateur avait validé l'accroche à la main ; le juge, lui, ne trouvait
    // rien à lui reprocher mais la bloquait sur un chiffre.
    //
    // Une note sans motif n'est pas un jugement, c'est une hésitation. Or le
    // barème du juge appelle lui-même 6 « publiable ». Bloquer là-dessus coûte
    // un créneau et une génération, sans rien apprendre à personne : ni le
    // client ni la réparation automatique n'ont de prise sur « 6 ».
    //
    // Quand le juge NOMME un défaut, le plancher de 7 s'applique — c'est le cas
    // normal et il ne bouge pas. Quand il n'en nomme aucun, 6 suffit.
    // ── Ce qui bloque vraiment, et ce qui coûte seulement des points ──
    //
    // Fondateur, 2026-08-13, devant trois posts refusés d'affilée : « je trouve
    // ces trois derniers plutôt bien. Attention à te retrouver dans la
    // situation où tu ne publies rien : on perd nos marges. Le prétexte bien
    // tourné, ça marche. Et la plante sèche, ça marche pour un fleuriste. »
    //
    // Il a raison, et j'avais oublié la moitié de l'équation. J'ai passé la
    // journée à durcir le contrôle sans jamais peser le COÛT d'un refus : une
    // génération payée, un créneau vide, et un client qui ne reçoit rien. Un
    // portillon qui ne laisse plus rien passer ne protège plus la qualité, il
    // supprime le service.
    //
    // On distingue donc deux natures de défauts.
    //
    // ÉLIMINATOIRES, parce qu'ils font mentir le commerçant ou ne montrent
    // rien : un client nommé inventé, un chiffre aberrant, une image vide, une
    // image qui ne montre pas le sujet. Ceux-là bloquent, quel que soit le
    // reste.
    //
    // PÉNALISANTS, parce qu'ils rendent le post moins bon sans le rendre faux :
    // le lien à l'actualité tiré par les cheveux en fait partie. Un prétexte
    // bien tourné fonctionne — et « ta com' est sèche comme une plante en plein
    // soleil » est une excellente accroche pour un fleuriste. Le juge n'a pas à
    // trancher à la place du métier : il retire des points, il ne condamne pas.
    /**
     * ── La story porte NOTRE texte, et c'est voulu ──
     *
     * Constaté le 15 août, en faisant juger une vraie vague : une story notée
     * 4/10 et refusée pour « texte illisible sur l'image ». Or ce texte, c'est
     * l'incrustation qu'on ajoute nous-mêmes — « Ton équipe, pas ton business. »
     * — et une story sans accroche incrustée ne se lit pas : elle passe en trois
     * secondes, sans son la plupart du temps.
     *
     * Ma règle d'hier interdisait le texte partout. Elle visait le texte
     * INVENTÉ par le modèle d'image — une enseigne, un prix, du charabia — pas
     * celui qu'on pose délibérément par-dessus. Interdire les deux, c'est
     * rendre le format story impossible.
     *
     * Sur les autres formats la règle reste entière : un mot dans une image
     * générée est un mot qu'on ne maîtrise pas.
     */
    const estStory = String(input.format || '').toLowerCase() === 'story';
    const texteIndesirable = flags.texteDansImage && !estStory;

    const eliminatoire = flags.inventedClient || flags.implausibleClaim
      || flags.offTopic || flags.emptyVisual || texteIndesirable;

    // ── L'actualité n'est plus un motif de sanction ──
    //
    // Fondateur, 2026-08-13 : « il ne faut pas que l'actualité soit bloquée et
    // refusée par le contrôle qualité, mais la pertinence avec le business, la
    // cible et le texte/titre, pour tous nos formats. »
    //
    // Il a raison, et ça simplifie le juge. La bonne question n'a jamais été
    // « ce lien à l'actualité est-il forcé ? » — c'est une question de goût, et
    // rebondir sur l'actualité est précisément le métier. La seule question qui
    // vaut : ce post parle-t-il à CE commerce et à SA clientèle ?
    //
    // Un post d'actualité hors-sujet pour la cible tombe déjà sous le critère de
    // pertinence, qui lui est éliminatoire. Le pénaliser une seconde fois au
    // nom de l'actualité revenait à sanctionner deux fois le même défaut — et à
    // décourager le rebond, qui est notre valeur ajoutée.
    const noteFinale = score;

    // 6, la note que le barème du juge appelle lui-même « publiable ». Exiger 7
    // partout revenait à ne garder que le remarquable, et à jeter le correct —
    // or le correct publié vaut infiniment mieux que le remarquable jamais sorti.
    const plancher = 6;

    const pass = !eliminatoire && noteFinale >= plancher;

    /**
     * ── Un drapeau qui bloque doit dire pourquoi ──
     *
     * Constaté le 15 août : un reel noté 8/10, sans un seul motif, refusé avec
     * « le contrôle a refusé sans motif explicite (note 8/10 — sous le seuil) ».
     * Le message était trompeur — 8 est bien au-dessus du plancher de 6. Ce qui
     * bloquait, c'était un drapeau éliminatoire levé par le modèle sans qu'il
     * l'ait répété dans ses motifs.
     *
     * On ne peut pas exiger du modèle qu'il soit deux fois d'accord avec
     * lui-même. On traduit donc chaque drapeau en motif : le client sait ce
     * qu'on lui reproche, la réparation sait quoi corriger, et le journal
     * cesse d'accuser un seuil qui n'y était pour rien.
     */
    const motifsModele = Array.isArray(v.reasons) ? v.reasons.map((r: any) => String(r).slice(0, 240)) : [];
    const motifsDesDrapeaux: string[] = [];
    if (flags.inventedClient) motifsDesDrapeaux.push('Un client nommé est présenté comme réel alors qu\'il est inventé.');
    if (flags.implausibleClaim) motifsDesDrapeaux.push('Une affirmation ou un chiffre invraisemblable est avancé.');
    if (flags.offTopic) motifsDesDrapeaux.push('L\'image n\'illustre pas le propos de la légende.');
    if (flags.emptyVisual) motifsDesDrapeaux.push('L\'image se réduit à un symbole ou un pictogramme, sans scène ni objet identifiable.');
    if (texteIndesirable) motifsDesDrapeaux.push('Du texte lisible apparaît dans l\'image générée — enseigne, panneau ou étiquette qu\'on ne maîtrise pas.');

    // Les motifs du modèle d'abord : ils sont plus précis que nos libellés.
    // Ceux des drapeaux ne s'ajoutent que s'ils n'ont pas déjà été dits.
    const reasons = [...motifsModele];
    for (const m of motifsDesDrapeaux) {
      const deja = motifsModele.some((r: any) => r.toLowerCase().slice(0, 30) === m.toLowerCase().slice(0, 30));
      if (!deja) reasons.push(m);
    }

    return {
      pass,
      // Une image vide n'est jamais récupérable ; tout le reste des défauts
      // (hors-sujet, hashtags, texte) se corrige en réécrivant la légende.
      imageUsable: !!v.image_usable && !flags.emptyVisual,
      score,
      hookScore,
      imageDescription: String(v.image_description || '').slice(0, 400),
      reasons,
      pointsForts: Array.isArray(v.points_forts) ? v.points_forts.map((r: any) => String(r).slice(0, 200)).slice(0, 3) : [],
      flags,
    };
  } catch {
    return null;
  }
}
