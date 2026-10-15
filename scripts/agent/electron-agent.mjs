import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { randomBytes } from 'node:crypto'
import { parseArgs } from 'node:util'
import { createControlServer, locate, sendCommand, actions } from './control.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(import.meta.url)

function parse(argv) {
  return parseArgs({ args: argv, allowPositionals: true, options: {
    profile: { type: 'string', default: 'default' }, root: { type: 'string' },
    show: { type: 'boolean', default: false }, offline: { type: 'boolean', default: false },
    check: { type: 'boolean', default: false }, 'skip-build': { type: 'boolean', default: false },
    json: { type: 'string' }, request: { type: 'string' },
  } })
}

export function resolveAgentProfilePaths(values) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/.test(values.profile)) throw new Error('Invalid profile name')
  // Avoid packaged-app LocalAppData virtualization: terminals and Codex must
  // resolve the same reusable profile, regardless of the launcher's identity.
  const base = values.root ? path.resolve(values.root) : path.join(os.homedir(), '.starverse-agent', 'profiles')
  const profileRoot = path.join(base, values.profile)
  const relative = path.relative(repoRoot, profileRoot)
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
    throw new Error('Agent profiles must be outside the repository')
  }
  return { profileRoot, marker: path.join(profileRoot, '.starverse-agent-profile.json'),
    controlFile: path.join(profileRoot, 'control.json'), lock: path.join(profileRoot, 'launcher.lock') }
}

