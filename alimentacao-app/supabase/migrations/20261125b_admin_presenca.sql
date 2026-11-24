-- Presença dos usuários para o painel administrativo.
-- O histórico começa após esta migration; não cria visitas retroativas.

create table if not exists public.admin_presenca (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  current_path text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_presenca_last_seen_idx
  on public.admin_presenca (last_seen_at desc);

alter table public.admin_presenca enable row level security;
grant select, insert, update on table public.admin_presenca to authenticated;

drop policy if exists admin_presenca_select on public.admin_presenca;
create policy admin_presenca_select on public.admin_presenca
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.ativo = true and p.role = 'admin'
    )
  );

drop policy if exists admin_presenca_insert on public.admin_presenca;
create policy admin_presenca_insert on public.admin_presenca
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists admin_presenca_update on public.admin_presenca;
create policy admin_presenca_update on public.admin_presenca
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

do $$
begin
  alter publication supabase_realtime add table public.admin_presenca;
exception when duplicate_object then null;
end
$$;
