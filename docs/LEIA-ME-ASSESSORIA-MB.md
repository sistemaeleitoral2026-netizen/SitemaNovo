# Assessoria MB — schema no banco Nerites

Banco: **mesmo do Sistema Nerites**  
`https://uzewhebfshmhuymgungr.supabase.co`

SQL: `alimentacao-app/supabase/assessoria/schema.sql`  
(também em `alimentacao-app/supabase/migrations/20261116_assessoria_mb.sql`)

Depois, rode também (nessa ordem) `20261116b_acessos_externos.sql`,
`20261116c_assessoria_mb_acesso_externo.sql` e
`20261116d_assessoria_mb_equipe_recorrente.sql` — liberam o acesso de quem
é cadastrado em `/admin` e adicionam tarefa recorrente.

## Como aplicar

1. Abra o **SQL Editor** do projeto Nerites no Supabase.
2. Cole e rode o conteúdo de `schema.sql`.
3. Confira no Table Editor as tabelas `mb_*` e o bucket Storage `mb-comprovantes`.

O script é idempotente (pode rodar de novo). Ele **aborta** se não existir `public.cadastros` (garante que não rode no projeto Gabinete).

## Tabelas (`mb_*`)

| Tabela | Conteúdo |
|--------|----------|
| `mb_empresas` | Empresas/subdivisions (ESP, MTEX…) |
| `mb_bancos` | Bancos / origens |
| `mb_centros_custo` | M1–M5 |
| `mb_templates_tarefa` | Modelos de tarefa |
| `mb_equipe` | Nomes da equipe (datalist) |
| `mb_lancamentos` | Receitas / despesas (`previsto`, `recebido`, `saida`) |
| `mb_tarefas` | Demandas e tarefas (`recorrente`=modelo que repete todo mês, `recorrente_origem_id`=cópia gerada a partir de um modelo) |
| `mb_prestacao_contas` | Planilha histórica (prestação de contas) |
| `mb_auditoria` | Log de ações do painel |
| `mb_anexos` | Metadados dos comprovantes |

Arquivos: Storage bucket **`mb-comprovantes`** (privado).

## Acesso (RLS)

**admin**/**diretoria** do Nerites (como sempre foi) **ou** quem tem acesso extra cadastrado em
`/admin` (`profiles.acessos_externos->>'assessoria-mb'`) — `can_access_assessoria_mb()`.

Nível **"editor"** lê/cria/edita tarefas, lançamentos e anexos, mas não exclui, e não mexe em
Configurações (bancos/centros/empresas/modelos/equipe) — isso é só nível **"admin"**
(`can_delete_assessoria_mb()` no banco; no painel, clicar em "Editar"/"Adicionar" das
Configurações com `MB.admin` falso só mostra um aviso, sem entrar no modo de edição).

Pra sugerir nomes no campo "Responsável" das tarefas, o painel busca (via RPC
`list_assessoria_mb_equipe()`) quem tem acesso ao sistema e junta com o catálogo livre
`mb_equipe`.

## Não confundir

| Prefixo | Sistema | Banco |
|---------|---------|--------|
| `financeiro_*` | Nerites (coordenação/liderança) | Nerites |
| `fin_*` | Painel do Mandato | Gabinete |
| `mb_*` | Assessoria MB | Nerites |

## Integração com o painel

O iframe em `/assessoria-mb` sincroniza via `postMessage` com `AssessoriaMbPage`:

1. `mb-pronto` → parent carrega `mb_*` e envia `mb-hydrate`
2. Cada `save()` no painel agenda `mb-persist` (lançamentos, tarefas, auditoria, anexos)
3. Comprovantes sobem para o bucket `mb-comprovantes`

Se a nuvem estiver vazia e o navegador tiver dados locais, o painel envia esses dados na primeira sincronização.
