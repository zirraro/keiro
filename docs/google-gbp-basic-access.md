# Demande d'accès de base — Google Business Profile API

Rédigé le 15 août 2026. À coller dans le formulaire
`support.google.com/business/contact/api_default`, en choisissant
**« Application For Basic Access »** — pas « quota increase » : on ne peut pas
augmenter un accès qu'on n'a pas encore, et la case à cocher de ce parcours-là
demande de déclarer que le quota n'est PAS à zéro. Il l'est.

Projet : `project-d63a36f4-1c20-4446-b56` · numéro `107890397335`
APIs demandées : **Account Management** ET **Business Information**.
La première trouve l'établissement, la seconde lit et écrit horaires et
description. Sans la seconde, la fiche serait visible mais jamais modifiable.

---

## What is the primary reason for seeking access?

> KeiroAI is a French SaaS platform that manages online presence for small local
> businesses and associations — bakeries, hair salons, garages, care
> associations — who do not have the time or staff to maintain their Google
> Business Profile themselves.
>
> Our customers explicitly connect their own Google account to KeiroAI through
> the standard OAuth consent flow, and grant us access to the listings they
> already own or manage. We act only on their behalf, only on their own
> listings, and only after they have given consent. Each customer can
> disconnect at any time from their dashboard.
>
> We need the API for three operations, all on customer-owned listings:
>
> 1. **Read and reply to reviews.** Our customers receive reviews they never
>    answer, because they are working in their shop. We draft a reply in their
>    voice, the owner validates it in our interface, and we post it through the
>    API. Replies are never published without the owner's explicit approval.
>
> 2. **Keep business information accurate.** Opening hours, holiday closures,
>    description, categories. A café that changes its summer hours tells us
>    once; we update the listing so customers are not sent to a closed door.
>
> 3. **Detect and report inconsistencies.** When the phone number, address or
>    hours on the listing no longer match what the owner told us, we alert them.
>
> We do not aggregate, resell, cache for third parties, or expose any Business
> Profile data outside the account that owns it. Data is used solely to display
> and maintain that customer's own listing inside their private dashboard.
>
> Expected volume is modest: a few requests per listing per day — one read to
> refresh the listing, occasional writes when information changes or a review
> arrives. We currently manage a small number of listings and expect gradual
> growth alongside our customer base.

---

## Notes pour nous

Ce qui fait accepter ou refuser ce type de demande, d'après ce que Google
vérifie :

· **Le consentement doit être explicite et révocable** — on le dit deux fois,
  parce que c'est le point sur lequel ils refusent le plus.
· **Pas d'agrégation, pas de revente, pas d'exposition à des tiers** — dit
  noir sur blanc.
· **Un volume réaliste** — annoncer des chiffres énormes fait basculer la
  demande vers un autre parcours d'approbation, plus long.
· **Des opérations nommées** — « gérer les fiches » est trop vague ; « lire les
  avis, poster une réponse validée par le propriétaire, mettre à jour les
  horaires » est vérifiable.

Ce qu'on ne promet pas et qu'on ne doit pas écrire : de la publication
automatique sans validation. Notre mode par défaut sur ce compte est
justement `review` — tout brouillon, validation du gérant obligatoire.
