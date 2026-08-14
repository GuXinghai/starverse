import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { build } from 'esbuild'

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..')
const cacheRoot = path.join(repositoryRoot, 'node_modules', '.cache', 'starverse-electron-smoke')
const appRoot = path.join(cacheRoot, 'model-provider-identity-fresh-profile-app')
const outfile = path.join(appRoot, 'main.mjs')
const profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'starverse-model-provider-identity-'))
const electronPath = createRequire(import.meta.url)('electron')

fs.rmSync(appRoot, { recursive: true, force: true })
fs.mkdirSync(path.join(appRoot, 'infra', 'db', 'v2'), { recursive: true })
fs.writeFileSync(path.join(appRoot, 'package.json'), JSON.stringify({
  name: 'starverse-model-provider-identity-fresh-profile-smoke', main: 'main.mjs',
}))
for (const entry of fs.readdirSync(path.join(repositoryRoot, 'infra', 'db', 'v2'), { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.sql')) {
    fs.copyFileSync(path.join(repositoryRoot, 'infra', 'db', 'v2', entry.name),
      path.join(appRoot, 'infra', 'db', 'v2', entry.name))
  }
}
await build({
  entryPoints: [path.join(repositoryRoot, 'scripts', 'smoke', 'model-provider-identity-fresh-profile-entry.ts')],
  outfile, bundle: true, platform: 'node', format: 'esm', target: 'node22',
  external: ['electron', 'better-sqlite3'], sourcemap: false, logLevel: 'silent',
})

try {
  for (const phase of ['write', 'verify']) {
    const run = spawnSync(electronPath, [appRoot], {
      cwd: repositoryRoot,
      env: { ...process.env, SV_IDENTITY_FRESH_PROFILE_ROOT: profileRoot, SV_IDENTITY_FRESH_PROFILE_PHASE: phase },
      encoding: 'utf8', stdio: 'pipe', timeout: 120_000,
    })
    if (run.stdout) process.stdout.write(run.stdout)
    if (run.stderr) process.stderr.write(run.stderr)
    if (run.error) throw run.error
    if (run.status !== 0 || !run.stdout.includes(`[model-provider-identity-fresh-profile] ${phase} PASS`)) {
      throw new Error(`MODEL_PROVIDER_IDENTITY_FRESH_PROFILE_${phase.toUpperCase()}_FAILED`)
    }
  }
} finally {
  fs.rmSync(profileRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  fs.rmSync(appRoot, { recursive: true, force: true })
}
