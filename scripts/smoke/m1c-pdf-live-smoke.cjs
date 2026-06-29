const { app, safeStorage, session } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')

const PROMPT = 'Read the attached PDF and reply with exactly one short sentence containing the code STARVERSE-M1C-PDF.'
const PDF_TEXT = 'Starverse M1C PDF smoke phrase: STARVERSE-M1C-PDF.'
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
const OPENAI_RESPONSES_BASE_URL = 'https://api.openai.com/v1'
const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1'
const ANTHROPIC_API_VERSION = '2023-06-01'
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com'
const FORBIDDEN_REQUEST_STRINGS = [
  'originalPath',
  'storagePath',
  'storageRootDir',
  'storageUri',
  'blobId',
  'originalUrl',
  'resolvedUrl',
  'Authorization',
]
const DEFAULT_PROVIDERS = ['openrouter', 'openai', 'anthropic', 'gemini']
const OPENAI_MODEL_PRIORITY = ['gpt-5.4-nano', 'gpt-5.4-mini']
const ANTHROPIC_MODEL_PRIORITY = ['claude-haiku-4-5-20251001', 'claude-haiku-4-5']
const GEMINI_MODEL_PRIORITY = ['gemini-3.1-flash-lite', 'gemini-2.5-flash-lite']
const MAX_GENERATION_CALLS = 4

const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
const starverseUserData = path.join(appData, 'Starverse')
app.setName('Starverse')
app.setPath('userData', starverseUserData)

let generationCalls = 0

function selectedProvidersFromArgs(argv) {
  const arg = argv.find((value) => value.startsWith('--providers='))
  const raw = arg ? arg.slice('--providers='.length) : ''
  const selected = raw
    ? raw.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean)
    : DEFAULT_PROVIDERS
  const allowed = new Set(['openrouter', 'openai', 'anthropic', 'gemini'])
  return selected.filter((provider) => allowed.has(provider))
}

