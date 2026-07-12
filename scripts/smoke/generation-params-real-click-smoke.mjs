import { execFileSync, spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..', '..')
const mainPath = path.join(repoRoot, 'dist-electron', 'main.js')
const defaultViteUrl = process.env.SV_GENERATION_PARAMS_SMOKE_VITE_URL ?? 'http://127.0.0.1:5173/'
const spawnedVitePort = Number.parseInt(process.env.SV_GENERATION_PARAMS_SMOKE_UI_PORT ?? '5187', 10)
const spawnedViteUrl = `http://127.0.0.1:${spawnedVitePort}/`
const artifactRoot = process.env.SV_GENERATION_PARAMS_SMOKE_ARTIFACT_DIR
  ? path.resolve(process.env.SV_GENERATION_PARAMS_SMOKE_ARTIFACT_DIR)
  : path.join(os.tmpdir(), 'starverse-generation-params-real-click-smoke')

const providerDescriptors = {
  openrouter: {
    bridgeName: 'openRouterCredential',
    displayName: 'OpenRouter',
  },
  openai_responses: {
    bridgeName: 'openAIResponsesCredential',
    displayName: 'OpenAI Responses',
  },
  google_ai_studio: {
    bridgeName: 'googleAIStudioCredential',
    displayName: 'Google AI Studio',
  },
  anthropic_messages: {
    bridgeName: 'anthropicCredential',
    displayName: 'Anthropic Messages',
  },
  deepseek: {
    bridgeName: 'deepSeekCredential',
    displayName: 'DeepSeek',
  },
}

const secretLeakPatterns = [
  /sk-[A-Za-z0-9_-]{8,}/gi,
  /Bearer\s+\S+/gi,
  /Authorization\s*:\s*[^\r\n]+/gi,
  /x-api-key\s*:\s*[^\r\n]+/gi,
  /api-key\s*:\s*[^\r\n]+/gi,
  /AIza[0-9A-Za-z_-]{20,}/gi,
]

function usage() {
  return `
Generation params real-click smoke.

This script intentionally uses the main Electron userData profile when
--use-main-user-data is supplied. Close any manually running Starverse Electron
window before running it, otherwise two app instances may write the same DB.

Examples:
  node scripts/smoke/generation-params-real-click-smoke.mjs --use-main-user-data --provider google_ai_studio --model gemini-2.5-flash-lite --param temperature=0.2
  node scripts/smoke/generation-params-real-click-smoke.mjs --use-main-user-data --provider openai_responses --model gpt-4.1-mini --preset reset

Required:
  --use-main-user-data
  --provider <openrouter|openai_responses|google_ai_studio|anthropic_messages|deepseek>
  --model <model-id>

Options:
  --param key=value        Set a generation parameter to custom value. Repeatable.
  --omit key              Set a generation parameter to omit. Repeatable.
  --preset reset          Click the generation params reset button before applying params.
  --prompt <text>         Prompt to send. Defaults to a short ok prompt.
  --credential-check-only Stop after main-userData credential status check.
  --vite-url <url>        Reuse an already running Vite server. Defaults to ${defaultViteUrl}
  --build-electron        Build worker/main/preload artifacts first.
  --timeout-ms <number>   Overall interaction timeout. Defaults to 180000.
`.trim()
}

function parseArgs(argv) {
  const args = {
    useMainUserData: false,
    provider: '',
    model: '',
    params: [],
    omits: [],
    preset: '',
    prompt: '请只回复 ok。',
    credentialCheckOnly: false,
    viteUrl: defaultViteUrl,
    buildElectron: false,
    timeoutMs: 180_000,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      args.help = true
      continue
    }
    if (arg === '--use-main-user-data') {
      args.useMainUserData = true
      continue
    }
    if (arg === '--build-electron') {
      args.buildElectron = true
      continue
    }
    if (arg === '--credential-check-only') {
      args.credentialCheckOnly = true
      continue
    }
    if (arg === '--provider') {
      args.provider = String(argv[++index] ?? '').trim()
      continue
    }
    if (arg === '--model') {
      args.model = String(argv[++index] ?? '').trim()
      continue
    }
    if (arg === '--param') {
      args.params.push(String(argv[++index] ?? '').trim())
      continue
    }
    if (arg === '--omit') {
      args.omits.push(String(argv[++index] ?? '').trim())
      continue
    }
    if (arg === '--preset') {
      args.preset = String(argv[++index] ?? '').trim()
      continue
    }
    if (arg === '--prompt') {
      args.prompt = String(argv[++index] ?? '')
      continue
    }
    if (arg === '--vite-url') {
      args.viteUrl = ensureTrailingSlash(String(argv[++index] ?? '').trim())
      continue
    }
    if (arg === '--timeout-ms') {
      args.timeoutMs = Number.parseInt(String(argv[++index] ?? ''), 10)
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  return args
}

function ensureTrailingSlash(value) {
  if (!value) return value
  return value.endsWith('/') ? value : `${value}/`
}

function redact(value) {
  if (typeof value !== 'string') return value
  let output = value
  for (const pattern of secretLeakPatterns) {
    output = output.replace(pattern, '<redacted-secret>')
  }
  return output
    .replace(/\/\/([^/@\s]+)@/g, '//<userinfo-redacted>@')
    .replace(/[?&](?:token|api_key|key|secret|password)=[^&\s]+/gi, '?<query-redacted>')
}

function sanitizeForSummary(value) {
  if (typeof value === 'string') return redact(value)
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((item) => sanitizeForSummary(item))
  const out = {}
  for (const [key, raw] of Object.entries(value)) {
    if (/api[-_]?key|authorization|bearer|secret|password|credential/i.test(key)
      || (/(^|[-_])token($|[-_])/i.test(key) && !/max.*token|token.*limit/i.test(key))) {
      out[key] = '<redacted-secret>'
      continue
    }
    out[key] = sanitizeForSummary(raw)
  }
  return out
}

function safeError(error) {
  return redact(error instanceof Error ? error.message : String(error))
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function cssString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function testIdSelector(testId) {
  return `[data-testid="${cssString(testId)}"]`
}

function modelPickerItemTestId(provider, model) {
  return provider === 'openrouter'
    ? `model-picker-item-${model}`
    : `model-picker-item-${provider}-${model}`
}

function parseParam(raw) {
  const delimiter = raw.indexOf('=')
  if (delimiter <= 0) throw new Error(`Invalid --param value: ${raw}`)
  const key = raw.slice(0, delimiter).trim()
  const value = raw.slice(delimiter + 1).trim()
  if (!key) throw new Error(`Invalid --param key: ${raw}`)
  return { key, value }
}

function normalizeInput(input) {
  if (input.help) return input
  if (!input.useMainUserData) {
    throw new Error('--use-main-user-data is required for this real-click smoke.')
  }
  if (!providerDescriptors[input.provider]) {
    throw new Error(`Unsupported provider: ${input.provider || '<missing>'}`)
  }
  if (!input.model) throw new Error('--model is required.')
  if (!Number.isFinite(input.timeoutMs) || input.timeoutMs < 30_000) input.timeoutMs = 180_000
  input.params = input.params.map(parseParam)
  input.omits = input.omits.map((key) => String(key ?? '').trim()).filter(Boolean)
  return input
}

function maybeBuildElectronArtifacts() {
  if (process.platform === 'win32') {
    execFileSync('cmd.exe', ['/d', '/s', '/c', 'node scripts/build-db-worker.cjs'], { cwd: repoRoot, stdio: 'inherit' })
    execFileSync('cmd.exe', ['/d', '/s', '/c', 'npx vite build --mode development --config vite.config.ts'], { cwd: repoRoot, stdio: 'inherit' })
    return
  }
  execFileSync('node', ['scripts/build-db-worker.cjs'], { cwd: repoRoot, stdio: 'inherit' })
  execFileSync('npx', ['vite', 'build', '--mode', 'development', '--config', 'vite.config.ts'], { cwd: repoRoot, stdio: 'inherit' })
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let lastError = null
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { cache: 'no-store' })
      if (response.ok) return true
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await sleep(250)
  }
  throw new Error(`Renderer server did not become ready at ${url}: ${safeError(lastError ?? 'timeout')}`)
}

function spawnVite(url) {
  const parsed = new URL(url)
  const command = [
    'npx',
    'vite',
    '--host',
    parsed.hostname,
    '--port',
    String(parsed.port || spawnedVitePort),
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

async function ensureViteServer(preferredUrl) {
  try {
    await waitForHttp(preferredUrl, 2000)
    return { url: preferredUrl, process: null, reused: true }
  } catch {
    const vite = spawnVite(spawnedViteUrl)
    let output = ''
    vite.stdout.on('data', (chunk) => {
      output += chunk.toString()
    })
    vite.stderr.on('data', (chunk) => {
      output += chunk.toString()
    })
    try {
      await waitForHttp(spawnedViteUrl, 30_000)
      return { url: spawnedViteUrl, process: vite, reused: false, getOutput: () => redact(output.slice(-2000)) }
    } catch (error) {
      await closeProcessTree(vite)
      throw new Error(`${safeError(error)}\nVite output tail:\n${redact(output.slice(-2000))}`)
    }
  }
}

async function waitForAppWindow(electronApp, viteUrl, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    for (const page of electronApp.windows()) {
      if (page.url().startsWith(viteUrl)) return page
      try {
        if (await page.evaluate(() => Boolean(document.querySelector('#app')))) return page
      } catch {
        // Keep polling.
      }
    }
    try {
      const page = await electronApp.waitForEvent('window', { timeout: 1000 })
      if (page.url().startsWith(viteUrl)) return page
    } catch {
      // Keep polling.
    }
  }
  throw new Error('Electron app window did not become ready.')
}

async function waitForPageCondition(page, predicate, arg, timeoutMs) {
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
  throw new Error(`Timed out waiting for page condition: ${safeError(lastError ?? 'condition not met')}`)
}

async function readCredentialStatus(page, provider) {
  const descriptor = providerDescriptors[provider]
  return await page.evaluate(async ({ bridgeName }) => {
    const bridge = window[bridgeName]
    if (!bridge || typeof bridge.getStatus !== 'function') {
      return { bridgeAvailable: false, apiKeyConfigured: false }
    }
    const result = await bridge.getStatus()
    const status = result?.status ?? result
    return {
      bridgeAvailable: true,
      apiKeyConfigured: status?.apiKeyConfigured === true,
      source: typeof status?.source === 'string' ? status.source : undefined,
      storageBackend: typeof status?.storageBackend === 'string'
        ? status.storageBackend
        : typeof status?.backend === 'string'
          ? status.backend
          : undefined,
      warnings: Array.isArray(status?.warnings) ? status.warnings.map(String) : [],
    }
  }, { bridgeName: descriptor.bridgeName })
}

async function readAllCredentialStatuses(page) {
  const result = {}
  for (const provider of Object.keys(providerDescriptors)) {
    result[provider] = await readCredentialStatus(page, provider)
  }
  return result
}

async function ensureProviderCredential(page, provider) {
  const status = await readCredentialStatus(page, provider)
  if (!status.bridgeAvailable) {
    throw new Error(`credential_bridge_unavailable:${provider}`)
  }
  if (!status.apiKeyConfigured) {
    throw new Error(`credential_missing:${provider}`)
  }
  return status
}

async function setCheckboxChecked(page, selector, checked) {
  await page.evaluate(({ selector: rawSelector, checked: nextChecked }) => {
    const input = document.querySelector(rawSelector)
    if (!(input instanceof HTMLInputElement)) throw new Error(`Missing checkbox ${rawSelector}`)
    if (input.checked === nextChecked) return
    input.checked = nextChecked
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }, { selector, checked })
}

async function selectModel(page, provider, model) {
  await page.click(testIdSelector('current-model-pill'))
  await page.waitForSelector(testIdSelector('model-picker-dialog'), { timeout: 30_000 })

  const providerFilter = page.locator(testIdSelector(`model-picker-provider-filter-${provider}`))
  if (await providerFilter.count()) {
    await setCheckboxChecked(page, testIdSelector(`model-picker-provider-filter-${provider}`), true)
  }

  const search = page.locator(testIdSelector('model-picker-search'))
  if (await search.count()) {
    await search.fill(model)
  }

  const itemSelector = testIdSelector(modelPickerItemTestId(provider, model))
  const item = page.locator(itemSelector).first()
  try {
    await item.waitFor({ state: 'visible', timeout: 20_000 })
  } catch {
    const state = await summarizeModelPickerState(page, provider, model)
    throw new Error(`model_picker_item_missing:${provider}:${model}:${JSON.stringify(state)}`)
  }

  await item.click()
  await page.waitForSelector(testIdSelector('model-picker-dialog'), { state: 'detached', timeout: 10_000 }).catch(() => undefined)
}

async function summarizeModelPickerState(page, provider, model) {
  return await page.evaluate(({ provider, model }) => ({
    provider,
    model,
    searchValue: document.querySelector('[data-testid="model-picker-search"]')?.value ?? '',
    providerChecked: document.querySelector(`[data-testid="model-picker-provider-filter-${provider}"]`)?.checked ?? null,
    providerStatus: document.querySelector(`[data-testid="model-picker-provider-status-${provider}"]`)?.textContent?.trim() ?? '',
    resultText: document.querySelector('[data-testid="model-picker-list"]')?.textContent?.trim().slice(0, 1000) ?? '',
  }), { provider, model })
}

async function openConsole(page) {
  if (await page.locator(testIdSelector('chat-session-console-scroll')).count()) return
  await page.getByRole('button', { name: /控制台|Console/i }).click()
  await page.waitForSelector(testIdSelector('chat-session-console-scroll'), { timeout: 20_000 })
}

async function findGenerationParamsEditor(page, keys) {
  const editors = page.locator(testIdSelector('generation-params-editor'))
  const count = await editors.count()
  const key = keys.find(Boolean) ?? ''
  for (let index = 0; index < count; index += 1) {
    const editor = editors.nth(index)
    if (!(await editor.isVisible().catch(() => false))) continue
    if (!key) return editor
    const mode = editor.locator(testIdSelector(`generation-param-mode-${key}`)).first()
    const advancedToggle = editor.locator(testIdSelector('generation-params-advanced-toggle')).first()
    if (!(await mode.count())) {
      if (await advancedToggle.isVisible().catch(() => false)) return editor
      continue
    }
    const disabled = await mode.evaluate((element) => {
      return element instanceof HTMLSelectElement ? element.disabled : true
    }).catch(() => true)
    if (!disabled) return editor
    if (await advancedToggle.isVisible().catch(() => false)) return editor
  }
  throw new Error('No editable generation params editor is visible.')
}

async function ensureParamVisible(editor, key) {
  const selector = testIdSelector(`generation-param-mode-${key}`)
  const locator = editor.locator(selector).first()
  if (await locator.isVisible().catch(() => false)) return

  const advancedToggle = editor.locator(testIdSelector('generation-params-advanced-toggle')).first()
  if (await advancedToggle.isVisible().catch(() => false)) {
    await advancedToggle.click()
  }

  await locator.waitFor({ state: 'visible', timeout: 10_000 })
}

async function applyGenerationParams(page, input) {
  await openConsole(page)
  const editor = await findGenerationParamsEditor(page, [
    ...input.params.map((param) => param.key),
    ...input.omits,
  ])
  await editor.waitFor({ state: 'visible', timeout: 20_000 })
  await editor.scrollIntoViewIfNeeded()

  if (input.preset === 'reset') {
    const reset = editor.locator(testIdSelector('generation-params-reset')).first()
    if (await reset.count()) await reset.click()
    await sleep(2_000)
  }

  for (const key of input.omits) {
    await ensureParamVisible(editor, key)
    await setParamMode(editor, key, 'omit')
  }
  for (const param of input.params) {
    await ensureParamVisible(editor, param.key)
    await setParamMode(editor, param.key, 'custom')
    await setParamValue(editor, param.key, param.value)
  }
  return await readGenerationParamsEditorState(editor, [
    ...input.params.map((param) => param.key),
    ...input.omits,
  ])
}

async function readGenerationParamsEditorState(editor, keys) {
  const result = {}
  for (const key of keys) {
    const mode = editor.locator(testIdSelector(`generation-param-mode-${key}`)).first()
    const value = editor.locator(testIdSelector(`generation-param-value-${key}`)).first()
    result[key] = {
      mode: await mode.evaluate((element) => (
        element instanceof HTMLSelectElement ? element.value : ''
      )).catch(() => ''),
      value: await value.evaluate((element) => (
        element instanceof HTMLInputElement || element instanceof HTMLSelectElement ? element.value : ''
      )).catch(() => ''),
      valueDisabled: await value.evaluate((element) => (
        element instanceof HTMLInputElement || element instanceof HTMLSelectElement ? element.disabled : true
      )).catch(() => true),
    }
  }
  return result
}

async function setParamMode(editor, key, mode) {
  const selector = testIdSelector(`generation-param-mode-${key}`)
  const locator = editor.locator(selector).first()
  await locator.waitFor({ state: 'visible', timeout: 10_000 })
  await locator.selectOption(mode)
  await locator.evaluate((element, nextMode) => {
    if (!(element instanceof HTMLSelectElement)) return
    element.value = String(nextMode)
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
  }, mode)
  await waitForSelectValue(locator, mode, 30_000)
}

async function waitForSelectValue(locator, expected, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const value = await locator.evaluate((element) => (
        element instanceof HTMLSelectElement ? element.value : ''
      ))
      if (value === expected) return
    } catch {
      // The editor may re-render after mode changes; retry against the locator.
    }
    await sleep(100)
  }
  throw new Error(`Timed out waiting for generation param mode ${expected}.`)
}

