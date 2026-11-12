const fs = require('fs')
const path = require('path')
const p = 'c:/Users/PC/Desktop/BATIMENTO DE COMPRAS/dashboard_administrativo_nerites.html'
const html = fs.readFileSync(p, 'utf8')
const outDir = __dirname

// Extract style blocks
const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1])
fs.writeFileSync(path.join(outDir, '_dash2-styles.css'), styles.join('\n\n/* ---- */\n\n'))

// Extract main content (skip sidebar if present)
const mainMatch = html.match(/<main[\s\S]*?<\/main>/i)
const bodyMatch = html.match(/<body[\s\S]*?<\/body>/i)
fs.writeFileSync(path.join(outDir, '_dash2-main.html'), mainMatch ? mainMatch[0] : (bodyMatch ? bodyMatch[0] : html))

// Outline headings and key classes
const headings = [...html.matchAll(/<(h[1-6]|section|button)[^>]*>([\s\S]{0,120}?)<\//gi)]
  .map(m => `${m[1]}: ${m[2].replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim()}`)
  .filter(s => s.length > 3)
  .slice(0, 100)
fs.writeFileSync(path.join(outDir, '_dash2-outline.txt'), headings.join('\n'))

const classes = [...new Set([...html.matchAll(/class="([^"]+)"/g)].flatMap(m => m[1].split(/\s+/)))]
  .filter(c => c && !c.startsWith('hover:') && !c.startsWith('lg:') && !c.startsWith('md:') && !c.startsWith('sm:'))
  .sort()
fs.writeFileSync(path.join(outDir, '_dash2-classes.txt'), classes.join('\n'))

console.log('styles', styles.length, 'chars', styles.join('').length)
console.log('main', (mainMatch||'').length)
console.log('headings', headings.length)
console.log('sample headings:\n', headings.slice(0, 40).join('\n'))
