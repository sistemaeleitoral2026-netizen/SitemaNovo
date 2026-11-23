# Controle Financeiro Pessoal — schema no banco Nerites

Banco: **mesmo do Sistema Nerites**
`https://uzewhebfshmhuymgungr.supabase.co`

SQL (nesta ordem):
1. `alimentacao-app/supabase/migrations/20261124_financeiro_pessoal.sql`
2. `alimentacao-app/supabase/migrations/20261124b_financeiro_pessoal_contas_editor.sql`

> **Situação:** dentro do sistema (`/financeiro-pessoal`) a tela salva **no banco**.
> Sem rodar o SQL, a tela abre vazia e mostra o aviso "As tabelas do Controle
> Financeiro Pessoal ainda não existem no banco".
>
> Aberto direto (`/sistemas/financeiro-pessoal/index.html`, sem `?remote=1`), o
> arquivo continua no modo demonstração: localStorage + dados de exemplo.

## Como a tela fala com o banco

- `src/pages/financeiro-pessoal/FinanceiroPessoalPage.tsx` carrega o iframe com
  `?remote=1` e faz a ponte por `postMessage`:
  - iframe → página: `fp-pronto`, `fp-persist` (estado inteiro), `fp-file-put`, `fp-file-get`, `fp-sair`, `fp-nerites`
  - página → iframe: `fp-user` (nome, admin, userId), `fp-hydrate` (dados do banco), `fp-persist-ok|erro`, `fp-file-ok|data|erro`
- `src/lib/financeiroPessoal.ts` converte estado ↔ linhas e, a cada salvamento,
  grava **só a diferença** em relação ao último estado sincronizado (insere,
  altera e exclui na ordem das chaves estrangeiras) e registra em `fp_auditoria`.
  Se o banco recusar algo (ex.: RLS), mostra o aviso e recarrega do banco.
- Ao voltar para a aba, a página recarrega do banco (pega o que outras pessoas lançaram),
  sem atropelar alteração ainda não salva.
- Comprovantes: enviados para `fp-comprovantes/lancamento/<id do lançamento>/…` e
  registrados em `fp_anexos`; excluir o lançamento apaga o arquivo.
- Teste da sincronização: `src/lib/financeiroPessoal.test.ts` (vitest).

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
| Contas, saldos do dia, aplicações, lançamentos e comprovantes (criar, editar, excluir) | ✓ | ✓ |
| Dar baixa em tarefa (`paga`) | ✓ | ✓ |
| Criar/editar/pausar/excluir tarefa | ✓ | — |
| Dispensar mês, desfazer baixa (excluir lançamento de tarefa) | ✓ | — |
| Alterar a meta da reserva | ✓ | — |

Regras de 20261124b_financeiro_pessoal_contas_editor.sql (rode depois do primeiro SQL).
Cada aplicação tem `conta_id` (a conta/banco onde está).

`is_admin_financeiro_pessoal()` decide o nível admin.

## Não confundir

| Prefixo | Sistema |
|---------|---------|
| `fp_*` | Controle Financeiro Pessoal |
| `mb_*` | Assessoria MB |
| `mr_*` | Empresas (MR Terceriza) |
| `fin_*` | Painel do Mandato (banco Gabinete) |
| `financeiro_*` | Nerites |
