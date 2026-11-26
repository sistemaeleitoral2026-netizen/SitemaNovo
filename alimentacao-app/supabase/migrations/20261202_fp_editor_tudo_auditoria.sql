-- CONTROLE FINANCEIRO PESSOAL — Editor faz tudo + Auditoria gravada pelo banco.
-- Rode no SQL Editor do projeto NERITES, depois dos SQLs 20261124* e 20261125*.
-- Pode rodar de novo sem perder dados.
--
-- 1) Editor (acesso extra "editor" em /admin) passa a poder tudo que o Admin
--    pode: criar/editar/excluir programações, dar baixa, dispensar, desfazer,
--    excluir qualquer lançamento e alterar a meta da reserva.
-- 2) Toda inclusão, alteração e exclusão nas tabelas fp_* é registrada em
--    fp_auditoria por gatilho no banco (não depende do navegador), com o nome,
--    o cargo e a descrição em português do que foi feito.
-- 3) Só o Admin lê a Auditoria (menu "Auditoria" no sistema).

do $$
begin
  if to_regclass('public.fp_auditoria') is null or to_regclass('public.fp_tarefas_baixas') is null then
    raise exception 'Rode alimentacao-app/supabase/migrations/20261124_financeiro_pessoal.sql antes deste. Pare aqui.';
  end if;
end $$;

-- ============ 1) EDITOR FAZ TUDO ============

drop policy if exists fp_tarefas_insert on public.fp_tarefas;
create policy fp_tarefas_insert on public.fp_tarefas
  for insert to authenticated with check (public.can_access_financeiro_pessoal());
drop policy if exists fp_tarefas_update on public.fp_tarefas;
create policy fp_tarefas_update on public.fp_tarefas
  for update to authenticated
  using (public.can_access_financeiro_pessoal())
  with check (public.can_access_financeiro_pessoal());
drop policy if exists fp_tarefas_delete on public.fp_tarefas;
create policy fp_tarefas_delete on public.fp_tarefas
  for delete to authenticated using (public.can_access_financeiro_pessoal());

drop policy if exists fp_tarefas_baixas_insert on public.fp_tarefas_baixas;
create policy fp_tarefas_baixas_insert on public.fp_tarefas_baixas
  for insert to authenticated with check (public.can_access_financeiro_pessoal());
drop policy if exists fp_tarefas_baixas_update on public.fp_tarefas_baixas;
create policy fp_tarefas_baixas_update on public.fp_tarefas_baixas
  for update to authenticated
  using (public.can_access_financeiro_pessoal())
  with check (public.can_access_financeiro_pessoal());
drop policy if exists fp_tarefas_baixas_delete on public.fp_tarefas_baixas;
create policy fp_tarefas_baixas_delete on public.fp_tarefas_baixas
  for delete to authenticated using (public.can_access_financeiro_pessoal());

drop policy if exists fp_lancamentos_delete on public.fp_lancamentos;
create policy fp_lancamentos_delete on public.fp_lancamentos
  for delete to authenticated using (public.can_access_financeiro_pessoal());

drop policy if exists fp_conferencias_conta_update on public.fp_conferencias_conta;
create policy fp_conferencias_conta_update on public.fp_conferencias_conta
  for update to authenticated
  using (public.can_access_financeiro_pessoal())
  with check (public.can_access_financeiro_pessoal());
drop policy if exists fp_investimentos_saldos_update on public.fp_investimentos_saldos;
create policy fp_investimentos_saldos_update on public.fp_investimentos_saldos
  for update to authenticated
  using (public.can_access_financeiro_pessoal())
  with check (public.can_access_financeiro_pessoal());

drop policy if exists fp_config_insert on public.fp_config;
create policy fp_config_insert on public.fp_config
  for insert to authenticated with check (public.can_access_financeiro_pessoal());
drop policy if exists fp_config_update on public.fp_config;
create policy fp_config_update on public.fp_config
  for update to authenticated
  using (public.can_access_financeiro_pessoal())
  with check (public.can_access_financeiro_pessoal());

-- ============ 2) AUDITORIA PELO BANCO ============

alter table public.fp_auditoria add column if not exists actor_cargo text;
alter table public.fp_auditoria add column if not exists descricao text;

create index if not exists fp_auditoria_actor_idx on public.fp_auditoria (actor_id, at desc);

-- Histórico só é lido pelo Admin e só é escrito pelos gatilhos abaixo.
drop policy if exists fp_auditoria_select on public.fp_auditoria;
create policy fp_auditoria_select on public.fp_auditoria
  for select to authenticated using (public.is_admin_financeiro_pessoal());
