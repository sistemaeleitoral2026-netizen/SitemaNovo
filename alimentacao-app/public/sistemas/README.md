# sistemas/

UIs carregadas em iframe pelas páginas React:

- `mandato-embed/` → `/painel-do-mandato`
- `assessoria-mb/` → `/assessoria-mb`
- `financeiro-pessoal/` → `/financeiro-pessoal` (HTML/JS/CSS legíveis; dados no localStorage por enquanto)

O Mandato ainda é um HTML empacotado. A Assessoria MB foi descompactada e deve ser editada
diretamente em `index.html`, `app.js` e `styles/`. Para formatá-la, rode
`npm run format:assessoria`.

Não misturar com as páginas hospedeiras em `src/pages/`. Ver `docs/SISTEMAS.md`.
