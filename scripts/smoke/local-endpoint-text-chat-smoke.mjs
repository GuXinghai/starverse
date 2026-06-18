import { execFileSync, spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..', '..')
const defaultRealEndpoint = process.env.LOCAL_ENDPOINT_SMOKE_URL ?? 'http://localhost:1234'
const defaultRealModel = process.env.LOCAL_ENDPOINT_SMOKE_MODEL ?? ''
const uiPort = Number.parseInt(process.env.SV_LOCAL_ENDPOINT_UI_SMOKE_PORT ?? '5182', 10)
const uiHost = process.env.SV_LOCAL_ENDPOINT_UI_SMOKE_HOST ?? '127.0.0.1'
const viteUrl = `http://${uiHost}:${uiPort}/`
const mainPath = path.join(repoRoot, 'dist-electron', 'main.js')
const viteConfigPath = path.join(repoRoot, 'scripts', 'smoke', 'vite.renderer-smoke.config.ts')
const artifactRoot = path.join(repoRoot, '.artifacts', 'local-endpoint-smoke')

function parseArgs(argv) {
  const args = {
    realEndpoint: defaultRealEndpoint,
    realModel: defaultRealModel,
    skipReal: false,
    requireReal: false,
    ui: false,
    buildElectron: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--real-endpoint' || arg === '--endpoint') {
      args.realEndpoint = String(argv[i + 1] ?? '').trim()
      i += 1
      continue
    }
    if (arg === '--real-model' || arg === '--model') {
      args.realModel = String(argv[i + 1] ?? '').trim()
      i += 1
      continue
    }
    if (arg === '--skip-real') {
      args.skipReal = true
      continue
    }
    if (arg === '--require-real') {
      args.requireReal = true
      continue
    }
    if (arg === '--ui') {
      args.ui = true
      continue
    }
    if (arg === '--build-electron') {
      args.buildElectron = true
      continue
    }
  }
  return args
}

function section(title) {
  process.stdout.write(`\n${'='.repeat(80)}\n${title}\n${'='.repeat(80)}\n`)
}

function redact(value) {
  if (typeof value !== 'string') return value
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer <redacted>')
    .replace(/Authorization:\s*[^\r\n]+/gi, 'Authorization: <redacted>')
    .replace(/\/\/([^/@\s]+)@/g, '//<userinfo-redacted>@')
    .replace(/[?&](?:token|api_key|key|secret|password)=[^&\s]+/gi, '?<query-redacted>')
}

function safeError(error) {
  const message = error instanceof Error ? error.message : String(error)
  return redact(message)
}

function ensureLoopbackEndpoint(raw) {
  const url = new URL(raw)
  const host = url.hostname.toLowerCase()
  const allowed = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]' || host === '::ffff:127.0.0.1'
  if (!allowed) throw new Error(`Refusing non-loopback endpoint: ${url.origin}`)
  if (url.username || url.password) throw new Error('Refusing endpoint URL with embedded credentials')
  return url
}

function endpointUrl(base, suffix) {
  const url = new URL(base)
  let pathname = url.pathname.replace(/\/+$/, '')
  if (!pathname.endsWith('/v1')) pathname = `${pathname}/v1`
  url.pathname = `${pathname}${suffix}`
  url.search = ''
  url.hash = ''
  return url.href
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function readRequestJson(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : null
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

function sendSseHeaders(res) {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  })
}

function writeSse(res, data) {
  res.write(`data: ${data}\n\n`)
}