drop policy if exists fp_auditoria_insert on public.fp_auditoria;

create or replace function public.fp_audit_moeda(v numeric)
returns text language sql immutable as $$
  select case when v is null then '—' else
    'R$ ' || translate(to_char(v, 'FM999,999,999,990.00'), ',.', '.,')
  end
$$;

create or replace function public.fp_audit_cargo()
returns text language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then 'Sistema'
    when public.is_admin() then 'Admin do Nerites'
    else coalesce((
      select case p.acessos_externos ->> 'financeiro-pessoal'
        when 'admin' then 'Admin' when 'editor' then 'Editor' end
      from public.profiles p where p.id = auth.uid()
    ), 'Sem cargo')
  end
$$;

-- Valor de um campo, legível. fmt: texto | moeda | data | mes | conta | bool | hora
create or replace function public.fp_audit_valor(v jsonb, fmt text)
returns text language plpgsql stable security definer set search_path = public as $$
declare s text := v #>> '{}';
begin
  if s is null or btrim(s) = '' then return '(vazio)'; end if;
  return case fmt
    when 'moeda' then public.fp_audit_moeda(s::numeric)
    when 'data' then to_char(s::date, 'DD/MM/YYYY')
    when 'mes' then to_char(s::date, 'MM/YYYY')
    when 'hora' then left(s, 5)
    when 'bool' then case when s = 'true' then 'sim' else 'não' end
    when 'conta' then coalesce((select '“' || nome || '”' from public.fp_contas where id::text = s), '(conta removida)')
    else '“' || left(s, 80) || '”'
  end;
end
$$;

-- "valor: R$ 40,00 → R$ 50,00; data: ..." só com os campos que mudaram.
create or replace function public.fp_audit_diff(o jsonb, n jsonb, campos text[])
returns text language plpgsql stable security definer set search_path = public as $$
declare
  c text[];
  partes text[] := '{}';
begin
  foreach c slice 1 in array campos loop
    if (o -> c[1]) is distinct from (n -> c[1]) then
      partes := partes || (c[2] || ': ' || public.fp_audit_valor(o -> c[1], c[3])
                           || ' → ' || public.fp_audit_valor(n -> c[1], c[3]));
    end if;
  end loop;
  return array_to_string(partes, '; ');
end
$$;

create or replace function public.fp_auditar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  o jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  n jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  r jsonb := coalesce(n, o);
  op text := case tg_op when 'INSERT' then 'criar' when 'UPDATE' then 'editar' else 'excluir' end;
  entidade text;
  rotulo text;
  nome text;
  diff text := '';
  descricao text;
  campos text[];
  v_nome text;
  v_id uuid;
