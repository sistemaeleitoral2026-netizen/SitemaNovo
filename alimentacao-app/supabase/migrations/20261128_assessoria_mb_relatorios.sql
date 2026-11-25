-- Assessoria MB: módulo Relatórios (relatório geral e relatórios médicos).
--
-- Cada relatório guarda os lançamentos (rows), os documentos de origem (files,
-- só metadados; o arquivo fica no bucket mb-comprovantes em relatorios/<id>/...)
-- e o histórico de movimentações (events).
--
-- Fluxo: Rascunho -> Em análise -> Visualizado -> Aprovado
--        (Em análise / Visualizado -> Devolvido -> Em análise ...)
-- Só dá para editar em Rascunho ou Devolvido. Visto, aprovação e devolução
-- só para nível admin (can_delete_assessoria_mb). A troca de situação é feita
-- pela função mb_relatorio_acao; o banco recusa troca direta.
--
-- Rode no SQL Editor do projeto NERITES depois de 20261116c_assessoria_mb_acesso_externo.sql.
-- Pode rodar de novo sem perder dados.

begin;

do $$
begin
  if to_regprocedure('public.can_delete_assessoria_mb()') is null then
    raise exception 'Rode 20261116c_assessoria_mb_acesso_externo.sql antes deste. Pare aqui.';
  end if;
end $$;

