-- Preserva fichas antigas incompletas e impede novas gravações desses campos em branco.
create or replace function public.validate_cadastro_essential_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if btrim(coalesce(new.nome_completo, '')) = '' then
    raise exception 'Informe o nome completo da pessoa.';
  end if;
  if btrim(coalesce(new.coordenador, '')) = '' then
    raise exception 'Selecione o coordenador.';
  end if;
  if btrim(coalesce(new.lider, '')) = '' then
    raise exception 'Selecione a liderança.';
  end if;
  return new;
end;
$$;

create trigger trg_validate_cadastro_essential_fields_insert
  before insert on public.cadastros
  for each row execute function public.validate_cadastro_essential_fields();

create trigger trg_validate_cadastro_essential_fields_update
  before update of nome_completo, coordenador, lider on public.cadastros
  for each row execute function public.validate_cadastro_essential_fields();
