const fs = require('fs')
const path = require('path')

const htmlPath = path.join(__dirname, '_extracted-dashboard.html')
const t = fs.readFileSync(htmlPath, 'utf8')

// Extract inline CSS from <style> tags and linked blob refs aren't available;
// also pull style attributes summary.
const styles = [...t.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1])
fs.writeFileSync(path.join(__dirname, '_extracted-styles.css'), styles.join('\n\n/* ---- */\n\n'))
console.log('styles bytes', styles.reduce((a, s) => a + s.length, 0), 'blocks', styles.length)

const classes = new Set()
const re = /class=["']([^"']+)["']/g
let m
while ((m = re.exec(t))) m[1].split(/\s+/).forEach((c) => c && classes.add(c))
fs.writeFileSync(
  path.join(__dirname, '_extracted-classes.txt'),
  [...classes].sort().join('\n'),
)
console.log('class count', classes.size)

// Outline
const outline = []
const re2 = /<(aside|header|nav|main|section|div|h1|h2|h3|p|button|a|span|footer|ul|li|select)([^>]*)>/gi
let n = 0
while ((m = re2.exec(t)) && n < 200) {
  const tag = m[1].toLowerCase()
  const cls = (m[2].match(/class=["']([^"']+)["']/) || [])[1] || ''
  const id = (m[2].match(/id=["']([^"']+)["']/) || [])[1] || ''
  if (
    cls ||
    ['aside', 'header', 'nav', 'main', 'section', 'h1', 'h2', 'h3', 'footer'].includes(tag)
  ) {
    outline.push(`${n}: <${tag}${id ? ' #' + id : ''}${cls ? ' .' + cls.split(/\s+/).join('.') : ''}>`)
    n++
  }
}
fs.writeFileSync(path.join(__dirname, '_extracted-outline.txt'), outline.join('\n'))
console.log('outline lines', outline.length)

// Extract aside, header, and first viewport chunks by tag matching
function extractTag(html, tagName) {
  const openRe = new RegExp(`<${tagName}(\\s[^>]*)?>`, 'i')
  const open = openRe.exec(html)
  if (!open) return null
  const start = open.index
  let i = start + open[0].length
  let depth = 1
  const openTok = new RegExp(`<${tagName}(\\s[^>]*)?>`, 'gi')
  const closeTok = new RegExp(`</${tagName}>`, 'gi')
  while (depth > 0 && i < html.length) {
    openTok.lastIndex = i
    closeTok.lastIndex = i
    const nextOpen = openTok.exec(html)
    const nextClose = closeTok.exec(html)
    if (!nextClose) break
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth++
      i = nextOpen.index + nextOpen[0].length
    } else {
      depth--
      i = nextClose.index + nextClose[0].length
      if (depth === 0) return html.slice(start, i)
    }
  }
  return null
}

const aside = extractTag(t, 'aside')
const header = extractTag(t, 'header')
const main = extractTag(t, 'main')
fs.writeFileSync(path.join(__dirname, '_snippet-aside.html'), aside || 'NOT FOUND')
fs.writeFileSync(path.join(__dirname, '_snippet-header.html'), header || 'NOT FOUND')
console.log('aside len', aside?.length, 'header len', header?.length, 'main len', main?.length)

// First viewport: from start of main until after diretorias cards (rough)
if (main) {
  // Find heading area + summary + dir section
  const markers = ['Visão geral', 'Diretorias', 'Evolução', 'Mobilização']
  for (const mk of markers) {
    const idx = main.indexOf(mk)
    console.log('marker', mk, idx)
  }
  // Take first ~12k of main as first viewport candidate, or until Evolução
  const cut = main.indexOf('Evolução')
  const first = cut > 0 ? main.slice(0, cut) : main.slice(0, 12000)
  fs.writeFileSync(path.join(__dirname, '_snippet-first-viewport.html'), first)
  console.log('first viewport len', first.length)
}

// Pretty-print key CSS custom properties / colors from styles
const css = styles.join('\n')
const colors = [...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((x) => x[0].toLowerCase())
const colorCounts = {}
for (const c of colors) colorCounts[c] = (colorCounts[c] || 0) + 1
const topColors = Object.entries(colorCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 40)
fs.writeFileSync(
  path.join(__dirname, '_extracted-colors.txt'),
  topColors.map(([c, n]) => `${c}\t${n}`).join('\n'),
)

const vars = [...css.matchAll(/--[\w-]+\s*:\s*[^;]+;/g)].map((x) => x[0])
fs.writeFileSync(path.join(__dirname, '_extracted-css-vars.txt'), vars.join('\n'))
console.log('css vars', vars.length)

// Dump body text headings
const headings = [...t.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)].map((h) =>
  h[0].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(),
)
fs.writeFileSync(path.join(__dirname, '_extracted-headings.txt'), headings.join('\n'))
console.log('headings', headings)
