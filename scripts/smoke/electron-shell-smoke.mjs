import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'

const require = createRequire(import.meta.url)
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..', '..')
const port = Number.parseInt(process.env.SV_ELECTRON_SMOKE_PORT ?? '5177', 10)
const host = process.env.SV_ELECTRON_SMOKE_HOST ?? '127.0.0.1'
const viteUrl = `http://${host}:${port}/`
const appUrl = `${viteUrl}?sv-electron-smoke-dfc=1`
const mainPath = path.join(repoRoot, 'dist-electron', 'main.js')
const viteConfigPath = path.join(repoRoot, 'scripts', 'smoke', 'vite.renderer-smoke.config.ts')
const tmpRoot = path.join(os.tmpdir(), `starverse-electron-smoke-${process.pid}`)
const dfcSmokeAssetId = 'asset-dfc-smoke'
const dfcSmokePreviewText = 'Electron smoke DFC markdown preview from selected option.'

function section(title) {
  process.stdout.write(`\n${'='.repeat(80)}\n${title}\n${'='.repeat(80)}\n`)
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { cache: 'no-store' })
      if (response.ok) return
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Vite renderer did not become ready at ${url}: ${lastError?.message ?? 'timeout'}`)
}

function spawnVite() {
  const command = [
    'npx',
    'vite',
    '--config',
    quoteForShell(viteConfigPath),
    '--host',
    host,
    '--port',
    String(port),
    '--strictPort',
    '--logLevel',
    'silent',
  ].join(' ')
  return spawn(command, {
    cwd: repoRoot,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      FORCE_COLOR: '0',
    },
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
}

function quoteForShell(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`
}

async function closeVite(child) {
  if (!child || child.exitCode !== null) return
  await new Promise((resolve) => {
    child.once('exit', resolve)
    child.kill()
    setTimeout(resolve, 3000).unref()
  })
}

