-- Mobilização: adesivo de carro + postagem em rede social
alter table public.cadastros
  add column if not exists adesivou_carro boolean not null default false;

alter table public.cadastros
  add column if not exists postou_rede boolean not null default false;

create index if not exists cadastros_adesivou_carro_idx
  on public.cadastros (adesivou_carro)
  where adesivou_carro = true;

create index if not exists cadastros_postou_rede_idx
  on public.cadastros (postou_rede)
  where postou_rede = true;

comment on column public.cadastros.adesivou_carro is 'Eleitor adesivou o carro (marcado por admin/diretoria)';
comment on column public.cadastros.postou_rede is 'Eleitor postou nas redes (marcado por admin/diretoria)';

-- Diretoria pode atualizar fichas do próprio escopo (ex.: flags de mobilização)
drop policy if exists cadastros_update_diretoria on public.cadastros;
create policy cadastros_update_diretoria on public.cadastros for update using (
  public.is_diretoria() and (
    diretoria_id = auth.uid()
    or operator_id in (select id from public.profiles where diretoria_id = auth.uid())
  )
) with check (
  public.is_diretoria() and (
    diretoria_id = auth.uid()
    or operator_id in (select id from public.profiles where diretoria_id = auth.uid())
  )
);
