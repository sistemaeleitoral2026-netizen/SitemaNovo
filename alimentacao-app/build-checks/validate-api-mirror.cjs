#!/usr/bin/env node
// A Vercel publica as funções de /api da RAIZ do repositório; alimentacao-app/api
// é só um espelho. Já aconteceu de uma correção entrar só no espelho e nunca ir
// para produção (ex.: acessos do Visualizador em /admin/usuarios). Este check
// falha o build se algum arquivo existir só de um lado ou tiver conteúdo diferente.

const fs = require('fs')
const path = require('path')

const appApi = path.join(__dirname, '..', 'api')
const rootApi = path.join(__dirname, '..', '..', 'api')

// Divergências antigas que precisam de revisão própria antes de serem unificadas.
// Não acrescente arquivos aqui para fazer o build passar: copie a versão certa.
const PENDENTES = new Set([
  '_financeiro.js', // financeiro do Mandato: raiz e espelho evoluíram separadamente
  'folha-cron.js',
])

if (!fs.existsSync(rootApi)) {
  console.warn('[validate-api-mirror] pasta api/ da raiz não encontrada; check ignorado.')
  process.exit(0)
}

const listar = (dir) => fs.readdirSync(dir).filter((f) => f.endsWith('.js'))
const ler = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n')

const nomes = new Set([...listar(appApi), ...listar(rootApi)])
const erros = []
for (const nome of [...nomes].sort()) {
  if (PENDENTES.has(nome)) continue
  const a = path.join(appApi, nome)
  const r = path.join(rootApi, nome)
  if (!fs.existsSync(r)) erros.push(`api/${nome} não existe na raiz (a Vercel não publica alimentacao-app/api/${nome}).`)
  else if (!fs.existsSync(a)) erros.push(`alimentacao-app/api/${nome} não existe (espelho de api/${nome}).`)
  else if (ler(a) !== ler(r)) erros.push(`api/${nome} e alimentacao-app/api/${nome} estão diferentes.`)
}

if (erros.length) {
  console.error('[validate-api-mirror] FALHOU — a Vercel usa api/ da raiz:')
  for (const e of erros) console.error('  - ' + e)
  console.error('Edite os dois arquivos (ou copie a versão correta para o outro lado).')
  process.exit(1)
}
console.log('[validate-api-mirror] OK — api/ da raiz e alimentacao-app/api estão iguais.')
