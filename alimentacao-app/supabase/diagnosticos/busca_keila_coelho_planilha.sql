-- Ficha_Keila_Coelho.xlsx — UM único SELECT (Supabase só mostra o último resultado).
-- Bate SOMENTE por título. Os dois Leandros NÃO se misturam:
--   Vieira Costa     = 086163951171
--   Cordeiro Andrade = 064943791180
-- Rode no SQL Editor e me mande a tabela inteira.

with planilha as (
  select *
  from (values
    ('086156351171', 'Lucas de Jesus Gomes dos Santos', '27/12/2004', '98985611462', '089', '251', 'Leuda Maria Silva Gomes', 'KEILA COELHO', 'CILENE'),
    ('086163951171', 'Leandro Vieira Costa', '18/08/2005', '9885171644', '089', '306', 'Ira Francisca Alves Vieira', 'KEILA COELHO', 'CILENE'),
    ('051145151147', 'Karina Nunes Lobato', '05/10/1987', '98987758193', '089', '481', 'Maria Dilma Nunes Lobato', 'KEILA COELHO', 'CILENE'),
    ('090093301155', 'Pedro Henrique Sousa Alcantara', '20/03/2009', '98987758193', '089', '527', 'Ana Karolina Almeida Sousa', 'KEILA COELHO', 'CILENE'),
    ('064943791180', 'Leandro Cordeiro de Andrade', '21/10/1991', '98987758193', '089', '272', 'Maria de Fátima Cordeiro', 'KEILA COELHO', 'CILENE'),
    ('074124931155', 'Mayson Henrique Sousa e Sousa', '09/01/1996', '98987758193', '089', '370', 'Ana Claudia Almeida Sousa', 'KEILA COELHO', 'CILENE'),
    ('069309761104', 'Ana Karolina Almeida Souza', '13/11/1993', '98987758193', '089', '302', 'Ana Claudia Almeida Sousa', 'KEILA COELHO', 'CILENE'),
    ('009207331139', 'Elinelson José Souza Moraes', '23/08/1987', '98985290739', '089', '264', 'Naldete Souza Morais', 'KEILA COELHO', 'CILENE'),
    ('080562981112', 'Lucas Adriano Sousa Ferreira', '22/10/2000', '98991773812', '089', '496', 'Rozileide Maria Galvão Sousa', 'KEILA COELHO', 'CILENE'),
    ('086163971139', 'Kevison Daniel dos Santos Sousa', '19/01/2006', '98970187123', '089', '355', 'Ausilene Farias dos Santos', 'KEILA COELHO', 'CILENE'),
    ('081431341112', 'Adelson Silva Santos Filho', '15/02/2001', '98981715354', '089', '501', 'Rita Maria Pereira Pontes', 'KEILA COELHO', 'CILENE'),
    ('061830471104', 'Joyce Irlane Lima da Silva', '01/03/1990', '98981226136', '089', '190', 'Marlene Lima da Silva', 'KEILA COELHO', 'CILENE'),
    ('051160171104', 'Rosa Maria Pereira de Almeida', '13/09/1975', '98981305896', '089', '195', 'Maria do Carmo P. de Almeida', 'KEILA COELHO', 'CILENE'),
    ('040827381104', 'Keillyane Pinto Coelho', '20/10/1978', '98985289163', '089', '350', 'Elza Maria Serra Pinto', 'KEILA COELHO', 'CILENE'),
    ('023476041147', 'Elda Diniz Fernandes Castro', '11/08/1972', '98982153792', '089', '395', 'Maria dos Anjos Diniz Fernandes', 'KEILA COELHO', 'CILENE'),
    ('027272461112', 'José Francisco da Silva Castro', '06/02/1976', '98982153792', '089', '320', 'Raimundo da Silva Castro', 'KEILA COELHO', 'CILENE'),
    ('064307941163', 'Daniele de Jesus Pereira', '17/11/1992', '', '089', '385', 'Maria Luiza', 'KEILA COELHO', 'CILENE'),
    ('081432271155', 'Keila Conceição de Sousa', '26/12/2002', '98991773812', '089', '499', 'MáAna Claude Lima Conceição', 'KEILA COELHO', 'CILENE'),
    ('177451071163', 'Magno Nascimento Oliveira', '04/10/1968', '98989091512', '089', '251', 'Maria Heloisa Pereira', 'KEILA COELHO', 'CILENE'),
    ('031358731104', 'José de Ribamar Nunes Muniz', '27/07/1979', '98', '089', '085', 'Basilia Rosa Nunes Muniz', 'KEILA COELHO', 'CILENE')
  ) as v(
    titulo_planilha, nome_planilha, nasc_planilha, fone_planilha,
    zona_planilha, secao_planilha, mae_planilha, lider_planilha, coord_planilha
  )
)
select
  p.titulo_planilha,
  p.nome_planilha,
  c.nome_completo as nome_sistema,
  case
    when c.id is null then 'FALTA'
    when regexp_replace(upper(btrim(coalesce(c.nome_completo, ''))), '\s+', ' ', 'g')
       = regexp_replace(upper(btrim(p.nome_planilha)), '\s+', ' ', 'g') then 'NOME_OK'
    else 'NOME_DIVERGE'
  end as check_nome,
  p.nasc_planilha,
  to_char(c.data_nascimento, 'DD/MM/YYYY') as nasc_sistema,
  case
    when c.id is null then null
    when c.data_nascimento is null then 'SEM_NASC'
    when to_char(c.data_nascimento, 'DD/MM/YYYY') = p.nasc_planilha then 'NASC_OK'
    else 'NASC_DIVERGE'
  end as check_nasc,
  p.mae_planilha,
  c.nome_mae as mae_sistema,
  case
    when c.id is null then null
    when regexp_replace(upper(btrim(coalesce(c.nome_mae, ''))), '\s+', ' ', 'g')
       = regexp_replace(upper(btrim(p.mae_planilha)), '\s+', ' ', 'g') then 'MAE_OK'
    else 'MAE_DIVERGE'
  end as check_mae,
  p.zona_planilha || '/' || p.secao_planilha as zona_secao_planilha,
  coalesce(c.zona, '') || '/' || coalesce(c.secao, '') as zona_secao_sistema,
  case
    when c.id is null then null
    when lpad(regexp_replace(coalesce(c.zona, ''), '\D', '', 'g'), 3, '0') = p.zona_planilha
     and lpad(regexp_replace(coalesce(c.secao, ''), '\D', '', 'g'), 3, '0') = lpad(p.secao_planilha, 3, '0')
      then 'ZONA_OK'
    else 'ZONA_DIVERGE'
  end as check_zona,
  p.fone_planilha,
  regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g') as fone_sistema,
  coalesce(c.coordenador, '(sem)') || ' / ' || coalesce(c.lider, '(sem)') as time_sistema,
  case
    when c.id is null then 'NAO_ENTROU'
    when regexp_replace(upper(btrim(coalesce(c.lider, ''))), '\s+', ' ', 'g') = p.lider_planilha
     and regexp_replace(upper(btrim(coalesce(c.coordenador, ''))), '\s+', ' ', 'g') = p.coord_planilha
      then 'TIME_OK_KEILA_CILENE'
    else 'OUTRO_TIME'
  end as check_time,
  case
    when c.id is null then 'NAO_ENTROU'
    when regexp_replace(upper(btrim(coalesce(c.nome_completo, ''))), '\s+', ' ', 'g')
       <> regexp_replace(upper(btrim(p.nome_planilha)), '\s+', ' ', 'g') then 'TITULO_OK_MAS_NOME_DIFERENTE'
    when regexp_replace(upper(btrim(coalesce(c.lider, ''))), '\s+', ' ', 'g') <> p.lider_planilha
      or regexp_replace(upper(btrim(coalesce(c.coordenador, ''))), '\s+', ' ', 'g') <> p.coord_planilha
      then 'JA_EXISTIA_OUTRO_TIME'
    when to_char(c.data_nascimento, 'DD/MM/YYYY') is distinct from p.nasc_planilha
      or regexp_replace(upper(btrim(coalesce(c.nome_mae, ''))), '\s+', ' ', 'g')
         is distinct from regexp_replace(upper(btrim(p.mae_planilha)), '\s+', ' ', 'g')
      or lpad(regexp_replace(coalesce(c.zona, ''), '\D', '', 'g'), 3, '0') is distinct from p.zona_planilha
      or lpad(regexp_replace(coalesce(c.secao, ''), '\D', '', 'g'), 3, '0') is distinct from lpad(p.secao_planilha, 3, '0')
      then 'ENTROU_COM_DIVERGENCIA_DE_DADOS'
    else 'OK_IGUAL_PLANILHA'
  end as situacao,
  c.id as cadastro_id,
  c.created_at
from planilha p
left join public.cadastros c
  on regexp_replace(coalesce(c.titulo, ''), '\D', '', 'g') = p.titulo_planilha
order by
  case
    when c.id is null then 1
    when regexp_replace(upper(btrim(coalesce(c.nome_completo, ''))), '\s+', ' ', 'g')
       <> regexp_replace(upper(btrim(p.nome_planilha)), '\s+', ' ', 'g') then 2
    when regexp_replace(upper(btrim(coalesce(c.lider, ''))), '\s+', ' ', 'g') <> p.lider_planilha
      or regexp_replace(upper(btrim(coalesce(c.coordenador, ''))), '\s+', ' ', 'g') <> p.coord_planilha then 3
    else 4
  end,
  p.nome_planilha;
