const { app, safeStorage, session } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const PROMPT = 'Read the attached PDF and reply with exactly one short sentence about its content.'
const PDF_TEXT = 'Starverse M1d provider file upload cache smoke.'
const OPENAI_BASE_URL = 'https://api.openai.com/v1'
const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1'
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com'
const MAX_GENERATIONS = 5

const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
const starverseUserData = path.join(appData, 'Starverse')
app.setName('Starverse')
app.setPath('userData', starverseUserData)

function readConfig() {
  const configPath = path.join(app.getPath('userData'), 'config.json')
  if (!fs.existsSync(configPath)) return {}
  return JSON.parse(fs.readFileSync(configPath, 'utf8'))
}

function selectedProvidersFromArgs(argv) {
  const arg = argv.find((value) => value.startsWith('--providers='))
  const raw = arg ? arg.slice('--providers='.length) : ''
  const selected = raw
    ? raw.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean)
    : ['openai', 'anthropic', 'gemini']
  const allowed = new Set(['openai', 'anthropic', 'gemini'])
  return selected.filter((provider) => allowed.has(provider))
}

function readCredential(config, providerKey) {
  const record = config?.providerCredentials?.v1?.[providerKey]
  if (!record?.ciphertextBase64 || record.backend !== 'electron_safe_storage') {
    return { ok: false, reason: 'secure-store credential missing' }
  }
  if (!safeStorage.isEncryptionAvailable()) {
    return { ok: false, reason: 'safeStorage unavailable' }
  }
  try {
    const apiKey = safeStorage.decryptString(Buffer.from(String(record.ciphertextBase64), 'base64')).trim()
    return apiKey ? { ok: true, apiKey } : { ok: false, reason: 'credential empty' }
  } catch {
    return { ok: false, reason: 'credential decrypt failed' }
  }
}

function makePdfBytes() {
  const escaped = PDF_TEXT.replace(/[()\\]/g, '\\$&')
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${escaped.length + 54} >>\nstream\nBT /F1 12 Tf 36 96 Td (${escaped}) Tj ET\nendstream\nendobj\n`,
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
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(pdf, 'utf8')
}

async function safeFetch(url, init) {
  return session.defaultSession.fetch(url, init)
}

async function jsonOrNull(response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

async function uploadOpenAI(apiKey, pdfBytes) {
  const multipart = buildMultipartFormData([
    { name: 'purpose', value: 'user_data' },
    { name: 'file', filename: 'm1d-smoke.pdf', contentType: 'application/pdf', bytes: pdfBytes },
  ])
  const response = await safeFetch(`${OPENAI_BASE_URL}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': multipart.contentType,
    },
    body: multipart.body,
  })
  if (!response.ok) return { ok: false, reason: await safeResponseReason(response, 'upload') }
  const json = await jsonOrNull(response)
  const fileId = typeof json?.id === 'string' ? json.id : ''
  return fileId ? { ok: true, fileId } : { ok: false, reason: 'upload missing file_id' }
}

async function generateOpenAI(apiKey, model, fileId) {
  const body = {
    model,
    input: [{ role: 'user', content: [{ type: 'input_text', text: PROMPT }, { type: 'input_file', file_id: fileId }] }],
    stream: false,
    temperature: 0,
    max_output_tokens: 32,
  }
  const response = await safeFetch(`${OPENAI_BASE_URL}/responses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) return { ok: false, reason: await safeResponseReason(response, 'generation') }
  const json = await jsonOrNull(response)
  const text = extractOpenAIText(json)
  return text ? { ok: true, text } : { ok: false, reason: 'empty text' }
}

async function uploadAnthropic(apiKey, pdfBytes) {
  const multipart = buildMultipartFormData([
    { name: 'file', filename: 'm1d-smoke.pdf', contentType: 'application/pdf', bytes: pdfBytes },
  ])
  const response = await safeFetch(`${ANTHROPIC_BASE_URL}/files`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'files-api-2025-04-14',
      'Content-Type': multipart.contentType,
    },
    body: multipart.body,
  })
  if (!response.ok) return { ok: false, reason: await safeResponseReason(response, 'upload') }
  const json = await jsonOrNull(response)
  const fileId = typeof json?.id === 'string' ? json.id : ''
  return fileId ? { ok: true, fileId } : { ok: false, reason: 'upload missing file_id' }
}

async function generateAnthropic(apiKey, model, fileId) {
  const body = {
    model,
    max_tokens: 32,
    temperature: 0,
    stream: false,
    messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, { type: 'document', source: { type: 'file', file_id: fileId }, title: 'm1d-smoke.pdf' }] }],
  }
  const response = await safeFetch(`${ANTHROPIC_BASE_URL}/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'files-api-2025-04-14',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) return { ok: false, reason: await safeResponseReason(response, 'generation') }
  const json = await jsonOrNull(response)
  const text = Array.isArray(json?.content)
    ? json.content.map((part) => part?.type === 'text' ? part.text : '').join('').trim()
    : ''
  return text ? { ok: true, text } : { ok: false, reason: 'empty text' }
}

