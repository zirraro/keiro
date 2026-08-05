-- Compteur de générations gratuites par IP — rapatrié depuis la base Neon.
--
-- Cette table vivait sur une base Neon héritée de Vercel, seule survivance
-- d'une infrastructure abandonnée. La route échouait « ouvert » si la variable
-- d'environnement manquait : supprimer la config sans migrer aurait donc
-- silencieusement rendu les générations gratuites illimitées par IP.
create table if not exists anon_gen_log (
  ip_hash  text primary key,
  count    integer not null default 0,
  last_at  timestamptz not null default now()
);

-- @@ étape 2 — incrément atomique
-- PostgREST ne sait pas faire « insère ou incrémente » en un aller-retour.
-- Lire puis écrire depuis l'application ouvrirait une fenêtre de concurrence :
-- deux requêtes simultanées de la même IP liraient la même valeur et la limite
-- serait contournable en rafale. La fonction règle ça côté base.
create or replace function anon_gen_touch(p_ip_hash text)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into anon_gen_log (ip_hash, count, last_at)
  values (p_ip_hash, 1, now())
  on conflict (ip_hash) do update
    set count = anon_gen_log.count + 1, last_at = now()
  returning count;
$$;
