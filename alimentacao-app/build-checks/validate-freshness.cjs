#!/usr/bin/env node

// Barreira contra regressões de cache/conteúdo antigo. Este script roda antes
// de toda compilação e também no CI. Se uma pessoa ou IA remover alguma das
// proteções, o deploy é interrompido antes de chegar às usuárias.

const fs = require('fs')
const path = require('path')

const appRoot = path.join(__dirname, '..')
const repoRoot = path.join(appRoot, '..')
const failures = []

function read(relativeToApp) {
  return fs.readFileSync(path.join(appRoot, relativeToApp), 'utf8')
}

function requireMatch(text, expression, message) {
  if (!expression.test(text)) failures.push(message)
}

function validateVercelConfig(file) {
  const fullPath = path.join(repoRoot, file)
  const config = JSON.parse(fs.readFileSync(fullPath, 'utf8'))
  const rules = config.headers || []
  const systemsRule = rules.find((rule) => rule.source === '/sistemas/(.*)')
  const spaRule = rules.find((rule) => rule.source === '/((?!api/|assets/|data/|sistemas/).*)')

  for (const [label, rule] of [['arquivos de /sistemas', systemsRule], ['HTML principal', spaRule]]) {
    const headers = Object.fromEntries((rule?.headers || []).map((header) => [header.key.toLowerCase(), header.value.toLowerCase()]))
    if (!headers['cache-control']?.includes('no-store')) {
      failures.push(`${file}: ${label} precisa de Cache-Control com no-store`)
    }
    if (!headers['vercel-cdn-cache-control']?.includes('no-store')) {
      failures.push(`${file}: ${label} precisa desativar também o cache da CDN da Vercel`)
    }
  }
}

const app = read('src/App.tsx')
requireMatch(app, /<DeploymentRefresh\s*\/>/, 'App.tsx precisa manter a verificação automática de novo deploy')

const vite = read('vite.config.ts')
requireMatch(vite, /VERCEL_GIT_COMMIT_SHA/, 'vite.config.ts precisa versionar cada build pelo commit da Vercel')
requireMatch(vite, /__BUILD_VERSION__/, 'vite.config.ts precisa expor __BUILD_VERSION__')

const buildVersion = read('src/lib/buildVersion.ts')
requireMatch(buildVersion, /searchParams|URLSearchParams/, 'systemUrl precisa acrescentar uma versão à URL dos sistemas')
requireMatch(buildVersion, /\bv\s*:/, 'systemUrl precisa enviar o parâmetro v da versão atual')

const pagesRoot = path.join(appRoot, 'src', 'pages')
const pageFiles = []
function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) collect(full)
    else if (/\.tsx?$/.test(entry.name)) pageFiles.push(full)
  }
}
collect(pagesRoot)

for (const file of pageFiles) {
  const source = fs.readFileSync(file, 'utf8')
  const relative = path.relative(appRoot, file)
  if (/src\s*=\s*["'`]\/sistemas\//.test(source)) {
    failures.push(`${relative}: iframe de /sistemas não pode usar URL fixa; use systemUrl(...)`)
  }
  if (source.includes('/sistemas/') && source.includes('index.html') && !source.includes('systemUrl(')) {
    failures.push(`${relative}: sistema incorporado sem versão automática`)
  }
}

const financeiroPage = read('src/pages/financeiro-pessoal/FinanceiroPessoalPage.tsx')
requireMatch(financeiroPage, /systemUrl\([^)]*remote:\s*['"]1['"]/, 'Financeiro Pessoal deve abrir obrigatoriamente em modo banco (remote=1)')

const financeiroEmbed = read('public/sistemas/financeiro-pessoal/js/app.js')
requireMatch(financeiroEmbed, /const REMOTE\s*=\s*embedded\s*&&/, 'Financeiro Pessoal só pode usar modo banco quando estiver incorporado com segurança')
requireMatch(financeiroEmbed, /if\s*\(REMOTE\)\s*state\s*=\s*emptyState\(\)/, 'Financeiro Pessoal incorporado não pode iniciar com dados de exemplo')

const assessoria = read('public/sistemas/assessoria-mb/app.js')
requireMatch(assessoria, /awaitingCloudHydrate\s*=\s*isEmbed/, 'Assessoria MB precisa aguardar a leitura real do banco quando incorporada')

const assessoriaBridge = read('src/lib/assessoriaMb.ts')
requireMatch(
  assessoriaBridge,
  /newRows\.length\s*&&\s*!opts\.canCreateTasks/,
  'Editor da Assessoria MB não pode tentar criar tarefa ao anexar arquivos',
)
const assessoriaPage = read('src/pages/assessoria/AssessoriaMbPage.tsx')
if (/setErroSync\(msg\)/.test(assessoriaPage)) {
  failures.push('Erro de salvamento da Assessoria MB não pode cobrir o sistema com tela branca')
}

const serviceWorker = read('public/sistemas/chat-seguro/sw.js')
if (/caches\.(open|match)/.test(serviceWorker) || /\.put\s*\(/.test(serviceWorker)) {
  failures.push('Chat Seguro não pode voltar a armazenar a interface em Cache Storage')
}

validateVercelConfig('vercel.json')
validateVercelConfig('alimentacao-app/vercel.json')

if (failures.length) {
  console.error('\n[validate-freshness] DEPLOY BLOQUEADO:')
  for (const failure of failures) console.error(`  - ${failure}`)
  console.error('\nRestaure as garantias de atualização antes de publicar.\n')
  process.exit(1)
}

console.log('[validate-freshness] OK — versão, cache e fontes reais de dados estão protegidos.')
