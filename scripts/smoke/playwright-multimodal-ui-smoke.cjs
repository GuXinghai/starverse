const { execFileSync, spawn } = require('node:child_process')
const { createRequire } = require('node:module')
const fs = require('node:fs/promises')
const fss = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const zlib = require('node:zlib')

const requireFromRepo = createRequire(path.join(__dirname, '..', '..', 'package.json'))
const repoRoot = path.resolve(__dirname, '..', '..')
const uiPort = Number.parseInt(process.env.SV_MULTIMODAL_UI_SMOKE_PORT || '5184', 10)
const uiHost = process.env.SV_MULTIMODAL_UI_SMOKE_HOST || '127.0.0.1'
const viteUrl = `http://${uiHost}:${uiPort}/`
const viteConfigPath = path.join(repoRoot, 'scripts', 'smoke', 'vite.renderer-smoke.config.ts')
const mainPath = path.join(repoRoot, 'dist-electron', 'main.js')
const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
const starverseUserData = path.join(appData, 'Starverse')
const sourceConfigPath = path.join(starverseUserData, 'config.json')

const IMAGE_PROMPT = 'Reply with exactly one short sentence describing the image.'
const PDF_PROMPT = 'Read the attached PDF and reply with exactly one short sentence about its content.'
const PDF_KEYWORD = 'STARVERSE-MULTIMODAL-UI-PDF'
const FORBIDDEN_UI_MARKERS = [
  'originalPath',
  'storagePath',
  'storageRootDir',
  'storageUri',
  'blobId',
  'originalUrl',
  'resolvedUrl',
  'Authorization',
  'Bearer ',
  'sk-',
  'AIza',
  ';base64,',
]

const providers = {
  openai: {
    id: 'openai',
    label: 'OpenAI Responses',
    providerKey: 'openai_responses',
    controlsTestId: 'openai-responses-chat-controls',
    enabledTestId: 'openai-responses-chat-enabled',
    modelTestId: 'openai-responses-chat-model',
    statusTestId: 'openai-responses-chat-selected-status',
    model: 'gpt-5.4-nano',
  },
  gemini: {
    id: 'gemini',
    label: 'Google AI Studio',
    providerKey: 'google_ai_studio',
    controlsTestId: 'google-ai-studio-chat-controls',
    enabledTestId: 'google-ai-studio-chat-enabled',
    modelTestId: 'google-ai-studio-chat-model',
    statusTestId: 'google-ai-studio-chat-selected-status',
    model: 'gemini-3.1-flash-lite',
  },
}

function section(title) {
  console.log(`\n== ${title} ==`)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function safeError(error) {
  return sanitize(String(error && error.message ? error.message : error))
}

function sanitize(value) {
  return String(value || '')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/AIza[0-9A-Za-z_-]+/g, '[redacted_google_key]')
    .replace(/sk-[0-9A-Za-z._:-]+/g, 'sk-[redacted]')
    .replace(/[A-Za-z]:[\\/][^\s"']+/g, '[local path]')
    .replace(/\b[A-Za-z0-9+/]{120,}={0,2}\b/g, '[redacted-long-token]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1000)
}

function quoteForShell(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function prepareUserData(userDataDir) {
  if (!(await pathExists(sourceConfigPath))) {
    throw new Error('Starverse secure-store config.json is missing.')
  }
  const sourceConfig = JSON.parse(await fs.readFile(sourceConfigPath, 'utf8'))
  const providerCredentials = sourceConfig && sourceConfig.providerCredentials
  for (const row of [providers.openai, providers.gemini]) {
    const record = providerCredentials && providerCredentials.v1 && providerCredentials.v1[row.providerKey]
    if (!record || record.backend !== 'electron_safe_storage' || !record.ciphertextBase64) {
      throw new Error(`${row.label} secure-store credential is missing.`)
    }
  }
  await fs.mkdir(userDataDir, { recursive: true })
  await fs.writeFile(
    path.join(userDataDir, 'config.json'),
    JSON.stringify({ providerCredentials }, null, 2),
    'utf8',
  )
}

function makePngBytes() {
  const width = 64
  const height = 64
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1)
    raw[row] = 0
    for (let x = 0; x < width; x += 1) {
      const i = row + 1 + x * 4
      const inSquare = x >= 16 && x < 48 && y >= 16 && y < 48
      raw[i] = inSquare ? 235 : 30
      raw[i + 1] = inSquare ? 80 : 160
      raw[i + 2] = inSquare ? 60 : 220
      raw[i + 3] = 255
    }
  }
  const chunks = []
  chunks.push(pngChunk('IHDR', Buffer.concat([
    u32(width),
    u32(height),
    Buffer.from([8, 6, 0, 0, 0]),
  ])))
  chunks.push(pngChunk('IDAT', zlib.deflateSync(raw)))
  chunks.push(pngChunk('IEND', Buffer.alloc(0)))
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ...chunks])
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii')
  const crcInput = Buffer.concat([typeBuffer, data])
  return Buffer.concat([u32(data.byteLength), typeBuffer, data, u32(crc32(crcInput))])
}

