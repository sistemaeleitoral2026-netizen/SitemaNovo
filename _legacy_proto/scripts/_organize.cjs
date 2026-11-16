const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const appRoot = __dirname
const repoRoot = path.join(appRoot, '..')
const pagesDir = path.join(appRoot, 'src', 'pages')

const groups = {
  auth: ['LoginPage.tsx', 'ForgotPasswordPage.tsx'],
  mandato: ['PainelMandatoPage.tsx'],
  assessoria: ['AssessoriaMbPage.tsx'],
  empresas: ['MrTerceirizaPage.tsx'],
  nerites: [
    'DashboardPage.tsx', 'OperadoresPage.tsx', 'OperadorDetailPage.tsx',
    'CadastrosPage.tsx', 'CadastroFormPage.tsx', 'MapaPage.tsx', 'ImportarPage.tsx',
    'RelatoriosPage.tsx', 'RelatorioFichasTxtPage.tsx', 'RelatorioBackupPage.tsx',
    'ChamadaPage.tsx', 'FerramentasTituloPage.tsx', 'ConfiguracoesPage.tsx',
    'EquipePage.tsx', 'AtivacaoLancarPage.tsx', 'AtivacaoPainelPage.tsx',
    'AtivacaoHistoricoPage.tsx', 'DemandasLancarPage.tsx', 'DemandasPainelPage.tsx',
    'LiderancaPage.tsx', 'GaragemLancarPage.tsx', 'GaragemHistoricoPage.tsx',
    'FinanceiroPage.tsx', 'TvDashboardPage.tsx', 'AuditoriaPage.tsx',
    'FormigasWhatsappPage.tsx', 'VotacaoLancarPage.tsx', 'VotacaoProgressoPage.tsx',
    'VotacaoHistoricoPage.tsx',
  ],
}

function rel(p) {
  return path.relative(repoRoot, p).replace(/\\/g, '/')
}

function move(fromAbs, toAbs) {
  if (!fs.existsSync(fromAbs)) {
    console.warn('missing', rel(fromAbs))
    return false
  }
  fs.mkdirSync(path.dirname(toAbs), { recursive: true })
  if (fs.existsSync(toAbs)) {
    console.warn('exists', rel(toAbs))
    return false
  }
  try {
    execSync(`git mv -- "${rel(fromAbs)}" "${rel(toAbs)}"`, { cwd: repoRoot, stdio: 'pipe' })
  } catch (e) {
    fs.renameSync(fromAbs, toAbs)
    execSync(`git add -- "${rel(toAbs)}"`, { cwd: repoRoot, stdio: 'pipe' })
  }
  console.log('moved', rel(toAbs))
  return true
}

function fixImports(filePath) {
  let src = fs.readFileSync(filePath, 'utf8')
  const before = src
  src = src.replace(/from '(\.\.\/(?:components|contexts|lib|hooks|types)[^']*)'/g, (m, p1) => {
    if (p1.startsWith('../../')) return m
    return `from '../${p1}'`
  })
  src = src.replace(/from "(\.\.\/(?:components|contexts|lib|hooks|types)[^"]*)"/g, (m, p1) => {
    if (p1.startsWith('../../')) return m
    return `from "../${p1}"`
  })
  if (src !== before) {
    fs.writeFileSync(filePath, src)
    console.log('imports', rel(filePath))
  }
}

for (const [folder, files] of Object.entries(groups)) {
  const destDir = path.join(pagesDir, folder)
  fs.mkdirSync(destDir, { recursive: true })
  for (const file of files) {
    const from = path.join(pagesDir, file)
    const to = path.join(destDir, file)
    if (move(from, to)) fixImports(to)
  }
  fs.writeFileSync(
    path.join(destDir, 'README.md'),
    `# ${folder}\n\nPáginas deste sistema. Ver \`docs/SISTEMAS.md\`.\n`,
  )
}

