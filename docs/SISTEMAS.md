# Mapa dos sistemas (um repo, seis produtos)

Tudo sobe no mesmo deploy (`sitema-novo.vercel.app`). O login escolhe qual sistema abrir.

| Sistema | Pasta do código | URL | O que é |
|---------|-----------------|-----|---------|
| **Nerites** | `alimentacao-app/src/pages/nerites/` | `/` | Cadastros, equipe, ativação, votação, mapa, relatórios |
| **Painel do Mandato** | `alimentacao-app/src/pages/mandato/` + `public/sistemas/mandato-embed/` | `/painel-do-mandato` | Gabinete do vereador (demandas, financeiro da Câmara, proposições) |
| **Assessoria MB** | `alimentacao-app/src/pages/assessoria/` + `public/sistemas/assessoria-mb/` | `/assessoria-mb` | Financeiro corporativo (despesas, comprovantes) |
| **Empresas** | `alimentacao-app/src/pages/empresas/` | `/mr-terceiriza` | MR Terceiriza — caixa de 7 empresas (entradas/saídas, contas, comprovantes, auditoria) |
| **Controle Financeiro Pessoal** | `alimentacao-app/src/pages/financeiro-pessoal/` + `public/sistemas/financeiro-pessoal/` | `/financeiro-pessoal` | Finanças pessoais de Matheus do Beiju (receitas/despesas, contas, **tarefas de pagamento** únicas ou recorrentes com baixa, conta, data/hora e comprovante, investimentos com saldo diário verificado por responsável). Só admin cria tarefas; editor dá baixa |
| **Chat Seguro** | `alimentacao-app/src/pages/chat/` + `public/sistemas/chat-seguro/` | `/chat` | Mensagens com criptografia de ponta a ponta (privadas, Sala Geral, temporárias), uma visão com comprovante, alertas de segurança, auditoria. Só admin do Nerites ou quem for liberado em /admin. Ver `docs/LEIA-ME-CHAT-SEGURO.md` |
| **Administração** | `alimentacao-app/src/pages/admin/` | `/admin` | Só admin. Lista os usuários do Nerites e libera/edita o acesso deles (ou cadastra login novo) à Assessoria MB, ao Painel do Mandato e à Empresas. Não aparece no seletor de login e não mexe no Nerites em si. |

## Onde colocar o quê

```
alimentacao-sistema/
  api/                      ← funções da Vercel (fonte do deploy)
  docs/                     ← documentação
  alimentacao-app/          ← app React (Vite)
    api/                    ← espelho do api/ da raiz (o build falha se divergir: validate-api-mirror)
    public/
      sistemas/
        mandato-embed/      ← UI empacotada do Painel do Mandato
        assessoria-mb/      ← UI modular da Assessoria MB (HTML, JS, CSS e fontes)
        financeiro-pessoal/ ← UI do Controle Financeiro Pessoal (index.html, js/, css/, assets/icons Lucide)
        chat-seguro/        ← UI do Chat Seguro (app.js, e2ee.js, vendor/ supabase-js + noble)
      data/                 ← JSON estático (proposições etc.)
    src/
      pages/
        auth/               ← login
        nerites/            ← sistema eleitoral
        mandato/            ← shell React do painel
        assessoria/         ← shell React da assessoria
        financeiro-pessoal/ ← shell React do Controle Financeiro Pessoal
        chat/               ← shell React do Chat Seguro (só repassa o login/token ao iframe)
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
| Controle Financeiro Pessoal | **Nerites** — tabelas `fp_*` + Storage `fp-comprovantes` (migration `20261124_financeiro_pessoal.sql`, ver `docs/LEIA-ME-FINANCEIRO-PESSOAL.md`). Bridge React ↔ iframe em `lib/financeiroPessoal.ts` (só grava a diferença) |
| Chat Seguro | **Nerites** — tabelas `sc_*` + Storage `sc-files`/`sc-once` (migrations `20261127_chat_seguro.sql` e `20261127b_chat_seguro_cron.sql`). Funções `api/chat-*.js`. Conteúdo cifrado no aparelho: o banco só guarda texto cifrado |
| Empresas (MR Terceriza) | **Nerites** — tabelas `mr_*` + Storage `mr-comprovantes` (mesmo padrão de bridge React ↔ iframe da Assessoria MB) |

## Administração (/admin)

- Só quem é `admin` no Nerites acessa. Não entra no seletor de login (`SITES` em `lib/sites.ts`).
- Lista os `profiles` do Nerites (referência) e deixa marcar, por usuário, um nível (`admin` ou
  `editor`) para cada um dos outros sistemas — grava em `profiles.acessos_externos` (jsonb).
- Também cadastra login novo com `role = 'externo'`: só serve pra entrar nos outros sistemas,
  sem nenhum cargo/hierarquia do Nerites. Precisa rodar
  `alimentacao-app/supabase/migrations/20261116b_acessos_externos.sql` no Supabase antes de usar
  (cria a coluna `acessos_externos` e libera `'externo'` em `profiles.role`).
- Cargos e hierarquia do Nerites (`admin/diretoria/operador/mobilizador/administrativo/coordenador/auxiliar`)
  continuam só pela gestão própria do Nerites (Equipe/Nerites) — essa página não mexe nisso.
- APIs: `api/admin-create-user.js` (cria `externo`) e `api/admin-manage-user.js` (edita/exclui
  `externo`) — espelhadas em `alimentacao-app/api/`, igual aos outros `api/*.js`.

## Não confundir

- **Chat Seguro** = tabelas `sc_*` (nunca crie `profiles`, `messages`, `rooms` sem prefixo: o Nerites já tem `profiles` e `handle_new_user`).

- `FinanceiroPage` em **nerites** = financeiro de coordenação/liderança do sistema eleitoral.
- Financeiro do **Painel do Mandato** = folha/VIEP/equipe do vereador (Gabinete).
- Financeiro da **Assessoria MB** = tabelas `mb_*` no Nerites (não misturar com `financeiro_*` nem com `fin_*` do Gabinete). Ver `docs/LEIA-ME-ASSESSORIA-MB.md`.
- **Controle Financeiro Pessoal** = tabelas `fp_*` no Nerites (contas, conferências de saldo, lançamentos, tarefas e baixas, investimentos). Não misturar com `mb_*`, `mr_*`, `fin_*` nem `financeiro_*`.
- Lançamentos de **Empresas** = tabelas `mr_*` no Nerites (migration `20261116f_mr_terceriza.sql`). As 7 empresas (MR, RE FASHION, IRON, GLOBO, MCC, LIMPOCAR SEMINOVOS, TIPS GRÁF) continuam fixas no código do painel (`mr-terceiriza-demo.html`) — só lançamentos, contas, anexos e auditoria viram banco de verdade.