begin
  if tg_op = 'UPDATE' and (o - 'updated_at' - 'updated_by') = (n - 'updated_at' - 'updated_by') then
    return null;
  end if;

  if tg_table_name = 'fp_lancamentos' then
    entidade := 'lancamento';
    rotulo := case r ->> 'tipo' when 'receita' then 'a receita' else 'a despesa' end;
    nome := public.fp_audit_valor(r -> 'descricao', 'texto');
    campos := array[
      array['descricao', 'descrição', 'texto'], array['valor', 'valor', 'moeda'], array['data', 'data', 'data'],
      array['hora', 'hora', 'hora'], array['tipo', 'tipo', 'texto'], array['categoria', 'categoria', 'texto'],
      array['conta_id', 'conta', 'conta'], array['recebedor', 'recebedor', 'texto'],
      array['responsavel', 'responsável', 'texto'], array['observacao', 'observação', 'texto']];
    descricao := case op
      when 'criar' then format('Lançou %s %s de %s em %s (conta %s)', rotulo, nome,
        public.fp_audit_moeda((r ->> 'valor')::numeric), public.fp_audit_valor(r -> 'data', 'data'),
        public.fp_audit_valor(r -> 'conta_id', 'conta'))
      when 'excluir' then format('Excluiu %s %s de %s de %s', rotulo, nome,
        public.fp_audit_moeda((r ->> 'valor')::numeric), public.fp_audit_valor(r -> 'data', 'data'))
      else format('Editou %s %s', rotulo, nome) end;

  elsif tg_table_name = 'fp_tarefas' then
    entidade := 'tarefa';
    rotulo := case r ->> 'tipo' when 'cobranca' then 'a cobrança' when 'documentacao' then 'a pendência' else 'o pagamento' end;
    nome := public.fp_audit_valor(r -> 'titulo', 'texto');
    campos := array[
      array['titulo', 'título', 'texto'], array['valor_previsto', 'valor previsto', 'moeda'],
      array['recebedor', 'quem recebe', 'texto'], array['cobrado', 'quem paga', 'texto'],
      array['responsavel_doc', 'responsável', 'texto'], array['categoria', 'categoria', 'texto'],
      array['conta_id', 'conta', 'conta'], array['recorrencia', 'recorrência', 'texto'],
      array['a_cada_meses', 'a cada (meses)', 'texto'], array['dia_inicio', 'dia inicial', 'texto'],
      array['dia_fim', 'dia final', 'texto'], array['mes_do_ano', 'mês do ano', 'texto'],
      array['data_inicio', 'a partir de', 'data'], array['data_fim', 'vencimento', 'data'],
      array['comeca_em', 'começa em', 'mes'], array['termina_em', 'termina em', 'mes'],
      array['pausada', 'pausada', 'bool'], array['instrucoes', 'instruções', 'texto']];
    descricao := case op
      when 'criar' then format('Criou %s %s%s', rotulo, nome,
        case when r ->> 'valor_previsto' is not null
          then ' (' || public.fp_audit_moeda((r ->> 'valor_previsto')::numeric) || ')' else '' end)
      when 'excluir' then format('Excluiu %s %s', rotulo, nome)
      else format('Editou %s %s', rotulo, nome) end;

  elsif tg_table_name = 'fp_tarefas_baixas' then
    entidade := 'baixa';
    select t.titulo into v_nome from public.fp_tarefas t where t.id = (r ->> 'tarefa_id')::uuid;
    nome := coalesce('“' || v_nome || '”', '(programação excluída)');
    rotulo := to_char(to_date(r ->> 'periodo', 'YYYY-MM'), 'MM/YYYY');
    campos := array[
      array['status', 'situação', 'texto'], array['valor', 'valor', 'moeda'], array['data', 'data', 'data'],
      array['hora', 'hora', 'hora'], array['conta_id', 'conta', 'conta'], array['recebedor', 'recebedor', 'texto'],
      array['responsavel', 'responsável', 'texto'], array['observacao', 'observação', 'texto']];
    op := case when op = 'criar' then coalesce(r ->> 'status', 'paga') when op = 'excluir' then 'desfazer' else op end;
    descricao := case op
      when 'paga' then format('Deu baixa no pagamento %s de %s (%s)', nome, rotulo, public.fp_audit_moeda((r ->> 'valor')::numeric))
      when 'cobrada' then format('Registrou o recebimento da cobrança %s de %s (%s)', nome, rotulo, public.fp_audit_moeda((r ->> 'valor')::numeric))
      when 'concluida' then format('Concluiu %s (%s)', nome, rotulo)
      when 'dispensada' then format('Dispensou %s em %s', nome, rotulo)
      when 'desfazer' then format('Desfez o registro de %s de %s', nome, rotulo)
      else format('Alterou o registro de %s de %s', nome, rotulo) end;
    op := 'tarefa.' || op;

  elsif tg_table_name = 'fp_contas' then
    entidade := 'conta';
    nome := public.fp_audit_valor(r -> 'nome', 'texto');
    campos := array[
      array['nome', 'nome', 'texto'], array['tipo', 'tipo', 'texto'], array['banco', 'banco', 'texto'],
      array['saldo_inicial', 'saldo inicial', 'moeda'], array['ativo', 'ativa', 'bool']];
    descricao := case op
      when 'criar' then format('Cadastrou a conta %s (saldo inicial %s)', nome, public.fp_audit_moeda((r ->> 'saldo_inicial')::numeric))
      when 'excluir' then format('Excluiu a conta %s', nome)
      else format('Editou a conta %s', nome) end;

  elsif tg_table_name = 'fp_conferencias_conta' then
    entidade := 'conta.saldo';
    nome := public.fp_audit_valor(r -> 'conta_id', 'conta');
    campos := array[
      array['saldo', 'saldo', 'moeda'], array['data', 'data', 'data'], array['hora', 'hora', 'hora'],
      array['responsavel', 'responsável', 'texto']];
    descricao := case op
      when 'criar' then format('Informou o saldo de %s na conta %s em %s às %s', public.fp_audit_moeda((r ->> 'saldo')::numeric),
        nome, public.fp_audit_valor(r -> 'data', 'data'), public.fp_audit_valor(r -> 'hora', 'hora'))
      when 'excluir' then format('Excluiu o saldo informado de %s da conta %s (%s)', public.fp_audit_moeda((r ->> 'saldo')::numeric),
        nome, public.fp_audit_valor(r -> 'data', 'data'))
      else format('Editou o saldo informado da conta %s', nome) end;

  elsif tg_table_name = 'fp_investimentos' then
    entidade := 'investimento';
    nome := public.fp_audit_valor(r -> 'nome', 'texto');
    campos := array[
      array['nome', 'nome', 'texto'], array['tipo', 'tipo', 'texto'], array['instituicao', 'instituição', 'texto'],
      array['conta_id', 'conta', 'conta'], array['ativo', 'ativa', 'bool']];
    descricao := case op
      when 'criar' then format('Cadastrou a aplicação %s', nome)
      when 'excluir' then format('Excluiu a aplicação %s', nome)
      else format('Editou a aplicação %s', nome) end;

  elsif tg_table_name = 'fp_investimentos_saldos' then
    entidade := 'investimento.saldo';
    select i.nome into v_nome from public.fp_investimentos i where i.id = (r ->> 'investimento_id')::uuid;
    nome := coalesce('“' || v_nome || '”', '(aplicação excluída)');
    campos := array[
      array['saldo', 'saldo', 'moeda'], array['data', 'data', 'data'], array['hora', 'hora', 'hora'],
      array['responsavel', 'responsável', 'texto']];
    descricao := case op
      when 'criar' then format('Registrou o saldo de %s na aplicação %s em %s', public.fp_audit_moeda((r ->> 'saldo')::numeric),
        nome, public.fp_audit_valor(r -> 'data', 'data'))
      when 'excluir' then format('Excluiu o saldo de %s da aplicação %s (%s)', public.fp_audit_moeda((r ->> 'saldo')::numeric),
        nome, public.fp_audit_valor(r -> 'data', 'data'))
      else format('Editou o saldo da aplicação %s', nome) end;

  elsif tg_table_name = 'fp_anexos' then
    entidade := 'anexo';
    nome := public.fp_audit_valor(r -> 'nome', 'texto');
    select l.descricao into v_nome from public.fp_lancamentos l where l.id = (r ->> 'entidade_id')::uuid;
    descricao := case op
      when 'criar' then format('Anexou o comprovante %s%s', nome, coalesce(' ao lançamento “' || v_nome || '”', ''))
      when 'excluir' then format('Removeu o comprovante %s%s', nome, coalesce(' do lançamento “' || v_nome || '”', ''))
      else format('Alterou o comprovante %s', nome) end;

  elsif tg_table_name = 'fp_config' then
    entidade := 'config';
    descricao := case
      when r ->> 'chave' = 'meta_reserva' then format('Alterou a meta da reserva: %s → %s',
        public.fp_audit_moeda(nullif(o ->> 'valor', '')::numeric), public.fp_audit_moeda(nullif(n ->> 'valor', '')::numeric))
      else format('Alterou a configuração “%s”', r ->> 'chave') end;
    if tg_op = 'UPDATE' and (o -> 'valor') = (n -> 'valor') then return null; end if;
  else
    return null;
  end if;

  if tg_op = 'UPDATE' and campos is not null then
    diff := public.fp_audit_diff(o, n, campos);
    if diff = '' then return null; end if; -- só mudou ordem/controle interno
    descricao := descricao || ' — ' || diff;
  end if;

  begin
    v_id := (r ->> 'id')::uuid;
  exception when others then
    v_id := null;
  end;
  select p.nome into v_nome from public.profiles p where p.id = auth.uid();

  insert into public.fp_auditoria (actor_id, actor_nome, actor_cargo, acao, entidade, entidade_id, descricao, detalhes)
  values (
    auth.uid(),
    coalesce(v_nome, case when auth.uid() is null then 'Sistema' else 'Usuário' end),
    public.fp_audit_cargo(),
    case when op like 'tarefa.%' then op else entidade || '.' || op end,
    entidade,
    v_id,
    left(descricao, 1000),
    jsonb_build_object('descricao', left(descricao, 1000))
  );
  return null;
end
$$;

revoke all on function public.fp_auditar() from public;
revoke all on function public.fp_audit_cargo() from public;
revoke all on function public.fp_audit_valor(jsonb, text) from public;
revoke all on function public.fp_audit_diff(jsonb, jsonb, text[]) from public;

do $$
declare
  t text;
begin
  foreach t in array array[
    'fp_contas', 'fp_conferencias_conta', 'fp_tarefas', 'fp_lancamentos', 'fp_tarefas_baixas',
    'fp_investimentos', 'fp_investimentos_saldos', 'fp_anexos', 'fp_config'
  ] loop
    execute format('drop trigger if exists %I on public.%I', t || '_auditoria', t);
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.fp_auditar()',
      t || '_auditoria', t
    );
  end loop;
end $$;

notify pgrst, 'reload schema';
