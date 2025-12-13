import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const args = new Set(process.argv.slice(2))
const skipTests = args.has('--skip-tests')

function section(title) {
  process.stdout.write(`\n${'='.repeat(80)}\n${title}\n${'='.repeat(80)}\n`)
}

function fail(message) {
  const err = new Error(message)
  err.name = 'GateCheckFailure'
  throw err
}

function assertFileMissing(filePath) {
  if (fs.existsSync(filePath)) fail(`Expected file to be deleted: ${filePath}`)
}

function assertPathMissing(filePath) {
  if (fs.existsSync(filePath)) fail(`Expected path to be deleted: ${filePath}`)
}

function runNpm(npmArgs) {
  const result = spawnSync('npm', npmArgs, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.error) throw result.error
  return result.status ?? 0
}

/**
 * Count pattern occurrences in directory using Node.js (no ripgrep dependency)
 */
function grepCountSync(pattern, rootDir) {
  let count = 0
  const regex = new RegExp(pattern, 'g')
  
  function walkDir(dir) {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === 'dist-electron') continue
        walkDir(fullPath)
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.vue') || entry.name.endsWith('.js'))) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8')
          const matches = content.match(regex)
          if (matches) count += matches.length
        } catch {
          // skip unreadable files
        }
      }
    }
  }
  
  walkDir(rootDir)
  return count
}

// Use Node.js native grep instead of ripgrep
function rgCount(pattern, rootDir) {
  return grepCountSync(pattern, rootDir)
}

const startedAt = Date.now()

section('TC-12 Gate Check - Delete legacy + remove flags')

try {
  section('Artifacts removed')
  assertFileMissing('src/next/config/flags.ts')
  assertPathMissing('src/next/generation')
  console.log('PASS: generation flag module and legacy generation folder are deleted.')

  section('Legacy app surface removed')
  assertPathMissing('src/components')
  assertPathMissing('src/stores')
  assertPathMissing('src/composables')
  assertPathMissing('src/services')
  assertPathMissing('src/utils')
  assertPathMissing('src/types')
  assertPathMissing('archived-services')
  console.log('PASS: legacy UI/stores/services surface removed.')

  section('No leftover switch references')
  const patterns = [
    'useNextGenerationPipeline',
    'readGenerationFlags',
    'VITE_USE_NEXT_GENERATION_PIPELINE',
    'starverse\\.flags\\.useNextGenerationPipeline',
    'LegacyGenerationPipeline',
    'enableUiNext',
    'VITE_ENABLE_UI_NEXT',
    'starverse\\.flags\\.enableUiNext',
    'useMessageSending',
    'performSendMessage',
    'OpenRouterService',
    'aiChatService',
    'useAppStore\\(',
  ]
  for (const p of patterns) {
    const c = rgCount(p, 'src')
    if (c > 0) fail(`Found leftover references for '${p}' in src/ (count=${c})`)
  }
  console.log('PASS: no legacy identifiers remain under src/.')

  section('Targeted tests')
  if (!skipTests) {
    const exit = runNpm(['test', '--silent'])
    if (exit !== 0) fail(`vitest failed (exit=${exit})`)
    console.log('PASS: test suite passed.')
  } else {
    console.log('SKIP: tests (requested via --skip-tests).')
  }

  const elapsedSec = (Date.now() - startedAt) / 1000
  section('RESULT')
  console.log(`PASS: TC-12 gate checks completed in ${elapsedSec.toFixed(1)}s`)
  process.exit(0)
} catch (err) {
  const message = err instanceof Error ? err.message : String(err)
  process.stderr.write(`\nFAIL: ${message}\n`)
  process.exit(1)
}
