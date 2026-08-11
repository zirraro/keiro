-- Mémoire de qualité partagée entre tous les agents.
--
-- Demande du fondateur, 2026-08-11 : « on veut que tous les agents aient pour
-- toutes leurs tâches un contrôle qualité, ce qui permet, si le résultat est
-- moyen, d'anticiper que ce n'est pas bon et de sortir quelque chose de
-- meilleur ; et si on a une objection client, qu'on la prenne comme un
-- contrôle qualité du niveau d'après — retenir tout ce qui a été bon et tout ce
-- qui a été mauvais, ainsi à force de clients on partage la connaissance. »
--
-- Deux tables, deux rôles distincts :
--
--   · `qualite_verdicts` — la trace de CHAQUE contrôle rendu. C'est la matière
--     brute : quel agent, quelle tâche, quelle note, quels défauts. Elle sert
--     à mesurer, et surtout à extraire ce qui revient.
--
--   · `qualite_objections` — ce qu'un CLIENT a reproché. Signal rare et
--     précieux : il dit ce qu'un juge automatique n'a pas vu. Séparé des
--     verdicts pour qu'il pèse plus lourd, et pour qu'on puisse le relire seul.
--
-- Ce qui est appris est partagé entre TOUS les clients, pas seulement celui
-- qui a subi le défaut : c'est tout l'intérêt, chaque erreur ne se paie
-- qu'une fois.

create extension if not exists "pgcrypto";

create table if not exists qualite_verdicts (
  id uuid primary key default gen_random_uuid(),
  agent text not null,
  -- La tâche précise : 'email_prospection', 'dm_reponse', 'avis_google',
  -- 'document_rh', 'whatsapp_reponse'… Un agent n'a pas le même barème selon
  -- ce qu'il produit.
  tache text not null,
  user_id uuid,
  note integer not null,
  -- Ce qui a été reproché, en clair et en français.
  defauts text[],
  -- Le contrôle a-t-il déclenché une réécriture, et a-t-elle suffi ?
  reecrit boolean not null default false,
  note_apres integer,
  bloque boolean not null default false,
  -- Un extrait court, pour comprendre un défaut sans stocker tout le contenu.
  extrait text,
  created_at timestamptz not null default now()
);

create index if not exists idx_qualite_verdicts_agent on qualite_verdicts(agent, tache, created_at desc);
create index if not exists idx_qualite_verdicts_note on qualite_verdicts(note) where note < 7;

create table if not exists qualite_objections (
  id uuid primary key default gen_random_uuid(),
  agent text not null,
  tache text,
  user_id uuid,
  -- Ce que le client a dit, dans ses mots. C'est la donnée la plus utile du
  -- système : elle nomme un défaut que personne n'avait su voir.
  objection text not null,
  -- La règle qu'on en tire, formulée pour être injectée dans un prompt.
  regle text,
  -- Une objection vaut pour tous les clients sauf si elle tient à un contexte
  -- particulier — un ton propre à un métier, par exemple.
  partagee boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_qualite_objections_agent on qualite_objections(agent, created_at desc);

alter table qualite_verdicts enable row level security;
alter table qualite_objections enable row level security;