// Move mr-terceiriza-demo.html with empresas if present
const demo = path.join(pagesDir, 'mr-terceiriza-demo.html')
if (fs.existsSync(demo)) move(demo, path.join(pagesDir, 'empresas', 'mr-terceiriza-demo.html'))

const pub = path.join(appRoot, 'public')
const sistemas = path.join(pub, 'sistemas')
fs.mkdirSync(sistemas, { recursive: true })
for (const name of ['assessoria-mb', 'mandato-embed']) {
  move(path.join(pub, name), path.join(sistemas, name))
}

let app = fs.readFileSync(path.join(appRoot, 'src', 'App.tsx'), 'utf8')
const map = {
  LoginPage: 'auth/LoginPage',
  ForgotPasswordPage: 'auth/ForgotPasswordPage',
  MrTerceirizaPage: 'empresas/MrTerceirizaPage',
  AssessoriaMbPage: 'assessoria/AssessoriaMbPage',
  PainelMandatoPage: 'mandato/PainelMandatoPage',
  VotacaoLancarPage: 'nerites/VotacaoLancarPage',
  VotacaoProgressoPage: 'nerites/VotacaoProgressoPage',
  VotacaoHistoricoPage: 'nerites/VotacaoHistoricoPage',
  DashboardPage: 'nerites/DashboardPage',
  OperadoresPage: 'nerites/OperadoresPage',
  OperadorDetailPage: 'nerites/OperadorDetailPage',
  CadastrosPage: 'nerites/CadastrosPage',
  CadastroFormPage: 'nerites/CadastroFormPage',
  MapaPage: 'nerites/MapaPage',
  ImportarPage: 'nerites/ImportarPage',
  RelatoriosPage: 'nerites/RelatoriosPage',
  RelatorioFichasTxtPage: 'nerites/RelatorioFichasTxtPage',
  RelatorioBackupPage: 'nerites/RelatorioBackupPage',
  ChamadaPage: 'nerites/ChamadaPage',
  FerramentasTituloPage: 'nerites/FerramentasTituloPage',
  ConfiguracoesPage: 'nerites/ConfiguracoesPage',
  EquipePage: 'nerites/EquipePage',
  AtivacaoLancarPage: 'nerites/AtivacaoLancarPage',
  AtivacaoPainelPage: 'nerites/AtivacaoPainelPage',
  AtivacaoHistoricoPage: 'nerites/AtivacaoHistoricoPage',
  DemandasLancarPage: 'nerites/DemandasLancarPage',
  DemandasPainelPage: 'nerites/DemandasPainelPage',
  LiderancaPage: 'nerites/LiderancaPage',
  GaragemLancarPage: 'nerites/GaragemLancarPage',
  GaragemHistoricoPage: 'nerites/GaragemHistoricoPage',
  FinanceiroPage: 'nerites/FinanceiroPage',
  TvDashboardPage: 'nerites/TvDashboardPage',
  AuditoriaPage: 'nerites/AuditoriaPage',
  FormigasWhatsappPage: 'nerites/FormigasWhatsappPage',
}
for (const [name, dest] of Object.entries(map)) {
  app = app.replaceAll(`./pages/${name}`, `./pages/${dest}`)
}
fs.writeFileSync(path.join(appRoot, 'src', 'App.tsx'), app)

function patch(abs, pairs) {
  if (!fs.existsSync(abs)) return
  let t = fs.readFileSync(abs, 'utf8')
  for (const [a, b] of pairs) t = t.split(a).join(b)
  fs.writeFileSync(abs, t)
}
patch(path.join(pagesDir, 'assessoria', 'AssessoriaMbPage.tsx'), [
  ['src="/assessoria-mb/index.html"', 'src="/sistemas/assessoria-mb/index.html"'],
])
patch(path.join(pagesDir, 'mandato', 'PainelMandatoPage.tsx'), [
  ['src="/mandato-embed/index.html"', 'src="/sistemas/mandato-embed/index.html"'],
])

console.log('organize done')
