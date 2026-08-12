-- L'index d'unicité des réservations ne peut pas être PARTIEL.
--
-- Constaté à la première insertion réelle, le 2026-08-12 : l'API renvoyait
-- « enregistrement impossible » alors que la même insertion passait
-- directement en SQL.
--
-- Cause : l'upsert de PostgREST doit INFÉRER l'index à partir des colonnes
-- données dans `on_conflict`. Un index partiel — ici `where conversation_ref
-- is not null` — ne peut pas être inféré sans répéter sa clause WHERE, que
-- PostgREST ne transmet pas. L'insertion échouait donc systématiquement.
--
-- La clause était de toute façon inutile : dans un index unique Postgres, deux
-- NULL ne sont jamais considérés comme égaux. Une réservation saisie à la main,
-- sans référence de conversation, peut donc coexister avec autant d'autres
-- qu'on veut sous un index complet.

drop index if exists idx_reservations_conversation;

create unique index if not exists idx_reservations_conversation
  on reservations(user_id, conversation_ref);
