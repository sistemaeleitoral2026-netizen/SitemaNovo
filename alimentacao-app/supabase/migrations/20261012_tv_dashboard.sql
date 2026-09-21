-- Stats agregados para o painel de TV (sem dados pessoais)
-- Meta global persistida para a TV ler a mesma meta das Configurações

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists app_settings_select_authenticated on public.app_settings;
create policy app_settings_select_authenticated on public.app_settings
  for select to authenticated
  using (true);

drop policy if exists app_settings_upsert_admin on public.app_settings;
create policy app_settings_upsert_admin on public.app_settings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

insert into public.app_settings (key, value)
values ('meta_fichas', to_jsonb(6000))
on conflict (key) do nothing;

create or replace function public.tv_dashboard_stats()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  meta_val int;
  total_val int;
  hoje_val int;
  day_start timestamptz;
begin
  select coalesce((value #>> '{}')::int, 6000)
    into meta_val
  from public.app_settings
  where key = 'meta_fichas';

  if meta_val is null or meta_val < 1 then
    meta_val := 6000;
  end if;

  day_start := date_trunc(
    'day',
    timezone('America/Sao_Paulo', now())
  ) at time zone 'America/Sao_Paulo';

  select count(*)::int into total_val from public.cadastros;
  select count(*)::int into hoje_val
  from public.cadastros
  where created_at >= day_start;

  return json_build_object(
    'total', coalesce(total_val, 0),
    'hoje', coalesce(hoje_val, 0),
    'meta', meta_val,
    'updated_at', now()
  );
end;
$$;

revoke all on function public.tv_dashboard_stats() from public;
grant execute on function public.tv_dashboard_stats() to anon, authenticated;

notify pgrst, 'reload schema';
