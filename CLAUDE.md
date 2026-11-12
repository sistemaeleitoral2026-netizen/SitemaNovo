# alimentacao-sistema

## GitHub

- Repo: `https://github.com/sistemaeleitoral2026-netizen/SitemaNovo.git`
- Branch: `main`
- Autor dos commits: `Jurandy1 <jujuba100054@gmail.com>`
- Não use `noreply` no autor
- App fica em `alimentacao-app/`
- CI roda `npm ci` e `npm run build` dentro de `alimentacao-app`
- Não commitar `.env`, senhas, service role, nem `supabase/diagnosticos/` novos sem pedido

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
