import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..', '..')
const artifactRoot = path.join(repoRoot, '.artifacts', 'white-screen', 'real-dev')
const cdpPort = Number.parseInt(process.env.SV_DEV_WHITE_SCREEN_DIAG_PORT ?? '9333', 10)
const cdpUrl = `http://127.0.0.1:${cdpPort}`
const timeoutMs = Number.parseInt(process.env.SV_DEV_WHITE_SCREEN_DIAG_TIMEOUT_MS ?? '45000', 10)

const files = {
  screenshot: path.join(artifactRoot, 'screenshot.png'),
  domSnapshot: path.join(artifactRoot, 'dom-snapshot.html'),
  runtimeState: path.join(artifactRoot, 'runtime-state.json'),
  console: path.join(artifactRoot, 'console.jsonl'),
  pageerror: path.join(artifactRoot, 'pageerror.jsonl'),
  requestfailed: path.join(artifactRoot, 'requestfailed.jsonl'),
  requests: path.join(artifactRoot, 'requests.jsonl'),
  pendingRequests: path.join(artifactRoot, 'pending-requests.json'),
  bootEvents: path.join(artifactRoot, 'boot-events.jsonl'),
  resourceEvents: path.join(artifactRoot, 'resource-events.jsonl'),
  responses4xx5xx: path.join(artifactRoot, 'responses-4xx-5xx.jsonl'),
  runInfo: path.join(artifactRoot, 'run-info.json'),
  devStdout: path.join(artifactRoot, 'npm-run-dev.stdout.log'),
  devStderr: path.join(artifactRoot, 'npm-run-dev.stderr.log'),
}

function jsonLine(value) {
  return `${JSON.stringify({ timestamp: new Date().toISOString(), ...value })}\n`
}

async function append(filePath, value) {
  await fs.appendFile(filePath, jsonLine(value), 'utf8').catch(() => undefined)
}

async function writeRunInfo(value) {
  await fs.writeFile(files.runInfo, JSON.stringify(value, null, 2), 'utf8')
}

async function prepareArtifacts() {
  await fs.mkdir(artifactRoot, { recursive: true })
  await Promise.all(Object.values(files).map((filePath) => fs.rm(filePath, { force: true }).catch(() => undefined)))
  await Promise.all([
    fs.writeFile(files.console, '', 'utf8'),
    fs.writeFile(files.pageerror, '', 'utf8'),
    fs.writeFile(files.requestfailed, '', 'utf8'),
    fs.writeFile(files.requests, '', 'utf8'),
    fs.writeFile(files.bootEvents, '', 'utf8'),
    fs.writeFile(files.resourceEvents, '', 'utf8'),
    fs.writeFile(files.responses4xx5xx, '', 'utf8'),
    fs.writeFile(files.devStdout, '', 'utf8'),
    fs.writeFile(files.devStderr, '', 'utf8'),
  ])
}

function spawnDev() {
  const command = process.platform === 'win32' ? 'cmd.exe' : 'npm'
  const args = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm run dev'] : ['run', 'dev']
  return spawn(command, args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      SV_DEV_WHITE_SCREEN_DIAG: '1',
      SV_DEV_BOOT_TIMELINE: '1',
      SV_DEV_WHITE_SCREEN_DIAG_PORT: String(cdpPort),
      SV_DEBUG_RENDERER_CONSOLE: '1',
      ELECTRON_ENABLE_LOGGING: '1',
      FORCE_COLOR: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
}

function installBootMarkerCapture(stream, logFile) {
  let buffer = ''
  stream.on('data', (chunk) => {
    const text = String(chunk)
    void fs.appendFile(logFile, chunk).catch(() => undefined)
    buffer += text
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const markerIndex = line.indexOf('[starverse-boot]')
      if (markerIndex >= 0) {
        const payload = line.slice(markerIndex + '[starverse-boot]'.length).trim()
        try {
          const event = JSON.parse(payload)
          void append(files.bootEvents, { source: logFile, ...event })
        } catch {
          void append(files.bootEvents, { source: logFile, parseError: true, line })
        }
      }
      const resourceIndex = line.indexOf('[starverse-resource]')
      if (resourceIndex >= 0) {
        const payload = line.slice(resourceIndex + '[starverse-resource]'.length).trim()
        try {
          const event = JSON.parse(payload)
          void append(files.resourceEvents, { source: logFile, ...event })
        } catch {
          void append(files.resourceEvents, { source: logFile, parseError: true, line })
        }
      }
    }
  })
}

