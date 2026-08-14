-- ═══════════════════════════════════════════════════════════════════════════
-- crm_activities : la contrainte refusait 40 des 51 types que le code écrit
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── Ce qu'on a constaté ──
--
-- Le fondateur demande le 14 août 2026 de suivre les ouvertures et les clics
-- des mails de prospection dans le rapport quotidien. En allant chercher les
-- chiffres : 467 mails envoyés sur 7 jours, et ZÉRO ouverture, ZÉRO clic dans
-- crm_activities. Depuis toujours, pas seulement cette semaine.
--
-- Pourtant le suivi fonctionne : 305 prospects portent une date d'ouverture et
-- 181 une date de clic, mises à jour le jour même. Le webhook reçoit bien les
-- événements et met bien à jour la fiche du prospect.
--
-- Ce qui échoue, c'est la ligne d'HISTORIQUE. Un INSERT dans crm_activities
-- avec type = 'email_opened' est rejeté par la base :
--
--     23514 — new row violates check constraint
--
-- Le webhook fait deux écritures. La première passe, la seconde est rejetée, et
-- comme personne ne lit le retour de l'insert, l'événement disparaît sans bruit.
--
-- ── L'ampleur ──
--
-- En testant un à un les 51 types que le code insère, 40 sont refusés :
--
--   suivi mail    email_opened · email_clicked · email_replied · email_bounced
--                 email_delivered · email_complained · email_step
--   commercial    prospect_discovered · enrichment · commercial_enrichment
--                 commercial_verification · commercial_social_enrichment
--   séquence      followup_1 · followup_2 · reactivation · initial · reply
--                 interested · neutral_reply · meeting_request · signup_converted
--   DM            dm_sent · dm_escalation · dm_handoff · client_followed
--   rétention     retention_alert · retention_message · milestone · high_usage
--                 red_alert · autonomy_upgrade · token_revoked
--   divers        action · image · note_commercial · onboarding_email
--                 comment_prepared · reply_ready_manual · generate_weekly · call
--
-- Seuls 11 passaient : autre, comment_replied, dm_after_follow_queued,
-- dm_blocked, dm_follow_queued, dm_followed, dm_instagram, email, note,
-- unsubscribe, appel. D'où un historique CRM qui ne montrait que les DM et les
-- envois, et jamais ce qu'ils avaient provoqué.
--
-- ── Pourquoi ça n'a jamais alerté ──
--
-- C'est la même famille de panne que l'allowlist sur crm_prospects.source
-- (Léo cassé pendant des semaines sans que rien ne le signale). Une contrainte
-- CHECK écrite un jour avec la liste des types de l'époque, jamais rouverte
-- ensuite, pendant que le code en ajoutait quarante. Chaque nouvel agent
-- écrivait dans le vide en croyant consigner.
--
-- La leçon tient en une phrase : une contrainte d'énumération vieillit toujours
-- plus vite que le code qu'elle garde.
--
-- ── Ce qu'on fait ──
--
-- On remplace l'énumération figée par une règle qui accepte les familles
-- préfixées (email_*, dm_*, comment_*, commercial_*, retention_*) plus la liste
-- explicite du reste. Les préfixes couvrent le cas des types CONSTRUITS à
-- l'exécution — le webhook Brevo écrit `email_${eventType}` avec le nom
-- d'événement du fournisseur, qu'aucune liste ne peut prévoir à l'avance.
--
-- On garde une contrainte plutôt que de la supprimer : elle attrape encore les
-- fautes de frappe et les types vides. Mais elle ne doit plus être une liste
-- fermée qu'il faut penser à rouvrir.
--
-- Note : l'historique perdu ne se reconstruit pas. Les compteurs de la fiche
-- prospect (email_opens_count, last_email_opened_at) ont survécu et restent la
-- mémoire longue ; les lignes d'activité repartent d'aujourd'hui.

do $$
declare
  c record;
begin
  -- On retire toute contrainte CHECK portant sur la colonne `type`, quel que
  -- soit son nom : il a changé au fil des migrations manuelles.
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where rel.relname = 'crm_activities'
      and ns.nspname = 'public'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%type%'
  loop
    execute format('alter table public.crm_activities drop constraint %I', c.conname);
    raise notice 'contrainte % retirée', c.conname;
  end loop;
end $$;

alter table public.crm_activities
  add constraint crm_activities_type_valide check (
    type is not null
    and type <> ''
    and type = lower(type)
    and length(type) <= 64
    and (
      -- Familles ouvertes : le suffixe vient du fournisseur ou du contexte.
      type ~ '^(email|dm|comment|commercial|retention|prospect|sequence)_[a-z0-9_]+$'
      -- Types simples, sans préfixe de famille.
      or type in (
        'action', 'appel', 'call', 'autre', 'note', 'image', 'email', 'reply',
        'initial', 'interested', 'enrichment', 'milestone', 'unsubscribe',
        'followup_1', 'followup_2', 'reactivation', 'neutral_reply',
        'meeting_request', 'signup_converted', 'onboarding_email',
        'autonomy_upgrade', 'client_followed', 'generate_weekly', 'high_usage',
        'red_alert', 'token_revoked', 'note_commercial', 'reply_ready_manual'
      )
    )
  );

comment on constraint crm_activities_type_valide on public.crm_activities is
  'Familles ouvertes (email_*, dm_*, …) + liste explicite. Volontairement permissive : la version fermée refusait 40 des 51 types du code et perdait tout l''historique en silence (14 août 2026).';
