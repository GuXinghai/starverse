import { spawn, execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'

const require = createRequire(import.meta.url)
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..', '..')
const mainPath = path.join(repoRoot, 'dist-electron', 'epoch2MainEntry.js')
const entryPath = path.join(repoRoot, 'scripts', 'smoke', 'generation-v2-real-smoke-main-wrapper.mjs')
const host = '127.0.0.1'
const port = Number.parseInt(process.env.SV_GENERATION_V2_REAL_PREFLIGHT_PORT ?? '5190', 10)
const viteUrl = `http://${host}:${port}/`
const artifactPath = path.join(repoRoot, '.artifacts', 'generation-v2-real-smoke', 'preflight.json')
const userDataDir = String(process.env.SV_GENERATION_V2_REAL_SMOKE_USER_DATA_DIR ?? '').trim()
const appDataDir = String(process.env.SV_GENERATION_V2_REAL_SMOKE_APP_DATA_DIR ?? '').trim()

function once(ms) { return new Promise((resolve) => setTimeout(resolve, ms)) }
function safeCommit() {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8', windowsHide: true }).trim() } catch { return 'unavailable' }
}
function sanitizeError(error) {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/[A-Za-z]:[\\/][^\s"'<>)]*/g, '<absolute-path-redacted>').slice(0, 512)
}
function spawnVite() {
  return spawn(process.execPath, [path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js'),
    '--config', path.join(repoRoot, 'scripts', 'smoke', 'vite.renderer-smoke.config.ts'),
    '--host', host, '--port', String(port), '--strictPort', '--logLevel', 'warn'], {
    cwd: repoRoot, env: { ...process.env, NODE_ENV: 'development', FORCE_COLOR: '0' },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  })
}
async function waitForVite() {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try { if ((await fetch(viteUrl, { cache: 'no-store' })).ok) return } catch { /* retry */ }
    await once(250)
  }
  throw new Error('GENERATION_V2_REAL_PREFLIGHT_VITE_UNAVAILABLE')
}
async function waitForPage(app) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    for (const page of app.windows()) {
      try {
        if (await page.evaluate(() => Boolean(window.generationV2 && document.querySelector('#app')))) return page
      } catch { /* renderer is still loading */ }
    }
    await once(250)
  }
  throw new Error('GENERATION_V2_REAL_PREFLIGHT_RENDERER_UNAVAILABLE')
}
async function close(child) {
  if (!child || child.exitCode !== null) return
  await new Promise((resolve) => {
    child.once('exit', resolve)
    try {
      if (process.platform === 'win32') execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
      else child.kill()
    } catch { child.kill() }
    setTimeout(resolve, 3_000).unref()
  })
}
async function writeArtifact(value) {
  await fs.mkdir(path.dirname(artifactPath), { recursive: true })
  await fs.writeFile(artifactPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function main() {
  const base = Object.freeze({ schemaVersion: 1, commit: safeCommit(), protocol: 'generation-v2-preflight',
    userData: userDataDir ? 'isolated-copied-user-data' : 'normal-product-user-data', realRequests: false })
  const vite = spawnVite()
  let app
  try {
    await waitForVite()
    const electronArgs = userDataDir ? [`--user-data-dir=${userDataDir}`, entryPath] : [entryPath]
    app = await electron.launch({ executablePath: require('electron'), args: electronArgs, cwd: repoRoot,
      env: { ...process.env, ...(appDataDir ? { SV_GENERATION_V2_REAL_SMOKE_APP_DATA_DIR: appDataDir } : {}), NODE_ENV: 'development', VITE_DEV_SERVER_URL: viteUrl, SV_GENERATION_V2_REAL_SMOKE: '1', FORCE_COLOR: '0' },
      timeout: 180_000 })
    const page = await waitForPage(app)
    const observed = await page.evaluate(async () => {
      const api = window.generationV2
      if (!api) throw new Error('GENERATION_V2_REAL_PREFLIGHT_BRIDGE_UNAVAILABLE')
      const credentials = {}
      for (const [key, bridge] of Object.entries(api.credentials ?? {})) {
        const status = await bridge.getStatus()
        credentials[key] = {
          ok: status?.ok ?? null,
          configured: status?.status?.apiKeyConfigured === true || status?.status?.configured === true,
          revision: Number.isSafeInteger(status?.status?.revision) ? status.status.revision : null,
          credentialScopeIdPresent: typeof status?.status?.credentialScopeId === 'string',
        }
      }
      const catalogs = {}
      for (const providerKey of ['deepseek', 'openrouter', 'openai_responses', 'google_ai_studio', 'anthropic_messages']) {
        const result = await api.models?.status?.({ providerKey })
        catalogs[providerKey] = {
          ok: result?.ok ?? null,
          status: result?.status ?? null,
          modelCount: Number.isSafeInteger(result?.modelCount) ? result.modelCount : null,
          activeSnapshotDigestPresent: typeof result?.responseDigest === 'string',
          errorCode: typeof result?.errorCode === 'string' ? result.errorCode : null,
        }
      }
      const workspace = await api.workspace?.ensureDefault?.()
      return { credentials, catalogs, defaultWorkspaceOk: workspace?.ok === true }
    })
    const database = await app.evaluate(({ app }) => {
      const pathModule = process.getBuiltinModule('node:path')
      const { createRequire } = process.getBuiltinModule('node:module')
      const requireFromApp = createRequire(pathModule.join(process.cwd(), 'package.json'))
      const BetterSqlite3 = requireFromApp('better-sqlite3')
      const dbPath = pathModule.join(app.getPath('userData'), 'workspace', 'epoch-2', 'starverse.db')
      const db = new BetterSqlite3(dbPath, { readonly: true, fileMustExist: true })
      try {
        const registry = db.prepare("SELECT registry_revision AS revision FROM tool_registry_head_v2 WHERE singleton_id='current'").get()
        const revisionCount = db.prepare('SELECT count(*) AS count FROM tool_registry_revision_v2').get()
        return { databasePresent: true, toolRegistryHeadPresent: typeof registry?.revision === 'string',
          toolRegistryRevision: typeof registry?.revision === 'string' ? registry.revision : null,
          toolRegistryRevisionCount: Number.isSafeInteger(revisionCount?.count) ? revisionCount.count : null }
      } finally { db.close() }
    })
    const result = Object.freeze({ ...base, result: 'PASS', observed, database })
    await writeArtifact(result)
    process.stdout.write(`${JSON.stringify(result)}\n`)
  } catch (error) {
    const result = Object.freeze({ ...base, result: 'FAIL', error: sanitizeError(error) })
    await writeArtifact(result)
    process.stderr.write(`${JSON.stringify(result)}\n`)
    process.exitCode = 1
  } finally {
    await app?.close().catch(() => undefined)
    await close(vite)
  }
}

main().catch((error) => { process.stderr.write(`GENERATION_V2_REAL_PREFLIGHT_FAILED:${sanitizeError(error)}\n`); process.exit(1) })
