# Regras pra editar os apps empacotados (Assessoria MB, Mandato, Empresas)

Leia isso antes de editar `alimentacao-app/public/sistemas/assessoria-mb/index.html`, `alimentacao-app/public/sistemas/mandato-embed/index.html` ou `alimentacao-app/src/pages/empresas/mr-terceiriza-demo.html`. Esses arquivos já quebraram a Assessoria MB em produção por causa de uma edição que deixou uma chave `{` sem fechar. Isso documenta o que aconteceu e como não deixar acontecer de novo.

## 1. Como esses arquivos são montados

`assessoria-mb/index.html` e `mandato-embed/index.html` não são HTML normal. São:

- Um “bootstrap” pequeno, multi-linha, HTML/JS normal — só o código que desempacota o resto.
- Dentro dele, uma tag `<script type="__bundler/template">...</script>` cujo conteúdo não é HTML nem JS direto — é uma string JSON (o `JSON.stringify()` do documento real inteiro: HTML + CSS + o `<script>` com o app todo dentro).
- No carregamento, o bootstrap faz `JSON.parse()` nessa string, troca o `<head>`/`<body>` pelo conteúdo decodificado, e executa o `<script>` real que estava embrulhado lá dentro.

Por isso, dentro dessa tag:

- `"` literal vira `\"`
- `/` normalmente vira `\/` (convenção do arquivo, não é obrigatório pelo JSON, mas é o padrão usado em todo o arquivo — manter consistência)
- nenhuma quebra de linha real pode aparecer. Todo `\n` tem que ser a sequência de escape de duas letras (`\` + `n`), nunca um Enter de verdade — JSON não permite caractere de controle cru dentro de uma string.

`mr-terceiriza-demo.html` é mais simples (HTML puro, sem esse empacotamento), mas ainda é um `<script>` só, então vale a regra 2 abaixo do mesmo jeito.

## 2. Por que UM erro de sintaxe quebra o app inteiro

Cada um desses arquivos carrega um único `<script>` com o app inteiro (não é dividido em módulos). Se esse script tiver qualquer erro de sintaxe — uma chave a mais, uma chave a menos, um parêntese sobrando — o navegador se recusa a rodar o arquivo inteiro, nem a primeira linha executa. A tela fica travada/em branco, sem nenhum dado, e o único sinal do problema é um erro no Console do navegador (F12) que o usuário comum nunca vai ver — só sabe dizer “travou”.

## 3. O bug real que já aconteceu (pra exemplo)

Na função `openModal()` (Assessoria MB), que monta o formulário de lançamento financeiro:

```js
function openModal(kind, id=null) {
  ...
  if (kind === 'task') {
    ...
  } else {
    // bloco financeiro
    const locked = !!obj;
    if (locked) {
      ... // campos travados (lançamento com baixas)
    } else {
      ... // campos normais
    }
    // <-- faltava fechar aqui o "else" de FORA (o do if kind==='task')
  }
  html += `...Comprovantes...`   // isso é comum aos dois casos, tem que ficar FORA do else
  ...
}
```

Uma edição anterior adicionou o `if (locked) {...} else {...}` novo (pra bloquear edição de lançamento já com baixas registradas) mas esqueceu de fechar o `else {` que já existia antes. Sobrou uma chave `{` sem par.

O pior: isso não dá erro na hora, nem perto de onde está o problema. O parser do JavaScript vai “empilhando” as chaves abertas e só reclama quando chega no final do arquivo inteiro. Por isso o erro aparecia como:

```text
Uncaught SyntaxError: expected expression, got ')'
    index.html:353
```

bem na última linha (`})();`), longe pra caramba de onde a chave realmente faltava. O número de linha do erro não serve pra achar o bug nesse tipo de arquivo.

## 4. Como isso passou batido pelo build/CI

`npm run build` roda `tsc` (só confere `.ts`/`.tsx`) e depois `vite build`. Esses arquivos `index.html` empacotados são estáticos — copiados direto pra `dist/` sem passar por nenhum compilador ou verificador de sintaxe.

Isso já foi corrigido: agora existe `alimentacao-app/build-checks/validate-embeds.cjs`, que roda automaticamente **ANTES** do `tsc`/`vite build` (via `npm run build`) e cancela o build se achar qualquer erro de sintaxe num desses três arquivos.

## 5. Regras pra seguir ao editar esses arquivos

1. Depois de **QUALQUER** edição em um desses 3 arquivos, rode:

   ```bash
   node alimentacao-app/build-checks/validate-embeds.cjs
   ```

   (ou `npm run validate-embeds` dentro de `alimentacao-app`). Zero desculpa pra pular esse passo — é rápido e não precisa de navegador.

2. Nunca confiar no número de linha de um erro de sintaxe vindo desses arquivos. O erro quase sempre aponta pro **FINAL** do arquivo, não pro lugar real do problema. Pra achar o lugar certo, é preciso contar profundidade de chaves/parênteses de verdade (parser AST tipo acorn / `validate-embeds`), não ler o número de linha do navegador.

3. Ao editar um bloco `if(){}else{}` (ou qualquer bloco aninhado), relê a função inteira de cima a baixo depois de editar, contando manualmente `{` e `}`. É especialmente fácil esquecer de fechar o de fora quando se adiciona um `if/else` novo **DENTRO** de um `else` que já existia.

4. Se a edição for feita direto no arquivo bruto (dentro da tag `<script type="__bundler/template">`), lembrar que é uma string JSON: `"` vira `\"`, `/` vira `\/`, e nenhuma quebra de linha real pode entrar — só `\n` escapado.

5. Rodar `npm run build` inteiro (dentro de `alimentacao-app`) antes de considerar a tarefa terminada, sempre que a edição tiver mexido em algum desses três arquivos.
