# UIs carregadas em iframe

## Assessoria MB: fonte modular

Desde novembro de 2026, a Assessoria MB não usa mais o empacotamento
`__bundler/template`. O iframe `/sistemas/assessoria-mb/index.html` carrega arquivos locais
normais:

```text
public/sistemas/assessoria-mb/
├── index.html
├── app.js
├── styles/
│   ├── app.css
│   └── fonts.css
└── assets/
    └── *.woff2
```

O React em `src/pages/assessoria/AssessoriaMbPage.tsx` hospeda o iframe e faz a ponte com o
Supabase por `postMessage`. Alterar a interface não deve mudar esse protocolo sem atualizar
os dois lados.

Comandos:

```bash
npm run format:assessoria
npm run validate-embeds
npm run build
```

## Mandato: formato empacotado legado

`public/sistemas/mandato-embed/index.html` ainda contém um bootstrap e uma tag
`<script type="__bundler/template">` cujo conteúdo é uma string JSON. Dentro dela, aspas,
barras e quebras de linha precisam permanecer escapadas. Um erro de sintaxe no script
interno pode impedir o carregamento de toda a tela.

## Empresas: HTML legado

`src/pages/empresas/mr-terceiriza-demo.html` é HTML normal, mas ainda possui um script
grande. O validador confere sua sintaxe durante o build.