async function waitForEditable(locator, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let lastDisabled = true
  while (Date.now() < deadline) {
    try {
      lastDisabled = await locator.evaluate((element) => {
        if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement) {
          return element.disabled
        }
        return false
      })
      if (!lastDisabled) return
    } catch {
      // The editor may re-render after mode changes; retry against the locator.
    }
    await sleep(100)
  }
  throw new Error(`Timed out waiting for generation param input to become editable.`)
}

async function setParamValue(editor, key, value) {
  const selector = testIdSelector(`generation-param-value-${key}`)
  const locator = editor.locator(selector).first()
  await locator.waitFor({ state: 'visible', timeout: 10_000 })
  await waitForEditable(locator, 30_000)
  const tagName = await locator.evaluate((element) => element.tagName.toLowerCase())
  if (tagName === 'select') {
    await locator.selectOption(value)
    await waitForInputValue(locator, value, 30_000)
    return
  }
  await locator.fill(value)
  await locator.press('Enter')
  await locator.blur()
  await waitForInputValue(locator, value, 30_000)
}

async function waitForInputValue(locator, expected, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const value = await locator.evaluate((element) => {
        if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement) return element.value
        return ''
      })
      if (value === String(expected)) return
    } catch {
      // The editor may re-render after value commits; retry against the locator.
    }
    await sleep(100)
  }
  throw new Error(`Timed out waiting for generation param value ${expected}.`)
}

