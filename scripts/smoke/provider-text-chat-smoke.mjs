import { execFileSync, spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

/**
 * Experimental provider text-chat Electron smoke matrix.
 *
 * Default dry run:
 *   node scripts/smoke/provider-text-chat-smoke.mjs
 *
 * Real Electron UI matrix:
 *   node scripts/smoke/provider-text-chat-smoke.mjs --ui --build-electron
 *
 * The UI matrix uses deterministic mocks:
 * - OpenRouter is mocked at the renderer OpenRouter IPC bridge.
 * - LocalEndpoint uses a loopback OpenAI-compatible mock endpoint.
 * - OpenAI Responses, Google AI Studio, Anthropic, and DeepSeek are mocked
 *   at their provider-specific renderer chat bridges.
 *
 * No API keys, Authorization headers, custom secret headers, real provider
 * calls, model-picker publication, Send Plan changes, or DB migrations are
 * involved.
 */

const require = createRequire(import.meta.url)
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..', '..')
const uiPort = Number.parseInt(process.env.SV_PROVIDER_SMOKE_UI_PORT ?? '5183', 10)
const uiHost = process.env.SV_PROVIDER_SMOKE_UI_HOST ?? '127.0.0.1'
const viteUrl = `http://${uiHost}:${uiPort}/`
const mainPath = path.join(repoRoot, 'dist-electron', 'main.js')
const viteConfigPath = path.join(repoRoot, 'scripts', 'smoke', 'vite.renderer-smoke.config.ts')
const artifactRoot = process.env.SV_PROVIDER_SMOKE_ARTIFACT_DIR
  ? path.resolve(process.env.SV_PROVIDER_SMOKE_ARTIFACT_DIR)
  : path.join(os.tmpdir(), 'starverse-provider-text-chat-smoke')

const secretLeakPatterns = [
  /sk-[A-Za-z0-9_-]{8,}/i,
  /Bearer\s+\S+/i,
  /Authorization\s*:/i,
  /x-api-key\s*:/i,
  /api-key\s*:/i,
  /custom secret header/i,
]

const providerCases = [
  {
    id: 'openrouter',
    label: 'OpenRouter default',
    expectedText: 'starverse openrouter smoke ok',
    mockModelId: 'openrouter/smoke-default',
    experimental: false,
  },
  {
    id: 'local-endpoint',
    label: 'LocalEndpoint experimental',
    expectedText: 'starverse local endpoint smoke ok',
    mockModelId: 'starverse-local-endpoint-matrix-mock',
    controlsTestId: 'local-endpoint-chat-controls',
    enabledTestId: 'local-endpoint-chat-enabled',
    modelTestId: 'local-endpoint-chat-model',
    urlTestId: 'local-endpoint-chat-url',
    clearTestId: 'local-endpoint-chat-clear',
    statusTestId: 'local-endpoint-chat-selected-status',
    experimental: true,
  },
  {
    id: 'openai-responses',
    label: 'OpenAI Responses experimental',
    expectedText: 'starverse openai responses smoke ok',
    mockModelId: 'gpt-starverse-smoke',
    controlsTestId: 'openai-responses-chat-controls',
    enabledTestId: 'openai-responses-chat-enabled',
    modelTestId: 'openai-responses-chat-model',
    clearTestId: 'openai-responses-chat-clear',
    statusTestId: 'openai-responses-chat-selected-status',
    bridgeName: 'openAIResponsesChat',
    experimental: true,
  },
  {
    id: 'google-ai-studio',
    label: 'Google AI Studio experimental',
    expectedText: 'starverse google ai studio smoke ok',
    mockModelId: 'gemini-starverse-smoke',
    controlsTestId: 'google-ai-studio-chat-controls',
    enabledTestId: 'google-ai-studio-chat-enabled',
    modelTestId: 'google-ai-studio-chat-model',
    clearTestId: 'google-ai-studio-chat-clear',
    statusTestId: 'google-ai-studio-chat-selected-status',
    bridgeName: 'googleAIStudioChat',
    experimental: true,
  },
  {
    id: 'anthropic',
    label: 'Anthropic Messages experimental',
    expectedText: 'starverse anthropic smoke ok',
    mockModelId: 'claude-starverse-smoke',
    controlsTestId: 'anthropic-chat-controls',
    enabledTestId: 'anthropic-chat-enabled',
    modelTestId: 'anthropic-chat-model',
    clearTestId: 'anthropic-chat-clear',
    statusTestId: 'anthropic-chat-selected-status',
    bridgeName: 'anthropicChat',
    experimental: true,
  },
  {
    id: 'deepseek',
    label: 'DeepSeek official experimental',
    expectedText: 'starverse deepseek smoke ok',
    mockModelId: 'deepseek-starverse-smoke',
    controlsTestId: 'deepseek-chat-controls',
    enabledTestId: 'deepseek-chat-enabled',
    modelTestId: 'deepseek-chat-model',
    clearTestId: 'deepseek-chat-clear',
    statusTestId: 'deepseek-chat-selected-status',
    bridgeName: 'deepSeekChat',
    experimental: true,
  },
]

function parseArgs(argv) {
  const args = {
    ui: false,
    buildElectron: false,
  }
  for (const arg of argv) {
    if (arg === '--ui') args.ui = true
    if (arg === '--build-electron') args.buildElectron = true
  }
  return args
}

function section(title) {
  process.stdout.write(`\n${'='.repeat(80)}\n${title}\n${'='.repeat(80)}\n`)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

async function startLocalEndpointMock() {
  const state = {
    authHeaderSeen: false,
    requestCount: 0,
    abortObserved: false,
    lastRequestBody: null,
  }
  const localCase = providerCases.find((row) => row.id === 'local-endpoint')
  const modelId = localCase?.mockModelId ?? 'starverse-local-endpoint-matrix-mock'
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
        const messages = Array.isArray(body?.messages) ? body.messages : []
        const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null
        const prompt = String(lastMessage?.content ?? '')
        if (body?.model !== modelId || body?.stream !== true) {
          sendJson(res, 400, { error: 'invalid smoke request' })
          return
        }

        sendSseHeaders(res)
        if (prompt.includes('abort')) {
          const markAbortObserved = () => {
            state.abortObserved = true
          }
          req.on('close', markAbortObserved)
          res.on('close', markAbortObserved)
          writeSse(res, JSON.stringify({ choices: [{ index: 0, delta: { content: 'local-endpoint abort-start ' }, finish_reason: null }] }))
          return
        }

        writeSse(res, JSON.stringify({ id: 'local-matrix-smoke-1', model: modelId, choices: [{ index: 0, delta: { content: 'starverse local ' }, finish_reason: null }] }))
        writeSse(res, JSON.stringify({ id: 'local-matrix-smoke-1', model: modelId, choices: [{ index: 0, delta: { content: 'endpoint smoke ok' }, finish_reason: 'stop' }] }))
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

async function startOpenRouterMock() {
  const state = {
    authHeaderSeen: false,
    requestCount: 0,
    abortObserved: false,
    lastRequestBody: null,
  }
  const modelId = providerCases.find((row) => row.id === 'openrouter')?.mockModelId ?? 'openrouter/smoke-default'
  const expectedText = providerCases.find((row) => row.id === 'openrouter')?.expectedText ?? 'starverse openrouter smoke ok'
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (req.headers.authorization) state.authHeaderSeen = true
      if (req.headers['x-api-key'] || req.headers['api-key'] || req.headers['x-local-admin-token']) {
        sendJson(res, 400, { error: 'unexpected secret-style header' })
        return
      }
      if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
        state.requestCount += 1
        const body = await readRequestJson(req)
        state.lastRequestBody = body
        const messages = Array.isArray(body?.messages) ? body.messages : []
        const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null
        const content = lastMessage?.content
        const prompt = typeof content === 'string'
          ? content
          : Array.isArray(content)
            ? content.map((part) => typeof part?.text === 'string' ? part.text : '').join('')
            : ''
        if (body?.stream !== true) {
          sendJson(res, 400, { error: 'invalid smoke request' })
          return
        }

        sendSseHeaders(res)
        if (prompt.includes('abort')) {
          const markAbortObserved = () => {
            state.abortObserved = true
          }
          req.on('close', markAbortObserved)
          res.on('close', markAbortObserved)
          writeSse(res, JSON.stringify({ choices: [{ index: 0, delta: { content: 'openrouter abort-start ' }, finish_reason: null }] }))
          return
        }
        writeSse(res, JSON.stringify({ id: 'openrouter-matrix-smoke-1', model: modelId, choices: [{ index: 0, delta: { content: expectedText }, finish_reason: null }] }))
        writeSse(res, JSON.stringify({ id: 'openrouter-matrix-smoke-1', model: modelId, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }))
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

async function maybeBuildElectronArtifacts() {
  if (process.platform === 'win32') {
    execFileSync('cmd.exe', ['/d', '/s', '/c', 'node scripts/build-db-worker.cjs'], { cwd: repoRoot, stdio: 'inherit' })
    execFileSync('cmd.exe', ['/d', '/s', '/c', 'npx vite build --mode development --config vite.config.ts'], { cwd: repoRoot, stdio: 'inherit' })
  } else {
    execFileSync('node', ['scripts/build-db-worker.cjs'], { cwd: repoRoot, stdio: 'inherit' })
    execFileSync('npx', ['vite', 'build', '--mode', 'development', '--config', 'vite.config.ts'], { cwd: repoRoot, stdio: 'inherit' })
  }
}

async function summarizeUiSmokeState(page) {
  return await page.evaluate(() => ({
    url: window.location.href,
    title: document.title,
    hasComposerDraft: Boolean(document.querySelector('[data-testid="composer-draft"]')),
    hasComposerSend: Boolean(document.querySelector('[data-testid="composer-send"]')),
    hasComposerStop: Boolean(document.querySelector('[data-testid="composer-stop"]')),
    localStorage: {
      local: window.localStorage.getItem('starverse.localEndpointTextChat.enabled'),
      openai: window.localStorage.getItem('starverse.openAIResponsesTextChat.enabled'),
      google: window.localStorage.getItem('starverse.googleAIStudioTextChat.enabled'),
      anthropic: window.localStorage.getItem('starverse.anthropicMessagesTextChat.enabled'),
      deepseek: window.localStorage.getItem('starverse.deepSeekTextChat.enabled'),
    },
    providerStatuses: {
      local: document.querySelector('[data-testid="local-endpoint-chat-selected-status"]')?.textContent ?? '',
      openai: document.querySelector('[data-testid="openai-responses-chat-selected-status"]')?.textContent ?? '',
      google: document.querySelector('[data-testid="google-ai-studio-chat-selected-status"]')?.textContent ?? '',
      anthropic: document.querySelector('[data-testid="anthropic-chat-selected-status"]')?.textContent ?? '',
      deepseek: document.querySelector('[data-testid="deepseek-chat-selected-status"]')?.textContent ?? '',
    },
    textSample: document.body.innerText.trim().slice(0, 1800),
    textTail: document.body.innerText.trim().slice(-1800),
    testIds: Array.from(document.querySelectorAll('[data-testid]'))
      .map((element) => element.getAttribute('data-testid'))
      .filter((value) => typeof value === 'string')
      .slice(0, 160),
  }))
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
    await sleep(100)
  }
  throw new Error(`Timed out waiting for page condition: ${safeError(lastError ?? 'condition not met')}`)
}

async function configureOpenRouterLoopbackCredential(page, openRouterMock) {
  const result = await page.evaluate(async ({ baseUrl }) => {
    const bridge = window.openRouterCredential
    if (!bridge || typeof bridge.update !== 'function') {
      return { ok: false, message: 'openRouterCredential bridge unavailable' }
    }
    return await bridge.update({
      apiKey: 'sk-provider-smoke-openrouter',
      baseUrl: `${baseUrl}/v1`,
    })
  }, { baseUrl: openRouterMock.baseUrl })
  if (!result?.ok) throw new Error(`OpenRouter mock credential update failed: ${redact(String(result?.message ?? 'unknown'))}`)
}

async function installMainProcessProviderIpcMocks(electronApp) {
  await electronApp.evaluate(({ ipcMain }) => {
    const cases = [
      {
        id: 'openai-responses',
        channel: 'openai-responses-chat',
        expectedText: 'starverse openai responses smoke ok',
        label: 'OpenAI Responses experimental',
      },
      {
        id: 'google-ai-studio',
        channel: 'google-ai-studio-chat',
        expectedText: 'starverse google ai studio smoke ok',
        label: 'Google AI Studio experimental',
      },
      {
        id: 'anthropic',
        channel: 'anthropic-chat',
        expectedText: 'starverse anthropic smoke ok',
        label: 'Anthropic Messages experimental',
      },
      {
        id: 'deepseek',
        channel: 'deepseek-chat',
        expectedText: 'starverse deepseek smoke ok',
        label: 'DeepSeek official experimental',
      },
    ]
    const state = {
      calls: [],
      aborts: [],
      installed: cases.map((row) => row.id),
    }
    const textFromValue = (value, depth = 0) => {
      if (depth > 8 || value == null) return ''
      if (typeof value === 'string') return value
      if (typeof value === 'number' || typeof value === 'boolean') return ''
      if (Array.isArray(value)) return value.map((item) => textFromValue(item, depth + 1)).join('\n')
      if (typeof value !== 'object') return ''

      const record = value
      const preferred = []
      for (const key of ['content', 'text', 'value', 'input', 'message']) {
        if (Object.prototype.hasOwnProperty.call(record, key)) preferred.push(textFromValue(record[key], depth + 1))
      }
      if (preferred.some((item) => item.length > 0)) return preferred.join('\n')
      return Object.values(record).map((item) => textFromValue(item, depth + 1)).join('\n')
    }
    const textFromPayload = (payload) => {
      const messages = Array.isArray(payload?.messages) ? payload.messages : []
      return messages.map((message) => textFromValue(message)).join('\n')
    }
    for (const row of cases) {
      ipcMain.removeHandler(`${row.channel}:stream-text`)
      ipcMain.handle(`${row.channel}:stream-text`, async (event, payload) => {
        const requestId = String(payload?.requestId ?? '')
        const assistantMessageId = String(payload?.assistantMessageId ?? '')
        const prompt = textFromPayload(payload)
        state.calls.push({
          provider: row.id,
          requestId,
          assistantMessageId,
          model: String(payload?.model ?? ''),
          prompt,
        })
        if (prompt.includes('abort')) {
          setTimeout(() => {
            event.sender.send(`${row.channel}:chunk:${requestId}`, {
              type: 'event',
              event: {
                type: 'message.text_delta',
                messageId: assistantMessageId,
                choiceIndex: 0,
                text: `${row.id} abort-start `,
              },
            })
          }, 50)
          return { ok: true }
        }
        setTimeout(() => {
          event.sender.send(`${row.channel}:chunk:${requestId}`, {
            type: 'event',
            event: {
              type: 'message.text_delta',
              messageId: assistantMessageId,
              choiceIndex: 0,
              text: row.expectedText,
            },
          })
          event.sender.send(`${row.channel}:chunk:${requestId}`, { type: 'event', event: { type: 'stream.done' } })
          event.sender.send(`${row.channel}:end:${requestId}`)
        }, 50)
        return { ok: true }
      })

      ipcMain.removeHandler(`${row.channel}:abort`)
      ipcMain.handle(`${row.channel}:abort`, async (event, requestIdInput) => {
        const requestId = String(requestIdInput ?? '')
        state.aborts.push({ provider: row.id, requestId })
        event.sender.send(`${row.channel}:chunk:${requestId}`, {
          type: 'event',
          event: {
            type: 'stream.abort',
            reason: 'user_abort',
            error: {
              phase: 'abort',
              provider: row.id,
              category: 'aborted',
              code: 'aborted',
              message: `${row.label} smoke aborted.`,
            },
          },
        })
        event.sender.send(`${row.channel}:end:${requestId}`)
        return { ok: true }
      })
    }
    globalThis.__starverseProviderSmokeIpc = state
  })
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

async function enableExperimentalProvider(page, row, localMock) {
  await openConsole(page)
  await page.waitForSelector(`[data-testid="${row.controlsTestId}"]`, { timeout: 30000 })
  await page.locator(`[data-testid="${row.controlsTestId}"]`).scrollIntoViewIfNeeded()
  const checkbox = page.locator(`[data-testid="${row.enabledTestId}"]`)
  if (!(await checkbox.isChecked())) await setCheckboxByTestId(page, row.enabledTestId, true)
  if (row.urlTestId) {
    await page.fill(`[data-testid="${row.urlTestId}"]`, `${localMock.baseUrl}/v1`)
  }
  await page.fill(`[data-testid="${row.modelTestId}"]`, row.mockModelId)
  await waitForPageCondition(page,
    ({ statusTestId, modelId }) => {
      const status = document.querySelector(`[data-testid="${statusTestId}"]`)?.textContent ?? ''
      return status.includes('active') && status.includes(modelId)
    },
    { statusTestId: row.statusTestId, modelId: row.mockModelId },
    10000,
  )
  await closeRightRailIfOpen(page)
}

async function clearExperimentalProvider(page, row) {
  await openConsole(page)
  await page.waitForSelector(`[data-testid="${row.controlsTestId}"]`, { timeout: 30000 })
  await page.locator(`[data-testid="${row.controlsTestId}"]`).scrollIntoViewIfNeeded()
  await page.locator(`[data-testid="${row.clearTestId}"]`).click({ force: true })
  await waitForPageCondition(page,
    ({ statusTestId }) => {
      const status = document.querySelector(`[data-testid="${statusTestId}"]`)?.textContent ?? ''
      return status.includes('inactive') && status.includes('none')
    },
    { statusTestId: row.statusTestId },
    10000,
  )
  await closeRightRailIfOpen(page)
}

async function sendPromptAndWait(page, prompt, expectedText) {
  await closeRightRailIfOpen(page)
  await page.waitForSelector('[data-testid="composer-draft"]', { timeout: 30000 })
  const previousCount = await page.evaluate(
    (text) => document.body.innerText.split(text).length - 1,
    expectedText,
  )
  await page.fill('[data-testid="composer-draft"]', prompt)
  await page.waitForSelector('[data-testid="composer-send"], [data-testid="composer-stop"]', { timeout: 30000 })
  if (!(await page.locator('[data-testid="composer-send"]').count())) {
    throw new Error(`composer send is unavailable: ${JSON.stringify(await summarizeUiSmokeState(page))}`)
  }
  await page.click('[data-testid="composer-send"]')
  await waitForPageCondition(page,
    ({ text, count }) => document.body.innerText.split(text).length - 1 > count,
    { text: expectedText, count: previousCount },
    60000,
  )
}

async function waitForMainProcessProviderAbort(electronApp, providerId) {
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    const state = await electronApp.evaluate(() => globalThis.__starverseProviderSmokeIpc ?? {})
    if (Array.isArray(state?.aborts) && state.aborts.some((entry) => entry.provider === providerId)) return
    await sleep(100)
  }
  throw new Error(`${providerId} main-process provider mock did not observe abort`)
}

async function sendAbortAndWait(page, row, localMock, openRouterMock, electronApp) {
  await closeRightRailIfOpen(page)
  await page.fill('[data-testid="composer-draft"]', `abort smoke for ${row.id}`)
  await page.click('[data-testid="composer-send"]')
  await waitForPageCondition(page,
    ({ marker }) => document.body.innerText.includes(marker),
    { marker: `${row.id} abort-start`.replace('local-endpoint', 'local-endpoint') },
    30000,
  )
  await page.waitForSelector('[data-testid="composer-stop"]', { timeout: 10000 })
  await page.click('[data-testid="composer-stop"]')
  if (row.id === 'openrouter') {
    const deadline = Date.now() + 5000
    while (!openRouterMock.state.abortObserved && Date.now() < deadline) await sleep(100)
    if (!openRouterMock.state.abortObserved) throw new Error('OpenRouter mock did not observe abort')
    return
  }
  if (row.id === 'local-endpoint') {
    const deadline = Date.now() + 5000
    while (!localMock.state.abortObserved && Date.now() < deadline) await sleep(100)
    if (!localMock.state.abortObserved) throw new Error('LocalEndpoint mock did not observe abort')
    return
  }
  await waitForMainProcessProviderAbort(electronApp, row.id)
}

async function assertNoSecretExposure(page, mainMockState = null) {
  const rendererResult = await page.evaluate((patterns) => {
    const text = document.body.innerText
    const values = [text]
    const matches = []
    for (const pattern of patterns) {
      const regex = new RegExp(pattern.source, pattern.flags)
      if (values.some((value) => regex.test(value))) matches.push(String(pattern.source))
    }
    return {
      ok: matches.length === 0,
      matches,
    }
  }, secretLeakPatterns.map((pattern) => ({ source: pattern.source, flags: pattern.flags })))
  const mainState = JSON.stringify(mainMockState ?? {})
  const mainMatches = secretLeakPatterns
    .filter((pattern) => pattern.test(mainState))
    .map((pattern) => pattern.source)
  if (!rendererResult.ok || mainMatches.length > 0) {
    throw new Error(`provider smoke output leaked a secret-like marker: ${[...rendererResult.matches, ...mainMatches].join(', ')}`)
  }
}

async function assertExperimentalModelsNotInMainPicker(page) {
  await closeRightRailIfOpen(page)
  await page.click('[data-testid="current-model-pill"]')
  await page.waitForSelector('[data-testid="model-picker-dialog"]', { timeout: 30000 })
  for (const row of providerCases.filter((item) => item.experimental)) {
    const count = await page.locator(`[data-testid="model-picker-item-${row.mockModelId}"]`).count()
    if (count !== 0) throw new Error(`${row.id} smoke model appeared in the main model picker`)
  }
  await page.click('[data-testid="model-picker-close"]').catch(() => undefined)
  await page.waitForSelector('[data-testid="model-picker-dialog"]', { state: 'detached', timeout: 10000 }).catch(() => undefined)
}

async function assertOpenRouterDefaultState(page) {
  const state = await page.evaluate(() => ({
    local: window.localStorage.getItem('starverse.localEndpointTextChat.enabled'),
    openai: window.localStorage.getItem('starverse.openAIResponsesTextChat.enabled'),
    google: window.localStorage.getItem('starverse.googleAIStudioTextChat.enabled'),
    anthropic: window.localStorage.getItem('starverse.anthropicMessagesTextChat.enabled'),
    deepseek: window.localStorage.getItem('starverse.deepSeekTextChat.enabled'),
  }))
  const enabled = Object.entries(state).filter(([, value]) => value === '1')
  if (enabled.length > 0) throw new Error(`experimental provider remained enabled: ${JSON.stringify(state)}`)
}

async function runUiSmoke(input) {
  section('Starverse Electron provider text-chat smoke matrix')
  if (input.buildElectron) await maybeBuildElectronArtifacts()

  const localMock = await startLocalEndpointMock()
  const openRouterMock = await startOpenRouterMock()
  const userDataDir = path.join(os.tmpdir(), `starverse-provider-text-chat-smoke-${process.pid}`)
  const summaryPath = path.join(artifactRoot, 'provider-text-chat-smoke-summary.json')
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
  let currentStep = 'initializing'
  try {
    currentStep = 'wait for Vite'
    await waitForHttp(viteUrl, 30000)
    const { _electron: electron } = await import('playwright')
    const electronExecutable = require('electron')

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
    currentStep = 'install provider IPC mocks'
    await installMainProcessProviderIpcMocks(electronApp)
    currentStep = 'configure OpenRouter loopback credential'
    await configureOpenRouterLoopbackCredential(page, openRouterMock)

    const results = []

    currentStep = 'assert default OpenRouter state'
    await assertOpenRouterDefaultState(page)
    const openRouter = providerCases.find((row) => row.id === 'openrouter')
    currentStep = 'send OpenRouter default prompt'
    await sendPromptAndWait(page, 'Please run the OpenRouter default smoke response.', openRouter.expectedText)
    currentStep = 'abort OpenRouter default prompt'
    await sendAbortAndWait(page, openRouter, localMock, openRouterMock, electronApp)
    results.push({ provider: openRouter.id, mode: 'loopback mock endpoint through real OpenRouter IPC', ok: true })

    for (const row of providerCases.filter((item) => item.experimental)) {
      currentStep = `enable ${row.id}`
      await enableExperimentalProvider(page, row, localMock)
      currentStep = `send ${row.id} prompt`
      await sendPromptAndWait(page, `Please run the ${row.label} smoke response.`, row.expectedText)
      currentStep = `abort ${row.id} prompt`
      await sendAbortAndWait(page, row, localMock, openRouterMock, electronApp)
      currentStep = `clear ${row.id}`
      await clearExperimentalProvider(page, row)
      currentStep = `assert OpenRouter default after ${row.id}`
      await assertOpenRouterDefaultState(page)
      results.push({
        provider: row.id,
        mode: row.id === 'local-endpoint' ? 'loopback mock endpoint through real LocalEndpoint IPC' : 'mocked provider-specific renderer bridge',
        ok: true,
      })
    }

    currentStep = 'send final OpenRouter prompt'
    await sendPromptAndWait(page, 'Please run the final OpenRouter default smoke response.', openRouter.expectedText)
    currentStep = 'assert experimental models not in main picker'
    await assertExperimentalModelsNotInMainPicker(page)
    currentStep = 'assert no secret exposure'
    const mainMockState = await electronApp.evaluate(() => globalThis.__starverseProviderSmokeIpc ?? {})
    await assertNoSecretExposure(page, mainMockState)
    if (localMock.state.authHeaderSeen) throw new Error('LocalEndpoint smoke mock observed a secret header')

    const summary = {
      ok: true,
      providers: results,
      localEndpoint: {
        endpoint: `${localMock.baseUrl}/v1`,
        modelId: localMock.modelId,
        requestCount: localMock.state.requestCount,
        authHeaderSeen: localMock.state.authHeaderSeen,
        abortObserved: localMock.state.abortObserved,
      },
      openRouter: {
        endpoint: `${openRouterMock.baseUrl}/v1`,
        requestCount: openRouterMock.state.requestCount,
        authHeaderSeen: openRouterMock.state.authHeaderSeen,
        abortObserved: openRouterMock.state.abortObserved,
      },
      providerIpcMockCallCount: Array.isArray(mainMockState.calls) ? mainMockState.calls.length : 0,
      providerIpcMockAbortCount: Array.isArray(mainMockState.aborts) ? mainMockState.aborts.length : 0,
      openRouterDefaultAfterClear: true,
      experimentalModelsInMainPicker: false,
      artifact: path.relative(repoRoot, summaryPath).replace(/\\/g, '/'),
    }
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf8')
    console.log(JSON.stringify(summary, null, 2))
    return summary
  } catch (error) {
    const failure = {
      ok: false,
      error: safeError(error),
      currentStep,
      viteOutputTail: viteOutput.slice(-2000),
      uiState: page ? await summarizeUiSmokeState(page).catch(() => null) : null,
      providerIpcMockState: electronApp
        ? await electronApp.evaluate(() => globalThis.__starverseProviderSmokeIpc ?? null).catch(() => null)
        : null,
    }
    await fs.writeFile(summaryPath, JSON.stringify(failure, null, 2), 'utf8').catch(() => undefined)
    throw error
  } finally {
    if (electronApp) await electronApp.close().catch(() => undefined)
    await closeProcessTree(vite)
    await localMock.close()
    await openRouterMock.close()
    await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.ui) {
    section('Provider text-chat smoke matrix')
    console.log(JSON.stringify({
      ok: true,
      ui: false,
      message: 'Use --ui --build-electron to launch the real Electron provider text-chat smoke matrix.',
      providers: providerCases.map((row) => row.id),
      realApiCalls: false,
      secretsRequired: false,
    }, null, 2))
    return
  }

  const result = await runUiSmoke({ buildElectron: args.buildElectron })
  section('Provider text-chat smoke summary')
  console.log(JSON.stringify(result, null, 2))
  console.log('\nPASS: provider text-chat smoke matrix completed')
}

main().catch((error) => {
  process.stderr.write(`\nFAIL: ${safeError(error)}\n`)
  process.exit(1)
})
