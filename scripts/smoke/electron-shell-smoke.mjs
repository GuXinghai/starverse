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
const appUrl = viteUrl
const mainPath = path.join(repoRoot, 'dist-electron', 'epoch2MainEntry.js')
const viteConfigPath = path.join(repoRoot, 'scripts', 'smoke', 'vite.renderer-smoke.config.ts')
const tmpRoot = path.join(os.tmpdir(), `starverse-electron-smoke-${process.pid}`)
const userDataRoot = path.join(tmpRoot, 'user-data')
const appDataRoot = path.join(tmpRoot, 'app-data')
const fixtureRoot = path.join(tmpRoot, 'fixtures')
const artifactRoot = path.join(repoRoot, '.artifacts', 'white-screen', 'electron-smoke')
const screenshotPath = path.join(artifactRoot, 'screenshot.png')
const domSnapshotPath = path.join(artifactRoot, 'dom-snapshot.html')
const runtimeStatePath = path.join(artifactRoot, 'runtime-state.json')
const consoleLogPath = path.join(artifactRoot, 'console.jsonl')
const pageErrorLogPath = path.join(artifactRoot, 'pageerror.jsonl')
const requestFailedLogPath = path.join(artifactRoot, 'requestfailed.jsonl')
const responseErrorLogPath = path.join(artifactRoot, 'responses-4xx-5xx.jsonl')
const runInfoPath = path.join(artifactRoot, 'run-info.json')
const dfcSmokeFixtureFilename = 'fixture-markdown.md'
const dfcSmokeFixturePreviewText = 'Backend-owned DFC markdown preview from smoke fixture.'
const dfcSmokeFixturePath = path.join(fixtureRoot, dfcSmokeFixtureFilename)
const htmlPdfSmokeFixtureFilename = 'fixture-html.html'
const htmlPdfSmokeFixturePath = path.join(fixtureRoot, htmlPdfSmokeFixtureFilename)
const htmlPdfSmokeFixtureTitle = 'Electron Smoke HTML PDF'

function section(title) {
  process.stdout.write(`\n${'='.repeat(80)}\n${title}\n${'='.repeat(80)}\n`)
}

async function seedV2DfcFixture(page, fixtureName, optionId) {
  return page.evaluate(async ({ fixtureName, optionId }) => {
    const unwrap = (result) => {
      if (!result || result.ok !== true) throw new Error(result?.code ?? 'generation_v2_smoke_command_failed')
      return result.value
    }
    const api = window.generationV2
    if (!api?.smokeFixture || !api.composer || !api.workspace) throw new Error('generation_v2_smoke_fixture_bridge_unavailable')
    const workspace = unwrap(await api.workspace.ensureDefault())
    const conversation = unwrap(await api.workspace.createConversation(
      workspace.projectId,
      `Electron smoke ${fixtureName}`,
    ))
    const conversationId = conversation.conversationId
    let draft = unwrap(await api.composer.get(conversationId))
    const grant = unwrap(await api.smokeFixture.requestLocalFileGrant(fixtureName))
    draft = unwrap(await api.composer.importLocal({
      conversationId,
      expectedRevision: draft.revision,
      filePath: grant.filePath,
      selectionGrantToken: grant.token,
    }))
    const attachment = [...draft.attachments].at(-1)
    if (!attachment || attachment.kind !== 'managed_file') throw new Error('generation_v2_smoke_import_missing_attachment')
    const options = unwrap(await api.composer.dfcOptions({
      conversationId,
      assetId: attachment.assetId,
      providerId: 'openrouter',
      operation: 'chat_completions',
    }))
    const selected = options.options.find((option) => option.optionId === optionId && option.isAvailable)
    if (!selected) throw new Error('generation_v2_smoke_option_unavailable')
    draft = unwrap(await api.composer.dfcSelect({
      conversationId,
      expectedRevision: draft.revision,
      assetId: attachment.assetId,
      optionId,
      providerId: 'openrouter',
      operation: 'chat_completions',
    }))
    const preview = unwrap(await api.composer.dfcPreview({
      conversationId,
      assetId: attachment.assetId,
      maxCharacters: 2048,
    }))
    unwrap(await api.workspace.setNewChatLifecycle({
      startupNavigation: 'restore_last_formal',
      startupTemplateReset: { modelConfig: false, draftAttachments: false },
      postSendTemplateReset: 'reset_all',
    }))
    unwrap(await api.workspace.setLastFormalConversation(conversationId))
    const persisted = draft.attachments.find((item) => item.kind === 'managed_file' && item.assetId === attachment.assetId)
    return {
      backendOwned: true,
      conversationId,
      assetId: attachment.assetId,
      attachmentId: attachment.assetRevisionId,
      optionId: selected.optionId,
      targetKind: selected.targetKind,
      sendStrategy: selected.sendStrategy,
      selectedAssetRefs: persisted?.dfcSelection ? [{ kind: persisted.dfcSelection.targetKind === 'original_file' ? 'raw_file' : 'derived_asset', assetId: persisted.dfcSelection.effectiveAssetId }] : [],
      previewText: preview.preview.text,
      previewKind: preview.preview.kind,
      previewStatus: preview.preview.status,
      availableTargets: options.options.filter((option) => option.isAvailable).map((option) => option.targetKind),
    }
  }, { fixtureName, optionId })
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

function assertContainedSmokePath(filePath) {
  const relative = path.relative(tmpRoot, filePath)
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('electron_smoke_isolation_path_invalid')
  }
}