function sanitizeMessage(value) {
  return String(value ?? '')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [REDACTED]')
    .replace(/AIza[0-9A-Za-z_-]+/g, '[REDACTED_GOOGLE_KEY]')
    .replace(/sk-[0-9A-Za-z._:-]+/g, 'sk-[REDACTED]')
    .replace(/[A-Za-z]:[\\/][^\s"']+/g, '[local path]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500)
}

function safeHttpError(response, bodyText) {
  let providerMessage = ''
  try {
    const parsed = JSON.parse(bodyText)
    providerMessage = parsed?.error?.message || parsed?.message || ''
  } catch {
    providerMessage = ''
  }
  return sanitizeMessage(`HTTP ${response.status} ${response.statusText || ''}${providerMessage ? `: ${providerMessage}` : ''}`)
}

async function electronFetchText(url, init) {
  const response = await session.defaultSession.fetch(url, init)
  const bodyText = await response.text()
  if (!response.ok) throw new Error(safeHttpError(response, bodyText))
  return bodyText
}

async function electronFetchJson(url, init) {
  return JSON.parse(await electronFetchText(url, init))
}

function readConfig() {
  const configPath = path.join(starverseUserData, 'config.json')
  return JSON.parse(fs.readFileSync(configPath, 'utf8'))
}

function readSecureKey(config, providerKey) {
  const record = config?.providerCredentials?.v1?.[providerKey]
  if (!record) return { ok: false, reason: 'secure-store record missing' }
  if (record.providerKey !== providerKey) return { ok: false, reason: 'providerKey mismatch' }
  if (record.backend !== 'electron_safe_storage') return { ok: false, reason: `backend is ${record.backend || 'missing'}` }
  if (!record.ciphertextBase64) return { ok: false, reason: 'ciphertextBase64 missing' }
  if (!safeStorage.isEncryptionAvailable()) return { ok: false, reason: 'safeStorage encryption unavailable' }

  try {
    const apiKey = safeStorage.decryptString(Buffer.from(String(record.ciphertextBase64), 'base64')).trim()
    return apiKey ? { ok: true, apiKey } : { ok: false, reason: 'decrypted key empty' }
  } catch (error) {
    return { ok: false, reason: `decrypt failed: ${sanitizeMessage(error?.message)}` }
  }
}

function requestLeakCheck(body, fixturePath, secretValues = []) {
  const serialized = JSON.stringify(body)
  const leaks = FORBIDDEN_REQUEST_STRINGS.filter((needle) => serialized.includes(needle))
  if (fixturePath && serialized.includes(fixturePath)) leaks.push('fixturePath')
  for (const value of secretValues) {
    if (typeof value === 'string' && value && serialized.includes(value)) leaks.push('apiKey')
  }
  return { ok: leaks.length === 0, leaks }
}

function makeMinimalPdf(text) {
  const escaped = String(text).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
  const stream = `BT /F1 18 Tf 72 720 Td (${escaped}) Tj ET`
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}\nendstream\nendobj\n`,
  ]
  const chunks = ['%PDF-1.4\n']
  const offsets = [0]
  let offset = Buffer.byteLength(chunks[0], 'ascii')
  for (const object of objects) {
    offsets.push(offset)
    chunks.push(object)
    offset += Buffer.byteLength(object, 'ascii')
  }
  const xrefOffset = offset
  chunks.push(`xref\n0 ${objects.length + 1}\n`)
  chunks.push('0000000000 65535 f \n')
  for (let i = 1; i < offsets.length; i += 1) {
    chunks.push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`)
  }
  chunks.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`)
  return Buffer.from(chunks.join(''), 'ascii')
}

function writeTempPdf() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'starverse-m1c-pdf-smoke-'))
  const filePath = path.join(dir, 'm1c-smoke.pdf')
  const bytes = makeMinimalPdf(PDF_TEXT)
  fs.writeFileSync(filePath, bytes)
  return { dir, filePath, bytes }
}

function cleanupTempPdf(temp) {
  if (!temp?.dir) return
  try {
    fs.rmSync(temp.dir, { recursive: true, force: true })
  } catch {
    // Best effort cleanup; do not fail the smoke after provider validation.
  }
}

function asLowerArray(value) {
  return Array.isArray(value) ? value.map((item) => String(item).toLowerCase()) : []
}

function priceScore(model) {
  const pricing = model?.pricing || {}
  const values = [pricing.prompt, pricing.completion, pricing.request, pricing.image]
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value >= 0)
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : 999
}

function isRouterLikeOpenRouterModel(model) {
  const id = String(model?.id || '').toLowerCase()
  const name = String(model?.name || '').toLowerCase()
  return id === 'openrouter/auto' ||
    id === 'openrouter/free' ||
    id.startsWith('openrouter/') ||
    id.includes('router') ||
    name.includes('router') ||
    id.includes('/auto') ||
    name.includes('auto router')
}

function isConcretePdfCapableOpenRouterModel(model) {
  const input = asLowerArray(model?.architecture?.input_modalities)
  const output = asLowerArray(model?.architecture?.output_modalities)
  const hasExplicitPdfInput = input.includes('file') || input.includes('pdf')
  return typeof model?.id === 'string' &&
    model.id.includes('/') &&
    input.includes('text') &&
    hasExplicitPdfInput &&
    (output.length === 0 || output.includes('text')) &&
    !isRouterLikeOpenRouterModel(model)
}

function openRouterHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    'HTTP-Referer': 'https://github.com/GuXinghai/starverse',
    'X-Title': 'Starverse',
  }
}

async function listOpenRouterModels(apiKey) {
  const headers = openRouterHeaders(apiKey)
  let lastError = null
  for (const endpoint of ['/models/user', '/models']) {
    try {
      const payload = await electronFetchJson(`${OPENROUTER_BASE_URL}${endpoint}`, { headers })
      return { ok: true, endpoint, models: Array.isArray(payload?.data) ? payload.data : [] }
    } catch (error) {
      lastError = error
      const message = String(error?.message || '')
      if (message.includes('HTTP 401') || message.includes('HTTP 403')) break
    }
  }
  return { ok: false, reason: sanitizeMessage(lastError?.message || 'OpenRouter model metadata fetch failed') }
}

async function selectOpenRouterModel(apiKey) {
  const listed = await listOpenRouterModels(apiKey)
  if (!listed.ok) return listed
  const candidates = listed.models
    .filter(isConcretePdfCapableOpenRouterModel)
    .sort((a, b) => priceScore(a) - priceScore(b) || String(a.id).localeCompare(String(b.id)))
  if (candidates.length === 0) {
    return { ok: false, reason: `no concrete PDF/file-capable model in ${listed.endpoint}` }
  }
  return { ok: true, model: candidates[0].id, metadataEndpoint: listed.endpoint }
}

async function selectOpenAIModel(apiKey) {
  try {
    const payload = await electronFetchJson(`${OPENAI_RESPONSES_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    const ids = new Set((Array.isArray(payload?.data) ? payload.data : []).map((model) => String(model?.id || '')))
    const model = OPENAI_MODEL_PRIORITY.find((id) => ids.has(id))
    return model ? { ok: true, model } : { ok: false, reason: 'preferred OpenAI models unavailable in model list' }
  } catch (error) {
    return { ok: false, reason: sanitizeMessage(error?.message || 'OpenAI model metadata fetch failed') }
  }
}

