#!/usr/bin/env node
// Valida a sintaxe JS dos apps empacotados em public/sistemas/** antes do build.
// Esses arquivos são HTML inteiros escritos à mão (às vezes por fora do editor,
// via Cursor etc.) e um colchete/chave a mais ou a menos quebra o app inteiro
// em produção sem nenhum aviso em tempo de build. Isso roda antes de tsc/vite
// e falha o build se algum <script> desses arquivos não for JS válido.

const fs = require('fs')
const path = require('path')
const vm = require('vm')

const root = path.join(__dirname, '..')

const targets = [
  path.join(root, 'public/sistemas/assessoria-mb/index.html'),
  path.join(root, 'public/sistemas/mandato-embed/index.html'),
  path.join(root, 'src/pages/empresas/mr-terceiriza-demo.html'),
]

const standaloneScripts = [path.join(root, 'public/sistemas/assessoria-mb/app.js')]

let ok = true

function checkScript(label, body) {
  if (!body.trim()) return
  try {
    new vm.Script(body, { filename: label })
  } catch (e) {
    ok = false
    console.error(`\n[validate-embeds] ERRO DE SINTAXE em ${label}:`)
    console.error('  ' + e.message)
  }
}

function validateBundlerTemplate(file, text) {
  const idx = text.indexOf('<script type="__bundler/template"')
  if (idx === -1) return false
  const startContent = text.indexOf('>', idx) + 1
  const endTag = text.indexOf('</script>', startContent)
  const raw = text.slice(startContent, endTag)
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    ok = false
    console.error(`\n[validate-embeds] ERRO: ${file} -> o <script type="__bundler/template"> não é JSON válido:`)
    console.error('  ' + e.message)
    return true
  }
  let pos = 0
  let count = 0
  while (true) {
    const openIdx = parsed.indexOf('<script', pos)
    if (openIdx === -1) break
    const tagEnd = parsed.indexOf('>', openIdx)
    const tagAttrs = parsed.slice(openIdx, tagEnd)
    const closeIdx = parsed.indexOf('</script>', tagEnd)
    if (closeIdx === -1) break
    if (!/\bsrc=/.test(tagAttrs)) {
      count++
      checkScript(`${file} (script empacotado #${count})`, parsed.slice(tagEnd + 1, closeIdx))
    }
    pos = closeIdx + 9
  }
  return true
}

function validatePlainHtml(file, text) {
  let pos = 0
  let count = 0
  while (true) {
    const openIdx = text.indexOf('<script', pos)
    if (openIdx === -1) break
    const tagEnd = text.indexOf('>', openIdx)
    const tagAttrs = text.slice(openIdx, tagEnd)
    const closeIdx = text.indexOf('</script>', tagEnd)
    if (closeIdx === -1) break
    if (!/\bsrc=/.test(tagAttrs)) {
      count++
      checkScript(`${file} (script #${count})`, text.slice(tagEnd + 1, closeIdx))
    }
    pos = closeIdx + 9
  }
}

for (const target of targets) {
  if (!fs.existsSync(target)) continue
  const rel = path.relative(root, target)
  const text = fs.readFileSync(target, 'utf8')
  const wasBundled = validateBundlerTemplate(rel, text)
  if (!wasBundled) validatePlainHtml(rel, text)
}

for (const target of standaloneScripts) {
  if (!fs.existsSync(target)) continue
  checkScript(path.relative(root, target), fs.readFileSync(target, 'utf8'))
}

if (!ok) {
  console.error('\n[validate-embeds] Build cancelado: corrija o(s) erro(s) acima antes de continuar.\n')
  process.exit(1)
}

console.log('[validate-embeds] OK — todos os apps e scripts externos têm JS válido.')
