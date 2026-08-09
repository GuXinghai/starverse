import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { build } from 'esbuild'

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..')
const cacheRoot = path.join(repositoryRoot, 'node_modules', '.cache', 'starverse-electron-smoke')
const appRoot = path.join(cacheRoot, 'schema-mismatch-recovery-app')
const outfile = path.join(appRoot, 'main.mjs')
const entryPath = path.join(repositoryRoot, 'scripts', 'smoke', 'schema-mismatch-recovery-entry.ts')
const electronPath = createRequire(import.meta.url)('electron')

fs.rmSync(appRoot, { recursive: true, force: true })
fs.mkdirSync(appRoot, { recursive: true })
fs.writeFileSync(path.join(appRoot, 'package.json'),
  JSON.stringify({ name: 'starverse-schema-mismatch-recovery-smoke', main: 'main.mjs' }))
await build({
  entryPoints: [entryPath],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['electron', 'better-sqlite3'],
  sourcemap: false,
  logLevel: 'silent',
})

const appDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'starverse-schema-mismatch-recovery-'))
try {
  const run = spawnSync(electronPath, [appRoot], {
    cwd: repositoryRoot,
    env: { ...process.env, SV_EPOCH_RECOVERY_SMOKE_ROOT: appDataRoot },
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 120_000,
  })
  if (run.stdout) process.stdout.write(run.stdout)
  if (run.stderr) process.stderr.write(run.stderr)
  if (run.error) throw run.error
  if (run.status !== 0) {
    throw new Error(`EPOCH2_RECOVERY_SMOKE_EXIT:${run.status}`)
  }
  if (!run.stdout.includes('[schema-mismatch-recovery-smoke] PASS')) {
    throw new Error('EPOCH2_RECOVERY_SMOKE_RESULT_MISSING')
  }
} finally {
  fs.rmSync(appDataRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  fs.rmSync(appRoot, { recursive: true, force: true })
}
