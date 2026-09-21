-- Formigas (mobilizador) precisam ver/editar lideranças e coordenadores de
-- qualquer diretoria. A policy antiga de SELECT por diretoria sozinha
-- escondia lideranças quando diretoria_id da formiga era null ou diferente.

drop policy if exists lideres_select on public.lideres;
create policy lideres_select on public.lideres
  for select to authenticated
  using (
    public.is_admin()
    or public.is_mobilizador()
    or diretoria_id = public.my_diretoria_id()
  );

drop policy if exists lideres_select_mobilizador on public.lideres;
-- coberta por lideres_select (is_mobilizador)

drop policy if exists coordenadores_select on public.coordenadores;
create policy coordenadores_select on public.coordenadores
  for select to authenticated
  using (
    public.is_admin()
    or public.is_mobilizador()
    or diretoria_id = public.my_diretoria_id()
  );

drop policy if exists coordenadores_select_mobilizador on public.coordenadores;

-- Garante UPDATE de ativação para formiga em qualquer diretoria
drop policy if exists lideres_update_mobilizador on public.lideres;
create policy lideres_update_mobilizador on public.lideres
  for update to authenticated
  using (public.is_mobilizador() or public.is_admin() or public.is_diretoria())
  with check (public.is_mobilizador() or public.is_admin() or public.is_diretoria());

drop policy if exists coordenadores_update_mobilizador on public.coordenadores;
create policy coordenadores_update_mobilizador on public.coordenadores
  for update to authenticated
  using (public.is_mobilizador() or public.is_admin() or public.is_diretoria())
  with check (public.is_mobilizador() or public.is_admin() or public.is_diretoria());

notify pgrst, 'reload schema';
