import { execFileSync, spawn } from 'node:child_process'
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
const artifactRoot = path.join(repoRoot, '.artifacts', 'white-screen', 'electron-smoke')
const screenshotPath = path.join(artifactRoot, 'screenshot.png')
const domSnapshotPath = path.join(artifactRoot, 'dom-snapshot.html')
const runtimeStatePath = path.join(artifactRoot, 'runtime-state.json')
const consoleLogPath = path.join(artifactRoot, 'console.jsonl')
const pageErrorLogPath = path.join(artifactRoot, 'pageerror.jsonl')
const requestFailedLogPath = path.join(artifactRoot, 'requestfailed.jsonl')
const responseErrorLogPath = path.join(artifactRoot, 'responses-4xx-5xx.jsonl')
const runInfoPath = path.join(artifactRoot, 'run-info.json')
const dfcSmokeFixtureFilename = 'electron-smoke-backend-dfc.md'
const dfcSmokeFixturePreviewText = 'Backend-owned DFC markdown preview from smoke fixture.'
const dfcSmokeFixturePath = path.join(tmpRoot, dfcSmokeFixtureFilename)
const htmlPdfSmokeFixtureFilename = 'electron-smoke-html-pdf.html'
const htmlPdfSmokeFixturePath = path.join(tmpRoot, htmlPdfSmokeFixtureFilename)
const htmlPdfSmokeFixtureTitle = 'Electron Smoke HTML PDF'

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
    'info',
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

function toJsonLine(value) {
  return `${JSON.stringify(value)}\n`
}