async function closeFloatingRightRailIfOpen(page) {
  const closeHandle = page.locator(testIdSelector('right-rail-floating-close-handle')).first()
  if (!(await closeHandle.isVisible().catch(() => false))) return
  await closeHandle.click()
  await page.locator(testIdSelector('right-rail-floating-backdrop')).waitFor({ state: 'detached', timeout: 10_000 }).catch(async () => {
    await page.locator(testIdSelector('right-rail-floating-backdrop')).waitFor({ state: 'hidden', timeout: 10_000 })
  })
}

async function sendPromptAndWait(page, prompt, timeoutMs) {
  await closeFloatingRightRailIfOpen(page)
  await page.waitForSelector(testIdSelector('composer-draft'), { timeout: 30_000 })
  const before = await page.evaluate(() => document.querySelectorAll('[data-testid^="msg-wrap-"]').length)
  await page.fill(testIdSelector('composer-draft'), prompt)
  await waitForPageCondition(page, () => {
    const button = document.querySelector('[data-testid="composer-send"]')
    return button instanceof HTMLButtonElement && !button.disabled
  }, null, 30_000)
  await page.click(testIdSelector('composer-send'))
  await sleep(1500)
  await waitForPageCondition(page, ({ beforeCount }) => {
    const stopVisible = Boolean(document.querySelector('[data-testid="composer-stop"]'))
    const wraps = Array.from(document.querySelectorAll('[data-testid^="msg-wrap-"]'))
    const count = wraps.length
    const newText = wraps.slice(beforeCount).map((node) => node.textContent ?? '').join('\n')
    const bodyText = document.body.innerText
    const hasNewError = /\bERROR\b|阶段：|phase:|code:/.test(newText)
    const stillRunning = /Running\s*·|正在生成|Status\s*·\s*(requesting|streaming|running)/i.test(bodyText)
    return !stopVisible && !stillRunning && (count > beforeCount || hasNewError)
  }, { beforeCount: before }, timeoutMs)
  return await page.evaluate(({ beforeCount }) => {
    const wraps = Array.from(document.querySelectorAll('[data-testid^="msg-wrap-"]'))
    const newText = wraps.slice(beforeCount).map((node) => node.textContent ?? '').join('\n').trim()
    return {
      beforeMessageCount: beforeCount,
      afterMessageCount: wraps.length,
      newMessageTextTail: newText.slice(-2000),
      hasNewError: /\bERROR\b|阶段：|phase:|code:/.test(newText),
    }
  }, { beforeCount: before })
}

