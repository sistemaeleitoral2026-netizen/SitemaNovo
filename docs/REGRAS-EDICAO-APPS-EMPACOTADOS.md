# Regras de edição das UIs em iframe

## Assessoria MB

A Assessoria MB foi descompactada. O código que roda em produção agora está em arquivos
normais e legíveis:

- `alimentacao-app/public/sistemas/assessoria-mb/index.html`: estrutura da tela
- `alimentacao-app/public/sistemas/assessoria-mb/app.js`: regras e interações
- `alimentacao-app/public/sistemas/assessoria-mb/styles/app.css`: estilos do sistema
- `alimentacao-app/public/sistemas/assessoria-mb/styles/fonts.css`: fontes locais
- `alimentacao-app/public/sistemas/assessoria-mb/assets/`: arquivos WOFF2

Não edite `_legacy_proto` para alterar a Assessoria MB e não volte a empacotar o sistema
em `<script type="__bundler/template">`. Use `npm run format:assessoria` para formatar os
arquivos e `npm run validate-embeds` para validar a sintaxe do `app.js`.

## Mandato e Empresas

O Mandato continua empacotado em uma string JSON dentro de
`alimentacao-app/public/sistemas/mandato-embed/index.html`. O arquivo de Empresas
`alimentacao-app/src/pages/empresas/mr-terceiriza-demo.html` continua sendo um HTML com um
script grande. Neles:

1. Preserve os escapes da string JSON do Mandato (`\"`, `\/` e `\n`).
2. Valide qualquer alteração com `npm run validate-embeds`.
3. Não confie apenas na linha indicada por um `SyntaxError`; um bloco aberto pode fazer o
   parser acusar erro somente no fim do arquivo.
4. Rode `npm run build` antes de concluir.

## Verificação obrigatória

Dentro de `alimentacao-app/`:

```bash
npm run validate-embeds
npm run build
```
