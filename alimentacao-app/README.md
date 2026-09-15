# AlimentaAção

Sistema web de cadastro, organização, geolocalização e análise.

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
