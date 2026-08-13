-- 2026-08-13 — Les faits que le client annonce dans un chat, partagés à tous les agents
--
-- Fondateur : « le client doit pouvoir dire dans le chat "publie sur tel plat
-- que je viens d'ajouter", ou décrire ses nouveaux horaires, une fermeture
-- exceptionnelle, un rabais, la nouvelle carte. Léna, Jade, Stella, Théo et
-- Hugo doivent tous reconnaître l'information et agir dessus. Super important
-- de partager toutes les infos des chats entre tous les agents : ça garde la
-- fraîcheur des infos et une pertinence maximum. »
--
-- Ce qui existait déjà ne couvrait pas ce besoin. `extract-directive` capture
-- des RÈGLES durables de style (« jamais de rouge », « montre des gens »).
-- Un fait est autre chose : il est daté, il périme, et il doit être connu de
-- tous en même temps. Dire « on ferme lundi » à Théo pendant que Jade répond
-- « à lundi ! » en message privé, c'est le genre de contradiction qui coûte un
-- client.
--
-- ── Pourquoi une table et pas le dossier d'entreprise ──
--
-- Le dossier décrit ce qui est STABLE : le métier, la clientèle, le ton. Un
-- fait est éphémère par nature — une fermeture d'une semaine, une promotion de
-- trois jours. Les mélanger ferait vieillir le dossier à chaque annonce et
-- personne ne saurait plus ce qui est encore vrai.

CREATE TABLE IF NOT EXISTS faits_client (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,

  -- De quoi on parle. Sert à router : Théo ne s'occupe que des horaires,
  -- Léna publie surtout sur les nouveautés et les offres.
  type text NOT NULL CHECK (type IN (
    'horaires', 'fermeture', 'nouveaute', 'offre', 'evenement', 'info'
  )),

  -- Le fait, écrit pour être relu par un agent ET par un humain.
  enonce text NOT NULL,

  -- Le détail structuré quand il y en a un (dates, prix, jours de fermeture).
  details jsonb,

  -- Validité. `valide_jusqu_au` NULL = pas de date de fin connue ; le fait
  -- reste vrai jusqu'à ce que le client dise autre chose.
  valide_du date,
  valide_jusqu_au date,

  -- D'où vient l'information : quel agent, quel message. On garde la trace
  -- parce qu'un fait erroné doit pouvoir être remonté à sa source.
  agent_source text,
  message_source text,

  -- Quand un fait en remplace un autre (nouveaux horaires annoncés deux fois),
  -- l'ancien est archivé plutôt que supprimé : on n'efface jamais ce que le
  -- client a dit, on cesse de s'en servir.
  archive_le timestamptz,
  remplace_par uuid,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- La lecture typique : « tous les faits encore valables de ce client ».
CREATE INDEX IF NOT EXISTS idx_faits_client_actifs
  ON faits_client (user_id, archive_le, valide_jusqu_au);

CREATE INDEX IF NOT EXISTS idx_faits_client_type
  ON faits_client (user_id, type);

ALTER TABLE faits_client ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "faits_client_proprietaire" ON faits_client;
CREATE POLICY "faits_client_proprietaire" ON faits_client
  FOR ALL USING (auth.uid() = user_id);
