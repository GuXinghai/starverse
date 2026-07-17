import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { build } from 'esbuild'

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..')
const cacheRoot = path.join(repositoryRoot, 'node_modules', '.cache', 'starverse-electron-smoke')
const appRoot = path.join(cacheRoot, 'fresh-epoch-database-crash-app')
const outfile = path.join(appRoot, 'main.mjs')
const electronPath = createRequire(import.meta.url)('electron')
const stages = ['after_schema', 'after_identity', 'after_envelope']
fs.rmSync(appRoot, { recursive: true, force: true })
fs.mkdirSync(path.join(appRoot, 'infra', 'db', 'v2'), { recursive: true })
fs.writeFileSync(path.join(appRoot, 'package.json'), JSON.stringify({ name: 'starverse-epoch-crash-smoke', main: 'main.mjs' }))
for (const fileName of ['coreConversationSchema.sql', 'generationConfigSchema.sql',
  'attachmentAssetSchema.sql', 'openRouterImagesSchema.sql', 'generationExecutionSchema.sql']) {
  fs.copyFileSync(path.join(repositoryRoot, 'infra', 'db', 'v2', fileName),
    path.join(appRoot, 'infra', 'db', 'v2', fileName))
}
await build({
  entryPoints: [path.join(repositoryRoot, 'scripts', 'smoke', 'fresh-epoch-database-crash-entry.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['electron', 'better-sqlite3'],
  sourcemap: false,
  logLevel: 'silent',
})

try {
  for (const stage of stages) {
    const appDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), `starverse-epoch-crash-${stage}-`))
    try {
      const markerPath = path.join(appDataRoot, 'crash-stage.marker')
      const env = {
        ...process.env,
        SV_EPOCH_CRASH_ROOT: appDataRoot,
        SV_EPOCH_CRASH_MARKER: markerPath,
      }
      const crashed = spawnSync(electronPath, [appRoot, stage], {
        cwd: repositoryRoot, env, encoding: 'utf8', stdio: 'pipe', timeout: 60_000,
      })
      if (crashed.status === 0 || crashed.error) {
        throw crashed.error ?? new Error(`EPOCH2_CRASH_STAGE_DID_NOT_CRASH:${stage}`)
      }
      if (!fs.existsSync(markerPath) || fs.readFileSync(markerPath, 'utf8') !== `${stage}\n`) {
        throw new Error(`EPOCH2_CRASH_STAGE_NOT_REACHED:${stage}`)
      }
      const databasePath = path.join(appDataRoot, 'Starverse', 'workspace', 'epoch-2', 'starverse.db')
      const journalPath = `${databasePath}-journal`
      const physicalEvidence = {
        mainBytes: fs.existsSync(databasePath) ? fs.statSync(databasePath).size : null,
        journalBytes: fs.existsSync(journalPath) ? fs.statSync(journalPath).size : null,
      }
      const recovered = spawnSync(electronPath, [appRoot, 'recover'], {
        cwd: repositoryRoot, env, encoding: 'utf8', stdio: 'pipe', timeout: 60_000,
      })
      if (recovered.stdout) process.stdout.write(recovered.stdout)
      if (recovered.stderr) process.stderr.write(recovered.stderr)
      if (recovered.error) throw recovered.error
      if (recovered.status !== 0) throw new Error(`EPOCH2_CRASH_RECOVERY_FAILED:${stage}`)
      process.stdout.write(`[fresh-epoch-database-crash] ${stage} ${JSON.stringify(physicalEvidence)}\n`)
    } finally {
      fs.rmSync(appDataRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
  }
} finally {
  fs.rmSync(appRoot, { recursive: true, force: true })
}
