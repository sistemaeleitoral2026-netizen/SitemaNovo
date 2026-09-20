-- Formigas (mobilizador) e diretoria precisam atualizar fichas de outras nerites
-- no fluxo "Registro — Formigas". A RLS já permite; o trigger enforce_cadastro_operator
-- ainda bloqueava com "Sem permissão para alterar cadastro de outra nerite".

create or replace function public.enforce_cadastro_operator()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- service role / jobs sem JWT: não sobrescrever operator_id
  if auth.uid() is null then
    return new;
  end if;

  -- Admin, diretoria e formiga podem alterar fichas de terceiros,
  -- mas nunca trocam o operator_id (dono da ficha).
  if public.is_admin() or public.is_diretoria() or public.is_mobilizador() then
    if tg_op = 'INSERT' and new.operator_id is null then
      new.operator_id := auth.uid();
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

notify pgrst, 'reload schema';
