/**
 * Script to translate ALL library component files from hardcoded French to i18n.
 * Adds translation keys to fr.ts and en.ts, then replaces hardcoded strings in components.
 */
import fs from 'fs';
import path from 'path';

const ROOT = 'C:/Users/vcgle/Documents/GitHub/keiro';
const COMPONENTS_DIR = path.join(ROOT, 'app/library/components');
const FR_PATH = path.join(ROOT, 'lib/i18n/translations/fr.ts');
const EN_PATH = path.join(ROOT, 'lib/i18n/translations/en.ts');

// ========================================================
// STEP 1: Define ALL new translation keys
// ========================================================

const newFrKeys = {
  // === CalendarTab ===
  calMonthJan: 'Janvier', calMonthFeb: 'Février', calMonthMar: 'Mars',
  calMonthApr: 'Avril', calMonthMay: 'Mai', calMonthJun: 'Juin',
  calMonthJul: 'Juillet', calMonthAug: 'Août', calMonthSep: 'Septembre',
  calMonthOct: 'Octobre', calMonthNov: 'Novembre', calMonthDec: 'Décembre',
  calDayMon: 'Lun', calDayTue: 'Mar', calDayWed: 'Mer',
  calDayThu: 'Jeu', calDayFri: 'Ven', calDaySat: 'Sam', calDaySun: 'Dim',
  calAutoPublishEnabled: 'Publication automatique activée',
  calAutoPublishDesc: 'Keiro publiera automatiquement vos posts aux dates et heures programmées. Vous recevrez une confirmation par email.',
  calNextAutoPublish: 'Prochaines publications automatiques :',
  calPublicationsScheduled: 'publication(s) planifiée(s)',
  calToday: "Aujourd'hui",
  calMore: 'autre(s)',
  calScheduledPost: 'Publication planifiée',
  calStatusScheduled: 'Planifié',
  calStatusPublished: 'Publié',
  calEdit: 'Modifier',
  calDelete: 'Supprimer',
  calConfirmDelete: 'Supprimer cette publication planifiée ?',
  calVisitorTitle: 'Planification automatique de vos publications',
  calVisitorDesc: 'Voici un aperçu de ce à quoi ressemblera votre calendrier une fois que vous aurez planifié vos posts. Keiro publiera automatiquement vos contenus aux dates et heures choisies !',
  calExampleTitle: 'Janvier 2026 (Exemple)',
  calExampleCount: '3 publications planifiées',
  calPreview: 'APERÇU',
  calScheduledPublications: 'Publications programmées :',
  calExPost1Date: 'Lun 8 jan à 18h00',
  calExPost1Text: 'Nouveau produit : Découvrez notre innovation...',
  calExPost2Date: 'Lun 15 jan à 12h30',
  calExPost2Text: 'Promo exclusive : -30% ce week-end uniquement...',
  calExPost3Date: 'Lun 22 jan à 19h15',
  calExPost3Text: 'Témoignage client : Sophie partage son expérience...',
  calHowToTitle: 'Comment planifier vos posts :',
  calStep1: 'Allez dans l\'onglet <strong>"Mes images"</strong>',
  calStep2: 'Survolez une image et cliquez sur <strong>"Préparer post"</strong>',
  calStep3: 'Ajoutez description et hashtags, puis cliquez sur <strong>"Planifier la publication"</strong>',
  calStep4: 'Choisissez date et heure → Keiro publiera automatiquement !',

  // === CreateFolderModal ===
  cfmTitle: 'Nouveau dossier',
  cfmPreview: 'Aperçu',
  cfmFolderNamePlaceholder: 'Nom du dossier',
  cfmZeroImages: '0 image',
  cfmFolderNameLabel: 'Nom du dossier *',
  cfmFolderNameInput: 'Ex: Mes projets, Clients, Instagram...',
  cfmCharacters: 'caractères',
  cfmIconLabel: 'Icône',
  cfmColorLabel: 'Couleur',
  cfmCancel: 'Annuler',
  cfmCreating: 'Création...',
  cfmCreate: 'Créer le dossier',
  cfmAlertEnterName: 'Veuillez entrer un nom pour le dossier',
  cfmAlertError: 'Erreur lors de la création du dossier',
  cfmColorBlue: 'Bleu', cfmColorPurple: 'Violet', cfmColorPink: 'Rose',
  cfmColorRed: 'Rouge', cfmColorOrange: 'Orange', cfmColorYellow: 'Jaune',
  cfmColorGreen: 'Vert', cfmColorCyan: 'Cyan',

  // === ContactSupportModal ===
  csmTitle: 'Contacter le support',
  csmSubtitle: 'Nous vous répondons sous 24h',
  csmSuccessTitle: 'Message envoyé !',
  csmSuccessDesc: "Notre équipe vous répondra dans les 24h à l'adresse email fournie.",
  csmNameLabel: 'Nom',
  csmNamePlaceholder: 'Votre nom',
  csmEmailLabel: 'Email',
  csmSubjectLabel: 'Sujet',
  csmSubjectPlaceholder: 'Décrivez votre problème en quelques mots',
  csmMessageLabel: 'Message',
  csmMessagePlaceholder: 'Décrivez votre problème en détail...',
  csmTipTitle: 'Conseil',
  csmTipDesc: 'Plus votre description est détaillée, plus nous pourrons vous aider rapidement.',
  csmCancel: 'Annuler',
  csmSending: 'Envoi...',
  csmSend: 'Envoyer',
  csmAlsoEmail: 'Vous pouvez aussi nous écrire directement à',
  csmSendError: "Erreur lors de l'envoi",
  csmSendErrorAlert: "Erreur lors de l'envoi:",

  // === ScheduleModal ===
  schTitle: 'Planifier la publication',
  schSubtitle: 'Préparez votre contenu pour publication ultérieure',
  schUntitled: 'Sans titre',
  schSelectedImage: 'Image sélectionnée',
  schPlatforms: 'Plateformes (sélection multiple)',
  schPlatformHint: 'Sélectionnez une ou plusieurs plateformes pour publier simultanément',
  schDate: 'Date',
  schTime: 'Heure',
  schCaption: 'Caption',
  schRegenerate: 'Régénérer',
  schCaptionPlaceholder: 'Écrivez votre caption...',
  schCharacters: 'caractères',
  schHashtags: 'Hashtags',
  schSuggest: 'Suggérer',
  schHashtagHint: 'Séparez les hashtags par des espaces',
  schAutoPublishEnabled: 'Publication automatique activée',
  schAutoPublishDesc: 'Votre post sera publié automatiquement sur',
  schAutoPublishTime: 'à la date et heure choisies.',
  schTikTokNote: 'Pour TikTok : Votre image sera automatiquement convertie en vidéo de 5 secondes.',
  schCancel: 'Annuler',
  schScheduling: 'Planification...',
  schScheduleBtn: 'Planifier',
  schAlertDateTime: 'Veuillez sélectionner une date et heure',
  schAlertPlatform: 'Veuillez sélectionner au moins une plateforme',
  schAlertError: 'Erreur lors de la planification',
  schNewContent: 'Nouveau contenu',
  schDefaultCaption1: 'Découvrez notre dernière création !',
  schDefaultCaption2: 'On partage avec vous cette nouvelle inspiration',
  schDefaultCaption3: 'À ne pas manquer !',

  // === ErrorSupportModal ===
  esmErrorOccurred: "Une erreur s'est produite",
  esmErrorLabel: 'Erreur :',
  esmTechnicalDetails: 'Détails techniques (pour le support)',
  esmCopyTechnical: "Copier l'erreur technique",
  esmCopied: 'Erreur technique copiée dans le presse-papier',
  esmNeedHelp: "Besoin d'aide ?",
  esmNeedHelpDesc: 'Notre équipe peut vous aider à résoudre ce problème rapidement. Choisissez votre moyen de contact préféré :',
  esmPhoneCall: 'Appel téléphonique (15 min gratuit)',
  esmEmail: 'Email (réponse sous 24h)',
  esmShareDuringCall: "Lors de l'appel, partagez :",
  esmShareError: "Le message d'erreur ci-dessus",
  esmShareTechnical: 'Les détails techniques (copiez-les)',
  esmShareAction: 'Ce que vous essayiez de faire',
  esmClose: 'Fermer',
  esmContactSupport: 'Contacter le support',

  // === VisitorBanner ===
  vbVisitorMode: 'Mode Visiteur',
  vbDiscoverWorkspace: 'Découvrez votre futur espace de travail',
  vbUploadFree: 'Uploadez des images et créez votre premier brouillon Instagram gratuitement',
  vbStartFree: 'Commencer gratuitement',
  vbSignIn: 'Se connecter',

  // === InstagramHelpGuide ===
  ihgTitle: 'Comment connecter votre Instagram ?',
  ihgDesc: 'Pour publier automatiquement sur Instagram, vous devez connecter votre compte via Meta Business API',
  ihgStep1Title: 'Convertir en compte professionnel',
  ihgStep1Desc: 'Allez dans Paramètres Instagram → Type de compte → Passer au compte professionnel',
  ihgStep2Title: 'Créer une Page Facebook',
  ihgStep2Desc: 'Votre compte Instagram doit être lié à une Page Facebook Business',
  ihgStep3Title: 'Configurer Meta Business Suite',
  ihgStep3Desc: 'Accédez à business.facebook.com et liez votre Instagram',
  ihgStep4Title: 'Connecter sur Keiro',
  ihgStep4Desc: 'Retournez sur Keiro et connectez votre Instagram via OAuth',
  ihgBookCall: "Booker un appel d'accompagnement",
  ihgMetaDocs: 'Documentation Meta API',
  ihgTip: "Astuce : Notre équipe peut vous accompagner dans la configuration. Bookez un appel gratuit de 15 minutes !",

  // === InstagramMetaInfo ===
  imiTitle: 'Publication automatique sur Instagram',
  imiDesc: 'Pour publier automatiquement sur Instagram, vous devez connecter votre compte via <strong>Meta Business Suite</strong>. Votre compte Instagram doit être <strong>professionnel</strong> et lié à une <strong>Page Facebook</strong>.',
  imiReq1: 'Compte Instagram <strong>professionnel</strong> requis',
  imiReq2: 'Lié à une <strong>Page Facebook Business</strong>',
  imiReq3: 'Configuration via <strong>Meta Business Suite</strong>',
  imiLearnMore: 'En savoir plus sur la configuration',

  // === EmailGateModal ===
  egmTitle: 'Commencez gratuitement !',
  egmSubtitle: 'Entrez votre email pour accéder à la galerie',
  egmBenefit1Title: "Upload d'images illimité",
  egmBenefit1Desc: 'Stockez vos visuels dans votre galerie',
  egmBenefit2Title: '1 brouillon Instagram gratuit',
  egmBenefit2Desc: 'Créez un post Instagram professionnel',
  egmBenefit3Title: 'Accès aux fonctionnalités de base',
  egmBenefit3Desc: 'Organisation et gestion de vos images',
  egmEmailLabel: 'Votre email',
  egmEmailPlaceholder: 'vous@exemple.com',
  egmDisclaimer: 'En continuant, vous acceptez de recevoir nos communications. Pas de spam, promis !',
  egmCancel: 'Annuler',
  egmLoading: 'Chargement...',
  egmStart: 'Commencer',
  egmErrorEmail: 'Veuillez entrer votre email',
  egmErrorInvalid: "Format d'email invalide",
  egmErrorGeneric: 'Une erreur est survenue',

  // === PlatformChoiceModal ===
  pcmTitle: 'Choisir une plateforme',
  pcmSubtitle: 'Sur quelle plateforme souhaitez-vous publier ?',
  pcmViralVideo: 'Vidéo virale',
  pcmProPost: 'Post professionnel',
  pcmImpactTweet: 'Tweet percutant',
  pcmCancel: 'Annuler',

  // === TwitterModal ===
  tmTitle: 'Préparer un tweet',
  tmMaxChars: '280 caractères max',
  tmAngleLabel: 'Quel angle pour votre tweet ?',
  tmAngleViral: 'Viral - Percutant et partageable',
  tmAngleHumorous: 'Humoristique - Faire rire',
  tmAngleInformative: 'Informatif - Facts et données',
  tmAngleProvocative: 'Provocateur - Interpeller',
  tmAngleConversational: 'Conversationnel - Engager un échange',
  tmAngleInspiring: 'Inspirant - Motiver',
  tmKeywordsPlaceholder: 'Ex: breaking news, opinion, thread...',
  tmSuggestTweet: 'Suggérer un tweet',
  tmYourTweet: 'Votre tweet',
  tmTweetPlaceholder: 'Écrivez un tweet percutant...',
  tmHashtagsNote: '(comptent dans les 280 car.)',
  tmAddHashtagPlaceholder: 'Ajouter un hashtag...',
  tmSaveDraft: 'Sauvegarder brouillon',
  tmMarkReady: 'Marquer prêt à publier',
  tmYourAccount: 'Votre compte',
  tmNow: 'maintenant',
  tmTweetPreview: 'Votre tweet apparaitra ici...',
  tmEditImage: "Modifier l'image",
  tmAlertWriteText: 'Veuillez écrire du texte pour votre tweet',
  tmTextDraftSaved: 'Brouillon texte X sauvegardé !',
  tmDraftSaved: 'Brouillon X sauvegardé !',
  tmVideoDraftSaved: 'Brouillon vidéo X sauvegardé !',
  tmSelectContent: 'Veuillez sélectionner un contenu',

  // === TikTokCarouselModal ===
  tkcTitle: 'Carrousel TikTok',
  tkcSelectRange: 'Sélectionnez 2-35 images',
  tkcSelectedCount: 'images sélectionnées',
  tkcClickToSelect: 'Cliquez sur les images pour les sélectionner/désélectionner',
  tkcNoImages: 'Aucune image disponible',
  tkcSelectedImages: 'Images sélectionnées',
  tkcVideoPreviewLabel: 'Aperçu de la 1ère image en vidéo (5s)',
  tkcConverting: 'Conversion en cours...',
  tkcVideoConverted: 'Vidéo convertie',
  tkcPreviewVideo: 'Prévisualiser la vidéo (5s)',
  tkcCarouselTone: 'Ton du carrousel',
  tkcSuggestDesc: 'Suggérer description et hashtags',
  tkcCarouselDescription: 'Description du carrousel',
  tkcCarouselPlaceholder: 'Écrivez une description engageante pour votre carrousel TikTok...',
  tkcSuggestedHashtags: 'Hashtags suggérés',
  tkcAddHashtagPlaceholder: 'Ajouter un hashtag',
  tkcConnectedTo: 'Connecté à TikTok :',
  tkcConnectWarning: 'Connectez votre compte TikTok pour publier automatiquement',
  tkcConnectTikTok: 'Connecter TikTok',
  tkcCancel: 'Annuler',
  tkcPublishing: 'Publication...',
  tkcPublishCarousel: 'Publier le carrousel',
  tkcMaxImages: 'Maximum 35 images pour un carrousel TikTok',
  tkcAlertSelectImage: 'Veuillez sélectionner au moins une image',
  tkcAlertWriteDesc: 'Veuillez écrire une description pour votre carrousel TikTok',
  tkcAlertConnectFirst: "Veuillez d'abord connecter votre compte TikTok",
  tkcConfirmPublish: 'Publier le carrousel sur TikTok ?',
  tkcConfirmSelected: 'image(s) sélectionnée(s)',
  tkcConfirmImmediate: 'Le carrousel sera publié immédiatement sur TikTok',
  tkcConfirmContinue: 'Continuer ?',
  tkcSuccessTitle: 'Carrousel publié avec succès sur TikTok !',
  tkcSuccessImages: 'images publiées',
  tkcSuccessEngagement: 'Les interactions commenceront bientôt',
  tkcSuccessCongrats: 'Félicitations !',
  tkcAlreadyVideo: 'Ce fichier est déjà une vidéo, pas de conversion nécessaire.',
  tkcVideoError: 'Erreur lors de la génération de la vidéo:',
  tkcPublishError: 'Erreur lors de la publication:',

  // === InstagramCarouselModal ===
  icmTitle: 'Carrousel Instagram',
  icmSelectRange: 'Sélectionnez 2-10 images',
  icmSelectedCount: 'images sélectionnées',
  icmClickToSelect: 'Cliquez sur les images pour les sélectionner/désélectionner',
  icmNoImages: 'Aucune image disponible',
  icmSelectedImages: 'Images sélectionnées',
  icmContentAngle: 'Angle du contenu',
  icmSuggestDesc: 'Suggérer description et hashtags',
  icmCarouselDescription: 'Description du carrousel',
  icmCarouselPlaceholder: 'Écrivez une description engageante pour votre carrousel Instagram...',
  icmSuggestedHashtags: 'Hashtags suggérés',
  icmAddHashtagPlaceholder: 'Ajouter un hashtag',
  icmConnectedTo: 'Connecté à Instagram :',
  icmConnectWarning: 'Connectez votre compte Instagram pour publier automatiquement',
  icmConnectInstagram: 'Connecter Instagram',
  icmCancel: 'Annuler',
  icmPublishing: 'Publication...',
  icmPublishCarousel: 'Publier le carrousel',
  icmMaxImages: 'Maximum 10 images pour un carrousel Instagram',
  icmAlertSelectImage: 'Veuillez sélectionner au moins 2 images',
  icmAlertWriteDesc: 'Veuillez écrire une description pour votre carrousel',
  icmAlertConnectFirst: "Veuillez d'abord connecter votre compte Instagram",
  icmConfirmPublish: 'Publier le carrousel sur Instagram ?',
  icmConfirmSelected: 'image(s) sélectionnée(s)',
  icmConfirmImmediate: 'Le carrousel sera publié immédiatement',
  icmConfirmContinue: 'Continuer ?',
  icmSuccessTitle: 'Carrousel publié avec succès sur Instagram !',
  icmSuccessImages: 'images publiées',
  icmSuccessEngagement: 'Les interactions commenceront bientôt',
  icmSuccessCongrats: 'Félicitations !',
  icmPublishError: 'Erreur lors de la publication:',

  // === AudioEditorWidget ===
  aewVoiceMaleNarrator: 'Homme narrateur', aewVoiceMaleNarratorDesc: 'Voix masculine britannique, posée et professionnelle',
  aewVoiceFemaleSoft: 'Femme douce', aewVoiceFemaleSoftDesc: 'Voix féminine calme et chaleureuse',
  aewVoiceFemaleNatural: 'Femme naturelle', aewVoiceFemaleNaturalDesc: 'Voix féminine douce et authentique',
  aewVoiceMaleDynamic: 'Homme dynamique', aewVoiceMaleDynamicDesc: 'Voix masculine énergique et engageante',
  aewVoiceMaleDeep: 'Homme profond', aewVoiceMaleDeepDesc: 'Voix masculine grave et confiante',
  aewVoiceMaleAuthority: 'Homme autoritaire', aewVoiceMaleAuthorityDesc: 'Voix masculine profonde et imposante',
  aewVoiceFemaleEnergetic: 'Femme énergique', aewVoiceFemaleEnergeticDesc: 'Voix féminine forte et dynamique',
  aewVoiceFemalePro: 'Femme pro', aewVoiceFemaleProDesc: 'Voix féminine claire et professionnelle',
  aewMusicNone: 'Aucune', aewMusicCorporate: 'Corporate', aewMusicEnergetic: 'Énergique',
  aewMusicCalm: 'Calme', aewMusicInspiring: 'Inspirant', aewMusicTrendy: 'Tendance',
  aewScriptLabel: 'Script de narration',
  aewLoading: 'Chargement...',
  aewSuggestions: 'Suggestions',
  aewScriptPlaceholder: 'Entrez le texte à narrer (ex: Découvrez les 3 tendances marketing de 2026...)\nMax ~15 mots pour 5 secondes',
  aewWordCount: 'mots',
  aewTooLong: 'Trop long, le texte sera condensé',
  aewVoiceLabel: 'Voix',
  aewMusicLabel: 'Musique de fond',
  aewUseSuggestion: 'Utiliser et générer audio',
  aewAudioGenerated: 'Audio généré',
  aewGenerating: 'Génération...',
  aewGenerateAudio: 'Générer audio',
  aewAddToVideo: 'Ajouter à la vidéo',
  aewTip: 'Astuce: Utilisez "Suggestions" pour des scripts optimisés',
  aewAlertEnterText: 'Veuillez entrer un texte à narrer',
  aewAlertGenerateFirst: "Veuillez d'abord générer l'audio",
  aewAlertNoContext: 'Aucun contexte disponible pour les suggestions',
  aewAlertAudioError: 'Erreur lors de la génération audio',
  aewAlertSuggestionError: 'Erreur lors de la génération de suggestions',

  // === DraftsTabs common ===
  draftsNone: 'Aucun brouillon',
  draftsTransform: 'Transformez vos visuels en',
  draftsHowTo: 'Comment créer un brouillon',
  draftsStep1: 'Cliquez sur "Préparer un post"',
  draftsPreparePost: 'Préparer un post',
  draftsStatusDraft: 'Brouillon',
  draftsStatusReady: 'Prêt à publier',
  draftsStatusPublished: 'Publié',
  draftsCategoryConverted: 'Convertie',
  draftsCategoryPublished: 'Publiée',
  draftsAll: 'Tous',
  draftsDrafts: 'Brouillons',
  draftsConverted: 'Converties',
  draftsPublishedCat: 'Publiées',
  draftsPublishedMasc: 'Publiés',
  draftsNoneInCategory: 'Aucun brouillon dans cette catégorie',
  draftsPreviewUnavailable: 'Aperçu non disponible',
  draftsContinue: 'Continuer',
  draftsDelete: 'Supprimer',
  draftsSchedule: 'Planifier',
  draftsCreatedOn: 'Créé le',
  draftsCtrlEnter: 'Ctrl+Entrée pour sauvegarder, Échap pour annuler',
  draftsNoDescClick: 'Pas de description (cliquer pour ajouter)',
  draftsClickToEdit: 'Cliquer pour modifier la description',

  // === TikTokDraftsTab specific ===
  ttdNoDrafts: 'Aucun brouillon TikTok',
  ttdTransformDesc: 'Transformez vos visuels en vidéos TikTok virales. Ajoutez des descriptions engageantes et des hashtags tendance.',
  ttdHowTo: 'Comment créer un brouillon TikTok ?',
  ttdStep1: 'Cliquez sur "Préparer un post" dans le widget TikTok',
  ttdStep2: 'Sélectionnez une image (convertie auto en vidéo 9:16)',
  ttdStep3: 'Ajoutez description et hashtags (#fyp #viral #foryou)',

  // === InstagramDraftsTab specific ===
  idtNoDrafts: 'Aucun brouillon Instagram',
  idtTransformDesc: 'Transformez vos visuels en posts Instagram professionnels. Ajoutez des descriptions et des hashtags pour maximiser votre engagement.',
  idtHowTo: 'Comment créer un brouillon ?',
  idtStep1: 'Allez dans l\'onglet "Mes images"',
  idtStep2: 'Survolez une image et cliquez sur "Préparer post"',
  idtStep3: 'Ajoutez votre description et vos hashtags',

  // === LinkedInDraftsTab specific ===
  ldtNoDrafts: 'Aucun brouillon LinkedIn',
  ldtTransformDesc: 'Créez des posts professionnels pour LinkedIn. Partagez votre expertise avec votre réseau.',
  ldtPreparePost: 'Préparer un post LinkedIn',

  // === TwitterDraftsTab specific ===
  xdtNoDrafts: 'Aucun brouillon X',
  xdtTransformDesc: 'Créez des tweets percutants. Optimisez chaque caractère pour maximiser votre impact.',
  xdtPrepareTweet: 'Préparer un tweet',

  // === GalleryHeader ===
  ghTitle: 'Galerie & Posts',
  ghPreviewTitle: 'Aperçu Galerie & Posts',
  ghPreviewDesc: 'Exemples de visuels générés avec Keiro AI',

  // === TabNavigation ===
  tabMyCreations: 'Mes créations',
  tabMyImages: 'Mes images',
  tabMyVideos: 'Mes vidéos',
  tabInstagramDrafts: 'Brouillons Instagram',
  tabTikTokDrafts: 'Brouillons TikTok',
  tabLinkedInDrafts: 'Brouillons LinkedIn',
  tabXDrafts: 'Brouillons X',
  tabCalendar: 'Calendrier',

  // === Widget common ===
  widgetYourPosts: 'Vos posts',
  widgetDemoPreview: 'Aperçu démo',
  widgetNotConnected: 'Non connecté',
  widgetPreparePost: 'Préparer un post',
  widgetExpand: 'Développer',
  widgetCollapse: 'Réduire',
  widgetExample: 'Exemple',
  widgetRefreshPosts: 'Actualiser les posts',
  widgetSyncPosts: 'Synchroniser les posts',
  widgetRequestRecorded: 'Demande enregistrée !',

  // === TwitterWidget ===
  twYourXPosts: 'Vos posts X',
  twConnectX: 'Connectez votre compte X pour publier',
  twJoinWaitlist: 'Rejoindre la liste prioritaire',

  // === InstagramWidget ===
  iwYourInstaPosts: 'Vos posts Instagram',
  iwCreateAccount: 'Créez un compte pour connecter Instagram',
  iwConnectToSee: 'Connectez votre Instagram pour voir vos posts',
  iwConnectInstagram: 'Connecter Instagram',
  iwNoPosts: 'Aucun post publié',
  iwPublishFirst: 'Publiez votre premier post !',

  // === LinkedInWidget ===
  lwYourLinkedInPosts: 'Vos posts LinkedIn',
  lwCreateAccount: 'Créez un compte pour connecter LinkedIn',
  lwConnectToPublish: 'Connectez votre LinkedIn pour publier directement',
  lwConnectLinkedIn: 'Connecter LinkedIn',
  lwNoPosts: 'Aucun post publié',
  lwPublishFirst: 'Publiez votre premier post depuis vos brouillons',
  lwTextPost: 'Post texte',
  lwPublished: 'Publié',

  // === TikTokWidget ===
  tkwYourTikTokPosts: 'Vos vidéos TikTok',
  tkwConnectToPublish: 'Connectez votre TikTok pour publier',
  tkwConnectTikTok: 'Connecter TikTok',
  tkwNoPosts: 'Aucune vidéo publiée',
  tkwPublishFirst: 'Publiez votre première vidéo !',
  tkwSyncComplete: 'Synchronisation terminée',
  tkwNoVideosFound: 'Aucune vidéo trouvée sur votre compte TikTok.',
  tkwWaitAndRetry: 'Si vous venez de publier, attendez quelques minutes et réessayez.',
  tkwSynced: 'vidéo(s) synchronisée(s) depuis TikTok',
  tkwInsufficientPerms: 'Permissions insuffisantes',
  tkwReconnect: 'Voulez-vous reconnecter votre compte TikTok ?',
  tkwSyncError: 'Erreur lors de la synchronisation TikTok',
  tkwViews: 'vues',
  tkwLikes: 'likes',

  // === Connection Modals ===
  connWhyConnect: 'Pourquoi connecter',
  connDirectPublish: '<strong>Publication directe</strong> en un clic',
  connImagesVideos: '<strong>Images et vidéos</strong> supportées',
  connSmartDrafts: '<strong>Brouillons</strong> intelligents',
  connTimeSaving: '<strong>Gain de temps</strong> plus de copier-coller',
  connWhatYouNeed: 'Ce dont vous avez besoin',
  connAuthorizeKeiro: 'Autoriser Keiro',
  connThatsAll: "C'est tout !",
  connPublishOnProfile: 'Publiez directement sur votre profil',

  // === LinkedInConnectionModal ===
  lcmTitle: 'Connecter LinkedIn',
  lcmLinkedInAccount: 'Un compte LinkedIn',
  lcmConnectBtn: 'Connecter avec LinkedIn',
  lcmSecure: 'Connexion sécurisée via OAuth 2.0',
  lcmNoPassword: 'Keiro ne stocke jamais votre mot de passe',
  lcmDisconnect: 'Déconnectez à tout moment',

  // === TikTokConnectionModal ===
  ttcTitle: 'Connecter TikTok',
  ttcAutoPublish: '<strong>Publication auto</strong> de vos vidéos',
  ttcCrossPlatform: '<strong>Cross-platform</strong> Instagram + TikTok',
  ttcAnalytics: '<strong>Analytics</strong> vues et engagement',
  ttcInsights: '<strong>Insights</strong> conseils personnalisés',
  ttcTikTokAccount: 'Un compte TikTok',
  ttcAutoConversion: 'Vos images sont automatiquement converties en vidéo 9:16 (5s) optimisée pour TikTok',
  ttcConnectBtn: 'Connecter avec TikTok',

  // === InstagramConnectionModal ===
  icmConnTitle: 'Connecter Instagram',
  icmWhyConnect: 'Pourquoi connecter Instagram ?',
  icmInstagramPro: 'Compte Instagram Pro',
  icmFacebookPage: 'Page Facebook liée',
  icmMetaSuite: 'Meta Business Suite',
  icmImportant: 'Important',
  icmImportantDesc: 'Votre compte Instagram doit être professionnel et lié à une Page Facebook.',
  icmNeedHelp: "Besoin d'aide pour la configuration ?",
  icmBookCall: "Booker un appel gratuit (15 min)",
  icmMetaGuide: 'Guide Meta Business',
  icmConnectBtn: 'Connecter avec Meta Business',

  // === AllCreationsTab, MyImagesTab, MyVideosTab ===
  // (These use shared keys from existing library section)

  // === LoadingSkeleton ===
  loadingText: 'Chargement...',

  // === FilterBar ===
  filterAll: 'Tous',
  filterFavorites: 'Favoris',
  filterRecent: 'Récents',
  filterSearch: 'Rechercher...',

  // === FolderList / FolderHeader ===
  flAllImages: 'Toutes les images',
  flNewFolder: 'Nouveau dossier',
  flRename: 'Renommer',
  flDeleteFolder: 'Supprimer le dossier',
  flConfirmDelete: 'Supprimer ce dossier et replacer les images ?',

  // === ImageCard / CreationCard ===
  icPreparePost: 'Préparer post',
  icDownload: 'Télécharger',
  icAddToFavorites: 'Ajouter aux favoris',
  icRemoveFromFavorites: 'Retirer des favoris',

  // === AddContentButton ===
  acbAddContent: 'Ajouter du contenu',
  acbUploadImages: 'Importer des images',
  acbUploadVideos: 'Importer des vidéos',

  // === UploadZone / DropZone ===
  uzDragHere: 'Glissez vos fichiers ici',
  uzOr: 'ou',
  uzBrowse: 'Parcourir',
  uzFormats: 'Images et vidéos supportées',

  // === ImageEditModal ===
  iemTitle: "Modifier l'image",
  iemRestore: "Restaurer l'original",
  iemSave: 'Sauvegarder',

  // === LayoutPicker ===
  lpGrid: 'Grille',
  lpList: 'Liste',

  // === TikTokRequirementsInfo ===
  triTitle: 'Conditions TikTok',
  triVideoFormat: 'Format vidéo 9:16 requis',
  triAutoConvert: 'Les images seront converties automatiquement',

  // === InstagramPreviewCard ===
  ipcLikedBy: 'Aimé par',
  ipcAndOthers: 'et d\'autres personnes',
};