async function waitForCdp(deadline) {
  let lastError = null
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${cdpUrl}/json/version`)
      if (response.ok) return
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`CDP endpoint did not become ready at ${cdpUrl}: ${lastError?.message ?? 'timeout'}`)
}

async function waitForAppPage(browser, deadline) {
  let lastPages = []
  while (Date.now() < deadline) {
    const pages = browser.contexts().flatMap((context) => context.pages())
    lastPages = pages.map((page) => page.url())
    const appPage = pages.find((page) => {
      const url = page.url()
      return url.startsWith('http://localhost:') || url.startsWith('http://127.0.0.1:')
    })
    if (appPage) return appPage
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`App page was not found. Pages: ${JSON.stringify(lastPages)}`)
}

function installPageDiagnostics(page) {
  page.on('console', (message) => {
    void append(files.console, {
      type: message.type(),
      text: message.text(),
      location: message.location(),
    })
  })
  page.on('pageerror', (error) => {
    void append(files.pageerror, {
      name: error.name,
      message: error.message,
      stack: error.stack,
    })
  })
  page.on('requestfailed', (request) => {
    void append(files.requestfailed, {
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      failure: request.failure(),
      timing: request.timing(),
    })
  })
  page.on('response', (response) => {
    if (response.status() >= 400) {
      void append(files.responses4xx5xx, {
        url: response.url(),
        status: response.status(),
        statusText: response.statusText(),
        requestMethod: response.request().method(),
        resourceType: response.request().resourceType(),
      })
    }
  })
}

async function installCdpNetworkDiagnostics(page) {
  const session = await page.context().newCDPSession(page)
  const requests = new Map()
  const record = async (event, payload) => {
    await append(files.requests, { event, ...payload })
  }

  session.on('Network.requestWillBeSent', (event) => {
    requests.set(event.requestId, {
      requestId: event.requestId,
      url: event.request.url,
      method: event.request.method,
      type: event.type,
      wallTime: event.wallTime,
      timestamp: event.timestamp,
      initiator: event.initiator,
      status: 'pending',
    })
    void record('requestWillBeSent', {
      requestId: event.requestId,
      url: event.request.url,
      method: event.request.method,
      type: event.type,
      wallTime: event.wallTime,
      timestamp: event.timestamp,
      initiatorType: event.initiator?.type,
      initiatorUrl: event.initiator?.url,
    })
  })
  session.on('Network.responseReceived', (event) => {
    const request = requests.get(event.requestId)
    if (request) {
      request.responseStatus = event.response.status
      request.mimeType = event.response.mimeType
      request.responseUrl = event.response.url
    }
    void record('responseReceived', {
      requestId: event.requestId,
      url: event.response.url,
      type: event.type,
      status: event.response.status,
      mimeType: event.response.mimeType,
      timestamp: event.timestamp,
    })
  })
  session.on('Network.loadingFinished', (event) => {
    const request = requests.get(event.requestId)
    if (request) {
      request.status = 'finished'
      request.encodedDataLength = event.encodedDataLength
      request.finishedTimestamp = event.timestamp
    }
    void record('loadingFinished', {
      requestId: event.requestId,
      encodedDataLength: event.encodedDataLength,
      timestamp: event.timestamp,
    })
  })
  session.on('Network.loadingFailed', (event) => {
    const request = requests.get(event.requestId)
    if (request) {
      request.status = 'failed'
      request.errorText = event.errorText
      request.canceled = event.canceled
      request.failedTimestamp = event.timestamp
    }
    void record('loadingFailed', {
      requestId: event.requestId,
      type: event.type,
      errorText: event.errorText,
      canceled: event.canceled,
      timestamp: event.timestamp,
    })
  })
  await session.send('Network.enable')

  return {
    session,
    getPending: () => Array.from(requests.values()).filter((request) => request.status === 'pending'),
    writePending: async () => {
      const pending = Array.from(requests.values()).filter((request) => request.status === 'pending')
      await fs.writeFile(files.pendingRequests, JSON.stringify(pending, null, 2), 'utf8')
      return pending
    },
  }
}

async function captureRuntimeState(page) {
  const state = await page.evaluate(() => {
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
      return {
        visible: style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0,
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
      }
    }
    const selectorPresence = (selector) => {
      const element = document.querySelector(selector)
      return { selector, present: Boolean(element), rect: rectFor(element), visibility: visibilityFor(element), textSample: element?.textContent?.trim().slice(0, 300) ?? '' }
    }
    const describeElement = (element) => {
      const style = window.getComputedStyle(element)
      return {
        tag: element.tagName.toLowerCase(),
        id: element.id || '',
        className: typeof element.className === 'string' ? element.className : '',
        rect: rectFor(element),
        visibility: visibilityFor(element),
        opacity: style.opacity,
        zIndex: style.zIndex,
        backgroundColor: style.backgroundColor,
        position: style.position,
      }
    }
    const appRoot = document.querySelector('#app')
    const resources = performance.getEntriesByType('resource').map((entry) => ({
      name: entry.name,
      initiatorType: entry.initiatorType,
      startTime: entry.startTime,
      duration: entry.duration,
      transferSize: entry.transferSize,
      encodedBodySize: entry.encodedBodySize,
      decodedBodySize: entry.decodedBodySize,
    }))
    return {
      capturedAt: new Date().toISOString(),
      url: window.location.href,
      readyState: document.readyState,
      title: document.title,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      hasAppRoot: Boolean(appRoot),
      appInnerHtmlLength: appRoot?.innerHTML?.length ?? 0,
      bodyInnerTextLength: document.body?.innerText?.length ?? 0,
      visibleTextSample: document.body?.innerText?.trim().slice(0, 2000) ?? '',
      appElementCount: appRoot ? appRoot.querySelectorAll('*').length : 0,
      bounds: { html: rectFor(document.documentElement), body: rectFor(document.body), app: rectFor(appRoot) },
      computedStyle: { html: styleFor(document.documentElement), body: styleFor(document.body), app: styleFor(appRoot) },
      selectorPresence: ['#app', '[data-testid="composer-draft"]', '.vite-error-overlay'].map(selectorPresence),
      bodyChildren: Array.from(document.body.children).map(describeElement),
      resources,
      boot: window.__STARVERSE_BOOT__ ?? null,
    }
  })
  await fs.writeFile(files.runtimeState, JSON.stringify(state, null, 2), 'utf8')
  await fs.writeFile(files.domSnapshot, await page.content(), 'utf8')
  const cdpSession = await page.context().newCDPSession(page)
  const screenshot = await cdpSession.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
  await fs.writeFile(files.screenshot, Buffer.from(screenshot.data, 'base64'))
  return state
}

async function waitForBootOutcome(page, cdpNetwork, deadline) {
  const emptyAppDeadline = Date.now() + 30_000
  let last = null
  while (Date.now() < deadline) {
    last = await page.evaluate(() => {
      const boot = window.__STARVERSE_BOOT__ ?? null
      const events = Array.isArray(boot?.events) ? boot.events : []
      const hasAfterMount = events.some((event) => event?.name === 'after_mount')
      const appRoot = document.querySelector('#app')
      return {
        hasAfterMount,
        readyState: document.readyState,
        appInnerHtmlLength: appRoot?.innerHTML?.length ?? 0,
        bodyInnerTextLength: document.body?.innerText?.length ?? 0,
        eventCount: events.length,
        lastEvent: events.at(-1) ?? null,
      }
    }).catch(() => null)

    if (last?.hasAfterMount) return { reason: 'after_mount', last }
    if (last?.appInnerHtmlLength > 0 && last?.bodyInnerTextLength > 0) return { reason: 'visible_dom', last }
    const pending = cdpNetwork?.getPending?.() ?? []
    const hasLongPending = pending.some((request) => {
      const start = Number(request.timestamp ?? 0)
      if (!start) return false
      const newestTimestamp = Math.max(...pending.map((item) => Number(item.timestamp ?? start)))
      return newestTimestamp - start >= 30
    })
    if (hasLongPending) return { reason: 'key_or_any_request_pending_over_30s', last }
    if (Date.now() >= emptyAppDeadline) return { reason: 'app_empty_over_30s', last }
    await page.waitForTimeout(500)
  }
  return { reason: 'timeout', last }
}

async function stopProcessTree(child) {
  if (!child || child.exitCode !== null) return
  await new Promise((resolve) => {
    child.once('exit', resolve)
    if (process.platform === 'win32') {
      spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }).once('exit', resolve)
    } else {
      child.kill()
      setTimeout(resolve, 3000).unref()
    }
  })
}

async function main() {
  await prepareArtifacts()
  const startedAt = new Date().toISOString()
  await writeRunInfo({ status: 'started', startedAt, cdpUrl, artifactRoot })
  await append(files.bootEvents, {
    name: 'npm_dev_start',
    phase: 'npm',
    tAbs: Date.now(),
    tRel: 0,
    extra: { command: 'npm run dev' },
  })

  const dev = spawnDev()
  installBootMarkerCapture(dev.stdout, files.devStdout)
  installBootMarkerCapture(dev.stderr, files.devStderr)

  let browser = null
  let page = null
  let cdpNetwork = null
  let pendingRequests = []
  let state = null
  let status = 'failed'
  let error = null
  const deadline = Date.now() + timeoutMs
  try {
    await waitForCdp(deadline)
    browser = await chromium.connectOverCDP(cdpUrl)
    page = await waitForAppPage(browser, deadline)
    installPageDiagnostics(page)
    cdpNetwork = await installCdpNetworkDiagnostics(page)
    await page.waitForLoadState('domcontentloaded', { timeout: Math.max(1000, deadline - Date.now()) }).catch(() => undefined)
    var bootOutcome = await waitForBootOutcome(page, cdpNetwork, deadline)
    state = await captureRuntimeState(page)
    pendingRequests = await cdpNetwork.writePending()
    status = state.hasAppRoot && state.appInnerHtmlLength > 0 && state.bodyInnerTextLength > 0 ? 'visible-or-mounted' : 'white-or-empty'
  } catch (caught) {
    error = {
      name: caught?.name ?? 'Error',
      message: caught?.message ?? String(caught),
      stack: caught?.stack ?? undefined,
    }
  } finally {
    if (browser) await browser.close().catch(() => undefined)
    await stopProcessTree(dev)
  }

  const runInfo = {
    status,
    startedAt,
    completedAt: new Date().toISOString(),
    cdpUrl,
    selectedPageUrl: page?.url() ?? null,
    error,
    runtimeSummary: state ? {
      readyState: state.readyState,
      title: state.title,
      hasAppRoot: state.hasAppRoot,
      appInnerHtmlLength: state.appInnerHtmlLength,
      bodyInnerTextLength: state.bodyInnerTextLength,
      appElementCount: state.appElementCount,
      composerDraftPresent: state.selectorPresence?.some((item) => item.selector === '[data-testid="composer-draft"]' && item.present) ?? false,
      pendingRequestCount: pendingRequests.length,
      bootOutcome,
      bootEventCount: state.boot?.events?.length ?? 0,
      lastBootEvent: state.boot?.events?.at?.(-1) ?? null,
    } : null,
    artifacts: files,
  }
  await writeRunInfo(runInfo)
  console.log(JSON.stringify(runInfo, null, 2))
  if (error) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