async function startMockEndpoint() {
  const state = {
    authHeaderSeen: false,
    requestCount: 0,
    abortObserved: false,
    lastRequestBody: null,
  }
  const modelId = 'starverse-local-smoke-mock'
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (req.headers.authorization || req.headers['x-api-key'] || req.headers['api-key'] || req.headers['x-local-admin-token']) {
        state.authHeaderSeen = true
        sendJson(res, 400, { error: 'secret header rejected by smoke mock' })
        return
      }
      if (req.method === 'GET' && url.pathname === '/v1/models') {
        sendJson(res, 200, { object: 'list', data: [{ id: modelId, object: 'model', owned_by: 'starverse-smoke' }] })
        return
      }
      if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
        state.requestCount += 1
        const body = await readRequestJson(req)
        state.lastRequestBody = body
        const prompt = Array.isArray(body?.messages)
          ? body.messages.map((message) => String(message?.content ?? '')).join('\n')
          : ''
        if (body?.model !== modelId || body?.stream !== true) {
          sendJson(res, 400, { error: 'invalid smoke request' })
          return
        }

        sendSseHeaders(res)
        if (prompt.includes('malformed')) {
          res.write('data: {"choices":[\n\n')
          res.end()
          return
        }
        if (prompt.includes('timeout')) {
          const markAbortObserved = () => {
            state.abortObserved = true
          }
          req.on('close', markAbortObserved)
          res.on('close', markAbortObserved)
          return
        }
        if (prompt.includes('abort')) {
          const markAbortObserved = () => {
            state.abortObserved = true
          }
          req.on('close', markAbortObserved)
          res.on('close', markAbortObserved)
          writeSse(res, JSON.stringify({ choices: [{ index: 0, delta: { content: 'abort-start ' }, finish_reason: null }] }))
          return
        }
        if (prompt.includes('slow')) {
          writeSse(res, JSON.stringify({ choices: [{ index: 0, delta: { content: 'slow ' }, finish_reason: null }] }))
          await sleep(150)
          writeSse(res, JSON.stringify({ choices: [{ index: 0, delta: { content: 'ok' }, finish_reason: 'stop' }] }))
          writeSse(res, '[DONE]')
          res.end()
          return
        }
        writeSse(res, JSON.stringify({ id: 'local-smoke-1', model: modelId, choices: [{ index: 0, delta: { content: 'starverse local ' }, finish_reason: null }] }))
        writeSse(res, JSON.stringify({ id: 'local-smoke-1', model: modelId, choices: [{ index: 0, delta: { content: 'endpoint smoke ok' }, finish_reason: 'stop' }] }))
        writeSse(res, '[DONE]')
        res.end()
        return
      }
      sendJson(res, 404, { error: 'not found' })
    } catch {
      sendJson(res, 500, { error: 'mock endpoint failed' })
    }
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  return {
    server,
    state,
    modelId,
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function readSseText(response, timeoutMs = 8000) {
  if (!response.body) throw new Error('Missing response body')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const startedAt = Date.now()
  let buffer = ''
  let dataLines = []
  let text = ''
  let sawDone = false

  const flush = () => {
    if (dataLines.length === 0) return
    const data = dataLines.join('\n')
    dataLines = []
    if (data === '[DONE]') {
      sawDone = true
      return
    }
    let json
    try {
      json = JSON.parse(data)
    } catch {
      throw new Error('Malformed SSE JSON')
    }
    const delta = json?.choices?.[0]?.delta?.content
    if (typeof delta === 'string') text += delta
  }

  while (!sawDone) {
    const remainingMs = timeoutMs - (Date.now() - startedAt)
    if (remainingMs <= 0) {
      await reader.cancel().catch(() => undefined)
      throw new Error(`SSE read timed out after ${timeoutMs}ms`)
    }
    let readResult
    try {
      readResult = await Promise.race([
        reader.read(),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error(`SSE read timed out after ${timeoutMs}ms`)), remainingMs).unref()
        }),
      ])
    } catch (error) {
      await reader.cancel().catch(() => undefined)
      throw error
    }
    const { value, done } = readResult
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    while (true) {
      const idx = buffer.indexOf('\n')
      if (idx < 0) break
      const rawLine = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 1)
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
      if (line === '') {
        flush()
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice('data:'.length).trimStart())
      }
    }
  }
  flush()
  return { text, sawDone }
}

