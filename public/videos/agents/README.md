# Vidéos de démonstration des agents

Filmées en **capture d'écran, sans son** (comme les vidéos de review Meta).
Tout doit se comprendre à l'image : cartons de texte plein écran entre les
séquences, curseur agrandi, zoom sur chaque clic important, et jamais plus de
4 secondes sans qu'il se passe quelque chose à l'écran.

## Comment publier une vidéo

1. Déposer le fichier ici, par exemple `content.mp4`.
2. Renseigner `src` dans `lib/marketing/agent-videos.ts` :
   `content: { src: '/videos/agents/content.mp4', ... }`
3. C'est tout. Tant que `src` est vide, l'emplacement n'apparaît pas sur
   l'accueil et Clara ne propose pas la vidéo — aucun lecteur cassé, aucune
   promesse de lien inexistant.

Format conseillé : MP4 H.264, 1280×720, moins de 8 Mo pour les formats courts.
Une image fixe (`poster`) est facultative mais améliore l'affichage avant
lecture.

## Ce qu'il reste à tourner

| Fichier attendu | Agent | Durée | Ce que la vidéo montre |
|---|---|---|---|
| `parcours.mp4` | parcours complet | 2 min 30 | De l'inscription au premier post publié, pour une boutique |
| `content.mp4` | Léna | 40 s | Dépôt de 3 photos → posts publiables et programmés |
| `email.mp4` | Hugo | 40 s | Boîte à 200 pubs → vidée, rangée, réponses préparées |
| `gmaps.mp4` | Théo | 30 s | Un avis Google arrive → réponse dans le ton + fiche complétée |
| `dm_instagram.mp4` | Jade | 30 s | DM et commentaires traités, comptes à suivre repérés |
| `rh.mp4` | Sara | 30 s | Clic sur « CDD » → contrat à la marque, prêt à signer |
| `comptable.mp4` | Louis | 30 s | Prévisionnel Excel + dossier prêt pour la banque |
| `commercial.mp4` | Léo | 30 s | CRM rempli de prospects qualifiés dans la zone |
| `whatsapp.mp4` | Stella | 30 s | Confirmation de RDV + rappel de la veille |

## Prérequis pour que la démo soit crédible

Le parcours complet suppose un compte de démonstration réel : une vraie fiche
Google Business avec de vrais avis, et 5 à 6 photos du lieu. Sans ça la démo
sonne faux et ne convertit pas.