async function main() {
  section('DFC-M11 Electron shell smoke')

  if (!(await pathExists(mainPath))) {
    throw new Error(`Missing ${path.relative(repoRoot, mainPath)}. Run an Electron dev/build step before this smoke.`)
  }
  if (!(await pathExists(viteConfigPath))) {
    throw new Error(`Missing ${path.relative(repoRoot, viteConfigPath)}`)
  }

  await fs.mkdir(tmpRoot, { recursive: true })

  section('Start renderer dev server')
  const vite = spawnVite()
  let viteOutput = ''
  vite.stdout.on('data', (chunk) => {
    viteOutput += chunk.toString()
  })
  vite.stderr.on('data', (chunk) => {
    viteOutput += chunk.toString()
  })

  let electronApp
  try {
    await waitForHttp(viteUrl, 30_000)
    console.log(`renderer: ${viteUrl}`)

    section('Launch Electron')
    const electronExecutable = require('electron')
    electronApp = await electron.launch({
      executablePath: electronExecutable,
      args: [`--user-data-dir=${tmpRoot}`, mainPath],
      cwd: repoRoot,
      env: {
        ...process.env,
        NODE_ENV: 'development',
        VITE_DEV_SERVER_URL: appUrl,
        SV_ELECTRON_SMOKE: '1',
        FORCE_COLOR: '0',
      },
      timeout: 60_000,
    })

    const page = await waitForAppWindow(electronApp, 60_000)
    await page.waitForLoadState('domcontentloaded', { timeout: 60_000 })
    await page.waitForSelector('#app', { state: 'attached', timeout: 60_000 })
    await page.waitForFunction(
      () => {
        const appRoot = document.querySelector('#app')
        const composerDraft = document.querySelector('[data-testid="composer-draft"]')
        return Boolean(composerDraft || (appRoot && (appRoot.children.length > 0 || appRoot.textContent?.trim())))
      },
      undefined,
      { timeout: 60_000 },
    )

    section('Assert shell and preload boundary')
    const result = await page.evaluate(() => {
      const w = window
      const appRoot = document.querySelector('#app')
      return {
        appMounted: Boolean(appRoot && (appRoot.children.length > 0 || appRoot.textContent?.trim())),
        composerDraftVisible: Boolean(document.querySelector('[data-testid="composer-draft"]')),
        rawIpcRendererExposed: Object.prototype.hasOwnProperty.call(w, 'ipcRenderer'),
        electronAPIExposed: typeof w.electronAPI === 'object' && w.electronAPI !== null,
        electronStoreExposed: typeof w.electronStore === 'object' && w.electronStore !== null,
        dbBridgeExposed: typeof w.dbBridge === 'object' && w.dbBridge !== null,
      }
    })

    console.log(JSON.stringify(result, null, 2))

    if (!result.appMounted) throw new Error('App root did not mount')
    if (result.rawIpcRendererExposed) throw new Error('raw ipcRenderer is exposed to renderer')
    if (!result.electronAPIExposed) throw new Error('electronAPI scoped preload object is missing')
    if (!result.electronStoreExposed) throw new Error('electronStore scoped preload object is missing')
    if (!result.dbBridgeExposed) throw new Error('dbBridge scoped preload object is missing')

    section('Assert DFC attachment smoke seam')
    await page.waitForSelector(`[data-testid="draft-attachment-card-${dfcSmokeAssetId}"]`, { timeout: 60_000 })
    await page.click(`[data-testid="draft-attachment-card-${dfcSmokeAssetId}"]`)
    await page.waitForSelector('[data-testid="draft-attachment-details-dialog"]', { timeout: 60_000 })
    await page.waitForSelector('[data-testid="draft-attachment-dfc-option-markdown"]', { timeout: 60_000 })
    await page.waitForSelector('[data-testid="draft-attachment-dfc-preview-text"]', { timeout: 60_000 })

    const dfcResult = await page.evaluate(() => ({
      attachmentVisible: Boolean(document.querySelector('[data-testid="draft-attachment-card-asset-dfc-smoke"]')),
      detailsVisible: Boolean(document.querySelector('[data-testid="draft-attachment-details-dialog"]')),
      markdownOptionText: document.querySelector('[data-testid="draft-attachment-dfc-option-markdown"]')?.textContent ?? '',
      previewText: document.querySelector('[data-testid="draft-attachment-dfc-preview-text"]')?.textContent ?? '',
    }))
    console.log(JSON.stringify(dfcResult, null, 2))

    if (!dfcResult.attachmentVisible) throw new Error('DFC smoke attachment card is missing')
    if (!dfcResult.detailsVisible) throw new Error('DFC smoke attachment details dialog is missing')
    if (!dfcResult.markdownOptionText.includes('Markdown')) throw new Error('DFC markdown option is missing')
    if (!dfcResult.previewText.includes(dfcSmokePreviewText)) throw new Error('DFC preview text is missing')

    console.log('\nPASS: Electron DFC attachment smoke completed')
  } catch (error) {
    if (viteOutput.trim()) {
      section('Vite output')
      console.error(viteOutput.trim().slice(-4000))
    }
    throw error
  } finally {
    if (electronApp) await electronApp.close().catch(() => undefined)
    await closeVite(vite)
    await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function waitForAppWindow(electronApp, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let lastDiagnostics = []
  while (Date.now() < deadline) {
    const windows = electronApp.windows()
    for (const page of windows) {
      const diagnostics = await describePage(page)
      if (diagnostics.hasAppRoot || diagnostics.url.startsWith(viteUrl)) return page
    }

    lastDiagnostics = await Promise.all(windows.map((page) => describePage(page)))
    const remaining = Math.max(250, deadline - Date.now())
    try {
      const page = await electronApp.waitForEvent('window', { timeout: Math.min(1000, remaining) })
      const diagnostics = await describePage(page)
      if (diagnostics.hasAppRoot || diagnostics.url.startsWith(viteUrl)) return page
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }

  throw new Error(`App window did not become ready. Windows: ${JSON.stringify(lastDiagnostics)}`)
}

async function describePage(page) {
  try {
    return await page.evaluate(() => ({
      url: window.location.href,
      title: document.title,
      hasAppRoot: Boolean(document.querySelector('#app')),
    }))
  } catch {
    return {
      url: page.url(),
      title: '',
      hasAppRoot: false,
    }
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`\nFAIL: ${message}\n`)
  process.exit(1)
})