async function postStreamingChat(baseUrl, modelId, prompt, timeoutMs = 8000, signal) {
  const url = endpointUrl(baseUrl, '/chat/completions')
  const controller = signal ? null : new AbortController()
  const timer = controller ? setTimeout(() => controller.abort('timeout'), timeoutMs) : null
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelId,
        stream: true,
        max_tokens: 64,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
      }),
      redirect: 'error',
      signal: signal ?? controller?.signal,
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`chat/completions HTTP ${response.status}: ${redact(body.slice(0, 200))}`)
    }
    return await readSseText(response, timeoutMs)
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function runMockHttpSmoke() {
  section('Mock LocalEndpoint text chat smoke')
  const mock = await startMockEndpoint()
  try {
    const modelsResponse = await fetchWithTimeout(endpointUrl(mock.baseUrl, '/models'), { method: 'GET', redirect: 'error' }, 3000)
    const modelsJson = await modelsResponse.json()
    const modelId = modelsJson?.data?.[0]?.id
    if (modelId !== mock.modelId) throw new Error('mock /v1/models did not return expected model id')

    const normal = await postStreamingChat(mock.baseUrl, modelId, 'Say "starverse local endpoint smoke ok".')
    if (!normal.text.includes('starverse local endpoint smoke ok')) throw new Error(`normal stream mismatch: ${normal.text}`)

    const slow = await postStreamingChat(mock.baseUrl, modelId, 'slow stream please')
    if (slow.text !== 'slow ok') throw new Error(`slow stream mismatch: ${slow.text}`)

    let malformedFailed = false
    try {
      await postStreamingChat(mock.baseUrl, modelId, 'malformed stream please')
    } catch (error) {
      malformedFailed = safeError(error).includes('Malformed SSE JSON')
    }
    if (!malformedFailed) throw new Error('malformed stream was not rejected')

    const controller = new AbortController()
    const timeoutPromise = postStreamingChat(mock.baseUrl, modelId, 'timeout stream please', 5000, controller.signal)
    setTimeout(() => controller.abort('smoke_abort'), 100).unref()
    let abortFailed = false
    try {
      await timeoutPromise
    } catch {
      abortFailed = true
    }
    if (!abortFailed) throw new Error('timeout/abort stream did not abort')

    if (mock.state.authHeaderSeen) throw new Error('mock observed a secret header')
    console.log(JSON.stringify({
      endpoint: `${mock.baseUrl}/v1`,
      modelId,
      normalText: normal.text,
      slowText: slow.text,
      malformedRejected: true,
      abortRejected: true,
      authHeaderSeen: false,
    }, null, 2))
    return { ok: true, endpoint: `${mock.baseUrl}/v1`, modelId, normalText: normal.text }
  } finally {
    await mock.close()
  }
}

async function runRealLmStudioSmoke(input) {
  section('Real LM Studio LocalEndpoint text chat smoke')
  let base
  try {
    base = ensureLoopbackEndpoint(input.endpoint)
  } catch (error) {
    return { ok: false, skipped: true, reason: safeError(error), endpoint: input.endpoint }
  }

  try {
    const modelsResponse = await fetchWithTimeout(endpointUrl(base.href, '/models'), { method: 'GET', redirect: 'error' }, 5000)
    if (!modelsResponse.ok) {
      return { ok: false, skipped: true, endpoint: input.endpoint, reason: `/v1/models HTTP ${modelsResponse.status}` }
    }
    const modelsJson = await modelsResponse.json()
    const models = Array.isArray(modelsJson?.data) ? modelsJson.data : []
    const modelId = input.model || String(models[0]?.id ?? '').trim()
    if (!modelId) return { ok: false, skipped: true, endpoint: input.endpoint, reason: 'no model id returned by /v1/models', modelCount: models.length }

    const stream = await postStreamingChat(base.href, modelId, 'Say "starverse local endpoint smoke ok".', 60000)
    if (!stream.text.trim()) throw new Error('real LM Studio stream returned empty text')
    const summary = {
      ok: true,
      endpoint: input.endpoint,
      modelId,
      modelCount: models.length,
      textLength: stream.text.length,
      textPreview: stream.text.slice(0, 160),
      sawDone: stream.sawDone,
    }
    console.log(JSON.stringify(summary, null, 2))
    return summary
  } catch (error) {
    const result = { ok: false, skipped: true, endpoint: input.endpoint, reason: safeError(error) }
    console.log(JSON.stringify(result, null, 2))
    return result
  }
}

