# Controle Financeiro Pessoal — schema no banco Nerites

Banco: **mesmo do Sistema Nerites**
`https://uzewhebfshmhuymgungr.supabase.co`

SQL: `alimentacao-app/supabase/migrations/20261124_financeiro_pessoal.sql`

> **Situação:** as tabelas existem no banco depois de rodar o SQL, mas a tela
> (`public/sistemas/financeiro-pessoal/`) **ainda salva no navegador**
> (localStorage + IndexedDB). Ligar a tela ao banco é o próximo passo
> (ponte React ↔ iframe, igual à Assessoria MB).

## Como aplicar

1. Confirme que já rodou `20261116b_acessos_externos.sql` (coluna `profiles.acessos_externos`).
2. Abra o **SQL Editor** do projeto Nerites no Supabase.
3. Cole e rode o conteúdo de `20261124_financeiro_pessoal.sql`.
4. Confira no Table Editor as tabelas `fp_*` e, em Storage, o bucket **`fp-comprovantes`** (privado).

O script é idempotente (pode rodar de novo). Ele **aborta** se não existir
`public.cadastros` (garante que não rode no projeto Gabinete).

## Tabelas (`fp_*`)

| Tabela | Conteúdo |
|--------|----------|
| `fp_contas` | Contas bancárias (nome, tipo, saldo inicial) |
| `fp_conferencias_conta` | Saldo real informado: conta, data, hora, valor, responsável |
| `fp_lancamentos` | Receitas e despesas (data, hora, conta, recebedor, responsável, vínculo com tarefa) |
| `fp_tarefas` | Modelos de pagamento: única (data inicial/vencimento), mensal (a cada 1/2/3/6 meses) ou anual, com janela "entre o dia X e Y" |
| `fp_tarefas_baixas` | Uma linha por tarefa por mês: `paga` (aponta pro lançamento) ou `dispensada` |
| `fp_investimentos` | Aplicações |
| `fp_investimentos_saldos` | Saldo verificado de cada aplicação: data, hora, valor, responsável |
| `fp_anexos` | Metadados dos comprovantes (`storage_path` no bucket) |
| `fp_config` | Configurações (`meta_reserva` = 15000) |
| `fp_auditoria` | Registro de quem fez o quê (só inclusão) |

Regras que o banco garante sozinho:

- **Saldo da conta** = última conferência + lançamentos com data/hora depois dela
  (cálculo feito no app; o banco guarda as conferências).
- Tarefa só aceita janela válida para o tipo (ex.: mensal precisa de `dia_inicio ≤ dia_fim`).
- Uma baixa por tarefa por mês (`unique (tarefa_id, periodo)`).
- **Excluir o lançamento apaga a baixa** (tarefa volta a ficar pendente).
- Não dá para excluir conta que tem lançamentos.

## Acesso (RLS)

`can_access_financeiro_pessoal()`: **admin do Nerites** ou acesso extra cadastrado
em `/admin` (`profiles.acessos_externos ? 'financeiro-pessoal'`), igual à rota
`/financeiro-pessoal` em `App.tsx`.

| Ação | admin (Nerites ou acesso "admin") | editor |
|------|:---:|:---:|
| Ver tudo | ✓ | ✓ |
| Lançar, informar saldo de conta/investimento, anexar comprovante | ✓ | ✓ |
| Dar baixa em tarefa (`paga`) | ✓ | ✓ |
| Criar/editar/pausar/excluir tarefa | ✓ | — |
| Dispensar mês, desfazer baixa | ✓ | — |
| Excluir conta, investimento, meta | ✓ | — |
| Excluir lançamento/saldo/anexo | qualquer um | só o que ele criou |

`is_admin_financeiro_pessoal()` decide o nível admin.

## Não confundir

| Prefixo | Sistema |
|---------|---------|
| `fp_*` | Controle Financeiro Pessoal |
| `mb_*` | Assessoria MB |
| `mr_*` | Empresas (MR Terceriza) |
| `fin_*` | Painel do Mandato (banco Gabinete) |
| `financeiro_*` | Nerites |
