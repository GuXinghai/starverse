import { spawn, execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'

const require = createRequire(import.meta.url)
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const mainPath = path.join(repoRoot, 'dist-electron', 'epoch2MainEntry.js')
const host = '127.0.0.1'
const port = Number.parseInt(process.env.SV_EPOCH2_NORMAL_PROFILE_INIT_PORT ?? '5190', 10)
const viteUrl = `http://${host}:${port}/`
const approved = process.env.SV_EPOCH2_NORMAL_PROFILE_RESET_APPROVED === '1'
const artifactRoot = path.join(repoRoot, '.artifacts', 'epoch2-normal-profile-initialization')
const artifactPath = path.join(artifactRoot, 'result.json')
const rendererDiagnostics = []

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const exists = async (target) => fs.access(target).then(() => true, () => false)
function commit() { try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8', windowsHide: true }).trim() } catch { return 'unavailable' } }
async function write(value) { await fs.mkdir(artifactRoot, { recursive: true }); await fs.writeFile(artifactPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8') }
function launchVite() {
  return spawn(process.execPath, [path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js'), '--config', 'scripts/smoke/vite.renderer-smoke.config.ts', '--host', host, '--port', String(port), '--strictPort', '--logLevel', 'warn'], {
    cwd: repoRoot, env: { ...process.env, NODE_ENV: 'development', FORCE_COLOR: '0' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  })
}
async function waitFor(url, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try { if (await predicate(url)) return } catch { /* retry */ }
    await sleep(250)
  }
  throw new Error('EPOCH2_NORMAL_PROFILE_INITIALIZATION_TIMEOUT')
}
async function close(child) {
  if (!child || child.exitCode !== null) return
  await new Promise((resolve) => {
    child.once('exit', resolve)
    try { process.platform === 'win32' ? execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }) : child.kill() } catch { child.kill() }
    setTimeout(resolve, 3_000).unref()
  })
}
function profileRoot() {
  if (process.platform !== 'win32' || !process.env.APPDATA) throw new Error('EPOCH2_NORMAL_PROFILE_INITIALIZATION_PLATFORM_UNSUPPORTED')
  return path.join(process.env.APPDATA, 'Starverse')
}

async function main() {
  const base = Object.freeze({ schemaVersion: 1, commit: commit(), action: 'normal_profile_epoch2_initialization', providerRequest: false })
  if (!approved) {
    const result = Object.freeze({ ...base, result: 'NOT_RUN_EXPLICIT_RESET_APPROVAL_MISSING' })
    await write(result); process.stdout.write(`${JSON.stringify(result)}\n`); return
  }
  if (!(await exists(mainPath))) throw new Error('EPOCH2_NORMAL_PROFILE_INITIALIZATION_MAIN_BUILD_MISSING')
  const root = profileRoot()
  const vite = launchVite()
  let app
  try {
    await waitFor(viteUrl, async (url) => (await fetch(url, { cache: 'no-store' })).ok, 30_000)
    // No --user-data-dir: identity bootstrap intentionally targets normal Starverse userData.
    app = await electron.launch({ executablePath: require('electron'), args: [mainPath], cwd: repoRoot,
      env: { ...process.env, NODE_ENV: 'development', VITE_DEV_SERVER_URL: viteUrl, SV_EPOCH2_NORMAL_PROFILE_INIT: '1', FORCE_COLOR: '0' }, timeout: 60_000 })
    app.on('window', (page) => {
      page.on('pageerror', (error) => rendererDiagnostics.push({ kind: 'pageerror', message: String(error?.message ?? error).slice(0, 512) }))
      page.on('console', (message) => {
        if (message.type() === 'error') rendererDiagnostics.push({ kind: 'console', message: String(message.text()).slice(0, 512) })
      })
    })
    await waitFor(null, async () => {
      for (const page of app.windows()) {
        try {
          const ready = await page.evaluate(async () => {
            if (!window.generationV2?.workspace) return false
            const result = await window.generationV2.workspace.ensureDefault()
            return result?.ok === true && typeof result.value?.conversationId === 'string' && typeof result.value?.branchId === 'string'
          })
          if (ready) return true
        } catch (error) { rendererDiagnostics.push({ kind: 'evaluate', url: page.url(), message: String(error?.message ?? error).slice(0, 512) }) }
      }
      return false
    }, 90_000)
    await app.close(); app = null
    const epochDatabasePresent = await exists(path.join(root, 'workspace', 'epoch-2', 'starverse.db'))
    const legacyChatDatabasePresent = await exists(path.join(root, 'chat.db'))
    const result = Object.freeze({ ...base, epochDatabasePresent, legacyChatDatabasePresent,
      result: epochDatabasePresent && !legacyChatDatabasePresent ? 'PASS' : 'FAIL_POSTCONDITION' })
    await write(result); process.stdout.write(`${JSON.stringify(result)}\n`)
    if (result.result !== 'PASS') throw new Error(result.result)
  } catch (error) {
    const result = Object.freeze({ ...base, result: 'FAIL', error: (error instanceof Error ? error.message : String(error)).slice(0, 16_384),
      pages: app ? app.windows().map((page) => page.url()) : [], rendererDiagnostics: rendererDiagnostics.slice(-12) })
    await write(result); process.stderr.write(`${JSON.stringify(result)}\n`); throw error
  } finally { await app?.close().catch(() => undefined); await close(vite) }
}

main().catch((error) => { process.stderr.write(`EPOCH2_NORMAL_PROFILE_INITIALIZATION_FAILED:${error instanceof Error ? error.message : String(error)}\n`); process.exit(1) })
