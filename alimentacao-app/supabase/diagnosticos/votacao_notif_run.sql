-- Notificações leves: auxiliar lançou VOTOU → admin/diretoria veem no header.
-- Rode no SQL Editor do Supabase.

alter table public.profiles
  add column if not exists votacao_notif_visto_em timestamptz;

create table if not exists public.votacao_notif (
  id uuid primary key default gen_random_uuid(),
  cadastro_id uuid not null references public.cadastros(id) on delete cascade,
  auxiliar_id uuid not null references public.profiles(id) on delete cascade,
  auxiliar_nome text not null default '',
  eleitor_nome text not null default '',
  lider text not null default '',
  coordenador text not null default '',
  votou boolean not null default true,
  diretoria_id uuid null,
  created_at timestamptz not null default now()
);

create index if not exists votacao_notif_created_idx
  on public.votacao_notif (created_at desc);

create index if not exists votacao_notif_dir_created_idx
  on public.votacao_notif (diretoria_id, created_at desc);

alter table public.votacao_notif enable row level security;

drop policy if exists votacao_notif_select on public.votacao_notif;
create policy votacao_notif_select
  on public.votacao_notif for select to authenticated
  using (
    public.is_admin()
    or (
      public.is_diretoria()
      and votacao_notif.diretoria_id = auth.uid()
    )
  );

drop policy if exists votacao_notif_insert on public.votacao_notif;
create policy votacao_notif_insert
  on public.votacao_notif for insert to authenticated
  with check (
    auxiliar_id = auth.uid()
    and public.is_auxiliar()
    and votou is true
  );

-- Auxiliar/admin não precisam update/delete na tabela de notif.
drop policy if exists votacao_notif_update on public.votacao_notif;
drop policy if exists votacao_notif_delete on public.votacao_notif;

grant select, insert on public.votacao_notif to authenticated;
grant update (votacao_notif_visto_em) on public.profiles to authenticated;

notify pgrst, 'reload schema';
