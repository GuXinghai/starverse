const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const zlib = require('node:zlib')

const PROMPT = 'Reply with exactly one short sentence describing the image.'
const OLLAMA_BASE_URL = process.env.STARVERSE_SMOKE_OLLAMA_URL || 'http://127.0.0.1:11434'
const LM_STUDIO_BASE_URL = process.env.STARVERSE_SMOKE_LM_STUDIO_URL || 'http://127.0.0.1:1234'
const TIMEOUT_MS = 30000

function crc32(buf) {
  let crc = 0xffffffff
  for (const byte of buf) {
    crc ^= byte
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

function makePng64() {
  const width = 64
  const height = 64
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1)
    raw[row] = 0
    for (let x = 0; x < width; x += 1) {
      const offset = row + 1 + x * 3
      raw[offset] = 220
      raw[offset + 1] = x < 32 ? 40 : 180
      raw[offset + 2] = y < 32 ? 40 : 210
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function safeError(error) {
  const message = error && error.message ? String(error.message) : String(error || 'unknown error')
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/sk-[A-Za-z0-9._-]+/g, 'sk-[redacted]')
    .replace(/[A-Za-z]:[\\/][^\s"']+/g, '[local path]')
    .slice(0, 220)
}

async function fetchJson(url, init = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      redirect: 'error',
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers || {}),
      },
    })
    if (!response.ok) return { ok: false, code: `http_${response.status}` }
    return { ok: true, json: await response.json() }
  } catch (error) {
    return { ok: false, code: error && error.name === 'AbortError' ? 'timeout' : 'network_error', error: safeError(error) }
  } finally {
    clearTimeout(timer)
  }
}

async function findOllamaVisionModel() {
  const tags = await fetchJson(`${OLLAMA_BASE_URL}/api/tags`)
  if (!tags.ok || !Array.isArray(tags.json && tags.json.models)) {
    return { ok: false, reason: `Ollama /api/tags unavailable (${tags.code})` }
  }
  for (const item of tags.json.models) {
    const model = String((item && (item.name || item.model)) || '').trim()
    if (!model) continue
    const show = await fetchJson(`${OLLAMA_BASE_URL}/api/show`, {
      method: 'POST',
      body: JSON.stringify({ model }),
    })
    if (!show.ok) continue
    const capabilities = Array.isArray(show.json && show.json.capabilities)
      ? show.json.capabilities.map((value) => String(value).toLowerCase())
      : []
    if (capabilities.includes('vision')) return { ok: true, model }
  }
  return { ok: false, reason: 'No installed Ollama model reported vision capability from /api/show.' }
}

async function smokeOllama(imageBase64) {
  const selected = await findOllamaVisionModel()
  if (!selected.ok) return { provider: 'ollama_local', status: 'skip', reason: selected.reason, generation: false }
  const body = {
    model: selected.model,
    messages: [{ role: 'user', content: PROMPT, images: [imageBase64] }],
    stream: false,
  }
  const serialized = JSON.stringify(body)
  if (serialized.includes('data:image')) throw new Error('Ollama native body unexpectedly contains data URL prefix.')
  const result = await fetchJson(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    body: serialized,
  })
  if (!result.ok) return { provider: 'ollama_local', status: 'fail', model: selected.model, reason: result.code, generation: true }
  const text = String(result.json && result.json.message && result.json.message.content || '').trim()
  return {
    provider: 'ollama_local',
    status: text ? 'pass' : 'fail',
    model: selected.model,
    textLength: text.length,
    generation: true,
    requestShape: 'native_api_chat_images_base64',
  }
}

async function findLMStudioVisionModel() {
  const models = await fetchJson(`${LM_STUDIO_BASE_URL}/api/v1/models`)
  if (!models.ok || !Array.isArray(models.json && models.json.models)) {
    return { ok: false, reason: `LM Studio /api/v1/models unavailable (${models.code})` }
  }
  for (const item of models.json.models) {
    const model = String((item && item.key) || '').trim()
    const loaded = Array.isArray(item && item.loaded_instances) && item.loaded_instances.length > 0
    const vision = item && item.capabilities && item.capabilities.vision === true
    if (model && loaded && vision) return { ok: true, model }
  }
  return { ok: false, reason: 'No loaded LM Studio model reported capabilities.vision=true.' }
}

async function smokeLMStudio(imageDataUrl) {
  const selected = await findLMStudioVisionModel()
  if (!selected.ok) return { provider: 'lm_studio', status: 'skip', reason: selected.reason, generation: false }
  const body = {
    model: selected.model,
    messages: [{ role: 'user', content: [
      { type: 'text', text: PROMPT },
      { type: 'image_url', image_url: { url: imageDataUrl } },
    ] }],
    stream: false,
  }
  const result = await fetchJson(`${LM_STUDIO_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  if (!result.ok) return { provider: 'lm_studio', status: 'fail', model: selected.model, reason: result.code, generation: true }
  const text = String(result.json && result.json.choices && result.json.choices[0] && result.json.choices[0].message && result.json.choices[0].message.content || '').trim()
  return {
    provider: 'lm_studio',
    status: text ? 'pass' : 'fail',
    model: selected.model,
    textLength: text.length,
    generation: true,
    requestShape: 'openai_compatible_image_url_data_url',
  }
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'starverse-local-image-smoke-'))
  const imagePath = path.join(root, 'tiny.png')
  const png = makePng64()
  await fs.writeFile(imagePath, png)
  const imageBase64 = png.toString('base64')
  const imageDataUrl = `data:image/png;base64,${imageBase64}`
  const results = []
  let generationCalls = 0
  try {
    const ollama = await smokeOllama(imageBase64)
    results.push(ollama)
    if (ollama.generation) generationCalls += 1
    if (generationCalls < 2) {
      const lmStudio = await smokeLMStudio(imageDataUrl)
      results.push(lmStudio)
      if (lmStudio.generation) generationCalls += 1
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }

  const output = {
    ok: results.some((item) => item.status === 'pass'),
    prompt: PROMPT,
    fixture: { mimeType: 'image/png', bytes: png.length, deleted: true },
    generationCalls,
    results,
    leakCheck: 'safe-summary-only',
  }
  const allSkipped = results.length > 0 && results.every((item) => item.status === 'skip')
  console.log(JSON.stringify(output, null, 2))
  process.exitCode = output.ok || allSkipped ? 0 : 2
}

main().catch((error) => {
  console.log(JSON.stringify({ ok: false, error: safeError(error) }, null, 2))
  process.exitCode = 1
})