async function uploadGemini(apiKey, pdfBytes) {
  const start = await safeFetch(`${GEMINI_BASE_URL}/upload/v1beta/files`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(pdfBytes.byteLength),
      'X-Goog-Upload-Header-Content-Type': 'application/pdf',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: 'm1d-smoke.pdf' } }),
  })
  if (!start.ok) return { ok: false, reason: await safeResponseReason(start, 'upload start') }
  const uploadUrl = start.headers.get('x-goog-upload-url')
  if (!uploadUrl) return { ok: false, reason: 'upload URL missing' }
  const finalize = await safeFetch(uploadUrl, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: pdfBytes,
  })
  if (!finalize.ok) return { ok: false, reason: await safeResponseReason(finalize, 'upload finalize') }
  const json = await jsonOrNull(finalize)
  const file = json?.file ?? json
  const uri = typeof file?.uri === 'string' ? file.uri : ''
  return uri ? { ok: true, fileUri: uri } : { ok: false, reason: 'upload missing fileUri' }
}

async function generateGemini(apiKey, model, fileUri) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: PROMPT }, { fileData: { mimeType: 'application/pdf', fileUri } }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 32 },
  }
  const response = await safeFetch(`${GEMINI_BASE_URL}/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) return { ok: false, reason: await safeResponseReason(response, 'generation') }
  const json = await jsonOrNull(response)
  const text = Array.isArray(json?.candidates?.[0]?.content?.parts)
    ? json.candidates[0].content.parts.map((part) => part?.text ?? '').join('').trim()
    : ''
  return text ? { ok: true, text } : { ok: false, reason: 'empty text' }
}

function extractOpenAIText(json) {
  if (typeof json?.output_text === 'string' && json.output_text.trim()) return json.output_text.trim()
  if (!Array.isArray(json?.output)) return ''
  return json.output.flatMap((item) => Array.isArray(item?.content) ? item.content : [])
    .map((part) => typeof part?.text === 'string' ? part.text : '')
    .join('')
    .trim()
}

async function safeResponseReason(response, phase) {
  let message = ''
  try {
    const json = await response.clone().json()
    message = String(json?.error?.message || json?.message || json?.error || '').trim()
  } catch {
    message = ''
  }
  return sanitizeMessage(`${phase} http ${response.status}${message ? `: ${message}` : ''}`)
}

function sanitizeMessage(value) {
  return String(value || '')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/AIza[0-9A-Za-z_-]+/g, '[redacted_google_key]')
    .replace(/sk-[0-9A-Za-z._:-]+/g, 'sk-[redacted]')
    .replace(/[A-Za-z]:[\\/][^\s"']+/g, '[local path]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240)
}

function buildMultipartFormData(parts) {
  const boundary = `----starverse-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  const chunks = []
  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`, 'utf8'))
    const name = escapeHeaderValue(part.name)
    if (part.bytes) {
      chunks.push(Buffer.from(
        `Content-Disposition: form-data; name="${name}"; filename="${escapeHeaderValue(part.filename || 'attachment.bin')}"\r\n` +
        `Content-Type: ${part.contentType || 'application/octet-stream'}\r\n\r\n`,
        'utf8',
      ))
      chunks.push(Buffer.from(part.bytes))
      chunks.push(Buffer.from('\r\n', 'utf8'))
    } else {
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="${name}"\r\n\r\n${part.value || ''}\r\n`, 'utf8'))
    }
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'))
  const body = Buffer.concat(chunks)
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    byteLength: body.byteLength,
    body: body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  }
}

