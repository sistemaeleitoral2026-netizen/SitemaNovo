-- Fichas que VOTARAM nos locais pedidos + votos do TSE (Aluisio Mendes e Junior Vieira) por local.
-- Rode no SQL Editor do Supabase. Resultado 1: por local, da maior para a menor quantidade de fichas que votaram.
-- Resultado 2: o mesmo por liderança dentro de cada local.

create temporary table _secoes (
  zona text, secao text, grupo text, local text, aluisio int, junior int
) on commit drop;

insert into _secoes values
('003','0299','Santa Cruz','C.E. ESTADO DO RIO GRANDE DO NORTE',3,7),
('076','0556','CEUMA (a confirmar)','UNICEUMA - TURU(ANTIGA PITAGORAS - BLOCO A)',3,4),
('003','0330','Vila Palmeira','ANEXO DO 2 DE JULHO (ANTIGO PIO XII)',0,6),
('003','0332','Vila Palmeira','ANEXO DO 2 DE JULHO (ANTIGO PIO XII)',1,2),
('003','0298','Santa Cruz','C.E. ESTADO DO RIO GRANDE DO NORTE',2,7),
('003','0380','CEUMA (a confirmar)','UNICEUMA RENASCENÇA',3,0),
('003','0333','Vila Palmeira','ANEXO DO 2 DE JULHO (ANTIGO PIO XII)',0,3),
('003','0315','Vila Palmeira','COLÉGIO MILITAR TIRADENTES',1,3),
('003','0312','Vila Palmeira','COLÉGIO MILITAR TIRADENTES',4,4),
('003','0426','CEUMA (a confirmar)','UNICEUMA RENASCENÇA',2,3),
('003','0358','Santa Cruz','U.E.B. JOSÉ ASSUB',4,19),
('076','0597','CEUMA (a confirmar)','UNICEUMA - TURU(ANTIGA PITAGORAS - BLOCO A)',0,2),
('003','0248','Vila Palmeira','COLÉGIO MILITAR 2 DE JULHO - BOMBEIROS',0,8),
('003','0367','Santa Cruz','C.E. ESTADO DO RIO GRANDE DO NORTE',2,16),
('003','0558','Santa Cruz','U.E.B. JOSÉ ASSUB',0,10),
('003','0447','CEUMA (a confirmar)','UNICEUMA RENASCENÇA',6,5),
('003','0423','CEUMA (a confirmar)','UNICEUMA RENASCENÇA',3,5),
('003','0424','CEUMA (a confirmar)','UNICEUMA RENASCENÇA',3,1),
('003','0331','Vila Palmeira','ANEXO DO 2 DE JULHO (ANTIGO PIO XII)',2,3),
('003','0245','Vila Palmeira','COLÉGIO MILITAR 2 DE JULHO - BOMBEIROS',1,4),
('003','0336','Vila Palmeira','COLÉGIO MILITAR TIRADENTES',5,7),
('003','0430','CEUMA (a confirmar)','UNICEUMA RENASCENÇA',2,1),
('003','0559','Santa Cruz','C.E. ESTADO DO RIO GRANDE DO NORTE',1,12),
('003','0385','CEUMA (a confirmar)','UNICEUMA RENASCENÇA',4,4),
('003','0422','CEUMA (a confirmar)','UNICEUMA RENASCENÇA',2,1),
('076','0554','CEUMA (a confirmar)','UNICEUMA - TURU(ANTIGA PITAGORAS - BLOCO A)',4,0),
('003','0300','Santa Cruz','C.E. ESTADO DO RIO GRANDE DO NORTE',4,11),
('003','0428','CEUMA (a confirmar)','UNICEUMA RENASCENÇA',1,2),
('003','0320','Vila Palmeira','COLÉGIO MILITAR TIRADENTES',0,2),
('003','0243','Vila Palmeira','COLÉGIO MILITAR 2 DE JULHO - BOMBEIROS',3,4),
('003','0379','CEUMA (a confirmar)','UNICEUMA RENASCENÇA',2,4),
('003','0325','Vila Palmeira','ANEXO DO 2 DE JULHO (ANTIGO PIO XII)',2,8),
('003','0382','CEUMA (a confirmar)','UNICEUMA RENASCENÇA',5,1),
('003','0334','Vila Palmeira','COLÉGIO MILITAR TIRADENTES',2,7),
('003','0323','Vila Palmeira','COLÉGIO MILITAR TIRADENTES',2,5),
('003','0313','Vila Palmeira','COLÉGIO MILITAR TIRADENTES',3,2),
('003','0429','CEUMA (a confirmar)','UNICEUMA RENASCENÇA',0,3),
('076','0553','CEUMA (a confirmar)','UNICEUMA - TURU(ANTIGA PITAGORAS - BLOCO A)',2,2),
('003','0446','CEUMA (a confirmar)','UNICEUMA RENASCENÇA',8,5),
('076','0628','CEUMA (a confirmar)','UNICEUMA - TURU(ANTIGA PITAGORAS - BLOCO A)',2,4),
('003','0369','Santa Cruz','C.E. ESTADO DO RIO GRANDE DO NORTE',2,18),
('003','0388','CEUMA (a confirmar)','UNICEUMA RENASCENÇA',3,1),
('003','0319','Vila Palmeira','COLÉGIO MILITAR TIRADENTES',1,4),
('003','0551','CEUMA (a confirmar)','UNICEUMA RENASCENÇA',5,1),
('003','0321','Vila Palmeira','COLÉGIO MILITAR TIRADENTES',2,5),
('003','0317','Vila Palmeira','COLÉGIO MILITAR TIRADENTES',4,5),
('003','0244','Vila Palmeira','COLÉGIO MILITAR 2 DE JULHO - BOMBEIROS',0,3),
('003','0241','Vila Palmeira','COLÉGIO MILITAR 2 DE JULHO - BOMBEIROS',1,5),
('003','0562','CEUMA (a confirmar)','UNICEUMA RENASCENÇA',2,3),
('003','0314','Vila Palmeira','COLÉGIO MILITAR TIRADENTES',2,7),
('076','0644','CEUMA (a confirmar)','UNICEUMA - TURU(ANTIGA PITAGORAS - BLOCO A)',1,2),
('003','0327','Vila Palmeira','ANEXO DO 2 DE JULHO (ANTIGO PIO XII)',1,8),
('076','0607','CEUMA (a confirmar)','UNICEUMA - TURU(ANTIGA PITAGORAS - BLOCO A)',1,5),
('003','0445','CEUMA (a confirmar)','UNICEUMA RENASCENÇA',3,4),
('003','0386','CEUMA (a confirmar)','UNICEUMA RENASCENÇA',3,4),
('003','0296','Santa Cruz','C.E. ESTADO DO RIO GRANDE DO NORTE',4,10),
('003','0448','CEUMA (a confirmar)','UNICEUMA RENASCENÇA',4,1),
('003','0387','CEUMA (a confirmar)','UNICEUMA RENASCENÇA',3,5),
('003','0383','CEUMA (a confirmar)','UNICEUMA RENASCENÇA',7,1),
('076','0616','CEUMA (a confirmar)','UNICEUMA - TURU(ANTIGA PITAGORAS - BLOCO A)',1,5),
('003','0425','CEUMA (a confirmar)','UNICEUMA RENASCENÇA',2,1),
('003','0328','Vila Palmeira','ANEXO DO 2 DE JULHO (ANTIGO PIO XII)',1,2),
('003','0297','Santa Cruz','C.E. ESTADO DO RIO GRANDE DO NORTE',0,6),
('003','0356','Santa Cruz','U.E.B. JOSÉ ASSUB',2,17),
('003','0250','Vila Palmeira','COLÉGIO MILITAR 2 DE JULHO - BOMBEIROS',1,2),
('003','0329','Vila Palmeira','ANEXO DO 2 DE JULHO (ANTIGO PIO XII)',4,7),
('076','0601','CEUMA (a confirmar)','UNICEUMA - TURU(ANTIGA PITAGORAS - BLOCO A)',0,4),
('003','0322','Vila Palmeira','COLÉGIO MILITAR TIRADENTES',0,4),
('003','0247','Vila Palmeira','COLÉGIO MILITAR 2 DE JULHO - BOMBEIROS',1,4),
('003','0371','Santa Cruz','C.E. ESTADO DO RIO GRANDE DO NORTE',2,16),
('003','0303','Santa Cruz','C.E. ESTADO DO RIO GRANDE DO NORTE',2,8),
('076','0612','CEUMA (a confirmar)','UNICEUMA - TURU(ANTIGA PITAGORAS - BLOCO A)',1,2),
('003','0242','Vila Palmeira','COLÉGIO MILITAR 2 DE JULHO - BOMBEIROS',2,3),
('003','0372','Santa Cruz','C.E. ESTADO DO RIO GRANDE DO NORTE',3,15),
('003','0557','CEUMA (a confirmar)','UNICEUMA RENASCENÇA',7,1),
('003','0377','CEUMA (a confirmar)','UNICEUMA RENASCENÇA',3,2),
('076','0639','CEUMA (a confirmar)','UNICEUMA - TURU(ANTIGA PITAGORAS - BLOCO A)',1,0),
('003','0335','Vila Palmeira','COLÉGIO MILITAR TIRADENTES',3,9),
('076','0667','CEUMA (a confirmar)','UNICEUMA - TURU VT',6,1),
('003','0316','Vila Palmeira','COLÉGIO MILITAR TIRADENTES',0,5),
('076','0625','CEUMA (a confirmar)','UNICEUMA - TURU(ANTIGA PITAGORAS - BLOCO A)',2,0),
('003','0384','CEUMA (a confirmar)','UNICEUMA RENASCENÇA',3,3),
('003','0318','Vila Palmeira','COLÉGIO MILITAR TIRADENTES',0,4),
('003','0554','CEUMA (a confirmar)','UNICEUMA RENASCENÇA',0,4),
('003','0326','Vila Palmeira','ANEXO DO 2 DE JULHO (ANTIGO PIO XII)',1,5),
('003','0381','CEUMA (a confirmar)','UNICEUMA RENASCENÇA',2,4),
('003','0368','Santa Cruz','C.E. ESTADO DO RIO GRANDE DO NORTE',0,18),
('003','0357','Santa Cruz','U.E.B. JOSÉ ASSUB',1,21),
('003','0324','Vila Palmeira','ANEXO DO 2 DE JULHO (ANTIGO PIO XII)',1,2),
('003','0302','Santa Cruz','C.E. ESTADO DO RIO GRANDE DO NORTE',2,12),
('076','0634','CEUMA (a confirmar)','UNICEUMA - TURU(ANTIGA PITAGORAS - BLOCO A)',5,5),
('003','0427','CEUMA (a confirmar)','UNICEUMA RENASCENÇA',0,3),
('003','0370','Santa Cruz','C.E. ESTADO DO RIO GRANDE DO NORTE',1,12),
('003','0378','CEUMA (a confirmar)','UNICEUMA RENASCENÇA',4,1),
('003','0249','Vila Palmeira','COLÉGIO MILITAR 2 DE JULHO - BOMBEIROS',1,5),
('003','0240','Vila Palmeira','COLÉGIO MILITAR 2 DE JULHO - BOMBEIROS',2,9),
('076','0555','CEUMA (a confirmar)','UNICEUMA - TURU(ANTIGA PITAGORAS - BLOCO A)',2,4),
('003','0359','Santa Cruz','U.E.B. JOSÉ ASSUB',0,17),
('003','0246','Vila Palmeira','COLÉGIO MILITAR 2 DE JULHO - BOMBEIROS',3,4),
('003','0301','Santa Cruz','C.E. ESTADO DO RIO GRANDE DO NORTE',4,4);

create temporary table _votou on commit drop as
select
  lpad(regexp_replace(coalesce(c.zona,''),'\D','','g'),3,'0') as zona,
  lpad(regexp_replace(coalesce(c.secao,''),'\D','','g'),4,'0') as secao,
  c.lider, c.coordenador
from cadastros c
where c.votou = true;

-- 1) Por local
select
  s.grupo, s.local,
  count(distinct s.zona||'|'||s.secao) as secoes,
  (select count(*) from _votou v join _secoes s2 on s2.zona=v.zona and s2.secao=v.secao where s2.local=s.local) as fichas_votou,
  sum(s.aluisio) as votos_aluisio_mendes,
  sum(s.junior)  as votos_junior_vieira
from _secoes s
group by s.grupo, s.local
order by fichas_votou desc, votos_aluisio_mendes desc;

-- 2) Por local e liderança
select s.local, coalesce(nullif(trim(v.lider),''),'Sem liderança') as lideranca,
       coalesce(nullif(trim(v.coordenador),''),'Sem coordenação') as coordenacao,
       count(*) as fichas_votou
from _votou v join _secoes s on s.zona=v.zona and s.secao=v.secao
group by 1,2,3
order by s.local, fichas_votou desc;
