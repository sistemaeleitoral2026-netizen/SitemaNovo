-- EMPRESAS — o Phibo bloqueia o servidor da Vercel (HTTP 403).
-- O preview neste computador consegue falar com o Phibo.
-- Rode no SQL Editor do NERITES. Pode rodar de novo.

create or replace function public.mr_phibo_ler_refresh()
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_mr_terceriza() then
    raise exception 'Só administrador sincroniza o Phibo.';
  end if;
  return (select s.refresh_token from public.mr_phibo_sessao s where s.id = 1);
end;
$$;
revoke all on function public.mr_phibo_ler_refresh() from public, anon;
grant execute on function public.mr_phibo_ler_refresh() to authenticated;

create or replace function public.mr_phibo_marcar_ok()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_mr_terceriza() then
    raise exception 'Só administrador sincroniza o Phibo.';
  end if;
  update public.mr_phibo_sessao
    set ultimo_ok = now(), ultimo_erro = null, ultima_tentativa = now()
    where id = 1;
end;
$$;
revoke all on function public.mr_phibo_marcar_ok() from public, anon;
grant execute on function public.mr_phibo_marcar_ok() to authenticated;

drop policy if exists mr_phibo_resumo_write on public.mr_phibo_resumo;
create policy mr_phibo_resumo_write on public.mr_phibo_resumo
  for all to authenticated
  using (public.is_admin_mr_terceriza())
  with check (public.is_admin_mr_terceriza());

notify pgrst, 'reload schema';
