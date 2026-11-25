-- Controle Financeiro Pessoal: banco de cada conta (logo e cores do cartão na tela Contas).
-- Projeto NERITES. Pode rodar mais de uma vez.
-- Valores: caixa, bb, inter, nubank, bradesco, outro (vazio = deduzido do nome da conta).
alter table public.fp_contas add column if not exists banco text;
