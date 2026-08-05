-- Enrichissement progressif des prospects : photos réelles du lieu et marqueur
-- de passage.
--
-- `photos_lieu` stocke les photos que le commerce a LUI-MÊME publiées sur sa
-- fiche Google. Une photo réelle de leur établissement personnalise infiniment
-- mieux qu'un visuel généré — on ne montre plus « un salon de coiffure », on
-- montre le leur — et elle coûte une fraction du prix.
--
-- `enrichi_le` est le garde-fou de coût le plus efficace du dispositif : il
-- garantit qu'un prospect n'est jamais repayé deux fois.
alter table crm_prospects
  add column if not exists photos_lieu text[],
  add column if not exists enrichi_le  timestamptz;

-- @@ étape 2 — index de file d'attente
-- Le cron cherche « les non-enrichis » à chaque passage : sans index, il relit
-- toute la table pour trouver quarante lignes.
create index if not exists idx_crm_a_enrichir on crm_prospects (classe_terrain)
  where enrichi_le is null;
