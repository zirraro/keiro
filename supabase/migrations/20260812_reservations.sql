-- Réservations : le carnet du commerçant, alimenté par tous les canaux.
--
-- Demande du fondateur, 2026-08-11 : « le CRM sert uniquement à la
-- prospection ; on doit pouvoir, si un client d'un resto réserve via DM, ou
-- WhatsApp, ou TikTok, ou email, consigner la demande, envoyer un SMS au
-- gérant, et enregistrer la résa. Ça doit être adaptatif selon le business
-- renseigné à l'onboarding, accessible dès le plan Créateur. »
--
-- ── Pourquoi une table à part du CRM ──
--
-- Le CRM suit un PROSPECT dans un cycle de vente : il a une température, un
-- statut, une séquence d'emails, et on ne le supprime jamais. Une réservation
-- est l'inverse : un ENGAGEMENT daté, qui se confirme ou s'annule, et qui
-- appartient à un client déjà acquis. Les mêler donnerait un objet qui ne
-- répond bien à aucune des deux questions.
--
-- ── Une seule table pour tous les métiers ──
--
-- Restaurant, hôtel, institut, boutique : ce qui change n'est pas la
-- structure, c'est le VOCABULAIRE et les champs utiles. On garde donc un
-- socle commun — qui, quand, combien, quel état — et un `details` libre pour
-- ce qui est propre au métier (numéro de chambre, praticien, référence
-- produit). Une table par métier aurait multiplié le code pour la même chose.

create extension if not exists "pgcrypto";

create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,

  -- Qui réserve. On n'exige rien : une demande arrivée en DM ne donne parfois
  -- qu'un pseudo, et refuser de l'enregistrer ferait perdre la réservation.
  client_nom text,
  client_telephone text,
  client_email text,

  -- D'où vient la demande. Le commerçant découvre ainsi quel canal lui amène
  -- vraiment du monde — une donnée qu'aucun cahier papier ne lui donne.
  canal text not null default 'manuel',       -- dm_instagram | whatsapp | email | tiktok | telephone | manuel | site
  -- De quoi remonter à la conversation d'origine en un clic.
  conversation_ref text,

  -- Le socle commun, quel que soit le métier.
  date_prevue date,
  heure_prevue time,
  -- Couverts au restaurant, nuits à l'hôtel, quantité en boutique.
  quantite integer,
  -- Ce qui est réservé, dans les mots du métier : « table en terrasse »,
  -- « chambre double », « coupe + couleur », « robe taille 38 ».
  objet text,

  -- Ce qui est propre au métier, sans imposer de colonnes inutiles aux autres.
  details jsonb not null default '{}'::jsonb,

  statut text not null default 'a_confirmer',  -- a_confirmer | confirmee | annulee | honoree | absent
  -- Ce que le client a écrit, mot pour mot. Le gérant tranche parfois sur une
  -- nuance que l'extraction automatique a perdue.
  demande_brute text,
  note text,

  -- Le gérant a-t-il été prévenu, et par quoi ?
  alerte_envoyee_le timestamptz,
  alerte_canal text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_reservations_user_date on reservations(user_id, date_prevue);
create index if not exists idx_reservations_statut on reservations(user_id, statut);
-- Le même client qui renvoie deux fois le même message ne crée pas deux
-- réservations : l'agent réutilise la référence de conversation.
create unique index if not exists idx_reservations_conversation
  on reservations(user_id, conversation_ref) where conversation_ref is not null;

alter table reservations enable row level security;

-- Le client ne voit et ne modifie que SES réservations. Contrairement aux
-- tables d'administration, celle-ci est lue directement depuis le navigateur.
drop policy if exists "reservations_select_own" on reservations;
create policy "reservations_select_own" on reservations
  for select using (auth.uid() = user_id);

drop policy if exists "reservations_insert_own" on reservations;
create policy "reservations_insert_own" on reservations
  for insert with check (auth.uid() = user_id);

drop policy if exists "reservations_update_own" on reservations;
create policy "reservations_update_own" on reservations
  for update using (auth.uid() = user_id);
