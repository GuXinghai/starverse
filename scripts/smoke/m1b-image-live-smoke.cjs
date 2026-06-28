const { app, safeStorage, session } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')
const zlib = require('zlib')

const PROMPT = 'Reply with exactly one short sentence describing the image.'
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com'
const FORBIDDEN_REQUEST_STRINGS = ['originalPath', 'storagePath', 'blobId', 'storageUri', 'originalUrl']
const MAX_GENERATION_CALLS = 2

const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
const starverseUserData = path.join(appData, 'Starverse')
app.setName('Starverse')
app.setPath('userData', starverseUserData)

let generationCalls = 0

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

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0)
  return Buffer.concat([length, typeBuffer, data, checksum])
}

function makePng64() {
  const width = 64
  const height = 64
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6

  const rows = []
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 4)
    for (let x = 0; x < width; x += 1) {
      const index = 1 + x * 4
      const insideSquare = x >= 18 && x < 46 && y >= 18 && y < 46
      row[index] = insideSquare ? 24 : 245
      row[index + 1] = insideSquare ? 120 : 248
      row[index + 2] = insideSquare ? 210 : 250
      row[index + 3] = 255
    }
    rows.push(row)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(Buffer.concat(rows), { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function sanitizeMessage(value) {
  return String(value ?? '')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [REDACTED]')
    .replace(/AIza[0-9A-Za-z_-]+/g, '[REDACTED_GOOGLE_KEY]')
    .replace(/sk-[0-9A-Za-z._-]+/g, 'sk-[REDACTED]')
    .slice(0, 500)
}

function parseSafeProviderMessage(bodyText) {
  try {
    const parsed = JSON.parse(bodyText)
    return sanitizeMessage(parsed?.error?.message || parsed?.message || '')
  } catch {
    return ''
  }
}

function safeHttpError(response, bodyText) {
  const providerMessage = parseSafeProviderMessage(bodyText)
  return `HTTP ${response.status} ${response.statusText || ''}${providerMessage ? `: ${providerMessage}` : ''}`.trim()
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
  return {
    configPath,
    config: JSON.parse(fs.readFileSync(configPath, 'utf8')),
  }
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

function requestLeakCheck(body, fixturePath) {
  const serialized = JSON.stringify(body)
  const leaks = FORBIDDEN_REQUEST_STRINGS.filter((needle) => serialized.includes(needle))
  if (fixturePath && serialized.includes(fixturePath)) leaks.push('fixturePath')
  return { ok: leaks.length === 0, leaks }
}

function asLowerArray(value) {
  return Array.isArray(value) ? value.map((item) => String(item).toLowerCase()) : []
}

function priceScore(model) {
  const pricing = model?.pricing || {}
  const values = [pricing.prompt, pricing.completion, pricing.image]
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

function isConcreteImageCapableOpenRouterModel(model) {
  const input = asLowerArray(model?.architecture?.input_modalities)
  const output = asLowerArray(model?.architecture?.output_modalities)
  return typeof model?.id === 'string' &&
    model.id.includes('/') &&
    input.includes('text') &&
    input.includes('image') &&
    (output.length === 0 || output.includes('text')) &&
    !isRouterLikeOpenRouterModel(model)
}

function splitOpenRouterModelId(modelId) {
  const slash = String(modelId).indexOf('/')
  if (slash <= 0 || slash === modelId.length - 1) return null
  return {
    author: modelId.slice(0, slash),
    slug: modelId.slice(slash + 1),
  }
}

function openRouterHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    'HTTP-Referer': 'https://github.com/GuXinghai/starverse',
    'X-Title': 'Starverse',
  }
}

async function listOpenRouterModels(apiKey, baseUrl) {
  const headers = openRouterHeaders(apiKey)
  const base = baseUrl.replace(/\/+$/, '')
  let lastError = null

  for (const endpoint of ['/models/user', '/models']) {
    try {
      const payload = await electronFetchJson(`${base}${endpoint}`, { headers })
      return {
        ok: true,
        endpoint,
        models: Array.isArray(payload?.data) ? payload.data : [],
      }
    } catch (error) {
      lastError = error
      const message = String(error?.message || '')
      if (message.includes('HTTP 401') || message.includes('HTTP 403')) break
    }
  }

  return { ok: false, reason: sanitizeMessage(lastError?.message || 'OpenRouter model metadata fetch failed') }
}

async function getOpenRouterEndpointSummary(apiKey, baseUrl, modelId) {
  const parts = splitOpenRouterModelId(modelId)
  if (!parts) return { ok: false, reason: 'invalid_model_id' }
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/models/${encodeURIComponent(parts.author)}/${encodeURIComponent(parts.slug)}/endpoints`
  try {
    const payload = await electronFetchJson(endpoint, { headers: openRouterHeaders(apiKey) })
    const endpoints = Array.isArray(payload?.data?.endpoints) ? payload.data.endpoints : []
    const activeEndpoints = endpoints.filter((item) => item?.status === 0 || item?.status === '0')
    return {
      ok: true,
      endpointCount: endpoints.length,
      activeEndpointCount: activeEndpoints.length,
      firstActiveProvider: activeEndpoints[0]?.provider_name || null,
    }
  } catch (error) {
    return { ok: false, reason: sanitizeMessage(error?.message || 'endpoint metadata failed') }
  }
}

async function pickOpenRouterImageModel(apiKey, baseUrl) {
  const listed = await listOpenRouterModels(apiKey, baseUrl)
  if (!listed.ok) return listed

  const candidates = listed.models
    .filter(isConcreteImageCapableOpenRouterModel)
    .sort((a, b) => priceScore(a) - priceScore(b) || String(a.id).localeCompare(String(b.id)))
    .slice(0, 12)

  const inspected = []
  for (const model of candidates) {
    const endpointSummary = await getOpenRouterEndpointSummary(apiKey, baseUrl, model.id)
    inspected.push({
      id: model.id,
      name: model.name || model.id,
      priceScore: priceScore(model),
      endpointSummary,
    })
    if (endpointSummary.ok && endpointSummary.activeEndpointCount > 0) {
      return {
        ok: true,
        sourceEndpoint: listed.endpoint,
        model: model.id,
        inspected,
      }
    }
  }

  if (candidates[0]) {
    return {
      ok: true,
      sourceEndpoint: listed.endpoint,
      model: candidates[0].id,
      inspected,
      warning: 'No active endpoint metadata found in inspected candidates; using cheapest concrete image-capable model.',
    }
  }

  return {
    ok: false,
    reason: `No concrete image-capable OpenRouter model found in ${listed.endpoint}.`,
    inspected,
  }
}

function extractOpenRouterText(payload) {
  let text = ''
  for (const choice of payload?.choices || []) {
    const delta = choice?.delta || choice?.message || {}
    if (typeof delta.content === 'string') {
      text += delta.content
      continue
    }
    if (Array.isArray(delta.content)) {
      for (const part of delta.content) {
        if (typeof part?.text === 'string') text += part.text
      }
    }
  }
  return text
}

async function readOpenRouterSseText(response) {
  const reader = response.body?.getReader?.()
  if (!reader) throw new Error('OpenRouter response body is not readable.')

  const decoder = new TextDecoder()
  let buffer = ''
  let text = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim()
      buffer = buffer.slice(newlineIndex + 1)
      if (line.startsWith('data:')) {
        const data = line.slice(5).trim()
        if (data && data !== '[DONE]') {
          try {
            text += extractOpenRouterText(JSON.parse(data))
          } catch {
            // Ignore malformed individual SSE chunks; terminal emptiness is checked by caller.
          }
        }
      }
      newlineIndex = buffer.indexOf('\n')
    }
  }
  return text.trim()
}

async function smokeOpenRouter(config, imageDataUrl, fixturePath) {
  const key = readSecureKey(config, 'openrouter')
  if (!key.ok) return { provider: 'openrouter', status: 'skipped', reason: key.reason }

  const baseUrl = String(config.openRouterBaseUrl || OPENROUTER_BASE_URL).trim() || OPENROUTER_BASE_URL
  const picked = await pickOpenRouterImageModel(key.apiKey, baseUrl)
  if (!picked.ok) {
    return {
      provider: 'openrouter',
      status: 'skipped',
      reason: picked.reason,
      inspected: picked.inspected || [],
      transport: 'electron_session_fetch',
    }
  }

  const body = {
    model: picked.model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: PROMPT },
          { type: 'image_url', image_url: { url: imageDataUrl } },
        ],
      },
    ],
    stream: true,
    temperature: 0,
    max_tokens: 32,
  }

  const leakCheck = requestLeakCheck(body, fixturePath)
  if (!leakCheck.ok) {
    return {
      provider: 'openrouter',
      status: 'blocked',
      reason: `request body leak: ${leakCheck.leaks.join(', ')}`,
      model: picked.model,
      transport: 'electron_session_fetch',
    }
  }

  if (generationCalls >= MAX_GENERATION_CALLS) {
    return { provider: 'openrouter', status: 'skipped', reason: 'generation call budget exhausted' }
  }
  generationCalls += 1

  const response = await session.defaultSession.fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      ...openRouterHeaders(key.apiKey),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '')
    return {
      provider: 'openrouter',
      status: 'failed',
      model: picked.model,
      transport: 'electron_session_fetch',
      generationCallMade: true,
      requestLeakCheck: 'passed',
      selector: {
        sourceEndpoint: picked.sourceEndpoint,
        inspected: picked.inspected,
        warning: picked.warning || null,
      },
      safeError: safeHttpError(response, bodyText),
    }
  }

  const text = await readOpenRouterSseText(response)
  return {
    provider: 'openrouter',
    status: text ? 'passed' : 'failed',
    model: picked.model,
    transport: 'electron_session_fetch',
    generationCallMade: true,
    requestLeakCheck: 'passed',
    selector: {
      sourceEndpoint: picked.sourceEndpoint,
      inspected: picked.inspected,
      warning: picked.warning || null,
    },
    textLength: text.length,
    sample: text.slice(0, 160),
  }
}

function geminiHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    'x-goog-api-key': apiKey,
  }
}

async function resolveProxyDiagnostic(url) {
  try {
    const proxy = await session.defaultSession.resolveProxy(url)
    const normalized = String(proxy || '').trim()
    if (!normalized || normalized === 'DIRECT') return { ok: true, route: 'DIRECT' }
    return { ok: true, route: normalized.split(/\s+/)[0] || 'configured' }
  } catch (error) {
    return { ok: false, reason: sanitizeMessage(error?.message || 'resolveProxy failed') }
  }
}

async function listGeminiModels(apiKey) {
  const url = `${GEMINI_BASE_URL}/v1beta/models`
  const proxyDiagnostic = await resolveProxyDiagnostic(url)
  try {
    const payload = await electronFetchJson(url, { headers: geminiHeaders(apiKey) })
    return {
      ok: true,
      models: Array.isArray(payload?.models) ? payload.models : [],
      proxyDiagnostic,
    }
  } catch (error) {
    return {
      ok: false,
      reason: sanitizeMessage(error?.message || 'Gemini model metadata fetch failed'),
      proxyDiagnostic,
    }
  }
}

function pickGeminiModel(models) {
  const byId = new Map()
  for (const model of models) {
    const name = String(model?.name || '')
    const id = name.startsWith('models/') ? name.slice('models/'.length) : name
    if (id) byId.set(id, model)
  }

  for (const id of ['gemini-3.1-flash-lite', 'gemini-2.5-flash-lite']) {
    const model = byId.get(id)
    const methods = Array.isArray(model?.supportedGenerationMethods) ? model.supportedGenerationMethods : []
    if (model && (methods.includes('generateContent') || methods.includes('streamGenerateContent'))) return id
  }
  return null
}

function extractGeminiText(payload) {
  let text = ''
  for (const candidate of payload?.candidates || []) {
    for (const part of candidate?.content?.parts || []) {
      if (typeof part?.text === 'string') text += part.text
    }
  }
  return text
}

async function readGeminiSseText(response) {
  const reader = response.body?.getReader?.()
  if (!reader) throw new Error('Gemini response body is not readable.')

  const decoder = new TextDecoder()
  let buffer = ''
  let text = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim()
      buffer = buffer.slice(newlineIndex + 1)
      if (line.startsWith('data:')) {
        const data = line.slice(5).trim()
        if (data) {
          try {
            text += extractGeminiText(JSON.parse(data))
          } catch {
            // Ignore malformed individual SSE chunks; terminal emptiness is checked by caller.
          }
        }
      }
      newlineIndex = buffer.indexOf('\n')
    }
  }
  return text.trim()
}

async function smokeGemini(config, imageBase64, fixturePath) {
  const key = readSecureKey(config, 'google_ai_studio')
  if (!key.ok) return { provider: 'gemini', status: 'skipped', reason: key.reason }

  const metadata = await listGeminiModels(key.apiKey)
  if (!metadata.ok) {
    return {
      provider: 'gemini',
      status: 'skipped',
      reason: 'metadata transport unavailable; generation not attempted',
      transport: 'electron_session_fetch',
      proxyDiagnostic: metadata.proxyDiagnostic,
      safeError: metadata.reason,
      generationCallMade: false,
    }
  }

  const model = pickGeminiModel(metadata.models)
  if (!model) {
    return {
      provider: 'gemini',
      status: 'skipped',
      reason: 'preferred Gemini flash-lite model not available in metadata',
      transport: 'electron_session_fetch',
      proxyDiagnostic: metadata.proxyDiagnostic,
      generationCallMade: false,
    }
  }

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: PROMPT },
          { inlineData: { mimeType: 'image/png', data: imageBase64 } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 32,
    },
  }

  const leakCheck = requestLeakCheck(body, fixturePath)
  if (!leakCheck.ok) {
    return {
      provider: 'gemini',
      status: 'blocked',
      reason: `request body leak: ${leakCheck.leaks.join(', ')}`,
      model,
      transport: 'electron_session_fetch',
    }
  }

  if (generationCalls >= MAX_GENERATION_CALLS) {
    return { provider: 'gemini', status: 'skipped', reason: 'generation call budget exhausted' }
  }
  generationCalls += 1

  const response = await session.defaultSession.fetch(`${GEMINI_BASE_URL}/v1beta/models/${model}:streamGenerateContent?alt=sse`, {
    method: 'POST',
    headers: geminiHeaders(key.apiKey),
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '')
    return {
      provider: 'gemini',
      status: 'failed',
      model,
      transport: 'electron_session_fetch',
      proxyDiagnostic: metadata.proxyDiagnostic,
      generationCallMade: true,
      requestLeakCheck: 'passed',
      safeError: safeHttpError(response, bodyText),
    }
  }

  const text = await readGeminiSseText(response)
  return {
    provider: 'gemini',
    status: text ? 'passed' : 'failed',
    model,
    transport: 'electron_session_fetch',
    proxyDiagnostic: metadata.proxyDiagnostic,
    generationCallMade: true,
    requestLeakCheck: 'passed',
    textLength: text.length,
    sample: text.slice(0, 160),
  }
}

async function main() {
  const png = makePng64()
  const fixturePath = path.join(os.tmpdir(), 'starverse-m1b-image-live-smoke-64.png')
  fs.writeFileSync(fixturePath, png)

  const output = {
    ok: false,
    prompt: PROMPT,
    generationCalls: 0,
    results: [
      {
        provider: 'fixture',
        status: 'created',
        mimeType: 'image/png',
        sizeBytes: png.length,
        under10KB: png.length < 10 * 1024,
      },
    ],
  }

  try {
    const { config, configPath } = readConfig()
    output.results.push({
      provider: 'secure-store',
      status: 'checked',
      configPath,
      records: ['openrouter', 'google_ai_studio', 'openai_responses', 'anthropic', 'deepseek'].map((providerKey) => {
        const record = config?.providerCredentials?.v1?.[providerKey]
        return {
          providerKey,
          present: !!record,
          backend: record?.backend || null,
          hasCiphertextBase64: !!record?.ciphertextBase64,
        }
      }),
    })

    const imageBase64 = png.toString('base64')
    const openRouter = await smokeOpenRouter(config, `data:image/png;base64,${imageBase64}`, fixturePath)
    output.results.push(openRouter)

    if (openRouter.status === 'passed') {
      output.results.push({
        provider: 'gemini',
        status: 'skipped',
        reason: 'OpenRouter passed; spend policy stops after first successful provider.',
      })
    } else {
      output.results.push(await smokeGemini(config, imageBase64, fixturePath))
    }
  } finally {
    output.generationCalls = generationCalls
    output.ok = output.results.some((result) => result.provider !== 'fixture' && result.status === 'passed')
    try {
      fs.unlinkSync(fixturePath)
    } catch {
      // Ignore temp fixture cleanup failures.
    }
  }

  console.log(JSON.stringify(output, null, 2))
  process.exitCode = output.ok ? 0 : 1
}

app.whenReady()
  .then(main)
  .catch((error) => {
    console.log(JSON.stringify({
      ok: false,
      generationCalls,
      fatal: sanitizeMessage(error?.message || error),
    }, null, 2))
    process.exitCode = 1
  })
  .finally(() => app.quit())
