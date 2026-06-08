-- Typed client directives — orders parsed from chat (or wizard) and
-- categorised by canonical intent type so the agent route can act on
-- them concretely instead of dumping raw text into the prompt.
-- Founder ask 2026-06-08.
create table if not exists public.client_directives_typed (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  agent_id    text not null,
  type        text not null,
  value       jsonb not null default '{}'::jsonb,
  raw_text    text not null,
  confidence  numeric(3,2) not null default 0.7,
  source      text not null default 'chat',
  expires_at  timestamptz null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, agent_id, type)
);

create index if not exists idx_cdt_user_agent on public.client_directives_typed(user_id, agent_id);

alter table public.client_directives_typed enable row level security;

drop policy if exists "cdt_own_rw" on public.client_directives_typed;
create policy "cdt_own_rw" on public.client_directives_typed
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
