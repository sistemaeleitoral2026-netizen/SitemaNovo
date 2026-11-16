# AlimentaAção

App Vite/React com **vários sistemas** no mesmo deploy. Mapa completo: [`docs/SISTEMAS.md`](../docs/SISTEMAS.md).

| Pasta | Sistema |
|-------|---------|
| `src/pages/nerites/` | Nerites (eleitoral) |
| `src/pages/mandato/` + `public/sistemas/mandato-embed/` | Painel do Mandato |
| `src/pages/assessoria/` + `public/sistemas/assessoria-mb/` | Assessoria MB |
| `src/pages/empresas/` | MR Terceiriza |
| `src/pages/auth/` | Login |

## Como rodar

```bash
cd alimentacao-app
npm install
npm run dev
```

Abra a URL do Vite (ex.: `http://127.0.0.1:5173`).

## Perfis

| Perfil | Acesso |
|--------|--------|
| **Administrador** | Dashboard, nerites (cria conta/senha), todos os cadastros, mapa por CEP, relatórios, configurações |
| **Nerite** | Meus cadastros, novo cadastro, importar planilha — **sem** dashboard |

O administrador cria cada nerite com e-mail e senha em **Nerites → Nova nerite**.

Zonas e seções são **eleitorais**. O mapa agrupa cadastros por **CEP**.

## Supabase

- Schema: `supabase/schema.sql` (`profiles`, `cadastros`, `importacoes`, `auditoria` + RLS)
- Role no banco: `admin` | `operador` (exibido na interface como **Nerite**)

Variáveis do frontend (`.env`):

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Nunca coloque a `service_role` no frontend.

## Stack

React + Vite + TypeScript + Supabase Auth/Postgres/RLS + Leaflet + Recharts + SheetJS
