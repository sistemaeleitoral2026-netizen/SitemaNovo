-- Auxiliar / coordenador / diretoria / admin podem adicionar ficha no Lançar.

alter table public.cadastros
  add column if not exists adicionado_por_auxiliar boolean not null default false;

alter table public.cadastros
  add column if not exists criado_por uuid references public.profiles (id) on delete set null;

create index if not exists cadastros_adicionado_por_auxiliar_idx
  on public.cadastros (adicionado_por_auxiliar)
  where adicionado_por_auxiliar = true;

create index if not exists cadastros_criado_por_idx
  on public.cadastros (criado_por)
  where criado_por is not null;

drop policy if exists cadastros_insert_auxiliar on public.cadastros;
create policy cadastros_insert_auxiliar on public.cadastros
  for insert to authenticated
  with check (
    public.is_auxiliar()
    and adicionado_por_auxiliar = true
    and criado_por = auth.uid()
    and exists (
      select 1
      from public.auxiliar_lideres al
      join public.lideres l on l.id = al.lider_id
      where al.auxiliar_id = auth.uid()
        and lower(btrim(cadastros.lider)) = lower(btrim(l.nome))
    )
    and exists (
      select 1
      from public.coordenadores co
      where co.id = public.my_coordenador_id()
        and lower(btrim(cadastros.coordenador)) = lower(btrim(co.nome))
    )
  );

drop policy if exists cadastros_insert_coordenador_votacao on public.cadastros;
create policy cadastros_insert_coordenador_votacao on public.cadastros
  for insert to authenticated
  with check (
    public.is_coordenador()
    and criado_por = auth.uid()
    and adicionado_por_auxiliar = false
    and exists (
      select 1
      from public.coordenadores co
      where co.id = public.my_coordenador_id()
        and lower(btrim(cadastros.coordenador)) = lower(btrim(co.nome))
    )
  );

drop policy if exists cadastros_insert_staff_votacao on public.cadastros;
create policy cadastros_insert_staff_votacao on public.cadastros
  for insert to authenticated
  with check (
    (public.is_admin() or public.is_diretoria())
    and criado_por = auth.uid()
    and adicionado_por_auxiliar = false
    and btrim(coalesce(cadastros.coordenador, '')) <> ''
    and btrim(coalesce(cadastros.lider, '')) <> ''
  );

notify pgrst, 'reload schema';
