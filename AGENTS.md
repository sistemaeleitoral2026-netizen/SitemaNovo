# Regras obrigatórias de atualização e dados reais

Estas regras valem para qualquer pessoa ou IA que altere este repositório:

- Nunca use URL fixa em iframe de `/sistemas/`; use `systemUrl(...)` de `src/lib/buildVersion.ts`.
- Nunca remova `DeploymentRefresh` do aplicativo principal.
- Nunca permita cache persistente para o HTML principal nem para `/sistemas/**`. Mantenha `Cache-Control: no-store` e `Vercel-CDN-Cache-Control: no-store` nos dois arquivos `vercel.json`.
- Nunca use Cache Storage/estratégia cache-first para a interface dos sistemas. O Service Worker do Chat Seguro é apenas para push e deve apagar caches antigos.
- Sistemas incorporados devem carregar dados do banco. Dados de exemplo ou `localStorage` só podem existir em modo isolado de desenvolvimento, nunca na rota real do Nerites.
- Na Assessoria MB, anexar arquivos a uma tarefa existente nunca pode executar `INSERT` em `mb_tarefas`. Somente nível admin cria tarefas; Editor/Administrativo grava apenas os anexos e as atualizações permitidas. Erro de persistência nunca pode cobrir o iframe com uma tela branca.
- `FinanceiroPessoalPage` deve abrir o iframe com `remote=1`. A Assessoria MB deve aguardar o hydrate do banco antes de mostrar registros locais.
- Antes de qualquer commit ou push, execute `npm run build` dentro de `alimentacao-app`. Não contorne nem enfraqueça `build-checks/validate-freshness.cjs` para fazer o build passar.

Se alguma dessas garantias falhar, o deploy deve ser bloqueado. Leia também `docs/ATUALIZACAO-E-DADOS-REAIS.md`.
