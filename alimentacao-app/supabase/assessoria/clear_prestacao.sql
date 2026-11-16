-- Limpa registros legados de Prestação de contas (planilha embutida antiga).
-- Rode no SQL Editor do Supabase do projeto alimentacao.

delete from public.mb_anexos
where entidade = 'prestacao';

delete from public.mb_prestacao_contas;
