-- Diagnóstico rápido + merge que funciona mesmo se a liderança
-- não estiver cadastrada nessa diretoria (só existia o texto nas fichas).

-- 1) O que tem em lideres (qualquer diretoria)
select id, nome, ativo, diretoria_id, coordenador_id, created_at
from public.lideres
where upper(btrim(nome)) in ('THASSIA', 'THASILLA')
   or nome ~* 'thasill|thassia'
order by nome, created_at;

-- 2) Coordenador MIRANDA nessa diretoria
select id, nome, diretoria_id, ativo
from public.coordenadores
where diretoria_id = '4383407d-1321-4880-bb49-fab84c620cbc'
  and upper(btrim(nome)) = 'MIRANDA';
