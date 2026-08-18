# Un avatar vitrine pour KeiroAI — ce que ça demande, ce que ça rapporte

Fondateur, 18 août : « un avatar réaliste peut faire plus réel, comme un
personnage quasi réel bien fait qui serait notre vitrine, notre community
manager qui communique. Avatar réel à ajouter à la stratégie, comment faire pour
l'intégrer et augmenter le niveau de nos reels. »

## La distinction qui rend l'idée possible

Le produit applique déjà une règle dure, et elle est juste : **on ne fabrique
jamais un visage IA pour un vrai dirigeant** (`client-prompts.ts`,
`content-prompt.ts`). Un faux visage présenté comme celui du patron casse la
confiance le jour où quelqu'un s'en aperçoit.

Ce que le fondateur propose n'entre pas en conflit avec cette règle, à une
condition près : le personnage appartient à **KeiroAI**, il ne se substitue à
personne. Ce n'est pas un faux commerçant, c'est notre porte-parole — la même
logique qu'une mascotte, en photoréaliste.

La ligne à ne pas franchir : ce personnage ne doit jamais apparaître dans le
contenu d'un client comme s'il était son employé. Notre vitrine, nos comptes.

## Les trois obstacles réels

**La cohérence du visage.** Un porte-parole n'a de valeur que si on le
reconnaît. Deux reels avec deux visages différents, ce n'est pas un personnage,
c'est du bruit. Or Seedream regénère à chaque appel : sans ancrage, le visage
dérive. La parade est l'image de référence (i2i) — une planche de portraits
validée une fois, réutilisée comme base à chaque génération, avec une force
faible pour laisser varier la scène sans laisser dériver les traits.

**La déclaration AIGC.** Sur TikTok, un contenu généré doit être déclaré. On l'a
appris à nos dépens en juin — et la mesure a montré que **déclarer ne coûte
aucune portée** (`reference_tiktok_aigc_strategy`). Un personnage photoréaliste
non déclaré, c'est le risque de sanction pour un gain nul.

**La vallée dérangeante.** Le fondateur a posé la règle lui-même le 15 août :
« ce qui ressemble à de l'IA est rédhibitoire ». Un visage photoréaliste qui
parle est précisément l'endroit où la génération se trahit le plus — bouche
désynchronisée, regard fixe, peau lisse. Un plan de trois secondes sur un visage
qui ne parle pas est nettement plus sûr qu'un monologue de dix secondes.

## Ce que je recommande, par ordre de risque croissant

**Étape 1 — le personnage sans parole.** Il apparaît dans les reels : il montre,
il pointe, il réagit. Aucune synchronisation labiale, donc aucun des défauts qui
trahissent. Le texte reste à l'écrit et la musique porte le son. C'est réalisable
avec ce qu'on a déjà : Seedream pour la planche de référence, Seedance pour
l'animation, i2i pour l'ancrage.

**Étape 2 — la voix off.** Le personnage est à l'image, une voix raconte, sans
que la bouche bouge en gros plan. On gagne l'oralité sans le risque de
synchronisation. ElevenLabs est déjà branché dans le produit.

**Étape 3 — le personnage qui parle.** C'est là que la synchronisation labiale
devient nécessaire, et c'est le seul point qui demande un outil qu'on n'a pas.
À n'ouvrir que si les deux premières étapes tiennent le niveau.

## Ce qu'il faut décider, et qui ne m'appartient pas

- **Qui est ce personnage** — âge, allure, énergie, ce qu'il incarne. Un
  porte-parole sans caractère ne se retient pas. C'est une décision de marque.
- **Un seul ou plusieurs** ? Un seul se mémorise mieux ; plusieurs couvrent plus
  de métiers et de publics.
- **Le nom.** Nos agents en ont un — Léna, Jade, Hugo. Le porte-parole visible
  devrait suivre la même règle, sans jamais être présenté comme humain.

## Le gain attendu, honnêtement

Un visage récurrent améliore la reconnaissance et la durée regardée : on
s'arrête plus volontiers sur quelqu'un qu'on a déjà vu. C'est documenté pour les
marques à porte-parole.

Mais je n'ai pas de mesure propre à nos comptes, et je ne vais pas inventer un
chiffre. La seule façon de savoir est de le tester sur une série de reels et de
comparer la durée regardée à celle des reels sans personnage — ce que nos
`outcome_events` savent déjà enregistrer.
