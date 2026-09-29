-- Aianka (chefe WhatsApp) e administrativo também leem nomes das formigas.

create or replace function public.formigas_nomes(p_ids uuid[])
returns table (id uuid, nome text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, coalesce(nullif(btrim(p.nome), ''), 'Formiga')
  from public.profiles p
  where p.id = any (coalesce(p_ids, array[]::uuid[]))
    and auth.uid() is not null
    and (
      public.is_mobilizador()
      or public.is_admin()
      or public.is_diretoria()
      or public.is_administrativo()
      or (
        exists (
          select 1
          from public.profiles me
          where me.id = auth.uid()
            and lower(trim(coalesce(me.email, ''))) = 'aiankacecilia01@gmail.com'
        )
      )
    );
$$;

revoke all on function public.formigas_nomes(uuid[]) from public;
grant execute on function public.formigas_nomes(uuid[]) to authenticated;

notify pgrst, 'reload schema';
