-- Scoring terrain des prospects (Léo) + socle du data moat.
--
-- ── Pourquoi des colonnes distinctes du score existant ──
--
-- `crm_prospects.score` est produit par scoreProspect() sur une échelle 0-100
-- et alimente `temperature` (hot ≥ 50 / warm ≥ 25 / cold), qui pilote déjà le
-- ciblage de Hugo et le routage de Léo. Écraser ce score changerait
-- silencieusement le comportement de deux agents en production.
--
-- Le score terrain répond à une autre question — « cette porte vaut-elle le
-- déplacement samedi ? » — sur une échelle et des classes différentes. Les deux
-- cohabitent, et la boucle d'apprentissage dira lequel prédit réellement une
-- signature. C'est précisément l'objet de l'exercice : le barème est une
-- hypothèse, pas une vérité.

-- @@ étape 1 — enrichissement Places
alter table crm_prospects
  -- Enrichissement Places manquant
  add column if not exists business_status      text,
  add column if not exists place_types          text[],
  add column if not exists last_review_date     timestamptz,
  add column if not exists lat                  double precision,
  add column if not exists lng                  double precision,
  -- Chaîne / franchise : le point de vente renvoie au siège, cas déjà vécu
  add column if not exists is_chain             boolean default false;

-- @@ étape 2 — enrichissement Instagram
alter table crm_prospects
  add column if not exists ig_status            text,
  add column if not exists ig_media_count       integer,
  add column if not exists ig_last_post_at      timestamptz,
  add column if not exists ig_days_since_post   integer,
  add column if not exists ig_enriched_at       timestamptz;

-- @@ étape 3 — scoring terrain
alter table crm_prospects
  add column if not exists score_terrain        integer,
  add column if not exists classe_terrain       text,
  add column if not exists score_details        jsonb,
  add column if not exists vision_verdict       jsonb,
  -- Boucle d'apprentissage : c'est ce qui permettra de recalibrer le barème
  add column if not exists statut_prospection   text default 'non_visite',
  add column if not exists resultat_visite      text,
  add column if not exists date_visite          timestamptz;

-- @@ étape 4 — contraintes
-- Contraintes de valeurs. On les pose en NOT VALID puis on valide : la table
-- contient déjà des lignes, et une contrainte qui échoue sur l'existant ferait
-- échouer toute la migration.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'crm_prospects_classe_terrain_check') then
    alter table crm_prospects add constraint crm_prospects_classe_terrain_check
      check (classe_terrain is null or classe_terrain in ('A','B','C')) not valid;
    alter table crm_prospects validate constraint crm_prospects_classe_terrain_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'crm_prospects_ig_status_check') then
    alter table crm_prospects add constraint crm_prospects_ig_status_check
      check (ig_status is null or ig_status in ('professional','not_found','private_or_personal','error')) not valid;
    alter table crm_prospects validate constraint crm_prospects_ig_status_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'crm_prospects_statut_prospection_check') then
    alter table crm_prospects add constraint crm_prospects_statut_prospection_check
      check (statut_prospection is null or statut_prospection in ('non_visite','visite','signe','refus','absent')) not valid;
    alter table crm_prospects validate constraint crm_prospects_statut_prospection_check;
  end if;
end $$;

-- @@ étape 5 — index
-- La tournée se prépare par classe + ville, et la boucle d'apprentissage
-- croise classe × résultat. Sans index, les deux scannent toute la table.
create index if not exists idx_crm_classe_terrain on crm_prospects (classe_terrain, ville)
  where classe_terrain is not null;
create index if not exists idx_crm_resultat_visite on crm_prospects (classe_terrain, resultat_visite)
  where resultat_visite is not null;
-- Le cache d'enrichissement Instagram (14 jours) interroge cette colonne à
-- chaque lot : sans index, chaque relance relit la table entière.
-- Le handle Instagram vit déjà dans la colonne `instagram` : on la réutilise
-- plutôt que d'ajouter un `ig_handle` qui la doublerait et divergerait.
create index if not exists idx_crm_ig_enriched on crm_prospects (ig_enriched_at)
  where instagram is not null;

-- @@ étape 6 — data moat
-- ── Le data moat, qui n'existait pas ──
--
-- lib/agents/outcome-events.ts écrit dans `outcome_events` depuis des mois.
-- La table n'a jamais été créée : la fonction est « best-effort » et avale
-- l'erreur, donc chaque écriture partait dans le vide sans le moindre signal.
-- getSectorBenchmark() retournait donc toujours null, et les benchmarks
-- sectoriels promis n'ont jamais eu la moindre donnée.
create table if not exists outcome_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid,
  org_id       uuid,
  agent        text not null,
  event_type   text not null,
  sector       text,
  platform     text,
  format       text,
  hook_family  text,
  event_context text,
  day_of_week  smallint,
  hour_of_day  smallint,
  metrics      jsonb default '{}'::jsonb,
  measured_at  text default 'submit',
  ref_id       text,
  created_at   timestamptz default now()
);

-- recordOutcome() fait un upsert sur ce quadruplet : sans l'index unique,
-- PostgREST rejette l'appel (« no unique constraint matching ») et le moat
-- resterait vide malgré la table.
create unique index if not exists idx_outcome_events_idem
  on outcome_events (user_id, event_type, ref_id, measured_at)
  where ref_id is not null;

create index if not exists idx_outcome_events_bench
  on outcome_events (sector, event_type, created_at desc);

-- @@ étape 7 — colonne oubliée au premier passage
-- `ig_followers` figurait dans la spec mais pas dans l'ALTER : la requête de
-- sélection la demandait, et PostgREST rejette la requête ENTIÈRE dès qu'une
-- colonne est inconnue. Le pipeline ne voyait donc aucun prospect, sans
-- qu'aucune erreur ne remonte — le lot ressortait simplement vide.
alter table crm_prospects add column if not exists ig_followers integer;

-- @@ étape 8 — aperçu personnalisé du prospect
-- Le visuel de démonstration envoyé en prospection : on stocke son URL pour ne
-- pas le régénérer à chaque ouverture de fiche, et parce que le lien déjà
-- envoyé à un prospect doit continuer d'afficher la même image.
alter table crm_prospects
  add column if not exists apercu_url       text,
  add column if not exists apercu_genere_le timestamptz;
