import fs from 'node:fs'
import path from 'node:path'

function fail(message) {
  process.stderr.write(`FAIL: ${message}\n`)
  process.exit(1)
}

const root = process.cwd()
const assetsDir = path.join(root, 'dist', 'assets')

if (!fs.existsSync(assetsDir)) {
  fail(`Missing assets directory: ${path.relative(root, assetsDir)}`)
}

const cssFiles = fs
  .readdirSync(assetsDir)
  .filter((name) => name.endsWith('.css'))
  .map((name) => path.join(assetsDir, name))

if (cssFiles.length === 0) {
  fail(`No CSS artifacts found under ${path.relative(root, assetsDir)}`)
}

const combinedCss = cssFiles
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n')

const missing = []
if (!combinedCss.includes('.katex')) missing.push('.katex')
if (!combinedCss.includes('.katex-display')) missing.push('.katex-display')

if (missing.length > 0) {
  const scanned = cssFiles.map((f) => path.relative(root, f)).join(', ')
  fail(`Missing required KaTeX selectors: ${missing.join(', ')}. Scanned: ${scanned}`)
}

console.log(`PASS: KaTeX CSS selectors found in ${cssFiles.length} artifact(s).`)