async function summarizePage(page, provider, model) {
  return await page.evaluate(({ provider, model }) => {
    const bodyText = document.body.innerText.trim()
    const modes = {}
    const values = {}
    for (const mode of document.querySelectorAll('[data-testid^="generation-param-mode-"]')) {
      const key = mode.getAttribute('data-testid')?.replace('generation-param-mode-', '') ?? ''
      modes[key] = mode.value
    }
    for (const value of document.querySelectorAll('[data-testid^="generation-param-value-"]')) {
      const key = value.getAttribute('data-testid')?.replace('generation-param-value-', '') ?? ''
      values[key] = value.value
    }
    return {
      provider,
      model,
      url: window.location.href,
      modelPill: document.querySelector('[data-testid="current-model-pill"]')?.textContent?.trim() ?? '',
      messageCount: document.querySelectorAll('[data-testid^="msg-wrap-"]').length,
      generationParamModes: modes,
      generationParamValues: values,
      textTail: bodyText.slice(-3000),
      hasErrorLikeText: /\bERROR\b|阶段：|phase:|code:/.test(bodyText),
    }
  }, { provider, model })
}

async function run(input) {
  await fs.mkdir(artifactRoot, { recursive: true })
  const summaryPath = path.join(artifactRoot, `generation-params-real-click-${Date.now()}.json`)
  const consoleMessages = []
  const generationParamsTraces = []
  let vite = null
  let electronApp = null
  let page = null
  let currentStep = 'initializing'
  let mainUserDataPath = null
  let credentialStatuses = null
  let appliedGenerationParams = null
  let sendResult = null
  const startedAt = new Date().toISOString()

  try {
    if (input.buildElectron) {
      currentStep = 'build Electron artifacts'
      maybeBuildElectronArtifacts()
    }
    currentStep = 'ensure Vite server'
    const viteState = await ensureViteServer(input.viteUrl)
    vite = viteState.process

    currentStep = 'launch Electron with main userData'
    const { _electron: electron } = await import('playwright')
    const electronExecutable = require('electron')
    electronApp = await electron.launch({
      executablePath: electronExecutable,
      args: ['.'],
      cwd: repoRoot,
      env: {
        ...process.env,
        NODE_ENV: 'development',
        VITE_DEV_SERVER_URL: viteState.url,
        FORCE_COLOR: '0',
      },
      timeout: 60_000,
    })
    mainUserDataPath = await electronApp.evaluate(({ app }) => app.getPath('userData'))

    currentStep = 'wait for app window'
    page = await waitForAppWindow(electronApp, viteState.url, 60_000)
    page.on('console', (message) => {
      consoleMessages.push({
        type: message.type(),
        text: redact(message.text()).slice(0, 1000),
      })
      if (consoleMessages.length > 100) consoleMessages.shift()
      if (message.text().includes('[generation-params-smoke-trace]')) {
        void (async () => {
          try {
            const args = message.args()
            const payload = args.length >= 2 ? await args[1].jsonValue() : { text: message.text() }
            generationParamsTraces.push(sanitizeForSummary(payload))
          } catch {
            generationParamsTraces.push({ text: redact(message.text()).slice(0, 2000) })
          }
        })()
      }
    })
    await page.waitForSelector(testIdSelector('composer-draft'), { timeout: 120_000 })
    await page.evaluate(() => {
      window.localStorage?.setItem('starverse.generationParamsSmokeTrace', '1')
    })

    currentStep = 'check provider credential status'
    credentialStatuses = await readAllCredentialStatuses(page)
    if (input.credentialCheckOnly) {
      const credentialStatus = credentialStatuses[input.provider] ?? null
      const summary = {
        ok: credentialStatus?.bridgeAvailable === true,
        mode: 'credential_check_only',
        startedAt,
        endedAt: new Date().toISOString(),
        currentStep,
        usedMainUserData: true,
        mainUserDataPath,
        provider: input.provider,
        providerDisplayName: providerDescriptors[input.provider].displayName,
        model: input.model,
        credentialStatus,
        credentialStatuses,
        generationParamsTraces,
        vite: { url: viteState.url, reused: viteState.reused },
        consoleMessages,
      }
      await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf8')
      console.log(JSON.stringify(summary, null, 2))
      console.log(`PASS: generation params real-click credential check completed. summary=${summaryPath}`)
      return 0
    }

    const credentialStatus = await ensureProviderCredential(page, input.provider)

    currentStep = 'select model'
    await selectModel(page, input.provider, input.model)

    currentStep = 'apply generation params'
    appliedGenerationParams = await applyGenerationParams(page, input)

    currentStep = 'send prompt'
    sendResult = await sendPromptAndWait(page, input.prompt, input.timeoutMs)
    if (sendResult?.hasNewError) {
      throw new Error(`provider_request_failed:${input.provider}:${sendResult.newMessageTextTail}`)
    }

    currentStep = 'summarize page'
    const pageSummary = await summarizePage(page, input.provider, input.model)
    const summary = {
      ok: true,
      startedAt,
      endedAt: new Date().toISOString(),
      currentStep,
      usedMainUserData: true,
      mainUserDataPath,
      provider: input.provider,
      providerDisplayName: providerDescriptors[input.provider].displayName,
      model: input.model,
      promptLength: input.prompt.length,
      credentialStatus,
      credentialStatuses,
      params: input.params,
      omits: input.omits,
      preset: input.preset || null,
      appliedGenerationParams,
      generationParamsTraces,
      sendResult,
      vite: { url: viteState.url, reused: viteState.reused },
      page: pageSummary,
      consoleMessages,
    }
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf8')
    console.log(JSON.stringify(summary, null, 2))
    console.log(`PASS: generation params real-click smoke completed. summary=${summaryPath}`)
    return 0
  } catch (error) {
    const failure = {
      ok: false,
      startedAt,
      endedAt: new Date().toISOString(),
      currentStep,
      provider: input.provider,
      model: input.model,
      usedMainUserData: input.useMainUserData === true,
      mainUserDataPath,
      credentialStatuses,
      appliedGenerationParams,
      generationParamsTraces,
      sendResult,
      error: safeError(error),
      consoleMessages,
    }
    await fs.mkdir(artifactRoot, { recursive: true })
    await fs.writeFile(summaryPath, JSON.stringify(failure, null, 2), 'utf8')
    console.error(JSON.stringify(failure, null, 2))
    console.error(`FAIL: generation params real-click smoke failed. summary=${summaryPath}`)
    return 1
  } finally {
    if (page) {
      await page.evaluate(() => {
        window.localStorage?.removeItem('starverse.generationParamsSmokeTrace')
      }).catch(() => undefined)
    }
    if (electronApp) await electronApp.close().catch(() => undefined)
    if (vite) await closeProcessTree(vite)
  }
}

const input = normalizeInput(parseArgs(process.argv.slice(2)))
if (input.help) {
  console.log(usage())
  process.exit(0)
}

run(input)
  .then((code) => {
    process.exitCode = code
  })
  .catch((error) => {
    console.error(safeError(error))
    process.exitCode = 1
  })