function buildRunInfoBase() {
  return {
    userData: {
      mode: 'isolated-temp',
      explicitUserDataDir: true,
      path: '<temp-user-data>',
    },
    appData: { mode: 'isolated-temp', path: '<temp-app-data>' },
    fixtures: { mode: 'isolated-temp', path: '<temp-fixtures>' },
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

  ;[userDataRoot, appDataRoot, fixtureRoot, dfcSmokeFixturePath, htmlPdfSmokeFixturePath].forEach(assertContainedSmokePath)
  await Promise.all([userDataRoot, appDataRoot, fixtureRoot].map((directory) => fs.mkdir(directory, { recursive: true })))
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
      args: [`--user-data-dir=${userDataRoot}`, mainPath],
      cwd: repoRoot,
      env: {
        ...process.env,
        NODE_ENV: 'development',
        VITE_DEV_SERVER_URL: appUrl,
        SV_ELECTRON_SMOKE: '1',
        SV_EPOCH2_SMOKE_FIXTURE_AUTHORITY: '1',
        SV_EPOCH2_SMOKE_FIXTURE_ROOT: fixtureRoot,
        SV_EPOCH2_SMOKE_APP_DATA_ROOT: appDataRoot,
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
        generationV2Exposed: typeof w.generationV2 === 'object' && w.generationV2 !== null,
      }
    })

    console.log(JSON.stringify(result, null, 2))

    if (!result.appMounted) throw new Error('App root did not mount')
    if (result.rawIpcRendererExposed) throw new Error('raw ipcRenderer is exposed to renderer')
    if (!result.electronAPIExposed) throw new Error('electronAPI scoped preload object is missing')
    if (!result.electronStoreExposed) throw new Error('electronStore scoped preload object is missing')
    if (!result.generationV2Exposed) throw new Error('generationV2 scoped preload object is missing')

    if (process.env.SV_ELECTRON_SHELL_ONLY === '1') {
      await writeRunInfo({
        status: 'passed', completedAt: new Date().toISOString(), ...buildRunInfoBase(),
        mode: 'shell-only', selectedPage: await describePage(page), assertions: result,
      })
      console.log('\nPASS: Electron shell-only smoke completed')
      return
    }

    section('Assert DFC attachment smoke seam')
    const seedResult = await seedV2DfcFixture(page, 'markdown', 'dfc:markdown:v1')
    console.log(JSON.stringify(seedResult, null, 2))

    if (!seedResult.backendOwned) throw new Error('DFC smoke did not use backend-owned seeding')
    if (!seedResult.assetId || seedResult.assetId === 'asset-dfc-smoke') throw new Error('DFC smoke asset id was not backend-created')
    if (!seedResult.optionId || !seedResult.optionId.includes(':markdown:')) throw new Error('DFC smoke markdown option was not backend-owned')

    await page.reload()
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