const newEnKeys = {
  // === CalendarTab ===
  calMonthJan: 'January', calMonthFeb: 'February', calMonthMar: 'March',
  calMonthApr: 'April', calMonthMay: 'May', calMonthJun: 'June',
  calMonthJul: 'July', calMonthAug: 'August', calMonthSep: 'September',
  calMonthOct: 'October', calMonthNov: 'November', calMonthDec: 'December',
  calDayMon: 'Mon', calDayTue: 'Tue', calDayWed: 'Wed',
  calDayThu: 'Thu', calDayFri: 'Fri', calDaySat: 'Sat', calDaySun: 'Sun',
  calAutoPublishEnabled: 'Auto-publish enabled',
  calAutoPublishDesc: 'Keiro will automatically publish your posts at the scheduled dates and times. You will receive a confirmation email.',
  calNextAutoPublish: 'Upcoming auto-publications:',
  calPublicationsScheduled: 'scheduled publication(s)',
  calToday: 'Today',
  calMore: 'more',
  calScheduledPost: 'Scheduled post',
  calStatusScheduled: 'Scheduled',
  calStatusPublished: 'Published',
  calEdit: 'Edit',
  calDelete: 'Delete',
  calConfirmDelete: 'Delete this scheduled post?',
  calVisitorTitle: 'Auto-scheduling your posts',
  calVisitorDesc: 'Here is a preview of what your calendar will look like once you schedule your posts. Keiro will automatically publish your content at the dates and times you choose!',
  calExampleTitle: 'January 2026 (Example)',
  calExampleCount: '3 scheduled publications',
  calPreview: 'PREVIEW',
  calScheduledPublications: 'Scheduled publications:',
  calExPost1Date: 'Mon Jan 8 at 6:00 PM',
  calExPost1Text: 'New product: Discover our innovation...',
  calExPost2Date: 'Mon Jan 15 at 12:30 PM',
  calExPost2Text: 'Exclusive promo: -30% this weekend only...',
  calExPost3Date: 'Mon Jan 22 at 7:15 PM',
  calExPost3Text: 'Customer testimonial: Sophie shares her experience...',
  calHowToTitle: 'How to schedule your posts:',
  calStep1: 'Go to the <strong>"My images"</strong> tab',
  calStep2: 'Hover over an image and click <strong>"Prepare post"</strong>',
  calStep3: 'Add a description and hashtags, then click <strong>"Schedule post"</strong>',
  calStep4: 'Choose date and time — Keiro will publish automatically!',

  // === CreateFolderModal ===
  cfmTitle: 'New folder',
  cfmPreview: 'Preview',
  cfmFolderNamePlaceholder: 'Folder name',
  cfmZeroImages: '0 images',
  cfmFolderNameLabel: 'Folder name *',
  cfmFolderNameInput: 'e.g. My projects, Clients, Instagram...',
  cfmCharacters: 'characters',
  cfmIconLabel: 'Icon',
  cfmColorLabel: 'Color',
  cfmCancel: 'Cancel',
  cfmCreating: 'Creating...',
  cfmCreate: 'Create folder',
  cfmAlertEnterName: 'Please enter a name for the folder',
  cfmAlertError: 'Error creating folder',
  cfmColorBlue: 'Blue', cfmColorPurple: 'Purple', cfmColorPink: 'Pink',
  cfmColorRed: 'Red', cfmColorOrange: 'Orange', cfmColorYellow: 'Yellow',
  cfmColorGreen: 'Green', cfmColorCyan: 'Cyan',

  // === ContactSupportModal ===
  csmTitle: 'Contact support',
  csmSubtitle: 'We respond within 24 hours',
  csmSuccessTitle: 'Message sent!',
  csmSuccessDesc: 'Our team will respond within 24 hours to the email address provided.',
  csmNameLabel: 'Name',
  csmNamePlaceholder: 'Your name',
  csmEmailLabel: 'Email',
  csmSubjectLabel: 'Subject',
  csmSubjectPlaceholder: 'Describe your issue in a few words',
  csmMessageLabel: 'Message',
  csmMessagePlaceholder: 'Describe your issue in detail...',
  csmTipTitle: 'Tip',
  csmTipDesc: 'The more detailed your description, the faster we can help you.',
  csmCancel: 'Cancel',
  csmSending: 'Sending...',
  csmSend: 'Send',
  csmAlsoEmail: 'You can also write to us directly at',
  csmSendError: 'Error sending message',
  csmSendErrorAlert: 'Error sending:',

  // === ScheduleModal ===
  schTitle: 'Schedule post',
  schSubtitle: 'Prepare your content for later publishing',
  schUntitled: 'Untitled',
  schSelectedImage: 'Selected image',
  schPlatforms: 'Platforms (multiple selection)',
  schPlatformHint: 'Select one or more platforms to publish simultaneously',
  schDate: 'Date',
  schTime: 'Time',
  schCaption: 'Caption',
  schRegenerate: 'Regenerate',
  schCaptionPlaceholder: 'Write your caption...',
  schCharacters: 'characters',
  schHashtags: 'Hashtags',
  schSuggest: 'Suggest',
  schHashtagHint: 'Separate hashtags with spaces',
  schAutoPublishEnabled: 'Auto-publish enabled',
  schAutoPublishDesc: 'Your post will be automatically published on',
  schAutoPublishTime: 'at the selected date and time.',
  schTikTokNote: 'For TikTok: Your image will be automatically converted to a 5-second video.',
  schCancel: 'Cancel',
  schScheduling: 'Scheduling...',
  schScheduleBtn: 'Schedule',
  schAlertDateTime: 'Please select a date and time',
  schAlertPlatform: 'Please select at least one platform',
  schAlertError: 'Error scheduling',
  schNewContent: 'New content',
  schDefaultCaption1: 'Discover our latest creation!',
  schDefaultCaption2: 'Sharing this new inspiration with you',
  schDefaultCaption3: 'Don\'t miss out!',

  // === ErrorSupportModal ===
  esmErrorOccurred: 'An error occurred',
  esmErrorLabel: 'Error:',
  esmTechnicalDetails: 'Technical details (for support)',
  esmCopyTechnical: 'Copy technical error',
  esmCopied: 'Technical error copied to clipboard',
  esmNeedHelp: 'Need help?',
  esmNeedHelpDesc: 'Our team can help you resolve this issue quickly. Choose your preferred contact method:',
  esmPhoneCall: 'Phone call (15 min free)',
  esmEmail: 'Email (response within 24h)',
  esmShareDuringCall: 'During the call, share:',
  esmShareError: 'The error message above',
  esmShareTechnical: 'The technical details (copy them)',
  esmShareAction: 'What you were trying to do',
  esmClose: 'Close',
  esmContactSupport: 'Contact support',

  // === VisitorBanner ===
  vbVisitorMode: 'Visitor Mode',
  vbDiscoverWorkspace: 'Discover your future workspace',
  vbUploadFree: 'Upload images and create your first Instagram draft for free',
  vbStartFree: 'Get started for free',
  vbSignIn: 'Sign in',

  // === InstagramHelpGuide ===
  ihgTitle: 'How to connect your Instagram?',
  ihgDesc: 'To auto-publish on Instagram, you need to connect your account via Meta Business API',
  ihgStep1Title: 'Switch to a professional account',
  ihgStep1Desc: 'Go to Instagram Settings > Account type > Switch to professional account',
  ihgStep2Title: 'Create a Facebook Page',
  ihgStep2Desc: 'Your Instagram account must be linked to a Facebook Business Page',
  ihgStep3Title: 'Set up Meta Business Suite',
  ihgStep3Desc: 'Go to business.facebook.com and link your Instagram',
  ihgStep4Title: 'Connect on Keiro',
  ihgStep4Desc: 'Return to Keiro and connect your Instagram via OAuth',
  ihgBookCall: 'Book a setup call',
  ihgMetaDocs: 'Meta API Documentation',
  ihgTip: 'Tip: Our team can help you with the setup. Book a free 15-minute call!',

  // === InstagramMetaInfo ===
  imiTitle: 'Auto-publishing on Instagram',
  imiDesc: 'To auto-publish on Instagram, you need to connect your account via <strong>Meta Business Suite</strong>. Your Instagram account must be <strong>professional</strong> and linked to a <strong>Facebook Page</strong>.',
  imiReq1: '<strong>Professional</strong> Instagram account required',
  imiReq2: 'Linked to a <strong>Facebook Business Page</strong>',
  imiReq3: 'Setup via <strong>Meta Business Suite</strong>',
  imiLearnMore: 'Learn more about the setup',

  // === EmailGateModal ===
  egmTitle: 'Get started for free!',
  egmSubtitle: 'Enter your email to access the gallery',
  egmBenefit1Title: 'Unlimited image uploads',
  egmBenefit1Desc: 'Store your visuals in your gallery',
  egmBenefit2Title: '1 free Instagram draft',
  egmBenefit2Desc: 'Create a professional Instagram post',
  egmBenefit3Title: 'Access to basic features',
  egmBenefit3Desc: 'Organize and manage your images',
  egmEmailLabel: 'Your email',
  egmEmailPlaceholder: 'you@example.com',
  egmDisclaimer: 'By continuing, you agree to receive our communications. No spam, we promise!',
  egmCancel: 'Cancel',
  egmLoading: 'Loading...',
  egmStart: 'Get started',
  egmErrorEmail: 'Please enter your email',
  egmErrorInvalid: 'Invalid email format',
  egmErrorGeneric: 'An error occurred',

  // === PlatformChoiceModal ===
  pcmTitle: 'Choose a platform',
  pcmSubtitle: 'Which platform would you like to publish on?',
  pcmViralVideo: 'Viral video',
  pcmProPost: 'Professional post',
  pcmImpactTweet: 'Impactful tweet',
  pcmCancel: 'Cancel',

  // === TwitterModal ===
  tmTitle: 'Prepare a tweet',
  tmMaxChars: '280 characters max',
  tmAngleLabel: 'What angle for your tweet?',
  tmAngleViral: 'Viral - Punchy and shareable',
  tmAngleHumorous: 'Humorous - Make them laugh',
  tmAngleInformative: 'Informative - Facts and data',
  tmAngleProvocative: 'Provocative - Challenge',
  tmAngleConversational: 'Conversational - Start a discussion',
  tmAngleInspiring: 'Inspiring - Motivate',
  tmKeywordsPlaceholder: 'e.g. breaking news, opinion, thread...',
  tmSuggestTweet: 'Suggest a tweet',
  tmYourTweet: 'Your tweet',
  tmTweetPlaceholder: 'Write a punchy tweet...',
  tmHashtagsNote: '(count towards 280 chars)',
  tmAddHashtagPlaceholder: 'Add a hashtag...',
  tmSaveDraft: 'Save draft',
  tmMarkReady: 'Mark as ready to publish',
  tmYourAccount: 'Your account',
  tmNow: 'now',
  tmTweetPreview: 'Your tweet will appear here...',
  tmEditImage: 'Edit image',
  tmAlertWriteText: 'Please write text for your tweet',
  tmTextDraftSaved: 'X text draft saved!',
  tmDraftSaved: 'X draft saved!',
  tmVideoDraftSaved: 'X video draft saved!',
  tmSelectContent: 'Please select content',

  // === TikTokCarouselModal ===
  tkcTitle: 'TikTok Carousel',
  tkcSelectRange: 'Select 2-35 images',
  tkcSelectedCount: 'images selected',
  tkcClickToSelect: 'Click images to select/deselect',
  tkcNoImages: 'No images available',
  tkcSelectedImages: 'Selected images',
  tkcVideoPreviewLabel: 'Preview first image as video (5s)',
  tkcConverting: 'Converting...',
  tkcVideoConverted: 'Video converted',
  tkcPreviewVideo: 'Preview video (5s)',
  tkcCarouselTone: 'Carousel tone',
  tkcSuggestDesc: 'Suggest description and hashtags',
  tkcCarouselDescription: 'Carousel description',
  tkcCarouselPlaceholder: 'Write an engaging description for your TikTok carousel...',
  tkcSuggestedHashtags: 'Suggested hashtags',
  tkcAddHashtagPlaceholder: 'Add a hashtag',
  tkcConnectedTo: 'Connected to TikTok:',
  tkcConnectWarning: 'Connect your TikTok account to auto-publish',
  tkcConnectTikTok: 'Connect TikTok',
  tkcCancel: 'Cancel',
  tkcPublishing: 'Publishing...',
  tkcPublishCarousel: 'Publish carousel',
  tkcMaxImages: 'Maximum 35 images for a TikTok carousel',
  tkcAlertSelectImage: 'Please select at least one image',
  tkcAlertWriteDesc: 'Please write a description for your TikTok carousel',
  tkcAlertConnectFirst: 'Please connect your TikTok account first',
  tkcConfirmPublish: 'Publish carousel on TikTok?',
  tkcConfirmSelected: 'image(s) selected',
  tkcConfirmImmediate: 'The carousel will be published immediately on TikTok',
  tkcConfirmContinue: 'Continue?',
  tkcSuccessTitle: 'Carousel successfully published on TikTok!',
  tkcSuccessImages: 'images published',
  tkcSuccessEngagement: 'Engagement will start soon',
  tkcSuccessCongrats: 'Congratulations!',
  tkcAlreadyVideo: 'This file is already a video, no conversion needed.',
  tkcVideoError: 'Error generating video:',
  tkcPublishError: 'Error publishing:',

  // === InstagramCarouselModal ===
  icmTitle: 'Instagram Carousel',
  icmSelectRange: 'Select 2-10 images',
  icmSelectedCount: 'images selected',
  icmClickToSelect: 'Click images to select/deselect',
  icmNoImages: 'No images available',
  icmSelectedImages: 'Selected images',
  icmContentAngle: 'Content angle',
  icmSuggestDesc: 'Suggest description and hashtags',
  icmCarouselDescription: 'Carousel description',
  icmCarouselPlaceholder: 'Write an engaging description for your Instagram carousel...',
  icmSuggestedHashtags: 'Suggested hashtags',
  icmAddHashtagPlaceholder: 'Add a hashtag',
  icmConnectedTo: 'Connected to Instagram:',
  icmConnectWarning: 'Connect your Instagram account to auto-publish',
  icmConnectInstagram: 'Connect Instagram',
  icmCancel: 'Cancel',
  icmPublishing: 'Publishing...',
  icmPublishCarousel: 'Publish carousel',
  icmMaxImages: 'Maximum 10 images for an Instagram carousel',
  icmAlertSelectImage: 'Please select at least 2 images',
  icmAlertWriteDesc: 'Please write a description for your carousel',
  icmAlertConnectFirst: 'Please connect your Instagram account first',
  icmConfirmPublish: 'Publish carousel on Instagram?',
  icmConfirmSelected: 'image(s) selected',
  icmConfirmImmediate: 'The carousel will be published immediately',
  icmConfirmContinue: 'Continue?',
  icmSuccessTitle: 'Carousel successfully published on Instagram!',
  icmSuccessImages: 'images published',
  icmSuccessEngagement: 'Engagement will start soon',
  icmSuccessCongrats: 'Congratulations!',
  icmPublishError: 'Error publishing:',

  // === AudioEditorWidget ===
  aewVoiceMaleNarrator: 'Male narrator', aewVoiceMaleNarratorDesc: 'British male voice, composed and professional',
  aewVoiceFemaleSoft: 'Soft female', aewVoiceFemaleSoftDesc: 'Calm and warm female voice',
  aewVoiceFemaleNatural: 'Natural female', aewVoiceFemaleNaturalDesc: 'Gentle and authentic female voice',
  aewVoiceMaleDynamic: 'Dynamic male', aewVoiceMaleDynamicDesc: 'Energetic and engaging male voice',
  aewVoiceMaleDeep: 'Deep male', aewVoiceMaleDeepDesc: 'Deep and confident male voice',
  aewVoiceMaleAuthority: 'Authoritative male', aewVoiceMaleAuthorityDesc: 'Deep and commanding male voice',
  aewVoiceFemaleEnergetic: 'Energetic female', aewVoiceFemaleEnergeticDesc: 'Strong and dynamic female voice',
  aewVoiceFemalePro: 'Professional female', aewVoiceFemaleProDesc: 'Clear and professional female voice',
  aewMusicNone: 'None', aewMusicCorporate: 'Corporate', aewMusicEnergetic: 'Energetic',
  aewMusicCalm: 'Calm', aewMusicInspiring: 'Inspiring', aewMusicTrendy: 'Trendy',
  aewScriptLabel: 'Narration script',
  aewLoading: 'Loading...',
  aewSuggestions: 'Suggestions',
  aewScriptPlaceholder: 'Enter the text to narrate (e.g. Discover the 3 marketing trends of 2026...)\nMax ~15 words for 5 seconds',
  aewWordCount: 'words',
  aewTooLong: 'Too long, the text will be condensed',
  aewVoiceLabel: 'Voice',
  aewMusicLabel: 'Background music',
  aewUseSuggestion: 'Use and generate audio',
  aewAudioGenerated: 'Audio generated',
  aewGenerating: 'Generating...',
  aewGenerateAudio: 'Generate audio',
  aewAddToVideo: 'Add to video',
  aewTip: 'Tip: Use "Suggestions" for optimized scripts',
  aewAlertEnterText: 'Please enter text to narrate',
  aewAlertGenerateFirst: 'Please generate the audio first',
  aewAlertNoContext: 'No context available for suggestions',
  aewAlertAudioError: 'Error generating audio',
  aewAlertSuggestionError: 'Error generating suggestions',

  // === DraftsTabs common ===
  draftsNone: 'No drafts',
  draftsTransform: 'Turn your visuals into',
  draftsHowTo: 'How to create a draft',
  draftsStep1: 'Click "Prepare a post"',
  draftsPreparePost: 'Prepare a post',
  draftsStatusDraft: 'Draft',
  draftsStatusReady: 'Ready to publish',
  draftsStatusPublished: 'Published',
  draftsCategoryConverted: 'Converted',
  draftsCategoryPublished: 'Published',
  draftsAll: 'All',
  draftsDrafts: 'Drafts',
  draftsConverted: 'Converted',
  draftsPublishedCat: 'Published',
  draftsPublishedMasc: 'Published',
  draftsNoneInCategory: 'No drafts in this category',
  draftsPreviewUnavailable: 'Preview unavailable',
  draftsContinue: 'Continue',
  draftsDelete: 'Delete',
  draftsSchedule: 'Schedule',
  draftsCreatedOn: 'Created on',
  draftsCtrlEnter: 'Ctrl+Enter to save, Escape to cancel',
  draftsNoDescClick: 'No description (click to add)',
  draftsClickToEdit: 'Click to edit description',

  // === TikTokDraftsTab specific ===
  ttdNoDrafts: 'No TikTok drafts',
  ttdTransformDesc: 'Turn your visuals into viral TikTok videos. Add engaging descriptions and trending hashtags.',
  ttdHowTo: 'How to create a TikTok draft?',
  ttdStep1: 'Click "Prepare a post" in the TikTok widget',
  ttdStep2: 'Select an image (auto-converted to 9:16 video)',
  ttdStep3: 'Add a description and hashtags (#fyp #viral #foryou)',

  // === InstagramDraftsTab specific ===
  idtNoDrafts: 'No Instagram drafts',
  idtTransformDesc: 'Turn your visuals into professional Instagram posts. Add descriptions and hashtags to maximize your engagement.',
  idtHowTo: 'How to create a draft?',
  idtStep1: 'Go to the "My images" tab',
  idtStep2: 'Hover over an image and click "Prepare post"',
  idtStep3: 'Add your description and hashtags',

  // === LinkedInDraftsTab specific ===
  ldtNoDrafts: 'No LinkedIn drafts',
  ldtTransformDesc: 'Create professional posts for LinkedIn. Share your expertise with your network.',
  ldtPreparePost: 'Prepare a LinkedIn post',

  // === TwitterDraftsTab specific ===
  xdtNoDrafts: 'No X drafts',
  xdtTransformDesc: 'Create impactful tweets. Optimize every character to maximize your reach.',
  xdtPrepareTweet: 'Prepare a tweet',

  // === GalleryHeader ===
  ghTitle: 'Gallery & Posts',
  ghPreviewTitle: 'Gallery & Posts Preview',
  ghPreviewDesc: 'Example visuals generated with Keiro AI',

  // === TabNavigation ===
  tabMyCreations: 'My creations',
  tabMyImages: 'My images',
  tabMyVideos: 'My videos',
  tabInstagramDrafts: 'Instagram Drafts',
  tabTikTokDrafts: 'TikTok Drafts',
  tabLinkedInDrafts: 'LinkedIn Drafts',
  tabXDrafts: 'X Drafts',
  tabCalendar: 'Calendar',

  // === Widget common ===
  widgetYourPosts: 'Your posts',
  widgetDemoPreview: 'Demo preview',
  widgetNotConnected: 'Not connected',
  widgetPreparePost: 'Prepare a post',
  widgetExpand: 'Expand',
  widgetCollapse: 'Collapse',
  widgetExample: 'Example',
  widgetRefreshPosts: 'Refresh posts',
  widgetSyncPosts: 'Sync posts',
  widgetRequestRecorded: 'Request recorded!',

  // === TwitterWidget ===
  twYourXPosts: 'Your X posts',
  twConnectX: 'Connect your X account to publish',
  twJoinWaitlist: 'Join the priority list',

  // === InstagramWidget ===
  iwYourInstaPosts: 'Your Instagram posts',
  iwCreateAccount: 'Create an account to connect Instagram',
  iwConnectToSee: 'Connect your Instagram to see your posts',
  iwConnectInstagram: 'Connect Instagram',
  iwNoPosts: 'No published posts',
  iwPublishFirst: 'Publish your first post!',

  // === LinkedInWidget ===
  lwYourLinkedInPosts: 'Your LinkedIn posts',
  lwCreateAccount: 'Create an account to connect LinkedIn',
  lwConnectToPublish: 'Connect your LinkedIn to publish directly',
  lwConnectLinkedIn: 'Connect LinkedIn',
  lwNoPosts: 'No published posts',
  lwPublishFirst: 'Publish your first post from your drafts',
  lwTextPost: 'Text post',
  lwPublished: 'Published',

  // === TikTokWidget ===
  tkwYourTikTokPosts: 'Your TikTok videos',
  tkwConnectToPublish: 'Connect your TikTok to publish',
  tkwConnectTikTok: 'Connect TikTok',
  tkwNoPosts: 'No published videos',
  tkwPublishFirst: 'Publish your first video!',
  tkwSyncComplete: 'Sync complete',
  tkwNoVideosFound: 'No videos found on your TikTok account.',
  tkwWaitAndRetry: 'If you just published, wait a few minutes and try again.',
  tkwSynced: 'video(s) synced from TikTok',
  tkwInsufficientPerms: 'Insufficient permissions',
  tkwReconnect: 'Would you like to reconnect your TikTok account?',
  tkwSyncError: 'Error syncing TikTok',
  tkwViews: 'views',
  tkwLikes: 'likes',

  // === Connection Modals ===
  connWhyConnect: 'Why connect',
  connDirectPublish: '<strong>Direct publish</strong> in one click',
  connImagesVideos: '<strong>Images and videos</strong> supported',
  connSmartDrafts: '<strong>Smart drafts</strong>',
  connTimeSaving: '<strong>Time saving</strong> no more copy-paste',
  connWhatYouNeed: 'What you need',
  connAuthorizeKeiro: 'Authorize Keiro',
  connThatsAll: "That's it!",
  connPublishOnProfile: 'Publish directly to your profile',

  // === LinkedInConnectionModal ===
  lcmTitle: 'Connect LinkedIn',
  lcmLinkedInAccount: 'A LinkedIn account',
  lcmConnectBtn: 'Connect with LinkedIn',
  lcmSecure: 'Secure connection via OAuth 2.0',
  lcmNoPassword: 'Keiro never stores your password',
  lcmDisconnect: 'Disconnect at any time',

  // === TikTokConnectionModal ===
  ttcTitle: 'Connect TikTok',
  ttcAutoPublish: '<strong>Auto-publish</strong> your videos',
  ttcCrossPlatform: '<strong>Cross-platform</strong> Instagram + TikTok',
  ttcAnalytics: '<strong>Analytics</strong> views and engagement',
  ttcInsights: '<strong>Insights</strong> personalized tips',
  ttcTikTokAccount: 'A TikTok account',
  ttcAutoConversion: 'Your images are automatically converted to 9:16 video (5s) optimized for TikTok',
  ttcConnectBtn: 'Connect with TikTok',

  // === InstagramConnectionModal ===
  icmConnTitle: 'Connect Instagram',
  icmWhyConnect: 'Why connect Instagram?',
  icmInstagramPro: 'Instagram Pro account',
  icmFacebookPage: 'Linked Facebook Page',
  icmMetaSuite: 'Meta Business Suite',
  icmImportant: 'Important',
  icmImportantDesc: 'Your Instagram account must be professional and linked to a Facebook Page.',
  icmNeedHelp: 'Need help with the setup?',
  icmBookCall: 'Book a free call (15 min)',
  icmMetaGuide: 'Meta Business Guide',
  icmConnectBtn: 'Connect with Meta Business',

  // === LoadingSkeleton ===
  loadingText: 'Loading...',

  // === FilterBar ===
  filterAll: 'All',
  filterFavorites: 'Favorites',
  filterRecent: 'Recent',
  filterSearch: 'Search...',

  // === FolderList / FolderHeader ===
  flAllImages: 'All images',
  flNewFolder: 'New folder',
  flRename: 'Rename',
  flDeleteFolder: 'Delete folder',
  flConfirmDelete: 'Delete this folder and move images out?',

  // === ImageCard / CreationCard ===
  icPreparePost: 'Prepare post',
  icDownload: 'Download',
  icAddToFavorites: 'Add to favorites',
  icRemoveFromFavorites: 'Remove from favorites',

  // === AddContentButton ===
  acbAddContent: 'Add content',
  acbUploadImages: 'Upload images',
  acbUploadVideos: 'Upload videos',

  // === UploadZone / DropZone ===
  uzDragHere: 'Drag your files here',
  uzOr: 'or',
  uzBrowse: 'Browse',
  uzFormats: 'Images and videos supported',

  // === ImageEditModal ===
  iemTitle: 'Edit image',
  iemRestore: 'Restore original',
  iemSave: 'Save',

  // === LayoutPicker ===
  lpGrid: 'Grid',
  lpList: 'List',

  // === TikTokRequirementsInfo ===
  triTitle: 'TikTok Requirements',
  triVideoFormat: '9:16 video format required',
  triAutoConvert: 'Images will be automatically converted',

  // === InstagramPreviewCard ===
  ipcLikedBy: 'Liked by',
  ipcAndOthers: 'and others',
};