function redactDiagnosticText(value) {
  if (typeof value !== 'string') return value
  return value
    .replace(/file:\/\/\/?[^\s"'<>)]*/gi, '<file-url-redacted>')
    .replace(/(^|[^A-Za-z])([A-Za-z]:[\\/][^\s"'<>)]*)/g, '$1<absolute-path-redacted>')
}

function redactDiagnosticValue(value) {
  if (typeof value === 'string') return redactDiagnosticText(value)
  if (!value || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((item) => redactDiagnosticValue(item))
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactDiagnosticValue(item)]))
}

function summarizeError(error) {
  if (!error) return null
  return redactDiagnosticValue({
    name: typeof error.name === 'string' ? error.name : undefined,
    message: typeof error.message === 'string' ? error.message : String(error),
    stack: typeof error.stack === 'string' ? error.stack : undefined,
  })
}

function artifactLabel(filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/g, '/')
}

function buildRunInfoBase() {
  return {
    userData: {
      mode: 'clean-temp',
      explicitUserDataDir: true,
      path: '<temp-clean-profile>',
    },
    artifactRoot: artifactLabel(artifactRoot),
    viteUrl,
    appUrl,
    mainPath: artifactLabel(mainPath),
    viteConfigPath: artifactLabel(viteConfigPath),
  }
}

function createDiagnostics() {
  const pageIds = new WeakMap()
  let nextPageId = 1
  const getPageId = (page) => {
    if (!pageIds.has(page)) pageIds.set(page, nextPageId++)
    return pageIds.get(page)
  }
  const appendJsonl = async (filePath, payload) => {
    await fs.appendFile(filePath, toJsonLine({ timestamp: new Date().toISOString(), ...redactDiagnosticValue(payload) }), 'utf8').catch(() => undefined)
  }
  return {
    getPageId,
    appendConsole: (page, message) => appendJsonl(consoleLogPath, {
      pageId: getPageId(page),
      type: message.type(),
      text: message.text(),
      location: message.location(),
    }),
    appendPageError: (page, error) => appendJsonl(pageErrorLogPath, { pageId: getPageId(page), error: summarizeError(error) }),
    appendRequestFailed: (page, request) => appendJsonl(requestFailedLogPath, {
      pageId: getPageId(page),
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      failure: request.failure(),
    }),
    appendResponseError: (page, response) => appendJsonl(responseErrorLogPath, {
      pageId: getPageId(page),
      url: response.url(),
      status: response.status(),
      statusText: response.statusText(),
      requestMethod: response.request().method(),
      resourceType: response.request().resourceType(),
    }),
  }
}

async function prepareArtifactFiles() {
  await fs.mkdir(artifactRoot, { recursive: true })
  await Promise.all([screenshotPath, domSnapshotPath, runtimeStatePath, runInfoPath].map((filePath) => fs.rm(filePath, { force: true }).catch(() => undefined)))
  await Promise.all([
    fs.writeFile(consoleLogPath, '', 'utf8'),
    fs.writeFile(pageErrorLogPath, '', 'utf8'),
    fs.writeFile(requestFailedLogPath, '', 'utf8'),
    fs.writeFile(responseErrorLogPath, '', 'utf8'),
  ])
  await writeRunInfo({ status: 'started', startedAt: new Date().toISOString(), ...buildRunInfoBase() })
}

async function writeRunInfo(payload) {
  await fs.writeFile(runInfoPath, JSON.stringify(redactDiagnosticValue(payload), null, 2), 'utf8')
}

function installPageDiagnostics(page, diagnostics) {
  diagnostics.getPageId(page)
  page.on('console', (message) => void diagnostics.appendConsole(page, message))
  page.on('pageerror', (error) => void diagnostics.appendPageError(page, error))
  page.on('requestfailed', (request) => void diagnostics.appendRequestFailed(page, request))
  page.on('response', (response) => {
    if (response.status() >= 400) void diagnostics.appendResponseError(page, response)
  })
}

function installElectronDiagnostics(electronApp, diagnostics) {
  for (const page of electronApp.windows()) installPageDiagnostics(page, diagnostics)
  electronApp.on('window', (page) => installPageDiagnostics(page, diagnostics))
}

async function captureVisualDiagnostics(page, phase) {
  await fs.mkdir(artifactRoot, { recursive: true })
  const runtimeState = await page.evaluate((capturePhase) => {
    const styleProps = ['display', 'visibility', 'opacity', 'width', 'height', 'backgroundColor', 'color', 'position', 'zIndex', 'overflow']
    const rectFor = (element) => {
      if (!element) return null
      const rect = element.getBoundingClientRect()
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left }
    }
    const styleFor = (element) => {
      if (!element) return null
      const style = window.getComputedStyle(element)
      return Object.fromEntries(styleProps.map((prop) => [prop, style[prop]]))
    }
    const visibilityFor = (element) => {
      if (!element) return null
      const style = window.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return { visible: style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0, display: style.display, visibility: style.visibility, opacity: style.opacity }
    }
    const selectorPresence = (selector) => {
      const element = document.querySelector(selector)
      return { selector, present: Boolean(element), rect: rectFor(element), visibility: visibilityFor(element), textSample: element?.textContent?.trim().slice(0, 300) ?? '' }
    }
    const describeElement = (element) => {
      const style = window.getComputedStyle(element)
      return { tag: element.tagName.toLowerCase(), id: element.id || '', className: typeof element.className === 'string' ? element.className : '', rect: rectFor(element), visibility: visibilityFor(element), opacity: style.opacity, zIndex: style.zIndex, backgroundColor: style.backgroundColor, position: style.position }
    }
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const viewportArea = viewportWidth * viewportHeight
    const appRoot = document.querySelector('#app')
    const overlayCandidates = Array.from(document.body.querySelectorAll('*')).map((element) => {
      const style = window.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      const zIndexNumber = Number.parseInt(style.zIndex, 10)
      const area = rect.width * rect.height
      const background = style.backgroundColor
      const hasOpaqueBackground = background !== 'rgba(0, 0, 0, 0)' && background !== 'transparent'
      const coversWindow = viewportArea > 0 && area / viewportArea >= 0.7
      if (!coversWindow || !hasOpaqueBackground || Number.isNaN(zIndexNumber) || zIndexNumber < 10) return null
      return describeElement(element)
    }).filter(Boolean).slice(0, 20)
    return {
      phase: capturePhase,
      capturedAt: new Date().toISOString(),
      url: window.location.href,
      readyState: document.readyState,
      title: document.title,
      viewport: { width: viewportWidth, height: viewportHeight },
      hasAppRoot: Boolean(appRoot),
      appInnerHtmlLength: appRoot?.innerHTML?.length ?? 0,
      bodyInnerTextLength: document.body?.innerText?.length ?? 0,
      visibleTextSample: document.body?.innerText?.trim().slice(0, 2000) ?? '',
      appElementCount: appRoot ? appRoot.querySelectorAll('*').length : 0,
      bounds: { html: rectFor(document.documentElement), body: rectFor(document.body), app: rectFor(appRoot) },
      computedStyle: { html: styleFor(document.documentElement), body: styleFor(document.body), app: styleFor(appRoot) },
      selectorPresence: ['#app', '[data-testid="composer-draft"]', '[data-testid="draft-attachment-details-dialog"]', '[data-testid="draft-attachment-dfc-option-markdown"]', '[data-testid="draft-attachment-dfc-option-pdf_attachment"]', '[data-testid="draft-attachment-card"]', '[data-testid^="draft-attachment-card-"]'].map(selectorPresence),
      bodyChildren: Array.from(document.body.children).map(describeElement),
      overlayCandidates,
    }
  }, phase)
  await fs.writeFile(runtimeStatePath, JSON.stringify(runtimeState, null, 2), 'utf8')
  await fs.writeFile(domSnapshotPath, await page.content(), 'utf8')
  await page.screenshot({ path: screenshotPath, fullPage: true })
  return runtimeState
}

async function captureVisualDiagnosticsBestEffort(page, phase) {
  try {
    return { ok: true, state: await captureVisualDiagnostics(page, phase), error: null }
  } catch (error) {
    await fs.writeFile(runtimeStatePath, JSON.stringify({ phase, capturedAt: new Date().toISOString(), diagnosticsCaptureFailed: true, error: summarizeError(error) }, null, 2), 'utf8').catch(() => undefined)
    return { ok: false, state: null, error: summarizeError(error) }
  }
}

async function closeVite(child) {
  if (!child || child.exitCode !== null) return
  await new Promise((resolve) => {
    child.once('exit', resolve)
    try {
      if (process.platform === 'win32') {
        execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
      } else {
        child.kill()
      }
    } catch {
      child.kill()
    }
    setTimeout(resolve, 3000).unref()
  })
}

async function main() {
  section('DFC-M11 Electron shell smoke')
  await prepareArtifactFiles()

  if (!(await pathExists(mainPath))) {
    throw new Error(`Missing ${path.relative(repoRoot, mainPath)}. Run an Electron dev/build step before this smoke.`)
  }
  if (!(await pathExists(viteConfigPath))) {
    throw new Error(`Missing ${path.relative(repoRoot, viteConfigPath)}`)
  }

  await fs.mkdir(tmpRoot, { recursive: true })
  await fs.writeFile(
    dfcSmokeFixturePath,
    [
      '# Electron Smoke Backend DFC',
      '',
      dfcSmokeFixturePreviewText,
      '',
    ].join('\n'),
    'utf8',
  )
  await fs.writeFile(
    htmlPdfSmokeFixturePath,
    [
      '<!doctype html>',
      '<html>',
      '<head>',
      '<meta charset="utf-8">',
      `<title>${htmlPdfSmokeFixtureTitle}</title>`,
      '<script>window.__starverseSmokeShouldNotRun = true</script>',
      '</head>',
      '<body>',
      `<h1>${htmlPdfSmokeFixtureTitle}</h1>`,
      '<p>Managed local HTML fixture for DFC HTML-to-PDF smoke.</p>',
      '<img src="https://example.invalid/blocked.png" alt="blocked remote image">',
      '<iframe src="file:///C:/starverse-smoke-secret.txt"></iframe>',
      '</body>',
      '</html>',
      '',
    ].join('\n'),
    'utf8',
  )

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
  let page
  const diagnostics = createDiagnostics()
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
    installElectronDiagnostics(electronApp, diagnostics)

    page = await waitForAppWindow(electronApp, 60_000)
    await waitForMountedApp(page, 120_000)

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
    await page.waitForFunction(
      () => typeof window.__starverseElectronSmokeSeedDfcAttachment === 'function',
      undefined,
      { timeout: 60_000 },
    )
    const seedResult = await page.evaluate(async (filePath) => {
      const seed = window.__starverseElectronSmokeSeedDfcAttachment
      if (typeof seed !== 'function') throw new Error('DFC smoke backend seeder is missing')
      return await seed(filePath)
    }, dfcSmokeFixturePath)
    console.log(JSON.stringify(seedResult, null, 2))

    if (!seedResult.backendOwned) throw new Error('DFC smoke did not use backend-owned seeding')
    if (!seedResult.assetId || seedResult.assetId === 'asset-dfc-smoke') throw new Error('DFC smoke asset id was not backend-created')
    if (!seedResult.optionId || !seedResult.optionId.includes(':markdown:')) throw new Error('DFC smoke markdown option was not backend-owned')

    await page.waitForSelector(`[data-testid="draft-attachment-card-${seedResult.assetId}"]`, { timeout: 60_000 })
    await page.click(`[data-testid="draft-attachment-card-${seedResult.assetId}"]`)
    await page.waitForSelector('[data-testid="draft-attachment-details-dialog"]', { timeout: 60_000 })
    await page.waitForSelector('[data-testid="draft-attachment-dfc-option-markdown"]', { timeout: 60_000 })
    await page.waitForSelector('[data-testid="draft-attachment-dfc-preview-text"]', { timeout: 60_000 })

    const dfcResult = await page.evaluate((assetId) => ({
      attachmentVisible: Boolean(document.querySelector(`[data-testid="draft-attachment-card-${assetId}"]`)),
      detailsVisible: Boolean(document.querySelector('[data-testid="draft-attachment-details-dialog"]')),
      markdownOptionText: document.querySelector('[data-testid="draft-attachment-dfc-option-markdown"]')?.textContent ?? '',
      previewText: document.querySelector('[data-testid="draft-attachment-dfc-preview-text"]')?.textContent ?? '',
    }), seedResult.assetId)
    console.log(JSON.stringify(dfcResult, null, 2))

    if (!dfcResult.attachmentVisible) throw new Error('DFC smoke attachment card is missing')
    if (!dfcResult.detailsVisible) throw new Error('DFC smoke attachment details dialog is missing')
    if (!dfcResult.markdownOptionText.includes('Markdown')) throw new Error('DFC markdown option is missing')
    if (!dfcResult.previewText.includes(dfcSmokeFixturePreviewText)) throw new Error('DFC preview text is missing')
    await page.click('[data-testid="draft-attachment-details-close"]')
    await page.waitForSelector('[data-testid="draft-attachment-details-dialog"]', { state: 'detached', timeout: 60_000 })

    section('Assert HTML PDF Electron conversion smoke seam')
    await page.waitForFunction(
      () => typeof window.__starverseElectronSmokeSeedHtmlPdfAttachment === 'function',
      undefined,
      { timeout: 60_000 },
    )
    const htmlPdfSeedResult = await page.evaluate(async (filePath) => {
      const seed = window.__starverseElectronSmokeSeedHtmlPdfAttachment
      if (typeof seed !== 'function') throw new Error('HTML PDF smoke backend seeder is missing')
      return await seed(filePath)
    }, htmlPdfSmokeFixturePath)
    console.log(JSON.stringify(htmlPdfSeedResult, null, 2))

    if (!htmlPdfSeedResult.backendOwned) throw new Error('HTML PDF smoke did not use backend-owned seeding')
    if (!htmlPdfSeedResult.assetId || htmlPdfSeedResult.assetId === 'asset-dfc-smoke') throw new Error('HTML PDF smoke asset id was not backend-created')
    if (!htmlPdfSeedResult.optionId || !htmlPdfSeedResult.optionId.includes(':pdf_attachment:')) throw new Error('HTML PDF option was not backend-owned')
    if (htmlPdfSeedResult.targetKind !== 'pdf_attachment') throw new Error(`Expected pdf_attachment target, got ${htmlPdfSeedResult.targetKind}`)
    if (htmlPdfSeedResult.sendStrategy !== 'file_attachment') throw new Error(`Expected file_attachment send strategy, got ${htmlPdfSeedResult.sendStrategy}`)
    if (!htmlPdfSeedResult.selectedAssetRefs?.some((ref) => ref.kind === 'derived_asset')) throw new Error('HTML PDF selected refs do not include a derived_asset')
    if (htmlPdfSeedResult.previewKind !== 'raw_file' || htmlPdfSeedResult.previewStatus !== 'ready') throw new Error('HTML PDF preview is not metadata-only ready')
    for (const requiredTarget of ['original_file', 'markdown', 'code', 'pdf_attachment']) {
      if (!htmlPdfSeedResult.availableTargets.includes(requiredTarget)) {
        throw new Error(`HTML PDF smoke missing available ${requiredTarget} option`)
      }
    }

    await page.waitForSelector(`[data-testid="draft-attachment-card-${htmlPdfSeedResult.assetId}"]`, { timeout: 60_000 })
    await page.click(`[data-testid="draft-attachment-card-${htmlPdfSeedResult.assetId}"]`)
    await page.waitForSelector('[data-testid="draft-attachment-details-dialog"]', { timeout: 60_000 })
    await page.waitForSelector('[data-testid="draft-attachment-dfc-option-pdf_attachment"]', { timeout: 60_000 })
    await page.waitForSelector('[data-testid="draft-attachment-dfc-option-markdown"]', { timeout: 60_000 })
    await page.waitForSelector('[data-testid="draft-attachment-dfc-option-code"]', { timeout: 60_000 })
    await page.waitForSelector('[data-testid="draft-attachment-dfc-option-original_file"]', { timeout: 60_000 })
    await page.waitForSelector('[data-testid="draft-attachment-dfc-preview-raw"]', { timeout: 60_000 })

    const htmlPdfUiResult = await page.evaluate((assetId) => {
      const preview = document.querySelector('[data-testid="draft-attachment-dfc-preview"]')?.textContent ?? ''
      return {
        attachmentVisible: Boolean(document.querySelector(`[data-testid="draft-attachment-card-${assetId}"]`)),
        detailsVisible: Boolean(document.querySelector('[data-testid="draft-attachment-details-dialog"]')),
        pdfOptionText: document.querySelector('[data-testid="draft-attachment-dfc-option-pdf_attachment"]')?.textContent ?? '',
        markdownOptionVisible: Boolean(document.querySelector('[data-testid="draft-attachment-dfc-option-markdown"]')),
        codeOptionVisible: Boolean(document.querySelector('[data-testid="draft-attachment-dfc-option-code"]')),
        originalOptionVisible: Boolean(document.querySelector('[data-testid="draft-attachment-dfc-option-original_file"]')),
        rawPreviewVisible: Boolean(document.querySelector('[data-testid="draft-attachment-dfc-preview-raw"]')),
        previewContainsPath: /storage|file:\/\/|[A-Za-z]:\\|sha256|contentHash|storageUri|storageRef|<html/i.test(preview),
      }
    }, htmlPdfSeedResult.assetId)
    console.log(JSON.stringify(htmlPdfUiResult, null, 2))

    if (!htmlPdfUiResult.attachmentVisible) throw new Error('HTML PDF smoke attachment card is missing')
    if (!htmlPdfUiResult.detailsVisible) throw new Error('HTML PDF smoke attachment details dialog is missing')
    if (!htmlPdfUiResult.pdfOptionText.includes('PDF')) throw new Error('HTML PDF pdf_attachment option is missing')
    if (!htmlPdfUiResult.markdownOptionVisible) throw new Error('HTML safe markdown option is missing')
    if (!htmlPdfUiResult.codeOptionVisible) throw new Error('HTML code option is missing')
    if (!htmlPdfUiResult.originalOptionVisible) throw new Error('HTML original_file option is missing')
    if (!htmlPdfUiResult.rawPreviewVisible) throw new Error('HTML PDF metadata-only preview is missing')
    if (htmlPdfUiResult.previewContainsPath) throw new Error('HTML PDF preview exposed path, storage, hash, or file body-like content')

    section('Capture visual diagnostics')
    const visualDiagnostics = await captureVisualDiagnosticsBestEffort(page, 'post-assertions')
    const runtimeState = visualDiagnostics.state
    console.log(JSON.stringify({
      artifactRoot: artifactLabel(artifactRoot),
      screenshotPath: artifactLabel(screenshotPath),
      runtimeStatePath: artifactLabel(runtimeStatePath),
      domSnapshotPath: artifactLabel(domSnapshotPath),
      diagnosticsCaptureOk: visualDiagnostics.ok,
      diagnosticsCaptureError: visualDiagnostics.error?.message ?? null,
      bodyInnerTextLength: runtimeState?.bodyInnerTextLength ?? null,
      appElementCount: runtimeState?.appElementCount ?? null,
      overlayCandidates: runtimeState?.overlayCandidates?.length ?? null,
    }, null, 2))

    await writeRunInfo({
      status: 'passed',
      completedAt: new Date().toISOString(),
      ...buildRunInfoBase(),
      selectedPage: await describePage(page),
      selectedPageIsAppPage: page.url().startsWith(viteUrl),
      pages: await Promise.all(electronApp.windows().map((openPage) => describePage(openPage))),
      viteOutputTail: viteOutput.trim().slice(-4000),
      visualDiagnostics: {
        ok: visualDiagnostics.ok,
        error: visualDiagnostics.error,
      },
      artifacts: {
        screenshot: artifactLabel(screenshotPath),
        domSnapshot: artifactLabel(domSnapshotPath),
        runtimeState: artifactLabel(runtimeStatePath),
        console: artifactLabel(consoleLogPath),
        pageerror: artifactLabel(pageErrorLogPath),
        requestfailed: artifactLabel(requestFailedLogPath),
        responses4xx5xx: artifactLabel(responseErrorLogPath),
      },
    })

    console.log('\nPASS: Electron DFC attachment smoke completed')
  } catch (error) {
    if (page) await captureVisualDiagnosticsBestEffort(page, 'failure')
    await writeRunInfo({
      status: 'failed',
      completedAt: new Date().toISOString(),
      ...buildRunInfoBase(),
      viteOutputTail: viteOutput.trim().slice(-4000),
      error: summarizeError(error),
      selectedPage: page ? await describePage(page).catch(() => null) : null,
    }).catch(() => undefined)
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
      if (diagnostics.url.startsWith(viteUrl)) return page
    }
    for (const page of windows) {
      const diagnostics = await describePage(page)
      if (diagnostics.hasAppRoot && !diagnostics.url.startsWith('devtools://')) return page
    }

    lastDiagnostics = await Promise.all(windows.map((page) => describePage(page)))
    const remaining = Math.max(250, deadline - Date.now())
    try {
      const page = await electronApp.waitForEvent('window', { timeout: Math.min(1000, remaining) })
      const diagnostics = await describePage(page)
      if (diagnostics.url.startsWith(viteUrl)) return page
      if (diagnostics.hasAppRoot && !diagnostics.url.startsWith('devtools://')) return page
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }

  throw new Error(`App window did not become ready. Windows: ${JSON.stringify(lastDiagnostics)}`)
}

async function waitForMountedApp(page, timeoutMs) {
  await page.waitForSelector('#app', { state: 'attached', timeout: timeoutMs })
  await page.waitForFunction(
    () => {
      const appRoot = document.querySelector('#app')
      const composerDraft = document.querySelector('[data-testid="composer-draft"]')
      return Boolean(composerDraft || (appRoot && (appRoot.children.length > 0 || appRoot.textContent?.trim())))
    },
    undefined,
    { timeout: timeoutMs },
  )
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
