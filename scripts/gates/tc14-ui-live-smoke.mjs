import process from 'node:process'

function section(title) {
  process.stdout.write(`\n${'='.repeat(80)}\n${title}\n${'='.repeat(80)}\n`)
}

function parseArgs(argv) {
  const args = { apiKey: undefined, model: undefined, withGeneration: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--api-key') {
      args.apiKey = argv[i + 1]
      i += 1
      continue
    }
    if (a === '--model') {
      args.model = argv[i + 1]
      i += 1
      continue
    }
    if (a === '--with-generation') {
      args.withGeneration = true
      continue
    }
  }
  return args
}

function pickApiKey(cliKey) {
  const key =
    (typeof cliKey === 'string' && cliKey.trim()) ||
    (typeof process.env.OPENROUTER_API_KEY === 'string' && process.env.OPENROUTER_API_KEY.trim()) ||
    (typeof process.env.VITE_OPENROUTER_API_KEY === 'string' && process.env.VITE_OPENROUTER_API_KEY.trim()) ||
    ''
  return key || null
}

function normalizeGenerationId(raw) {
  if (typeof raw !== 'string') return null
  const id = raw.trim()
  return id ? id : null
}

function safeErrorMessage(err) {
  if (!err) return 'Unknown error'
  if (err instanceof Error) return err.message || err.name
  return String(err)
}

async function readSSEAndExtractSummary(response, { timeoutMs }) {
  const decoder = new TextDecoder()
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Missing response body stream')

  const startedAt = Date.now()
  let buffer = ''
  let dataLines = []
  let sawDone = false
  let generationId = normalizeGenerationId(response.headers.get('x-openrouter-generation-id'))
  let lastFinishReason = null
  let lastNativeFinishReason = null
  let lastError = null

  const flushEvent = () => {
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
      throw new Error('SSE protocol_error: failed to JSON.parse data payload')
    }

    if (!generationId && typeof json?.id === 'string') generationId = normalizeGenerationId(json.id)

    const choice0 = Array.isArray(json?.choices) ? json.choices[0] : undefined
    const finishReason = typeof choice0?.finish_reason === 'string' ? choice0.finish_reason : null
    const nativeFinishReason =
      typeof choice0?.native_finish_reason === 'string' ? choice0.native_finish_reason : null
    if (finishReason) lastFinishReason = finishReason
    if (nativeFinishReason) lastNativeFinishReason = nativeFinishReason

    if (json && typeof json === 'object' && json.error) {
      lastError = json.error
    }
  }

  while (true) {
    if (Date.now() - startedAt > timeoutMs) throw new Error(`Timeout after ${timeoutMs}ms`)

    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    while (true) {
      const idx = buffer.indexOf('\n')
      if (idx === -1) break
      const rawLine = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 1)

      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
      if (line === '') {
        flushEvent()
        continue
      }

      if (line.startsWith(':')) {
        continue
      }

      if (line.startsWith('data:')) {
        dataLines.push(line.slice('data:'.length).trimStart())
      }
    }

    if (sawDone) break
  }

  if (buffer.length > 0) {
    buffer = buffer.trimEnd()
    if (buffer.length > 0) {
      const line = buffer
      if (line.startsWith('data:')) dataLines.push(line.slice('data:'.length).trimStart())
      buffer = ''
    }
  }
  flushEvent()

  return {
    generationId,
    sawDone,
    lastFinishReason,
    lastNativeFinishReason,
    lastError,
  }
}

async function fetchGenerationMetadata({ apiKey, generationId, timeoutMs }) {
  const url = `https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(generationId)}`
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort('timeout'), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    })
    const text = await res.text()
    if (!res.ok) {
      return { ok: false, status: res.status, bodyText: text.slice(0, 2000) }
    }
    let json
    try {
      json = JSON.parse(text)
    } catch {
      return { ok: false, status: res.status, bodyText: text.slice(0, 2000) }
    }
    return { ok: true, status: res.status, json }
  } finally {
    clearTimeout(t)
  }
}

async function main() {
  section('TC-14 — ui-next live smoke (OpenRouter chat/completions)')

  const args = parseArgs(process.argv.slice(2))
  const apiKey = pickApiKey(args.apiKey)
  if (!apiKey) {
    console.log('SKIP: no api key; use --api-key or env (OPENROUTER_API_KEY / VITE_OPENROUTER_API_KEY)')
    process.exit(0)
  }

  const model = typeof args.model === 'string' && args.model.trim() ? args.model.trim() : 'openrouter/auto'

  section('Request')
  console.log(`model: ${model}`)
  console.log(`stream: true`)

  const controller = new AbortController()
  const timeoutMs = 30_000
  const t = setTimeout(() => controller.abort('timeout'), timeoutMs)

  let summary
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        stream: true,
        usage: { include: true },
        messages: [{ role: 'user', content: 'tc14 live smoke: ping' }],
      }),
      signal: controller.signal,
    })

    section('Response')
    console.log(`status: ${res.status}`)

    if (!res.ok) {
      const text = await res.text()
      console.error(`FAIL: non-2xx response`)
      console.error(text.slice(0, 2000))
      process.exit(1)
    }

    summary = await readSSEAndExtractSummary(res, { timeoutMs })
  } finally {
    clearTimeout(t)
  }

  section('Summary')
  if (summary.generationId) console.log(`generationId: ${summary.generationId}`)
  if (summary.lastFinishReason) console.log(`finish_reason: ${summary.lastFinishReason}`)
  if (summary.lastNativeFinishReason) console.log(`native_finish_reason: ${summary.lastNativeFinishReason}`)
  console.log(`done: ${summary.sawDone ? 'yes' : 'no'}`)

  if (summary.lastError) {
    console.error('FAIL: upstream error chunk received')
    console.error(typeof summary.lastError === 'string' ? summary.lastError : JSON.stringify(summary.lastError, null, 2))
    process.exit(1)
  }

  if (!summary.sawDone) {
    console.error('FAIL: stream ended without [DONE]')
    process.exit(1)
  }

  if (args.withGeneration && summary.generationId) {
    section('Generation metadata (/generation?id=...)')
    const meta = await fetchGenerationMetadata({ apiKey, generationId: summary.generationId, timeoutMs: 15_000 })
    console.log(`status: ${meta.status}`)
    if (!meta.ok) {
      console.log('NOTE: generation metadata fetch failed (non-fatal)')
      console.log(meta.bodyText)
    } else {
      const u = meta.json?.data?.usage ?? meta.json?.usage ?? null
      const fr = meta.json?.data?.finish_reason ?? meta.json?.finish_reason ?? null
      if (fr) console.log(`finish_reason: ${fr}`)
      if (u) console.log(`usage: ${JSON.stringify(u)}`)
      else console.log('usage: (missing)')
    }
  }

  console.log('\nPASS: live smoke completed')
}

main().catch((err) => {
  const msg = safeErrorMessage(err)
  process.stderr.write(`\nFAIL: ${msg}\n`)
  process.exit(1)
})