// ========================================================
// STEP 2: Inject keys into translation files
// ========================================================

function injectKeys(filePath, newKeys) {
  let content = fs.readFileSync(filePath, 'utf-8');

  // Find the closing of the library section: "  }," after library: {
  // We need to find the last key in library section and add after it
  // Strategy: find "  library: {" then find the matching closing "},"

  const libraryStart = content.indexOf('  library: {');
  if (libraryStart === -1) {
    console.error(`Could not find library section in ${filePath}`);
    return;
  }

  // Find the closing of library section - look for the pattern "  }," after library content
  // We'll find the next section start (like "  studio: {") and insert before it
  const nextSectionPattern = /\n  \},\n  studio: \{/;
  const match = content.match(nextSectionPattern);
  if (!match) {
    console.error(`Could not find end of library section in ${filePath}`);
    return;
  }

  const insertPos = content.indexOf(match[0]);

  // Build the new keys string
  let keysStr = '\n    // === Component translations (auto-generated) ===\n';
  for (const [key, value] of Object.entries(newKeys)) {
    // Escape single quotes in values
    const escapedValue = value.replace(/'/g, "\\'");
    keysStr += `    ${key}: '${escapedValue}',\n`;
  }

  // Insert before the closing of library section
  content = content.slice(0, insertPos) + keysStr + content.slice(insertPos);

  fs.writeFileSync(filePath, content, 'utf-8');
  console.log(`Injected ${Object.keys(newKeys).length} keys into ${path.basename(filePath)}`);
}

// ========================================================
// STEP 3: Run it
// ========================================================

console.log('Injecting FR keys...');
injectKeys(FR_PATH, newFrKeys);

console.log('Injecting EN keys...');
injectKeys(EN_PATH, newEnKeys);

console.log('Done! Keys injected into both translation files.');
console.log('Now you need to update the component files to use these keys.');
