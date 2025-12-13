import { spawnSync } from 'node:child_process'
import fs from 'node:fs'

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

function rgCount(pattern, rootDir) {
  const result = spawnSync(
    'rg',
    [
      '--count-matches',
      '--no-messages',
      '--hidden',
      '--glob',
      '!.git/**',
      '--',
      pattern,
      rootDir,
    ],
    { encoding: 'utf8', shell: false }
  )

  if (result.error) {
    fail(`ripgrep (rg) not found in PATH; install rg. Details: ${result.error.message}`)
  }

  if (result.status === 1) return 0
  if (result.status !== 0) {
    const stderr = (result.stderr || '').toString().trim()
    fail(
      `rg failed for pattern '${pattern}' in '${rootDir}' (exit=${result.status})${
        stderr ? `: ${stderr}` : ''
      }`
    )
  }

  const stdout = (result.stdout || '').toString().trim()
  if (!stdout) return 0

  let sum = 0
  for (const line of stdout.split(/\r?\n/g)) {
    const parts = line.split(':')
    const n = parts.at(-1)
    if (n && /^\d+$/.test(n)) sum += Number.parseInt(n, 10)
  }
  return sum
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