function u32(value) {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32BE(value >>> 0, 0)
  return buffer
}

function crc32(buffer) {
  if (!crc32.table) {
    const table = new Uint32Array(256)
    for (let i = 0; i < 256; i += 1) {
      let c = i
      for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
      table[i] = c >>> 0
    }
    crc32.table = table
  }
  let c = 0xffffffff
  for (const byte of buffer) c = crc32.table[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function makePdfBytes() {
  const text = `Starverse Playwright UI smoke keyword: ${PDF_KEYWORD}.`
  const escaped = text.replace(/[()\\]/g, '\\$&')
  const stream = `BT /F1 12 Tf 36 96 Td (${escaped}) Tj ET`
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'))
    pdf += object
  }
  const xrefOffset = Buffer.byteLength(pdf, 'utf8')
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(pdf, 'utf8')
}

async function writeFixtures(root) {
  await fs.mkdir(root, { recursive: true })
  const imagePath = path.join(root, 'starverse-ui-smoke-image.png')
  const pdfPath = path.join(root, 'starverse-ui-smoke-document.pdf')
  await fs.writeFile(imagePath, makePngBytes())
  await fs.writeFile(pdfPath, makePdfBytes())
  return { imagePath, pdfPath }
}

function spawnVite() {
  const command = [
    'npx',
    'vite',
    '--config',
    quoteForShell(viteConfigPath),
    '--host',
    uiHost,
    '--port',
    String(uiPort),
    '--strictPort',
    '--logLevel',
    'info',
  ].join(' ')
  return spawn(command, {
    cwd: repoRoot,
    env: { ...process.env, NODE_ENV: 'development', FORCE_COLOR: '0' },
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let lastError = null
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { cache: 'no-store' })
      if (response.ok) return
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await sleep(250)
  }
  throw new Error(`Renderer server did not become ready at ${url}: ${safeError(lastError)}`)
}

async function closeProcessTree(child) {
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

async function buildElectronArtifacts() {
  if (process.platform === 'win32') {
    execFileSync('cmd.exe', ['/d', '/s', '/c', 'node scripts/build-db-worker.cjs'], { cwd: repoRoot, stdio: 'inherit' })
    execFileSync('cmd.exe', ['/d', '/s', '/c', 'npx vite build --mode development --config vite.config.ts'], { cwd: repoRoot, stdio: 'inherit' })
  } else {
    execFileSync('node', ['scripts/build-db-worker.cjs'], { cwd: repoRoot, stdio: 'inherit' })
    execFileSync('npx', ['vite', 'build', '--mode', 'development', '--config', 'vite.config.ts'], { cwd: repoRoot, stdio: 'inherit' })
  }
}

async function waitForAppWindow(electronApp, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    for (const page of electronApp.windows()) {
      if (page.url().startsWith('devtools://')) continue
      if (page.url().startsWith(viteUrl)) return page
      try {
        if (await page.evaluate(() => Boolean(document.querySelector('#app') || document.querySelector('[data-testid="composer-draft"]')))) return page
      } catch {}
    }
    try {
      const page = await electronApp.waitForEvent('window', { timeout: 1000 })
      if (page.url().startsWith('devtools://')) continue
      try {
        if (await page.evaluate(() => Boolean(document.querySelector('#app') || document.querySelector('[data-testid="composer-draft"]')))) return page
      } catch {}
    } catch {}
  }
  throw new Error('Electron app window did not become ready.')
}

async function waitForPageCondition(page, predicate, arg, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  let lastError = null
  while (Date.now() < deadline) {
    try {
      if (await page.evaluate(predicate, arg)) return
    } catch (error) {
      lastError = error
    }
    await sleep(150)
  }
  throw new Error(`Timed out waiting for page condition: ${safeError(lastError || 'condition not met')}`)
}

async function openConsole(page) {
  await page.getByRole('button', { name: /Console/ }).click()
}

async function closeRightRailIfOpen(page) {
  const floatingCloseHandle = page.locator('[data-testid="right-rail-floating-close-handle"]')
  if (await floatingCloseHandle.count()) {
    await floatingCloseHandle.click()
    await page.waitForSelector('[data-testid="right-rail-floating-close-handle"]', { state: 'detached', timeout: 5000 }).catch(() => undefined)
  }
}

async function setCheckboxByTestId(page, testId, checked) {
  await page.evaluate(({ selector, nextChecked }) => {
    const input = document.querySelector(selector)
    if (!(input instanceof HTMLInputElement)) throw new Error(`Missing checkbox ${selector}`)
    input.checked = nextChecked
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }, { selector: `[data-testid="${testId}"]`, nextChecked: checked })
}

async function selectProvider(page, row) {
  await openConsole(page)
  await page.waitForSelector(`[data-testid="${row.controlsTestId}"]`, { timeout: 30000 })
  await page.locator(`[data-testid="${row.controlsTestId}"]`).scrollIntoViewIfNeeded()
  const checkbox = page.locator(`[data-testid="${row.enabledTestId}"]`)
  if (!(await checkbox.isChecked())) await setCheckboxByTestId(page, row.enabledTestId, true)
  await page.fill(`[data-testid="${row.modelTestId}"]`, row.model)
  await waitForPageCondition(page,
    ({ statusTestId, model }) => {
      const status = document.querySelector(`[data-testid="${statusTestId}"]`)?.textContent || ''
      return status.includes('active') && status.includes(model)
    },
    { statusTestId: row.statusTestId, model: row.model },
    15000,
  )
  await closeRightRailIfOpen(page)
}

async function installFileDialogMock(electronApp, filePath) {
  await electronApp.evaluate(({ dialog }, selectedPath) => {
    globalThis.__starverseMultimodalUiSmokeDialog = {
      selectedPath,
      calls: [],
    }
    dialog.showOpenDialog = async (_browserWindowOrOptions, maybeOptions) => {
      const options = maybeOptions || _browserWindowOrOptions || {}
      globalThis.__starverseMultimodalUiSmokeDialog.calls.push({
        properties: Array.isArray(options.properties) ? options.properties : [],
        filters: Array.isArray(options.filters) ? options.filters.map((filter) => filter.name) : [],
      })
      return { canceled: false, filePaths: [globalThis.__starverseMultimodalUiSmokeDialog.selectedPath] }
    }
  }, filePath)
}

async function attachViaUi(page, electronApp, filePath, kind) {
  await installFileDialogMock(electronApp, filePath)
  await page.click('[data-testid="composer-attach-toggle"]')
  await page.waitForSelector('[data-testid="composer-attach-menu"]', { timeout: 10000 })
  await page.click(kind === 'image' ? '[data-testid="composer-attach-image"]' : '[data-testid="composer-attach-file"]')
  await page.waitForSelector('[data-testid="draft-attachment-strip"]', { timeout: 60000 })
  await waitForPageCondition(page,
    () => {
      const block = document.querySelector('[data-testid="composer-send-gate-block"]')
      const loading = document.querySelector('[data-testid="composer-send-gate-loading"]')
      return !block && !loading && Boolean(document.querySelector('[data-testid="composer-send"]'))
    },
    null,
    90000,
  )
}

async function sendPromptAndWaitForAssistant(page, prompt) {
  await page.fill('[data-testid="composer-draft"]', prompt)
  const beforeAssistantCount = await page.locator('[data-testid^="copy-assistant-text-"]').count()
  await page.click('[data-testid="composer-send"]')
  await waitForPageCondition(page,
    ({ before }) => document.querySelectorAll('[data-testid^="copy-assistant-text-"]').length > before,
    { before: beforeAssistantCount },
    180000,
  )
  await waitForPageCondition(page,
    ({ before }) => {
      const buttons = Array.from(document.querySelectorAll('[data-testid^="copy-assistant-text-"]'))
      const latest = buttons.at(-1)
      const wrap = latest ? latest.closest('[data-testid^="msg-wrap-"]') : null
      const text = wrap ? wrap.textContent || '' : ''
      return buttons.length > before && text.trim().length > 0 && !document.querySelector('[data-testid="composer-stop"]')
    },
    { before: beforeAssistantCount },
    180000,
  )
  return await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('[data-testid^="copy-assistant-text-"]'))
    const latest = buttons.at(-1)
    const wrap = latest ? latest.closest('[data-testid^="msg-wrap-"]') : null
    return (wrap && wrap.textContent ? wrap.textContent : '').trim()
  })
}

