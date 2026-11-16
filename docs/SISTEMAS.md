# Mapa dos sistemas (um repo, quatro produtos)

Tudo sobe no mesmo deploy (`sitema-novo.vercel.app`). O login escolhe qual sistema abrir.

| Sistema | Pasta do código | URL | O que é |
|---------|-----------------|-----|---------|
| **Nerites** | `alimentacao-app/src/pages/nerites/` | `/` | Cadastros, equipe, ativação, votação, mapa, relatórios |
| **Painel do Mandato** | `alimentacao-app/src/pages/mandato/` + `public/sistemas/mandato-embed/` | `/painel-do-mandato` | Gabinete do vereador (demandas, financeiro da Câmara, proposições) |
| **Assessoria MB** | `alimentacao-app/src/pages/assessoria/` + `public/sistemas/assessoria-mb/` | `/assessoria-mb` | Financeiro corporativo (despesas, comprovantes) |
| **Empresas** | `alimentacao-app/src/pages/empresas/` | `/mr-terceiriza` | MR Terceiriza |

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
        assessoria-mb/      ← UI empacotada da Assessoria MB
      data/                 ← JSON estático (proposições etc.)
    src/
      pages/
        auth/               ← login
        nerites/            ← sistema eleitoral
        mandato/            ← shell React do painel
        assessoria/         ← shell React da assessoria
        empresas/           ← empresas
      lib/sites.ts          ← lista dos 4 sistemas
  _legacy_proto/            ← protótipos e scripts antigos (não entram no app)
```

## Bancos

| Sistema | Banco |
|---------|--------|
| Nerites | Supabase Nerites (`VITE_SUPABASE_*`) |
| Painel do Mandato (fichas/lideranças) | Lê Nerites |
| Painel do Mandato (financeiro) | Supabase **Gabinete** (`GABINETE_*` só no servidor) |
| Assessoria MB | **Nerites** — tabelas `mb_*` + Storage `mb-comprovantes` (bridge React ↔ iframe) |

## Não confundir

- `FinanceiroPage` em **nerites** = financeiro de coordenação/liderança do sistema eleitoral.
- Financeiro do **Painel do Mandato** = folha/VIEP/equipe do vereador (Gabinete).
- Financeiro da **Assessoria MB** = tabelas `mb_*` no Nerites (não misturar com `financeiro_*` nem com `fin_*` do Gabinete). Ver `docs/LEIA-ME-ASSESSORIA-MB.md`.
