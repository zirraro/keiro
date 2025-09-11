-- S'assurer qu'il n'existe plus de NULL (sécurité)
delete from brands where user_id is null;

-- user_id obligatoire désormais
alter table brands alter column user_id set not null;
