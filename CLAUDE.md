# alimentacao-sistema

Mapa dos sistemas (Nerites, Mandato, Assessoria MB, Empresas): `docs/SISTEMAS.md`.

## GitHub

- Repo: `https://github.com/sistemaeleitoral2026-netizen/SitemaNovo.git`
- Branch: `main`
- Autor dos commits: `Jurandy1 <jujuba100054@gmail.com>`
- Não use `noreply` no autor
- App fica em `alimentacao-app/`
- Páginas por sistema em `alimentacao-app/src/pages/{auth,nerites,mandato,assessoria,empresas}/`
- Embeds empacotados em `alimentacao-app/public/sistemas/`
- **Antes de editar embeds** (Assessoria MB / Mandato / Empresas): leia `.cursor/rules/embeds-empacotados.mdc` e `docs/EMBEDS.md`. Depois de qualquer mudança: `npm run validate-embeds` (ou `npm run build`) em `alimentacao-app`
- CI roda `npm ci` e `npm run build` dentro de `alimentacao-app`
- Não commitar `.env`, senhas, service role, nem `supabase/diagnosticos/` novos sem pedido
- Scripts soltos / protótipos: `_legacy_proto/` (não entram no app)

## Preview local

- Preview local é **dentro do sistema real, logado**: `npm run dev` em `alimentacao-app` e abrir a rota do sistema (ex.: `http://127.0.0.1:5173/assessoria-mb`) com usuário logado
- **Não** usar página HTML solta (ex.: `public/preview-*.html`) nem abrir o embed direto (`/sistemas/.../index.html`) como preview para o usuário
- Se a sessão não estiver logada, pedir para o usuário fazer login no navegador; nunca pedir/salvar senha
- Quando o usuário pedir "preview local primeiro", **não** fazer push até ele aprovar

## Push

```powershell
git add <arquivos>
$env:GIT_AUTHOR_NAME = 'Jurandy1'
$env:GIT_AUTHOR_EMAIL = 'jujuba100054@gmail.com'
$env:GIT_COMMITTER_NAME = 'Jurandy1'
$env:GIT_COMMITTER_EMAIL = 'jujuba100054@gmail.com'
git commit -m "mensagem"
git push origin HEAD
```

Se o CI falhar, corrija o build (`npm run build` em `alimentacao-app`) antes de tentar de novo.
