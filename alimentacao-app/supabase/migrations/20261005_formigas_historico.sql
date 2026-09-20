-- Histórico de ações das Formigas (cada uma vê o seu; admin/diretoria vê todos)

create table if not exists public.formigas_historico (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete cascade,
  actor_email text,
  actor_nome text,
  tipo text not null check (tipo in ('eleitor', 'lideranca', 'coordenador')),
  pessoa_id uuid not null,
  pessoa_nome text not null,
  secao text not null check (secao in ('whatsapp', 'carros', 'casa', 'links', 'notas')),
  resumo text not null,
  valor_antes text,
  valor_depois text,
  diretoria_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists formigas_historico_created_idx
  on public.formigas_historico (created_at desc);

create index if not exists formigas_historico_actor_idx
  on public.formigas_historico (actor_id, created_at desc);

alter table public.formigas_historico enable row level security;

drop policy if exists formigas_historico_select on public.formigas_historico;
create policy formigas_historico_select on public.formigas_historico
  for select to authenticated
  using (
    public.is_admin()
    or public.is_diretoria()
    or actor_id = auth.uid()
  );

drop policy if exists formigas_historico_insert on public.formigas_historico;
create policy formigas_historico_insert on public.formigas_historico
  for insert to authenticated
  with check (
    actor_id = auth.uid()
    and (public.is_mobilizador() or public.is_admin() or public.is_diretoria())
  );

notify pgrst, 'reload schema';
