-- Assessoria MB:
-- 1) Lista (nome + nivel) de quem tem acesso ao painel, pra sugerir como
--    "Responsável" nas tarefas em vez de só um catálogo livre (mb_equipe).
-- 2) Tarefa recorrente: marca um modelo que se repete todo mês.
--
-- Rode no SQL Editor do projeto NERITES, depois de 20261116_assessoria_mb.sql
-- e 20261116b_acessos_externos.sql. Pode rodar de novo sem perder dados.

do $$
begin
  if to_regclass('public.mb_tarefas') is null then
    raise exception 'Rode alimentacao-app/supabase/migrations/20261116_assessoria_mb.sql antes deste. Pare aqui.';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'acessos_externos'
  ) then
    raise exception 'Rode alimentacao-app/supabase/migrations/20261116b_acessos_externos.sql antes deste. Pare aqui.';
  end if;
end $$;

-- "Modelo" recorrente (recorrente=true) e as instâncias geradas a partir dele
-- (recorrente_origem_id aponta pro modelo). Gerar a instância do mês é feito
-- pelo app (lib/assessoriaMb.ts) ao carregar o painel.
alter table public.mb_tarefas
  add column if not exists recorrente boolean not null default false;

alter table public.mb_tarefas
  add column if not exists recorrente_origem_id uuid references public.mb_tarefas (id) on delete set null;

create index if not exists mb_tarefas_recorrente_idx
  on public.mb_tarefas (recorrente)
  where recorrente = true;

create index if not exists mb_tarefas_recorrente_origem_idx
  on public.mb_tarefas (recorrente_origem_id)
  where recorrente_origem_id is not null;

-- Quem pode usar o painel (admin/diretoria do Nerites, ou acesso extra
-- cadastrado em /admin), com o nível ('admin' ou 'editor'). Não expõe e-mail
-- nem nenhum outro dado do perfil — só id/nome/nivel, pro seletor de
-- responsável dentro do painel.
create or replace function public.list_assessoria_mb_equipe()
returns table (id uuid, nome text, nivel text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.nome,
    case
      when p.role in ('admin', 'diretoria') then 'admin'
      else p.acessos_externos ->> 'assessoria-mb'
    end as nivel
  from public.profiles p
  where auth.uid() is not null
    and p.ativo = true
    and (
      p.role in ('admin', 'diretoria')
      or p.acessos_externos ? 'assessoria-mb'
    )
  order by p.nome;
$$;

revoke all on function public.list_assessoria_mb_equipe() from public;
grant execute on function public.list_assessoria_mb_equipe() to authenticated;

notify pgrst, 'reload schema';