async function selectAnthropicModel(apiKey) {
  try {
    const payload = await electronFetchJson(`${ANTHROPIC_BASE_URL}/models`, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_API_VERSION,
      },
    })
    const ids = new Set((Array.isArray(payload?.data) ? payload.data : []).map((model) => String(model?.id || '')))
    const model = ANTHROPIC_MODEL_PRIORITY.find((id) => ids.has(id))
    return model ? { ok: true, model } : { ok: false, reason: 'Claude Haiku 4.5 unavailable in model list' }
  } catch (error) {
    return { ok: false, reason: sanitizeMessage(error?.message || 'Anthropic model metadata fetch failed') }
  }
}

async function selectGeminiModel(apiKey) {
  try {
    const payload = await electronFetchJson(`${GEMINI_BASE_URL}/v1beta/models`, {
      headers: { 'x-goog-api-key': apiKey },
    })
    const names = new Set((Array.isArray(payload?.models) ? payload.models : []).map((model) => String(model?.name || '').replace(/^models\//, '')))
    const model = GEMINI_MODEL_PRIORITY.find((id) => names.has(id))
    return model ? { ok: true, model } : { ok: false, reason: 'preferred Gemini PDF-capable models unavailable in model list' }
  } catch (error) {
    return { ok: false, reason: sanitizeMessage(error?.message || 'Gemini model metadata fetch failed') }
  }
}

function parseSseDataLines(bodyText) {
  return String(bodyText)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trim())
    .filter((line) => line && line !== '[DONE]')
}

function extractOpenAIText(bodyText) {
  const parts = []
  for (const line of parseSseDataLines(bodyText)) {
    try {
      const event = JSON.parse(line)
      if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') parts.push(event.delta)
      const output = Array.isArray(event.response?.output) ? event.response.output : []
      for (const item of output) {
        for (const content of Array.isArray(item?.content) ? item.content : []) {
          if (typeof content?.text === 'string') parts.push(content.text)
        }
      }
    } catch {
      // Ignore malformed SSE data lines in smoke extraction.
    }
  }
  return parts.join('').trim()
}

function extractAnthropicText(bodyText) {
  const parts = []
  for (const line of parseSseDataLines(bodyText)) {
    try {
      const event = JSON.parse(line)
      if (event.type === 'content_block_delta' && typeof event.delta?.text === 'string') parts.push(event.delta.text)
      if (event.type === 'content_block_start' && typeof event.content_block?.text === 'string') parts.push(event.content_block.text)
    } catch {
      // Ignore malformed SSE data lines in smoke extraction.
    }
  }
  return parts.join('').trim()
}

function extractGeminiText(bodyText) {
  const parts = []
  for (const line of parseSseDataLines(bodyText)) {
    try {
      const event = JSON.parse(line)
      for (const candidate of Array.isArray(event?.candidates) ? event.candidates : []) {
        for (const part of Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []) {
          if (typeof part?.text === 'string') parts.push(part.text)
        }
      }
    } catch {
      // Ignore malformed SSE data lines in smoke extraction.
    }
  }
  return parts.join('').trim()
}

function extractOpenRouterText(bodyText) {
  const parts = []
  for (const line of parseSseDataLines(bodyText)) {
    try {
      const event = JSON.parse(line)
      for (const choice of Array.isArray(event?.choices) ? event.choices : []) {
        if (typeof choice?.delta?.content === 'string') parts.push(choice.delta.content)
        if (typeof choice?.message?.content === 'string') parts.push(choice.message.content)
      }
    } catch {
      // Ignore malformed SSE data lines in smoke extraction.
    }
  }
  return parts.join('').trim()
}

function hasExpectedPhrase(text) {
  return /STARVERSE[- ]M1C[- ]PDF/i.test(text)
}

function generationAllowed() {
  if (generationCalls >= MAX_GENERATION_CALLS) return false
  generationCalls += 1
  return true
}

async function smokeOpenRouter(apiKey, pdfBase64, fixturePath) {
  const selected = await selectOpenRouterModel(apiKey)
  if (!selected.ok) return { provider: 'openrouter', status: 'skipped', generationCalled: false, reason: selected.reason }
  const body = {
    model: selected.model,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: PROMPT },
        { type: 'file', file: { filename: 'm1c-smoke.pdf', file_data: `data:application/pdf;base64,${pdfBase64}` } },
      ],
    }],
    stream: true,
    temperature: 0,
    max_tokens: 32,
  }
  const leakCheck = requestLeakCheck(body, fixturePath, [apiKey])
  if (!leakCheck.ok) return { provider: 'openrouter', status: 'failed', generationCalled: false, model: selected.model, leakCheck }
  if (!generationAllowed()) return { provider: 'openrouter', status: 'skipped', generationCalled: false, model: selected.model, reason: 'generation budget exhausted' }
  try {
    const bodyText = await electronFetchText(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { ...openRouterHeaders(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const text = extractOpenRouterText(bodyText)
    return {
      provider: 'openrouter',
      status: text && hasExpectedPhrase(text) ? 'passed' : 'failed',
      generationCalled: true,
      model: selected.model,
      metadataEndpoint: selected.metadataEndpoint,
      nonEmptyText: text.length > 0,
      containsExpectedPhrase: hasExpectedPhrase(text),
      textLength: text.length,
      leakCheck,
    }
  } catch (error) {
    return { provider: 'openrouter', status: 'failed', generationCalled: true, model: selected.model, reason: sanitizeMessage(error?.message), leakCheck }
  }
}

async function smokeOpenAI(apiKey, pdfBase64, fixturePath) {
  const selected = await selectOpenAIModel(apiKey)
  if (!selected.ok) return { provider: 'openai', status: 'skipped', generationCalled: false, reason: selected.reason }
  const body = {
    model: selected.model,
    input: [{
      role: 'user',
      content: [
        { type: 'input_text', text: PROMPT },
        { type: 'input_file', filename: 'm1c-smoke.pdf', file_data: `data:application/pdf;base64,${pdfBase64}` },
      ],
    }],
    stream: true,
    temperature: 0,
    max_output_tokens: 32,
  }
  const leakCheck = requestLeakCheck(body, fixturePath, [apiKey])
  if (!leakCheck.ok) return { provider: 'openai', status: 'failed', generationCalled: false, model: selected.model, leakCheck }
  if (!generationAllowed()) return { provider: 'openai', status: 'skipped', generationCalled: false, model: selected.model, reason: 'generation budget exhausted' }
  try {
    const bodyText = await electronFetchText(`${OPENAI_RESPONSES_BASE_URL}/responses`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const text = extractOpenAIText(bodyText)
    return {
      provider: 'openai',
      status: text && hasExpectedPhrase(text) ? 'passed' : 'failed',
      generationCalled: true,
      model: selected.model,
      nonEmptyText: text.length > 0,
      containsExpectedPhrase: hasExpectedPhrase(text),
      textLength: text.length,
      leakCheck,
    }
  } catch (error) {
    return { provider: 'openai', status: 'failed', generationCalled: true, model: selected.model, reason: sanitizeMessage(error?.message), leakCheck }
  }
}

async function smokeAnthropic(apiKey, pdfBase64, fixturePath) {
  const selected = await selectAnthropicModel(apiKey)
  if (!selected.ok) return { provider: 'anthropic', status: 'skipped', generationCalled: false, reason: selected.reason }
  const body = {
    model: selected.model,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: PROMPT },
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 }, title: 'm1c-smoke.pdf' },
      ],
    }],
    max_tokens: 32,
    temperature: 0,
    stream: true,
  }
  const leakCheck = requestLeakCheck(body, fixturePath, [apiKey])
  if (!leakCheck.ok) return { provider: 'anthropic', status: 'failed', generationCalled: false, model: selected.model, leakCheck }
  if (!generationAllowed()) return { provider: 'anthropic', status: 'skipped', generationCalled: false, model: selected.model, reason: 'generation budget exhausted' }
  try {
    const bodyText = await electronFetchText(`${ANTHROPIC_BASE_URL}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_API_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const text = extractAnthropicText(bodyText)
    return {
      provider: 'anthropic',
      status: text && hasExpectedPhrase(text) ? 'passed' : 'failed',
      generationCalled: true,
      model: selected.model,
      nonEmptyText: text.length > 0,
      containsExpectedPhrase: hasExpectedPhrase(text),
      textLength: text.length,
      leakCheck,
    }
  } catch (error) {
    return { provider: 'anthropic', status: 'failed', generationCalled: true, model: selected.model, reason: sanitizeMessage(error?.message), leakCheck }
  }
}

async function smokeGemini(apiKey, pdfBase64, fixturePath) {
  const selected = await selectGeminiModel(apiKey)
  if (!selected.ok) return { provider: 'gemini', status: 'skipped', generationCalled: false, reason: selected.reason }
  const body = {
    contents: [{
      role: 'user',
      parts: [
        { text: PROMPT },
        { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
      ],
    }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 32,
    },
  }
  const leakCheck = requestLeakCheck(body, fixturePath, [apiKey])
  if (!leakCheck.ok) return { provider: 'gemini', status: 'failed', generationCalled: false, model: selected.model, leakCheck }
  if (!generationAllowed()) return { provider: 'gemini', status: 'skipped', generationCalled: false, model: selected.model, reason: 'generation budget exhausted' }
  try {
    const url = `${GEMINI_BASE_URL}/v1beta/models/${selected.model}:streamGenerateContent?alt=sse`
    const bodyText = await electronFetchText(url, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const text = extractGeminiText(bodyText)
    return {
      provider: 'gemini',
      status: text && hasExpectedPhrase(text) ? 'passed' : 'failed',
      generationCalled: true,
      model: selected.model,
      nonEmptyText: text.length > 0,
      containsExpectedPhrase: hasExpectedPhrase(text),
      textLength: text.length,
      leakCheck,
      transport: 'electron_session',
    }
  } catch (error) {
    return { provider: 'gemini', status: 'failed', generationCalled: true, model: selected.model, reason: sanitizeMessage(error?.message), leakCheck, transport: 'electron_session' }
  }
}

async function run() {
  await app.whenReady()
  const providers = selectedProvidersFromArgs(process.argv.slice(2))
  const config = readConfig()
  const temp = writeTempPdf()
  const pdfBase64 = temp.bytes.toString('base64')
  const results = []

  try {
    for (const provider of providers) {
      const credentialProvider =
        provider === 'openai' ? 'openai_responses'
          : provider === 'gemini' ? 'google_ai_studio'
            : provider
      const key = readSecureKey(config, credentialProvider)
      if (!key.ok) {
        results.push({ provider, status: 'skipped', generationCalled: false, reason: key.reason })
        continue
      }

      if (provider === 'openrouter') results.push(await smokeOpenRouter(key.apiKey, pdfBase64, temp.filePath))
      if (provider === 'openai') results.push(await smokeOpenAI(key.apiKey, pdfBase64, temp.filePath))
      if (provider === 'anthropic') results.push(await smokeAnthropic(key.apiKey, pdfBase64, temp.filePath))
      if (provider === 'gemini') results.push(await smokeGemini(key.apiKey, pdfBase64, temp.filePath))
    }
  } finally {
    cleanupTempPdf(temp)
  }

  const passed = results.some((result) => result.status === 'passed')
  const summary = {
    smoke: 'm1c-pdf-inline-live',
    passed,
    generationCalls,
    fixture: {
      generated: true,
      bytes: temp.bytes.length,
      deleted: !fs.existsSync(temp.filePath),
    },
    results,
  }
  console.log(JSON.stringify(summary, null, 2))
  app.quit()
  process.exitCode = passed ? 0 : 1
}

run().catch((error) => {
  console.error(JSON.stringify({
    smoke: 'm1c-pdf-inline-live',
    passed: false,
    error: sanitizeMessage(error?.message || error),
  }, null, 2))
  app.quit()
  process.exitCode = 1
})
