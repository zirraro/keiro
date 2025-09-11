-- Une seule fois: permettre de mettre à jour les brands orphelines (user_id IS NULL)
drop policy if exists "claim orphan brands" on brands;

create policy "claim orphan brands" on brands
  for update
  using (user_id is null)               -- lignes modifiables: orphelines
  with check (user_id = auth.uid());    -- après MAJ: doivent appartenir au caller

-- (Optionnel) policy d'update standard pour le propriétaire (pratique pour futurs edits)
drop policy if exists "update own brands" on brands;
create policy "update own brands" on brands
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