create table if not exists public.mb_relatorios (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'general' check (kind in ('general', 'medical')),
  mode text not null default 'import' check (mode in ('import', 'manual')),
  title text not null default 'Relatório',
  competencia_inicio date,
  competencia_fim date,
  percent numeric(10, 2) not null default 25 check (percent >= 0 and percent <= 1000),
  company text not null default '',
  status text not null default 'Rascunho'
    check (status in ('Rascunho', 'Em análise', 'Visualizado', 'Aprovado', 'Devolvido')),
  rows jsonb not null default '[]'::jsonb,
  files jsonb not null default '[]'::jsonb,
  events jsonb not null default '[]'::jsonb,
  snapshot jsonb not null default '{}'::jsonb,
  -- Totais em centavos (para a lista do histórico sem abrir as linhas).
  total_centavos bigint not null default 0,
  registros integer not null default 0,
  author text not null default '',
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mb_relatorios_created_idx on public.mb_relatorios (created_at desc);
create index if not exists mb_relatorios_status_idx on public.mb_relatorios (status);

alter table public.mb_relatorios enable row level security;

drop policy if exists mb_relatorios_select on public.mb_relatorios;
create policy mb_relatorios_select on public.mb_relatorios
  for select to authenticated
  using (public.can_access_assessoria_mb());

drop policy if exists mb_relatorios_insert on public.mb_relatorios;
create policy mb_relatorios_insert on public.mb_relatorios
  for insert to authenticated
  with check (public.can_access_assessoria_mb() and status = 'Rascunho');

drop policy if exists mb_relatorios_update on public.mb_relatorios;
create policy mb_relatorios_update on public.mb_relatorios
  for update to authenticated
  using (public.can_access_assessoria_mb())
  with check (public.can_access_assessoria_mb());

drop policy if exists mb_relatorios_delete on public.mb_relatorios;
create policy mb_relatorios_delete on public.mb_relatorios
  for delete to authenticated
  using (public.can_delete_assessoria_mb());

-- Trava: relatório enviado não pode ser editado, e a situação só muda pela função.
create or replace function public.mb_relatorios_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if coalesce(current_setting('mb.relatorio_acao', true), '') = '1' then
    return new;
  end if;
  if new.status is distinct from old.status then
    raise exception 'A situação do relatório só muda pelos botões de envio, visto, aprovação ou devolução.';
  end if;
  if old.status not in ('Rascunho', 'Devolvido') then
    raise exception 'Relatório em "%" não pode ser editado. Crie uma cópia.', old.status;
  end if;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists mb_relatorios_guard on public.mb_relatorios;
create trigger mb_relatorios_guard
  before update on public.mb_relatorios
  for each row execute function public.mb_relatorios_guard();

-- Envio / visto / aprovação / devolução.
create or replace function public.mb_relatorio_acao(
  p_id uuid,
  p_acao text,
  p_nota text default '',
  p_actor text default ''
)
returns public.mb_relatorios
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.mb_relatorios;
  novo text;
  rotulo text;
  quem text := coalesce(nullif(trim(p_actor), ''), 'Usuário');
begin
  if not public.can_access_assessoria_mb() then
    raise exception 'Sem acesso à Assessoria MB.';
  end if;

  select * into r from public.mb_relatorios where id = p_id for update;
  if not found then
    raise exception 'Relatório não encontrado.';
  end if;

  if p_acao = 'submit' then
    if r.status not in ('Rascunho', 'Devolvido') then
      raise exception 'Só rascunhos ou relatórios devolvidos podem ser enviados.';
    end if;
    novo := 'Em análise'; rotulo := 'Enviado para análise';
  elsif p_acao in ('view', 'approve', 'return') then
    if not public.can_delete_assessoria_mb() then
      raise exception 'Apenas o administrador pode registrar visto, aprovar ou devolver.';
    end if;
    if p_acao = 'view' then
      if r.status <> 'Em análise' then raise exception 'O relatório não está em análise.'; end if;
      novo := 'Visualizado'; rotulo := 'Visto registrado';
    elsif p_acao = 'approve' then
      if r.status <> 'Visualizado' then raise exception 'Registre o visto antes de aprovar.'; end if;
      novo := 'Aprovado'; rotulo := 'Relatório aprovado';
    else
      if r.status not in ('Em análise', 'Visualizado') then
        raise exception 'Só relatórios em análise ou visualizados podem ser devolvidos.';
      end if;
      if coalesce(trim(p_nota), '') = '' then raise exception 'Informe o motivo da devolução.'; end if;
      novo := 'Devolvido'; rotulo := 'Devolvido para correção';
    end if;
  else
    raise exception 'Ação inválida.';
  end if;

  perform set_config('mb.relatorio_acao', '1', true);
  update public.mb_relatorios
     set status = novo,
         events = events || jsonb_build_array(jsonb_build_object(
           'action', rotulo,
           'by', quem,
           'byId', auth.uid(),
           'at', now(),
           'note', coalesce(p_nota, '')
         ))
   where id = p_id
   returning * into r;
  perform set_config('mb.relatorio_acao', '', true);

  insert into public.mb_auditoria (actor_id, actor_nome, action, detail)
  values (auth.uid(), quem, 'Relatório: ' || rotulo, r.title);

  return r;
end;
$$;

revoke all on function public.mb_relatorio_acao(uuid, text, text, text) from public;
grant execute on function public.mb_relatorio_acao(uuid, text, text, text) to authenticated;

-- Cópia salva do PDF no envio (fica gravada mesmo com o relatório travado).
create or replace function public.mb_relatorio_snapshot(p_id uuid, p_snapshot jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_access_assessoria_mb() then
    raise exception 'Sem acesso à Assessoria MB.';
  end if;
  perform set_config('mb.relatorio_acao', '1', true);
  update public.mb_relatorios set snapshot = coalesce(p_snapshot, '{}'::jsonb)
   where id = p_id and status = 'Em análise';
  perform set_config('mb.relatorio_acao', '', true);
end;
$$;

revoke all on function public.mb_relatorio_snapshot(uuid, jsonb) from public;
grant execute on function public.mb_relatorio_snapshot(uuid, jsonb) to authenticated;

-- Documentos de origem: Excel, CSV e TIFF além de PDF/imagens; até 30 MB.
update storage.buckets
   set file_size_limit = 31457280,
       allowed_mime_types = array[
         'image/jpeg', 'image/png', 'image/webp', 'image/tiff', 'application/pdf',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'application/vnd.ms-excel', 'text/csv', 'application/octet-stream'
       ]
 where id = 'mb-comprovantes';

notify pgrst, 'reload schema';

commit;
