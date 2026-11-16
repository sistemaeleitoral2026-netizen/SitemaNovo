-- Acesso de usuarios "externos" aos outros sistemas (Assessoria MB, Painel do
-- Mandato, Empresas), cadastrados pelo admin na pagina /admin.
-- Rode no SQL Editor do projeto NERITES. Pode rodar de novo sem perder dados.
--
-- Nao mexe no papel (role) nem na hierarquia de ninguem que ja existe: so
-- adiciona uma coluna nova e libera 'externo' como mais um valor permitido
-- em profiles.role (quem ja tem admin/diretoria/operador/... continua igual).

do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'Este SQL e do projeto NERITES (precisa existir public.profiles). Pare aqui.';
  end if;
end $$;

alter table public.profiles
  add column if not exists acessos_externos jsonb not null default '{}'::jsonb;

comment on column public.profiles.acessos_externos is
  'Acesso extra a sistemas fora do Nerites (cadastrado em /admin). Chave = id do sistema (assessoria-mb, painel-do-mandato, mr-terceiriza), valor = "admin" ou "editor". Nao usado pelo Nerites em si.';

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in (
    'admin', 'diretoria', 'operador', 'mobilizador', 'administrativo',
    'coordenador', 'auxiliar', 'externo'
  ));