async function runCase(page, electronApp, row, fixturePath, kind, prompt) {
  await selectProvider(page, row)
  await attachViaUi(page, electronApp, fixturePath, kind)
  const text = await sendPromptAndWaitForAssistant(page, prompt)
  return {
    provider: row.id,
    model: row.model,
    kind,
    ok: text.length > 0,
    assistantTextLength: text.length,
    pdfKeywordHit: kind === 'pdf' ? text.includes(PDF_KEYWORD) : undefined,
  }
}

async function assertNoLeak(page, extraNeedles) {
  const result = await page.evaluate((needles) => {
    const text = document.body.innerText || ''
    const matches = needles.filter((needle) => text.includes(needle))
    return { ok: matches.length === 0, matches }
  }, [...FORBIDDEN_UI_MARKERS, ...extraNeedles])
  if (!result.ok) throw new Error(`UI leak check failed: ${result.matches.join(', ')}`)
}

async function summarizeUi(page) {
  return await page.evaluate(() => ({
    url: window.location.href,
    hasComposerDraft: Boolean(document.querySelector('[data-testid="composer-draft"]')),
    hasComposerSend: Boolean(document.querySelector('[data-testid="composer-send"]')),
    textTail: (document.body.innerText || '').slice(-1600),
    testIds: Array.from(document.querySelectorAll('[data-testid]')).map((el) => el.getAttribute('data-testid')).filter(Boolean).slice(0, 120),
  }))
}

