-- MR Terceiriza: garante no banco que a conta escolhida no lançamento
-- pertence à mesma empresa do lançamento.
-- Pode rodar novamente sem perder dados.

-- Normaliza valores vazios antigos para não criar uma conta sem nome.
update public.mr_lancamentos
set conta = null
where conta is not null and btrim(conta) = '';

-- Preserva lançamentos antigos: se houver uma conta usada em lançamento que
-- ainda não está no cadastro, cria o vínculo antes de aplicar a chave.
insert into public.mr_contas (empresa, nome, ordem)
select l.empresa, l.conta, 0
from public.mr_lancamentos l
where l.conta is not null
  and not exists (
    select 1
    from public.mr_contas c
    where c.empresa = l.empresa and c.nome = l.conta
  )
group by l.empresa, l.conta;

-- Remove apenas cadastros duplicados da mesma conta/empresa. Os lançamentos
-- continuam ligados pelo par empresa + nome.
delete from public.mr_contas c
using public.mr_contas duplicada
where c.empresa = duplicada.empresa
  and c.nome = duplicada.nome
  and (c.created_at, c.id) > (duplicada.created_at, duplicada.id);

create unique index if not exists mr_contas_empresa_nome_uidx
  on public.mr_contas (empresa, nome);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.mr_lancamentos'::regclass
      and conname = 'mr_lancamentos_conta_empresa_fk'
  ) then
    alter table public.mr_lancamentos
      add constraint mr_lancamentos_conta_empresa_fk
      foreign key (empresa, conta)
      references public.mr_contas (empresa, nome)
      on update cascade;
  end if;
end $$;

notify pgrst, 'reload schema';