function quoteForShell(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`
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
  throw new Error(`Renderer server did not become ready at ${url}: ${lastError?.message ?? 'timeout'}`)
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

async function waitForAppWindow(electronApp, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    for (const page of electronApp.windows()) {
      if (page.url().startsWith(viteUrl)) return page
      try {
        const hasApp = await page.evaluate(() => Boolean(document.querySelector('#app')))
        if (hasApp) return page
      } catch {
        // Continue polling.
      }
    }
    try {
      const page = await electronApp.waitForEvent('window', { timeout: 1000 })
      if (page.url().startsWith(viteUrl)) return page
    } catch {
      // Continue polling.
    }
  }
  throw new Error('Electron app window did not become ready')
}

async function summarizeUiSmokeState(page) {
  return await page.evaluate(() => ({
    url: window.location.href,
    title: document.title,
    hasComposerDraft: Boolean(document.querySelector('[data-testid="composer-draft"]')),
    hasComposerSend: Boolean(document.querySelector('[data-testid="composer-send"]')),
    hasComposerStop: Boolean(document.querySelector('[data-testid="composer-stop"]')),
    hasLocalEndpointControls: Boolean(document.querySelector('[data-testid="local-endpoint-chat-controls"]')),
    testIds: Array.from(document.querySelectorAll('[data-testid]'))
      .map((element) => element.getAttribute('data-testid'))
      .filter((value) => typeof value === 'string')
      .slice(0, 120),
    textSample: document.body.innerText.trim().slice(0, 1200),
  }))
}

async function maybeBuildElectronArtifacts() {
  if (process.platform === 'win32') {
    execFileSync('cmd.exe', ['/d', '/s', '/c', 'npx vite build --mode development --config vite.config.ts'], { cwd: repoRoot, stdio: 'inherit' })
  } else {
    execFileSync('npx', ['vite', 'build', '--mode', 'development', '--config', 'vite.config.ts'], { cwd: repoRoot, stdio: 'inherit' })
  }
}

async function runUiSmoke(input) {
  section('Starverse Electron UI LocalEndpoint text chat smoke')
  if (input.buildElectron) await maybeBuildElectronArtifacts()

  const mock = await startMockEndpoint()
  const userDataDir = path.join(os.tmpdir(), `starverse-local-endpoint-ui-smoke-${process.pid}`)
  const summaryPath = path.join(artifactRoot, 'ui-smoke-summary.json')
  await fs.mkdir(artifactRoot, { recursive: true })
  await fs.rm(summaryPath, { force: true }).catch(() => undefined)
  await fs.mkdir(userDataDir, { recursive: true })

  const vite = spawnVite()
  let viteOutput = ''
  vite.stdout.on('data', (chunk) => {
    viteOutput += chunk.toString()
  })
  vite.stderr.on('data', (chunk) => {
    viteOutput += chunk.toString()
  })

  let electronApp = null
  let page = null
  try {
    await waitForHttp(viteUrl, 30000)
    const { _electron: electron } = await import('playwright')
    const electronExecutable = require('electron')

    const launchApp = async () => {
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
      const launchedPage = await waitForAppWindow(electronApp, 60000)
      await launchedPage.waitForSelector('[data-testid="composer-draft"]', { timeout: 120000 })
      return launchedPage
    }

    page = await launchApp()
    await page.getByRole('button', { name: /Console/ }).click()
    await page.waitForSelector('[data-testid="local-endpoint-chat-controls"]', { timeout: 60000 })
    await page.locator('[data-testid="local-endpoint-chat-controls"]').scrollIntoViewIfNeeded()
    const checkbox = page.locator('[data-testid="local-endpoint-chat-enabled"]')
    if (!(await checkbox.isChecked())) await checkbox.click()
    await page.fill('[data-testid="local-endpoint-chat-url"]', `${mock.baseUrl}/v1`)
    await page.fill('[data-testid="local-endpoint-chat-model"]', mock.modelId)
    const floatingCloseHandle = page.locator('[data-testid="right-rail-floating-close-handle"]')
    if (await floatingCloseHandle.count()) {
      await floatingCloseHandle.click()
      await page.waitForSelector('[data-testid="local-endpoint-chat-controls"]', { state: 'detached', timeout: 10000 }).catch(() => undefined)
    }
    await page.fill('[data-testid="composer-draft"]', 'Say "starverse local endpoint smoke ok".')
    await page.waitForSelector('[data-testid="composer-send"], [data-testid="composer-stop"]', { timeout: 30000 })
    if (!(await page.locator('[data-testid="composer-send"]').count())) {
      throw new Error(`composer send is unavailable before LocalEndpoint smoke send: ${JSON.stringify(await summarizeUiSmokeState(page))}`)
    }
    await page.click('[data-testid="composer-send"]')
    await page.waitForFunction(
      () => document.body.innerText.includes('starverse local endpoint smoke ok'),
      undefined,
      { timeout: 60000 },
    )

    const transcriptText = await page.locator('body').innerText()
    const streamedIntoTranscript = transcriptText.includes('starverse local endpoint smoke ok')
    const persistenceEvidence = await page.evaluate(async () => {
      const convoRow = document.querySelector('[data-testid^="convo-row-"]')
      const testId = convoRow?.getAttribute('data-testid') ?? ''
      const convoId = testId.startsWith('convo-row-') ? testId.slice('convo-row-'.length) : ''
      const bridge = window.dbBridge
      if (!convoId || !bridge || typeof bridge.invoke !== 'function') {
        return { ok: false, convoId, messageCount: 0 }
      }
      const rows = await bridge.invoke('message.list', { convoId, limit: 100, direction: 'asc' })
      const serializedRows = JSON.stringify(rows)
      return {
        ok: serializedRows.includes('starverse local endpoint smoke ok'),
        convoId,
        messageCount: Array.isArray(rows) ? rows.length : 0,
      }
    })
    const persisted = persistenceEvidence.ok

    await page.fill('[data-testid="composer-draft"]', 'abort smoke please')
    await page.click('[data-testid="composer-send"]')
    await page.waitForFunction(
      () => document.body.innerText.includes('abort-start'),
      undefined,
      { timeout: 30000 },
    )
    await page.waitForSelector('[data-testid="composer-stop"]', { timeout: 10000 })
    await page.click('[data-testid="composer-stop"]')
    const abortDeadline = Date.now() + 5000
    while (!mock.state.abortObserved && Date.now() < abortDeadline) await sleep(100)

    const summary = {
      ok: true,
      endpoint: `${mock.baseUrl}/v1`,
      modelId: mock.modelId,
      streamedIntoTranscript,
      messagesPersistedViaDbBridge: persisted,
      persistenceEvidence,
      abortObserved: mock.state.abortObserved,
      authHeaderSeen: mock.state.authHeaderSeen,
      artifact: path.relative(repoRoot, summaryPath).replace(/\\/g, '/'),
    }
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf8')
    console.log(JSON.stringify(summary, null, 2))
    if (!streamedIntoTranscript) throw new Error('LocalEndpoint text did not appear in normal transcript')
    if (!persisted) throw new Error('LocalEndpoint transcript was not persisted through dbBridge message.list')
    if (mock.state.authHeaderSeen) throw new Error('UI smoke mock observed a secret header')
    return summary
  } catch (error) {
    const failure = {
      ok: false,
      error: safeError(error),
      viteOutputTail: viteOutput.slice(-2000),
      uiState: page ? await summarizeUiSmokeState(page).catch(() => null) : null,
    }
    await fs.writeFile(summaryPath, JSON.stringify(failure, null, 2), 'utf8').catch(() => undefined)
    throw error
  } finally {
    if (electronApp) await electronApp.close().catch(() => undefined)
    await closeProcessTree(vite)
    await mock.close()
    await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const results = {
    mock: await runMockHttpSmoke(),
    real: null,
    ui: null,
  }
  if (!args.skipReal) {
    results.real = await runRealLmStudioSmoke({ endpoint: args.realEndpoint, model: args.realModel })
    if (args.requireReal && !results.real.ok) throw new Error(`Required real LocalEndpoint smoke failed: ${results.real.reason}`)
  }
  if (args.ui) results.ui = await runUiSmoke({ buildElectron: args.buildElectron })

  section('LocalEndpoint text chat smoke summary')
  console.log(JSON.stringify(results, null, 2))
  console.log('\nPASS: LocalEndpoint smoke completed')
}

main().catch((error) => {
  process.stderr.write(`\nFAIL: ${safeError(error)}\n`)
  process.exit(1)
})
