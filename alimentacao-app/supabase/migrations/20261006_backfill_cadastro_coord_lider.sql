-- Preenche coordenador/lider vazios nas fichas a partir do vínculo da nerite (profiles).
-- Só altera onde o campo está vazio; não sobrescreve o que já foi informado.

-- 1) Conferir quantas ficariam preenchidas
select
  count(*) filter (
    where nullif(trim(c.coordenador), '') is null
      and n.coordenador_id is not null
  ) as fichas_sem_coord_com_vinculo_nerite,
  count(*) filter (
    where nullif(trim(c.lider), '') is null
      and n.lider_id is not null
  ) as fichas_sem_lider_com_vinculo_nerite,
  count(*) filter (
    where (nullif(trim(c.coordenador), '') is null or nullif(trim(c.lider), '') is null)
      and (n.coordenador_id is null or n.lider_id is null)
  ) as fichas_vazias_nerite_sem_vinculo
from public.cadastros c
left join public.profiles n on n.id = c.operator_id;

-- 2) Aplicar o preenchimento
update public.cadastros c
set
  coordenador = case
    when nullif(trim(c.coordenador), '') is null and coord.nome is not null then coord.nome
    else c.coordenador
  end,
  lider = case
    when nullif(trim(c.lider), '') is null and lid.nome is not null then lid.nome
    else c.lider
  end
from public.profiles n
left join public.coordenadores coord on coord.id = n.coordenador_id
left join public.lideres lid on lid.id = n.lider_id
where c.operator_id = n.id
  and (
    (nullif(trim(c.coordenador), '') is null and coord.nome is not null)
    or (nullif(trim(c.lider), '') is null and lid.nome is not null)
  );

-- 3) Nerites sem coordenador/liderança vinculados (preciso ajustar na Equipe)
select
  n.nome as nerite,
  n.email,
  n.id as nerite_id,
  n.coordenador_id,
  n.lider_id,
  count(c.id) as fichas
from public.profiles n
left join public.cadastros c on c.operator_id = n.id
where n.role = 'operador'
   or (n.extra_roles is not null and 'operador' = any (n.extra_roles))
group by n.id, n.nome, n.email, n.coordenador_id, n.lider_id
having n.coordenador_id is null or n.lider_id is null
order by fichas desc, n.nome;
