-- ═══════════════════════════════════════════════════════════════════════════
-- Quelle fiche Google est la sienne — parce qu'on ne peut pas la deviner
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── Ce qu'on a trouvé le 15 août 2026 ──
--
-- Le fondateur, trois fois : « la fiche établissement ne s'affiche toujours
-- pas ». Puis, la précision qui débloque tout : « la fiche que j'ai connectée,
-- c'est Le Repère de l'Autisme ».
--
-- On cherchait « KeiroAI » — le nom de son dossier d'entreprise. La fiche
-- s'appelle « Le repère de l'autisme », 14 rue Charles Delescluze à Paris.
-- Deux noms sans rapport, donc aucune recherche ne pouvait aboutir.
--
-- ── Pourquoi ce n'est pas un cas particulier ──
--
-- Le nom de l'entreprise et celui de la fiche Google diffèrent souvent, et
-- légitimement : une agence qui gère la fiche d'un client, un gérant qui a
-- plusieurs établissements, une enseigne commerciale différente de la raison
-- sociale, un compte Google personnel qui administre une fiche pro.
--
-- Deviner à partir du nom de l'entreprise marchera donc parfois, jamais
-- toujours — et quand ça se trompe, ça affiche le commerce de quelqu'un
-- d'autre. On a déjà vu la recherche « KeiroAI » rendre « Kayro.ai » puis
-- « Kiiro », deux entreprises parisiennes sans aucun lien.
--
-- ── La réponse ──
--
-- On demande. Le client choisit sa fiche une fois, on garde son identifiant
-- Places, et tout le reste en découle — affichage, avis, suivi de la note.
-- C'est la seule source fiable, et elle ne dépend pas de l'autorisation
-- Business Profile encore en attente chez Google.

alter table public.profiles
  add column if not exists google_place_id text,
  add column if not exists google_place_nom text,
  add column if not exists google_place_adresse text;

comment on column public.profiles.google_place_id is
  'Identifiant Google Places de la fiche établissement du client, choisi par lui. Deviner à partir du nom de l''entreprise affichait le commerce d''un homonyme (15 août 2026).';
