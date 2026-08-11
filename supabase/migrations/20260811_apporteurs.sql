-- Programme apporteur d'affaires.
--
-- Décidé le 2026-08-11 après avoir chiffré les canaux d'acquisition : un
-- apporteur à 20 % pendant douze mois coûte 77 € par client, contre 100 € par
-- la publicité Meta — et sans avance de trésorerie, puisqu'il est payé sur des
-- abonnements déjà encaissés.
--
-- Ce que le programme doit garantir, et qui dicte ce schéma :
--   · la commission s'arrête après DUREE_MOIS (jamais de rente perpétuelle,
--     qui coûterait 311 € par client si on ramenait la perte mensuelle à 3 %) ;
--   · elle n'est due que pour les mois RÉELLEMENT payés par le client ;
--   · les primes de palier ne tombent que sur des clients encore actifs, seul
--     endroit où l'intérêt de l'apporteur rejoint le nôtre sur la rétention.

create extension if not exists "pgcrypto";

create table if not exists apporteurs (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  email text,
  -- Le code que l'apporteur diffuse : keiroai.com/?ref=SONCODE
  code text not null unique,
  -- Taux et durée figés À LA SIGNATURE : changer la grille plus tard ne doit
  -- pas modifier rétroactivement ce qu'on doit à quelqu'un.
  taux numeric(4,3) not null default 0.200,
  duree_mois integer not null default 12,
  actif boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists apporteur_clients (
  id uuid primary key default gen_random_uuid(),
  apporteur_id uuid not null references apporteurs(id) on delete cascade,
  user_id uuid not null,
  code_utilise text,
  signe_le timestamptz not null default now(),
  -- Un client n'appartient qu'à UN apporteur. Sans cette contrainte, deux
  -- apporteurs pourraient réclamer le même client et on paierait deux fois.
  constraint apporteur_clients_user_unique unique (user_id)
);

create index if not exists idx_apporteur_clients_apporteur on apporteur_clients(apporteur_id);

create table if not exists apporteur_commissions (
  id uuid primary key default gen_random_uuid(),
  apporteur_id uuid not null references apporteurs(id) on delete cascade,
  user_id uuid,
  -- Premier jour du mois concerné. Null pour une prime de palier.
  mois date,
  -- 'recurrent' = pourcentage sur une mensualité ; 'prime' = palier de volume.
  type text not null default 'recurrent',
  base_eur numeric(10,2) not null default 0,
  taux numeric(4,3),
  montant_eur numeric(10,2) not null,
  statut text not null default 'du',   -- du | paye | annule
  motif text,
  paye_le timestamptz,
  created_at timestamptz not null default now()
);

-- Empêche de compter deux fois la même mensualité, même si le calcul est
-- relancé : c'est la garantie qui rend le passage rejouable sans risque.
create unique index if not exists idx_apporteur_commissions_unique
  on apporteur_commissions(apporteur_id, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(mois, '1970-01-01'::date), type, coalesce(motif, ''));

create index if not exists idx_apporteur_commissions_statut on apporteur_commissions(apporteur_id, statut);

-- Tables d'administration : aucune politique, donc inaccessibles aux clients.
-- Le service role les lit et les écrit, il contourne RLS par conception.
alter table apporteurs enable row level security;
alter table apporteur_clients enable row level security;
alter table apporteur_commissions enable row level security;
