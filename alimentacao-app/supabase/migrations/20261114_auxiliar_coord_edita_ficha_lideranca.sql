-- Auxiliar pode lançar/editar qualquer ficha das lideranças liberadas
-- (mesmo se operator_id for de outra nerite ou null).
-- Coordenador idem na própria coordenação.
-- Corrige: "Sem permissão para alterar cadastro de outra nerite".

create or replace function public.enforce_cadastro_operator()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  -- Admin, diretoria, formiga, Título, coordenador (sua coord) e auxiliar (suas lideranças)
  -- podem alterar fichas de terceiros, mas nunca trocam o operator_id (dono da ficha).
  if public.is_admin()
     or public.is_diretoria()
     or public.is_mobilizador()
     or public.titulo_pode_ferramentas()
     or (
       public.is_coordenador()
       and (
         tg_op = 'INSERT'
         or exists (
           select 1
           from public.coordenadores co
           where co.id = public.my_coordenador_id()
             and lower(btrim(coalesce(old.coordenador, ''))) = lower(btrim(co.nome))
         )
       )
     )
     or (
       public.is_auxiliar()
       and (
         tg_op = 'INSERT'
         or public.auxiliar_pode_ficha(old.id)
       )
     )
  then
    if tg_op = 'INSERT' and new.operator_id is null then
      -- Lançamento de votação pode vir com operator_id null de propósito.
      if coalesce(new.adicionado_por_auxiliar, false) = true or new.criado_por is not null then
        null;
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

notify pgrst, 'reload schema';
