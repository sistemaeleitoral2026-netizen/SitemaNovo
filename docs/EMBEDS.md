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

## Mandato: fonte legível + empacotamento automático

`public/sistemas/mandato-embed/index.html` ainda é o arquivo que a produção carrega: um
bootstrap, `<script type="__bundler/manifest">` (imagens/fontes/runtime em base64) e
`<script type="__bundler/template">` cujo conteúdo é uma string JSON com o HTML/CSS/JS do
app inteiro. Isso não muda — continua sendo gerado por uma ferramenta externa de
site-builder (tags customizadas `sc-if`/`sc-for`/`x-dc` no HTML).

**Não edite `index.html` diretamente.** Em vez disso, edite os arquivos legíveis em
`public/sistemas/mandato-embed/source/`:

```text
public/sistemas/mandato-embed/
├── index.html          ← gerado; não editar à mão
└── source/
    ├── template.html       marcação (sc-if/sc-for), com placeholders para os blocos abaixo
    ├── app.js               lógica do app (estado, formulários, dados) — o que normalmente muda
    ├── app.css               estilos próprios do app (pequeno)
    ├── fonts.css              @font-face (Public Sans, via Google Fonts)
    └── vendor-icons.css       CSS do Tabler Icons (vendorizado, não editar)
```

Fluxo de edição:

```bash
# depois de editar algo em public/sistemas/mandato-embed/source/*
npm run pack:mandato        # reconstrói index.html a partir de source/
npm run validate-embeds
npm run build
```

Se precisar re-gerar `source/` a partir de um `index.html` atualizado por outro meio
(ex.: reexportado da ferramenta de site-builder), rode `npm run unpack:mandato` — ele
sobrescreve `source/*`, então rode antes de qualquer edição manual perdida.

Os scripts ficam em `alimentacao-app/build-checks/{unpack,pack}-mandato.cjs`. O `pack`
troca **só** o conteúdo do `<script type="__bundler/template">`, preservando o bootstrap e
o `__bundler/manifest` byte a byte — o encode foi verificado idêntico ao arquivo original
antes dessa mudança ser adotada.

Um erro de sintaxe no `app.js`/`template.html` pode impedir o carregamento de toda a tela
(mesmo risco de sempre — `validate-embeds` pega erro de sintaxe, não bug de lógica).

## Empresas: HTML legado

`src/pages/empresas/mr-terceiriza-demo.html` é HTML normal, mas ainda possui um script
grande. O validador confere sua sintaxe durante o build.