async function main() {
  section('Playwright multimodal real UI smoke')
  const buildElectron = process.argv.includes('--build-electron') || !(await pathExists(mainPath))
  if (buildElectron) {
    section('Build Electron artifacts')
    await buildElectronArtifacts()
  }

  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'starverse-multimodal-ui-smoke-'))
  const userDataDir = path.join(root, 'userData')
  const fixtureDir = path.join(root, 'fixtures')
  const { imagePath, pdfPath } = await writeFixtures(fixtureDir)
  await prepareUserData(userDataDir)

  const vite = spawnVite()
  let viteOutput = ''
  vite.stdout.on('data', (chunk) => { viteOutput += chunk.toString() })
  vite.stderr.on('data', (chunk) => { viteOutput += chunk.toString() })

  let electronApp = null
  let page = null
  const results = []
  let currentStep = 'initializing'
  try {
    currentStep = 'wait for Vite'
    await waitForHttp(viteUrl, 30000)
    const { _electron: electron } = await import('playwright')
    const electronExecutable = requireFromRepo('electron')
    currentStep = 'launch Electron'
    electronApp = await electron.launch({
      executablePath: electronExecutable,
      args: [`--user-data-dir=${userDataDir}`, mainPath],
      cwd: repoRoot,
      env: {
        ...process.env,
        NODE_ENV: 'development',
        VITE_DEV_SERVER_URL: viteUrl,
        FORCE_COLOR: '0',
      },
      timeout: 60000,
    })
    currentStep = 'wait for app window'
    page = await waitForAppWindow(electronApp, 60000)
    await page.waitForSelector('[data-testid="composer-draft"]', { timeout: 120000 })

    currentStep = 'image UI smoke'
    results.push(await runCase(page, electronApp, providers.openai, imagePath, 'image', IMAGE_PROMPT))
    await assertNoLeak(page, [imagePath, pdfPath])

    currentStep = 'pdf UI smoke'
    results.push(await runCase(page, electronApp, providers.gemini, pdfPath, 'pdf', PDF_PROMPT))
    await assertNoLeak(page, [imagePath, pdfPath])

    const dialogState = await electronApp.evaluate(() => globalThis.__starverseMultimodalUiSmokeDialog || null)
    const summary = {
      ok: results.every((result) => result.ok),
      generationCalls: results.length,
      fixtures: {
        imageBytes: (await fs.stat(imagePath)).size,
        pdfBytes: (await fs.stat(pdfPath)).size,
      },
      results,
      uiLeakCheck: 'passed',
      dialogCalls: Array.isArray(dialogState && dialogState.calls) ? dialogState.calls.length : null,
      screenshots: 'none',
      traces: 'none',
      realProviderCalls: true,
      secureStoreCredentials: true,
    }
    console.log(JSON.stringify(summary, null, 2))
    if (!summary.ok) throw new Error('One or more UI smoke cases failed.')
  } catch (error) {
    const failure = {
      ok: false,
      currentStep,
      error: safeError(error),
      viteOutputTail: sanitize(viteOutput.slice(-2000)),
      ui: page ? await summarizeUi(page).catch((uiError) => ({ error: safeError(uiError) })) : null,
      screenshots: 'none',
      traces: 'none',
    }
    console.log(JSON.stringify(failure, null, 2))
    process.exitCode = 1
  } finally {
    if (electronApp) await electronApp.close().catch(() => undefined)
    await closeProcessTree(vite)
    await fs.rm(root, { recursive: true, force: true }).catch(() => undefined)
  }
}

main().catch((error) => {
  process.stderr.write(`\nFAIL: ${safeError(error)}\n`)
  process.exit(1)
})
