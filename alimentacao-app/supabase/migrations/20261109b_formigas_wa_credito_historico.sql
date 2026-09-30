-- Aianka lê histórico (para crédito WA na visão) + backfill de formigas_wa_by nulo.

create or replace function public.is_formigas_whatsapp_chefe()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.ativo = true
      and lower(trim(coalesce(p.email, ''))) = 'aiankacecilia01@gmail.com'
  );
$$;

drop policy if exists formigas_historico_select on public.formigas_historico;
create policy formigas_historico_select on public.formigas_historico
  for select to authenticated
  using (
    public.is_admin()
    or public.is_diretoria()
    or public.is_mobilizador()
    or public.is_formigas_whatsapp_chefe()
    or actor_id = auth.uid()
  );

-- Backfill: quem lançou WA primeiro no histórico vira dono se ainda estiver null
do $$
declare
  t text;
begin
  foreach t in array array['cadastros', 'lideres', 'coordenadores']
  loop
    execute format($sql$
      update public.%I p
      set formigas_wa_by = h.actor_id
      from (
        select distinct on (pessoa_id)
          pessoa_id, actor_id
        from public.formigas_historico
        where tipo = %L
          and secao = 'whatsapp'
        order by pessoa_id, created_at asc
      ) h
      where p.id = h.pessoa_id
        and p.formigas_wa_by is null
        and p.ativacao_em is not null
        and coalesce(p.contato_whatsapp_status, 'nao') in ('sim', 'sem')
    $sql$, t, case t
      when 'cadastros' then 'eleitor'
      when 'lideres' then 'lideranca'
      else 'coordenador'
    end);
  end loop;
end $$;

notify pgrst, 'reload schema';
