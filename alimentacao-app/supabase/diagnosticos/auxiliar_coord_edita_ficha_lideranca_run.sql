-- Rode no SQL Editor do Supabase (obrigatório para o Lançar do auxiliar funcionar).
-- Corrige: "Sem permissão para alterar cadastro de outra nerite".
--
-- Importante:
-- 1) Push no GitHub NÃO aplica SQL no banco — precisa rodar este arquivo.
-- 2) O trigger não revalida liderança; a RLS (auxiliar_pode_ficha) é quem limita o acesso.
-- 3) Se rodar ferramentas_titulo_edicao_livre_run.sql depois, rode ESTE de novo.

-- Amplia quem o auxiliar pode atualizar: liderança liberada + coordenação do login.
create or replace function public.auxiliar_pode_ficha(p_cadastro_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.cadastros c
    join public.auxiliar_lideres al on al.auxiliar_id = auth.uid()
    join public.lideres l on l.id = al.lider_id
    left join public.coordenadores co on co.id = public.my_coordenador_id()
    where c.id = p_cadastro_id
      and lower(btrim(c.lider)) = lower(btrim(l.nome))
      and (
        co.id is null
        or lower(btrim(coalesce(c.coordenador, ''))) = lower(btrim(co.nome))
      )
      and (
        c.diretoria_id is null
        or c.diretoria_id = l.diretoria_id
        or c.diretoria_id = public.my_diretoria_id()
        or c.diretoria_id = co.diretoria_id
      )
  );
$$;

-- Trigger: auxiliar/coordenador/admin/diretoria/formiga/título podem alterar
-- fichas de terceiros, mas NUNCA trocam o operator_id (dono nerite).
create or replace function public.enforce_cadastro_operator()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean := false;
begin
  if auth.uid() is null then
    return new;
  end if;

  -- Auxiliar: a RLS já garante que só mexe em fichas liberadas.
  if public.is_auxiliar() then
    v_ok := true;
  elsif public.is_coordenador() then
    v_ok := true;
  elsif public.is_admin() or public.is_diretoria() then
    v_ok := true;
  else
    begin
      v_ok := public.is_mobilizador();
    exception when undefined_function then
      v_ok := false;
    end;
    if not v_ok then
      begin
        v_ok := public.titulo_pode_ferramentas();
      exception when undefined_function then
        v_ok := false;
      end;
    end if;
  end if;

  if v_ok then
    if tg_op = 'INSERT' and new.operator_id is null then
      if coalesce(new.adicionado_por_auxiliar, false) = true or new.criado_por is not null then
        null; -- lançamento de votação: deixa operator_id null
      else
        new.operator_id := auth.uid();
      end if;
    elsif tg_op = 'UPDATE' then
      new.operator_id := old.operator_id;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.operator_id := auth.uid();
  elsif tg_op = 'UPDATE' then
    if old.operator_id is distinct from auth.uid() then
      raise exception 'Sem permissão para alterar cadastro de outra nerite';
    end if;
    new.operator_id := old.operator_id;
  end if;
  return new;
end;
$$;

-- Garante policy de update do auxiliar (idempotente).
drop policy if exists cadastros_update_auxiliar on public.cadastros;
create policy cadastros_update_auxiliar on public.cadastros
  for update to authenticated
  using (public.is_auxiliar() and public.auxiliar_pode_ficha(id))
  with check (public.is_auxiliar() and public.auxiliar_pode_ficha(id));

notify pgrst, 'reload schema';
