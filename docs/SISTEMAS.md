# Mapa dos sistemas (um repo, cinco produtos)

Tudo sobe no mesmo deploy (`sitema-novo.vercel.app`). O login escolhe qual sistema abrir.

| Sistema | Pasta do código | URL | O que é |
|---------|-----------------|-----|---------|
| **Nerites** | `alimentacao-app/src/pages/nerites/` | `/` | Cadastros, equipe, ativação, votação, mapa, relatórios |
| **Painel do Mandato** | `alimentacao-app/src/pages/mandato/` + `public/sistemas/mandato-embed/` | `/painel-do-mandato` | Gabinete do vereador (demandas, financeiro da Câmara, proposições) |
| **Assessoria MB** | `alimentacao-app/src/pages/assessoria/` + `public/sistemas/assessoria-mb/` | `/assessoria-mb` | Financeiro corporativo (despesas, comprovantes) |
| **Empresas** | `alimentacao-app/src/pages/empresas/` | `/mr-terceiriza` | MR Terceiriza — caixa de 7 empresas (entradas/saídas, contas, comprovantes, auditoria) |
| **Controle Financeiro Pessoal** | `alimentacao-app/src/pages/financeiro-pessoal/` + `public/sistemas/financeiro-pessoal/` | `/financeiro-pessoal` | Finanças pessoais de Matheus do Beiju (receitas/despesas, contas, investimentos com saldo diário verificado por responsável) |
| **Administração** | `alimentacao-app/src/pages/admin/` | `/admin` | Só admin. Lista os usuários do Nerites e libera/edita o acesso deles (ou cadastra login novo) à Assessoria MB, ao Painel do Mandato e à Empresas. Não aparece no seletor de login e não mexe no Nerites em si. |

## Onde colocar o quê

```
alimentacao-sistema/
  api/                      ← funções da Vercel (fonte do deploy)
  docs/                     ← documentação
  alimentacao-app/          ← app React (Vite)
    api/                    ← espelho do api/ da raiz (manter igual)
    public/
      sistemas/
        mandato-embed/      ← UI empacotada do Painel do Mandato
        assessoria-mb/      ← UI modular da Assessoria MB (HTML, JS, CSS e fontes)
        financeiro-pessoal/ ← UI do Controle Financeiro Pessoal (index.html, js/, css/, assets/icons Lucide)
      data/                 ← JSON estático (proposições etc.)
    src/
      pages/
        auth/               ← login
        nerites/            ← sistema eleitoral
        mandato/            ← shell React do painel
        assessoria/         ← shell React da assessoria
        financeiro-pessoal/ ← shell React do Controle Financeiro Pessoal
        empresas/           ← empresas
        admin/              ← /admin — gestão de acesso aos outros sistemas
      lib/sites.ts          ← lista dos 5 sistemas + acessos_externos (admin/editor por sistema)
  _legacy_proto/            ← protótipos e scripts antigos (não entram no app)
```

## Bancos

| Sistema | Banco |
|---------|--------|
| Nerites | Supabase Nerites (`VITE_SUPABASE_*`) |
| Painel do Mandato (fichas/lideranças) | Lê Nerites |
| Painel do Mandato (financeiro) | Supabase **Gabinete** (`GABINETE_*` só no servidor) |
| Assessoria MB | **Nerites** — tabelas `mb_*` + Storage `mb-comprovantes` (bridge React ↔ iframe) |
| Controle Financeiro Pessoal | **Nenhum por enquanto** — dados no navegador (localStorage do iframe, chave `meu-financeiro:v2`) |
| Empresas (MR Terceriza) | **Nerites** — tabelas `mr_*` + Storage `mr-comprovantes` (mesmo padrão de bridge React ↔ iframe da Assessoria MB) |

## Administração (/admin)

- Só quem é `admin` no Nerites acessa. Não entra no seletor de login (`SITES` em `lib/sites.ts`).
- Lista os `profiles` do Nerites (referência) e deixa marcar, por usuário, um nível (`admin` ou
  `editor`) para cada um dos outros 3 sistemas — grava em `profiles.acessos_externos` (jsonb).
- Também cadastra login novo com `role = 'externo'`: só serve pra entrar nos outros sistemas,
  sem nenhum cargo/hierarquia do Nerites. Precisa rodar
  `alimentacao-app/supabase/migrations/20261116b_acessos_externos.sql` no Supabase antes de usar
  (cria a coluna `acessos_externos` e libera `'externo'` em `profiles.role`).
- Cargos e hierarquia do Nerites (`admin/diretoria/operador/mobilizador/administrativo/coordenador/auxiliar`)
  continuam só pela gestão própria do Nerites (Equipe/Nerites) — essa página não mexe nisso.
- APIs: `api/admin-create-user.js` (cria `externo`) e `api/admin-manage-user.js` (edita/exclui
  `externo`) — espelhadas em `alimentacao-app/api/`, igual aos outros `api/*.js`.

## Não confundir

- `FinanceiroPage` em **nerites** = financeiro de coordenação/liderança do sistema eleitoral.
- Financeiro do **Painel do Mandato** = folha/VIEP/equipe do vereador (Gabinete).
- Financeiro da **Assessoria MB** = tabelas `mb_*` no Nerites (não misturar com `financeiro_*` nem com `fin_*` do Gabinete). Ver `docs/LEIA-ME-ASSESSORIA-MB.md`.
- Lançamentos de **Empresas** = tabelas `mr_*` no Nerites (migration `20261116f_mr_terceriza.sql`). As 7 empresas (MR, RE FASHION, IRON, GLOBO, MCC, LIMPOCAR SEMINOVOS, TIPS GRÁF) continuam fixas no código do painel (`mr-terceiriza-demo.html`) — só lançamentos, contas, anexos e auditoria viram banco de verdade.
