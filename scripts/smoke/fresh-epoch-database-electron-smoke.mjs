import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { build } from 'esbuild'

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..')
const cacheRoot = path.join(repositoryRoot, 'node_modules', '.cache', 'starverse-electron-smoke')
const appRoot = path.join(cacheRoot, 'fresh-epoch-database-electron-app')
const outfile = path.join(appRoot, 'main.mjs')
fs.rmSync(appRoot, { recursive: true, force: true })
fs.mkdirSync(path.join(appRoot, 'infra', 'db', 'v2'), { recursive: true })
fs.writeFileSync(path.join(appRoot, 'package.json'), JSON.stringify({ name: 'starverse-epoch-db-smoke', main: 'main.mjs' }))
for (const fileName of ['coreConversationSchema.sql', 'generationConfigSchema.sql',
  'attachmentAssetSchema.sql', 'openRouterImagesSchema.sql', 'generationExecutionSchema.sql']) {
  fs.copyFileSync(path.join(repositoryRoot, 'infra', 'db', 'v2', fileName),
    path.join(appRoot, 'infra', 'db', 'v2', fileName))
}
await build({
  entryPoints: [path.join(repositoryRoot, 'scripts', 'smoke', 'fresh-epoch-database-electron-entry.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['electron', 'better-sqlite3'],
  sourcemap: false,
  logLevel: 'silent',
})
const require = createRequire(import.meta.url)
const electronPath = require('electron')
const result = spawnSync(electronPath, [appRoot], {
  cwd: repositoryRoot,
  env: process.env,
  encoding: 'utf8',
  stdio: 'pipe',
  timeout: 120_000,
})
if (result.stdout) process.stdout.write(result.stdout)
if (result.stderr) process.stderr.write(result.stderr)
fs.rmSync(appRoot, { recursive: true, force: true })
if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)