function escapeHeaderValue(value) {
  return String(value).replace(/[\r\n"]/g, '_')
}

async function runProvider(name, config, pdfBytes, counters) {
  const providerKey = name === 'openai' ? 'openai_responses' : name === 'anthropic' ? 'anthropic' : 'google_ai_studio'
  const credential = readCredential(config, providerKey)
  if (!credential.ok) return { provider: name, status: 'skip', reason: credential.reason }

  if (name === 'openai') {
    const upload = await uploadOpenAI(credential.apiKey, pdfBytes)
    if (!upload.ok) return { provider: name, status: 'fail', phase: 'upload', reason: upload.reason }
    for (const model of ['gpt-5.4-nano', 'gpt-5.4-mini']) {
      if (counters.generations >= MAX_GENERATIONS) return { provider: name, status: 'skip', reason: 'generation budget exhausted' }
      counters.generations += 1
      const generation = await generateOpenAI(credential.apiKey, model, upload.fileId)
      if (generation.ok) return { provider: name, status: 'pass', model, reference: 'file_id', textLength: generation.text.length }
      if (!/404|model|not found/i.test(generation.reason)) return { provider: name, status: 'fail', phase: 'generation', model, reason: generation.reason }
    }
    return { provider: name, status: 'skip', reason: 'OpenAI low-cost models unavailable' }
  }

  if (name === 'anthropic') {
    const upload = await uploadAnthropic(credential.apiKey, pdfBytes)
    if (!upload.ok) return { provider: name, status: 'fail', phase: 'upload', reason: upload.reason, nonZdr: true }
    if (counters.generations >= MAX_GENERATIONS) return { provider: name, status: 'skip', reason: 'generation budget exhausted', nonZdr: true }
    counters.generations += 1
    const generation = await generateAnthropic(credential.apiKey, 'claude-haiku-4-5-20251001', upload.fileId)
    return generation.ok
      ? { provider: name, status: 'pass', model: 'claude-haiku-4-5-20251001', reference: 'file_id', textLength: generation.text.length, nonZdr: true }
      : { provider: name, status: 'fail', phase: 'generation', model: 'claude-haiku-4-5-20251001', reason: generation.reason, nonZdr: true }
  }

  const upload = await uploadGemini(credential.apiKey, pdfBytes)
  if (!upload.ok) return { provider: name, status: 'fail', phase: 'upload', reason: upload.reason }
  for (const model of ['gemini-3.1-flash-lite', 'gemini-2.5-flash-lite']) {
    if (counters.generations >= MAX_GENERATIONS) return { provider: name, status: 'skip', reason: 'generation budget exhausted' }
    counters.generations += 1
    const generation = await generateGemini(credential.apiKey, model, upload.fileUri)
    if (generation.ok) return { provider: name, status: 'pass', model, reference: 'fileUri', textLength: generation.text.length }
    if (!/404|model|not found/i.test(generation.reason)) return { provider: name, status: 'fail', phase: 'generation', model, reason: generation.reason }
  }
  return { provider: name, status: 'skip', reason: 'Gemini low-cost models unavailable' }
}

app.whenReady().then(async () => {
  if (process.argv.includes('--transport-probe')) {
    const checks = []
    try {
      const response = await session.defaultSession.fetch('https://example.com')
      checks.push({ name: 'get', ok: true, status: response.status })
    } catch (error) {
      checks.push({ name: 'get', ok: false, safeError: safeExceptionReason(error) })
    }
    try {
      const response = await session.defaultSession.fetch('https://example.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true }),
      })
      checks.push({ name: 'post-json-string', ok: true, status: response.status })
    } catch (error) {
      checks.push({ name: 'post-json-string', ok: false, safeError: safeExceptionReason(error) })
    }
    try {
      const response = await session.defaultSession.fetch('https://example.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: Buffer.from('probe'),
      })
      checks.push({ name: 'post-buffer', ok: true, status: response.status })
    } catch (error) {
      checks.push({ name: 'post-buffer', ok: false, safeError: safeExceptionReason(error) })
    }
    try {
      const response = await session.defaultSession.fetch('https://example.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': '5' },
        body: Buffer.from('probe'),
      })
      checks.push({ name: 'post-content-length', ok: true, status: response.status })
    } catch (error) {
      checks.push({ name: 'post-content-length', ok: false, safeError: safeExceptionReason(error) })
    }
    console.log(JSON.stringify({ probe: 'electron-session-fetch', checks }, null, 2))
    app.quit(0)
    return
  }
  const config = readConfig()
  const pdfBytes = makePdfBytes()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'starverse-m1d-file-cache-smoke-'))
  const filePath = path.join(dir, 'm1d-smoke.pdf')
  fs.writeFileSync(filePath, pdfBytes)
  const counters = { generations: 0 }
  const results = []
  try {
    for (const provider of selectedProvidersFromArgs(process.argv)) {
      try {
        results.push(await runProvider(provider, config, pdfBytes, counters))
      } catch (error) {
        results.push({
          provider,
          status: 'fail',
          phase: 'exception',
          reason: safeExceptionReason(error),
        })
      }
    }
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
  }
  const passed = results.some((result) => result.status === 'pass')
  console.log(JSON.stringify({
    smoke: 'm1d-provider-file-upload-cache-live',
    passed,
    generationCalls: counters.generations,
    fixtureBytes: pdfBytes.byteLength,
    fileApiPathRequired: true,
    inlineFallbackUsed: false,
    leakCheck: 'safe-summary-only',
    results,
  }, null, 2))
  app.quit(passed ? 0 : 1)
}).catch((error) => {
  console.log(JSON.stringify({
    smoke: 'm1d-provider-file-upload-cache-live',
    passed: false,
    safeError: String(error?.message ?? error).slice(0, 200),
  }, null, 2))
  app.quit(1)
})

function safeExceptionReason(error) {
  return String(error?.message || error || 'unknown error').replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').slice(0, 160)
}
