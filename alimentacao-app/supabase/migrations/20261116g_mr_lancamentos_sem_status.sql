-- EMPRESAS (MR Terceriza) — rode no SQL Editor do projeto NERITES, DEPOIS do
-- 20261116f_mr_terceriza.sql. Pode rodar de novo sem problema.
--
-- Lançamento de Empresas não passa mais por aprovação/revisão nem exige
-- comprovante pra salvar — tira a coluna "status" (não é mais usada pelo
-- painel nem pela lib) de public.mr_lancamentos.

drop index if exists public.mr_lancamentos_status_idx;
alter table public.mr_lancamentos drop column if exists status;

notify pgrst, 'reload schema';