export async function prepareAgentProfile(profile) {
  await fs.mkdir(profile.profileRoot, { recursive: true })
  if ((await fs.lstat(profile.profileRoot)).isSymbolicLink() ||
      path.relative(profile.profileRoot, await fs.realpath(profile.profileRoot)) !== '') throw new Error('Profile links are forbidden')
  let marker
  try { marker = JSON.parse(await fs.readFile(profile.marker, 'utf8')) } catch (error) {
    if (error.code !== 'ENOENT') throw error
    if ((await fs.readdir(profile.profileRoot)).length !== 0) throw new Error('Refusing an unowned, nonempty profile directory')
    marker = { kind: 'starverse-agent-profile-v1', repositoryRoot: repoRoot }
    await fs.writeFile(profile.marker, JSON.stringify(marker), { flag: 'wx', mode: 0o600 })
  }
  if (marker.kind !== 'starverse-agent-profile-v1' || marker.repositoryRoot !== repoRoot) throw new Error('Profile owner does not match this checkout')
  try {
    const existing = JSON.parse(await fs.readFile(profile.lock, 'utf8'))
    if (!Number.isSafeInteger(existing.pid) || existing.pid <= 0) throw new Error('Invalid launcher lock')
    try { process.kill(existing.pid, 0) } catch (error) {
      if (error.code !== 'ESRCH') throw error
      await fs.unlink(profile.lock)
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  const lock = await fs.open(profile.lock, 'wx', 0o600)
  await lock.writeFile(JSON.stringify({ pid: process.pid }))
  await lock.close()
}

async function buildApplication() {
  const { build } = await import('vite-plugin-electron')
  const shared = { mode: 'development', resolve: { alias: { '@': path.join(repoRoot, 'src') } },
    build: { minify: false, sourcemap: false }, logLevel: 'warn' }
  await build({ entry: 'electron/epoch2MainEntry.ts', vite: {
    ...shared, build: { ...shared.build, rollupOptions: { external: ['better-sqlite3'] } },
  } })
  await build({ vite: { ...shared, build: { ...shared.build, rollupOptions: {
    input: path.join(repoRoot, 'electron/preload.ts'), output: {
      format: 'cjs', inlineDynamicImports: true, entryFileNames: 'preload.mjs',
      chunkFileNames: '[name].mjs', assetFileNames: '[name].[ext]',
    },
  } } } })
}

async function start(profile, values) {
  await prepareAgentProfile(profile)
  const runRoot = path.join(profile.profileRoot, 'sessions', `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(4).toString('hex')}`)
  let vite, electronApp, control
  let closing
  let stopping = false
  let ready = false
  let lastState
  const ensureRunning = () => { if (stopping) throw new Error('AGENT_START_CANCELLED') }
  const shutdown = () => {
    if (closing) return closing
    stopping = true
    closing = (async () => {
      if (control) await control.close()
      if (electronApp) {
        const child = electronApp.process()
        let timer
        try {
          await Promise.race([electronApp.close(), new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('ELECTRON_CLOSE_TIMEOUT')), 10000)
          })])
        } catch { if (child.exitCode === null) child.kill() }
        finally { clearTimeout(timer) }
      }
      if (vite) await vite.close()
      if (lastState) await fs.writeFile(profile.controlFile, JSON.stringify({ ...lastState,
        state: 'stopped', endpoint: null, token: undefined }, null, 2), { mode: 0o600 })
      await fs.unlink(profile.lock).catch(() => {})
    })()
    return closing
  }
  const handleSignal = () => {
    stopping = true
    if (ready) void shutdown()
    else {
      // Abort renderer readiness waits too; startup's catch will release the lock.
      if (electronApp) void electronApp.close().catch(() => {})
      if (vite) void vite.close().catch(() => {})
    }
  }
  process.once('SIGINT', handleSignal)
  process.once('SIGTERM', handleSignal)
  try {
    await fs.mkdir(runRoot, { recursive: true })
    lastState = { state: 'starting', pid: process.pid, runRoot, profileRoot: profile.profileRoot, endpoint: null }
    await fs.writeFile(profile.controlFile, JSON.stringify(lastState, null, 2), { mode: 0o600 })
    if (!values['skip-build']) await buildApplication()
    ensureRunning()
    const { createServer } = await import('vite')
    vite = await createServer({ root: repoRoot,
      configFile: path.join(repoRoot, 'scripts/smoke/vite.renderer-smoke.config.ts'),
      cacheDir: path.join(profile.profileRoot, 'vite-cache'), logLevel: 'warn',
      server: { host: '127.0.0.1', port: 0, open: false },
    })
    await vite.listen()
    ensureRunning()
    const address = vite.httpServer.address()
    const appUrl = `http://127.0.0.1:${address.port}/`
    const env = { ...process.env }
    for (const key of Object.keys(env)) {
      if (key.startsWith('SV_AGENT_') || key.startsWith('SV_EPOCH2_SMOKE_') ||
          key === 'SV_ELECTRON_SMOKE' || key === 'SV_ELECTRON_COMPATIBLE_E2E' ||
          key === 'ELECTRON_RUN_AS_NODE') delete env[key]
    }
    Object.assign(env, { NODE_ENV: 'development', VITE_DEV_SERVER_URL: appUrl,
      SV_AGENT_AUTOMATION: '1', SV_AGENT_ISOLATED_PROFILE: '1', SV_AGENT_PROFILE_ROOT: profile.profileRoot,
      SV_AGENT_SHOW_WINDOW: values.show ? '1' : '0', SV_AGENT_NETWORK: values.offline ? 'offline' : 'normal' })
    const { _electron } = await import('playwright')
    electronApp = await _electron.launch({ executablePath: require('electron'), cwd: repoRoot,
      args: [`--user-data-dir=${path.join(profile.profileRoot, 'user-data')}`, path.join(repoRoot, 'dist-electron/epoch2MainEntry.js')],
      env, timeout: 60000 })
    ensureRunning()
    const append = (file, value) => { void fs.appendFile(path.join(runRoot, file), value).catch(() => {}) }
    electronApp.process().stdout?.on('data', (chunk) => append('electron.log', chunk))
    electronApp.process().stderr?.on('data', (chunk) => append('electron.log', chunk))
    electronApp.on('close', () => { if (!stopping) void shutdown() })
    const page = await electronApp.firstWindow({ timeout: 60000 })
    page.on('pageerror', (error) => append('renderer-errors.log', `${error.message}\n`))
    if (values.offline) {
      const allowed = (url) => { try { return new URL(url).origin === new URL(appUrl).origin } catch { return false } }
      await page.context().route('**/*', (route) => allowed(route.request().url()) ? route.continue() : route.abort('blockedbyclient'))
      await page.context().routeWebSocket('**/*', (socket) => {
        if (socket.url().startsWith(appUrl.replace('http:', 'ws:'))) socket.connectToServer()
        else socket.close()
      })
    }
    await page.waitForFunction(() => document.querySelector('#app')?.children.length > 0 &&
      Boolean(window.generationV2?.workspace && window.generationV2?.composer), undefined, { timeout: 60000 })
    await page.locator('textarea').first().waitFor({ state: 'attached', timeout: 60000 })
    ensureRunning()
    const inspect = async () => ({
      profileRoot: profile.profileRoot, runRoot, network: values.offline ? 'offline' : 'normal',
      rendererUrl: page.url(), rendererAttached: !page.isClosed(),
      ...await electronApp.evaluate(({ app, BrowserWindow }) => ({
        electronVersion: process.versions.electron, appData: app.getPath('appData'),
        userData: app.getPath('userData'), sessionData: app.getPath('sessionData'),
        windows: BrowserWindow.getAllWindows().map((window) => ({ visible: window.isVisible(),
          focused: window.isFocused(), devToolsOpen: window.webContents.isDevToolsOpened(),
          backgroundThrottling: window.webContents.getBackgroundThrottling(), offscreen: window.webContents.isOffscreen() })),
      })),
    })
    const state = await inspect()
    if (path.relative(path.join(profile.profileRoot, 'app-data'), state.appData) !== '' ||
        path.relative(path.join(profile.profileRoot, 'user-data'), state.userData) !== '' ||
        path.relative(state.userData, state.sessionData) !== '') throw new Error('PROFILE_ISOLATION_CHECK_FAILED')
    if (!values.show && state.windows.some((window) => window.visible || window.focused || window.devToolsOpen)) {
      throw new Error('BACKGROUND_WINDOW_CHECK_FAILED')
    }
    const dispatch = async (command) => {
      const options = { timeout: Math.min(Math.max(Number(command.timeoutMs) || 5000, 1), 30000) }
      switch (command.action) {
        case 'status': return inspect()
        case 'snapshot': {
          const text = await (command.target ? locate(page, command.target) : page.locator('body')).ariaSnapshot({ timeout: options.timeout })
          return { text: text.slice(0, 30000), truncated: text.length > 30000 }
        }
        case 'screenshot': {
          const filename = command.filename ?? `screenshot-${Date.now()}.png`
          if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*\.png$/.test(filename)) throw new Error('Invalid screenshot filename')
          const file = path.join(runRoot, filename)
          if (!values.show) {
            if (command.fullPage) throw new Error('Full-page screenshots require --show; background screenshots capture the viewport')
            // Wake painting while keeping the native window hidden.
            const window = await electronApp.browserWindow(page)
            let timer
            try {
              const capture = window.evaluate(async (target) => {
                const image = await target.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })
                return image.toPNG().toString('base64')
              })
              const png = await Promise.race([capture, new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error('BACKGROUND_CAPTURE_TIMEOUT')), options.timeout)
              })])
              await fs.writeFile(file, Buffer.from(png, 'base64'))
            } finally { clearTimeout(timer); await window.dispose() }
          } else {
            await page.screenshot({ path: file, fullPage: command.fullPage === true, timeout: options.timeout })
          }
          return { path: file, method: values.show ? 'playwright' : 'electron.capturePage' }
        }
        case 'click': await locate(page, command.target).click(options); break
        case 'fill': await locate(page, command.target).fill(command.value, options); break
        case 'press': await locate(page, command.target).press(command.key, options); break
        case 'select': await locate(page, command.target).selectOption(command.value, options); break
        case 'check': await locate(page, command.target).setChecked(command.value ?? true, options); break
        case 'scroll': {
          if (!command.target) throw new Error('scroll requires a target')
          await locate(page, command.target).evaluate((element, delta) => element.scrollBy(delta), {
            top: Math.max(-10000, Math.min(10000, Number(command.top) || 0)),
            left: Math.max(-10000, Math.min(10000, Number(command.left) || 0)),
          }, options)
          break
        }
        case 'stop': setTimeout(() => { void shutdown() }, 100); return { stopping: true }
        default: throw new Error('CONTROL_ACTION_INVALID')
      }
      return { completed: true }
    }
    control = await createControlServer(dispatch)
    ensureRunning()
    lastState = { state: 'ready', pid: process.pid, runRoot, profileRoot: profile.profileRoot,
      endpoint: control.endpoint, token: control.token, network: state.network, hidden: !values.show }
    await fs.writeFile(profile.controlFile, JSON.stringify(lastState, null, 2), { mode: 0o600 })
    ensureRunning()
    console.log(JSON.stringify({ state: 'ready', controlFile: profile.controlFile, ...state }, null, 2))
    ready = true
    if (values.check) {
      const snapshot = await sendCommand(control, { action: 'snapshot' })
      const screenshot = await sendCommand(control, { action: 'screenshot', filename: 'connection-check.png' })
      const afterCapture = await inspect()
      await fs.writeFile(path.join(runRoot, 'connection-check.json'), JSON.stringify({ state,
        afterCapture, snapshot, screenshot, checkedAt: new Date().toISOString() }, null, 2))
      if (!snapshot.ok || !snapshot.value.text || !screenshot.ok) {
        throw new Error(`CONTROL_CONNECTION_CHECK_FAILED: ${snapshot.error ?? screenshot.error ?? 'empty snapshot'}`)
      }
      if (!values.show && afterCapture.windows.some((window) => window.visible || window.focused || window.devToolsOpen)) {
        throw new Error('BACKGROUND_CAPTURE_FOCUSED_WINDOW')
      }
      console.log(JSON.stringify({ check: 'passed', screenshot: screenshot.value.path }))
      await shutdown()
    }
  } catch (error) {
    await fs.mkdir(runRoot, { recursive: true }).catch(() => {})
    await fs.writeFile(path.join(runRoot, 'startup-error.log'), String(error?.stack ?? error)).catch(() => {})
    await shutdown()
    throw error
  }
}

export async function main(argv = process.argv.slice(2)) {
  const { values, positionals } = parse(argv)
  const action = positionals[0] ?? 'start'
  process.chdir(repoRoot)
  const profile = resolveAgentProfilePaths(values)
  if (action === 'start') return start(profile, values)
  if (!actions.has(action)) throw new Error(`Unknown command: ${action}`)
  const control = JSON.parse(await fs.readFile(profile.controlFile, 'utf8'))
  if (control.state !== 'ready') throw new Error('Agent is stopped; start it first')
  const extra = values.request ? JSON.parse(await fs.readFile(values.request, 'utf8')) : JSON.parse(values.json ?? '{}')
  const result = await sendCommand(control, { ...extra, action })
  console.log(JSON.stringify(result, null, 2))
  if (!result.ok) process.exitCode = 1
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1 })
}
