import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import crypto from 'node:crypto'

const API_URL = 'https://openrouter.ai/api/v1/chat/completions'
const DEFAULT_BASE_MODEL = 'google/gemini-2.5-flash'
const DEFAULT_NATIVE_MODEL = 'x-ai/grok-3-mini-beta'
const PROMPT = [
  'Use web search now.',
  'Return exactly two lines:',
  'utc_date: <current UTC date YYYY-MM-DD>',
  'source_url: <one URL you actually used>',
].join('\n')

function parseArgs(argv) {
  const args = {
    apiKey: null,
    baseModel: DEFAULT_BASE_MODEL,
    nativeModel: DEFAULT_NATIVE_MODEL,
    outDir: null,
    discoverKey: true,
    timeoutMs: 60_000,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--api-key') {
      args.apiKey = argv[i + 1] || null
      i += 1
    } else if (a === '--base-model') {
      args.baseModel = argv[i + 1] || args.baseModel
      i += 1
    } else if (a === '--native-model') {
      args.nativeModel = argv[i + 1] || args.nativeModel
      i += 1
    } else if (a === '--out-dir') {
      args.outDir = argv[i + 1] || null
      i += 1
    } else if (a === '--discover-key=false') {
      args.discoverKey = false
    } else if (a === '--timeout-ms') {
      const n = Number(argv[i + 1])
      if (Number.isFinite(n) && n > 0) args.timeoutMs = n
      i += 1
    }
  }
  return args
}

function nowTag() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function collapseWs(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function sha10(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 10)
}

function extractKeysFromConfigBackups() {
  const appData = process.env.APPDATA
  if (!appData) return []
  const dir = path.join(appData, 'starverse')
  if (!fs.existsSync(dir)) return []
  const files = fs
    .readdirSync(dir)
    .filter((n) => n.startsWith('config.json'))
    .map((n) => path.join(dir, n))

  const keySet = new Set()
  for (const full of files) {
    let text = ''
    try {
      text = fs.readFileSync(full, 'utf8')
    } catch {
      continue
    }
    const hits = text.match(/sk-or-v1-[A-Za-z0-9_-]{20,}/g)
    if (!hits) continue
    for (const k of hits) keySet.add(k)
  }
  return [...keySet]
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(t)
  }
}

async function probeApiKey(key, timeoutMs) {
  try {
    const res = await fetchWithTimeout(
      API_URL,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'openrouter/auto',
          stream: false,
          max_tokens: 8,
          messages: [{ role: 'user', content: 'ok' }],
        }),
      },
      timeoutMs
    )
    return res.status !== 401
  } catch {
    return false
  }
}

async function resolveApiKey(args) {
  const candidates = []
  const envKey = process.env.OPENROUTER_API_KEY || process.env.VITE_OPENROUTER_API_KEY || ''
  if (args.apiKey && args.apiKey.trim()) candidates.push({ source: 'cli', key: args.apiKey.trim() })
  if (envKey && envKey.trim()) candidates.push({ source: 'env', key: envKey.trim() })
  if (args.discoverKey) {
    for (const k of extractKeysFromConfigBackups()) {
      candidates.push({ source: 'appdata', key: k })
    }
  }

  const seen = new Set()
  for (const c of candidates) {
    if (seen.has(c.key)) continue
    seen.add(c.key)
    if (await probeApiKey(c.key, args.timeoutMs)) {
      return { key: c.key, source: c.source, keyHash: sha10(c.key) }
    }
  }
  return null
}

function summarizeAnnotations(annotations) {
  if (!Array.isArray(annotations)) {
    return {
      count: 0,
      types: [],
      urlCitationCount: 0,
      startIndexZeroCount: 0,
      startIndexNonZeroCount: 0,
      endIndexZeroCount: 0,
      endIndexNonZeroCount: 0,
      sample: null,
    }
  }

  let urlCitationCount = 0
  let startIndexZeroCount = 0
  let startIndexNonZeroCount = 0
  let endIndexZeroCount = 0
  let endIndexNonZeroCount = 0
  const types = new Set()

  for (const ann of annotations) {
    if (!ann || typeof ann !== 'object') continue
    if (typeof ann.type === 'string') types.add(ann.type)
    const uc = ann.url_citation
    if (!uc || typeof uc !== 'object') continue
    urlCitationCount += 1
    if (typeof uc.start_index === 'number') {
      if (uc.start_index === 0) startIndexZeroCount += 1
      else startIndexNonZeroCount += 1
    }
    if (typeof uc.end_index === 'number') {
      if (uc.end_index === 0) endIndexZeroCount += 1
      else endIndexNonZeroCount += 1
    }
  }

  let sample = null
  if (annotations[0] && typeof annotations[0] === 'object') {
    const c = annotations[0].url_citation?.content
    sample = {
      type: annotations[0].type || null,
      url: annotations[0].url_citation?.url || null,
      title: annotations[0].url_citation?.title || null,
      start_index: annotations[0].url_citation?.start_index ?? null,
      end_index: annotations[0].url_citation?.end_index ?? null,
      content_preview: typeof c === 'string' ? c.slice(0, 240) : null,
    }
  }

  return {
    count: annotations.length,
    types: [...types],
    urlCitationCount,
    startIndexZeroCount,
    startIndexNonZeroCount,
    endIndexZeroCount,
    endIndexNonZeroCount,
    sample,
  }
}

async function runJsonCase({ apiKey, body, timeoutMs, caseDir }) {
  ensureDir(caseDir)
  fs.writeFileSync(path.join(caseDir, 'request.json'), `${JSON.stringify(body, null, 2)}\n`, 'utf8')

  const startedAt = new Date().toISOString()
  const res = await fetchWithTimeout(
    API_URL,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    timeoutMs
  )
  const endedAt = new Date().toISOString()
  const text = await res.text()
  fs.writeFileSync(path.join(caseDir, 'response.txt'), text, 'utf8')

  let json = null
  try {
    json = JSON.parse(text)
    fs.writeFileSync(path.join(caseDir, 'response.json'), `${JSON.stringify(json, null, 2)}\n`, 'utf8')
  } catch {}

  const annotations = json?.choices?.[0]?.message?.annotations
  const annSummary = summarizeAnnotations(annotations)
  const content = json?.choices?.[0]?.message?.content
  const errMsg = json?.error?.message || null

  return {
    mode: 'json',
    status: res.status,
    ok: res.ok,
    startedAt,
    endedAt,
    responseModel: json?.model || null,
    responseProvider: json?.provider || null,
    contentPreview: typeof content === 'string' ? collapseWs(content).slice(0, 240) : null,
    annotations: annSummary,
    error: errMsg,
  }
}

function safeParseJson(s) {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

async function runStreamCase({ apiKey, body, timeoutMs, caseDir }) {
  ensureDir(caseDir)
  fs.writeFileSync(path.join(caseDir, 'request.json'), `${JSON.stringify(body, null, 2)}\n`, 'utf8')

  const startedAt = new Date().toISOString()
  const res = await fetchWithTimeout(
    API_URL,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    timeoutMs
  )
  if (!res.ok) {
    const text = await res.text()
    fs.writeFileSync(path.join(caseDir, 'response.txt'), text, 'utf8')
    const j = safeParseJson(text)
    return {
      mode: 'stream',
      status: res.status,
      ok: false,
      startedAt,
      endedAt: new Date().toISOString(),
      error: j?.error?.message || text.slice(0, 400),
    }
  }

  const reader = res.body?.getReader()
  if (!reader) {
    return {
      mode: 'stream',
      status: res.status,
      ok: false,
      startedAt,
      endedAt: new Date().toISOString(),
      error: 'Missing response body stream',
    }
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let done = false
  let dataLines = 0
  let jsonEvents = 0
  let eventIndex = 0
  let firstDeltaAnnotationEvent = -1
  let firstMessageAnnotationEvent = -1
  const streamEvents = []
  const aggregatedContent = []
  let responseModel = null
  let responseProvider = null
  const allDeltaAnnotations = []

  while (true) {
    const { value, done: readDone } = await reader.read()
    if (readDone) break
    buffer += decoder.decode(value, { stream: true })
    while (true) {
      const idx = buffer.indexOf('\n')
      if (idx === -1) break
      const raw = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 1)
      const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
      if (!line.startsWith('data:')) continue

      dataLines += 1
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') {
        done = true
        continue
      }
      const j = safeParseJson(payload)
      if (!j) continue

      jsonEvents += 1
      eventIndex += 1
      if (!responseModel && typeof j.model === 'string') responseModel = j.model
      if (!responseProvider && typeof j.provider === 'string') responseProvider = j.provider

      const choice = Array.isArray(j.choices) ? j.choices[0] : null
      const deltaContent = choice?.delta?.content
      if (typeof deltaContent === 'string') aggregatedContent.push(deltaContent)

      const deltaAnnotations = Array.isArray(choice?.delta?.annotations) ? choice.delta.annotations : []
      const messageAnnotations = Array.isArray(choice?.message?.annotations) ? choice.message.annotations : []

      if (deltaAnnotations.length > 0 && firstDeltaAnnotationEvent < 0) firstDeltaAnnotationEvent = eventIndex
      if (messageAnnotations.length > 0 && firstMessageAnnotationEvent < 0) firstMessageAnnotationEvent = eventIndex
      for (const ann of deltaAnnotations) allDeltaAnnotations.push(ann)

      streamEvents.push({
        eventIndex,
        finishReason: choice?.finish_reason ?? null,
        deltaContentChars: typeof deltaContent === 'string' ? deltaContent.length : 0,
        deltaAnnotationCount: deltaAnnotations.length,
        messageAnnotationCount: messageAnnotations.length,
      })
    }
    if (done) break
  }

  const endedAt = new Date().toISOString()
  fs.writeFileSync(path.join(caseDir, 'stream-events.json'), `${JSON.stringify(streamEvents, null, 2)}\n`, 'utf8')
  fs.writeFileSync(path.join(caseDir, 'stream-aggregated-content.txt'), aggregatedContent.join(''), 'utf8')

  return {
    mode: 'stream',
    status: res.status,
    ok: true,
    startedAt,
    endedAt,
    responseModel,
    responseProvider,
    contentPreview: collapseWs(aggregatedContent.join('')).slice(0, 240),
    stream: {
      dataLines,
      jsonEvents,
      doneSeen: done,
      firstDeltaAnnotationEvent,
      firstMessageAnnotationEvent,
      deltaAnnotations: summarizeAnnotations(allDeltaAnnotations),
    },
  }
}

async function runCase(ctx, c) {
  const caseDir = path.join(ctx.outDir, c.id)
  const body = c.buildBody(ctx)
  const run = c.stream ? runStreamCase : runJsonCase
  try {
    const result = await run({
      apiKey: ctx.apiKey,
      body,
      timeoutMs: ctx.timeoutMs,
      caseDir,
    })
    return {
      id: c.id,
      title: c.title,
      objective: c.objective,
      request: body,
      result,
    }
  } catch (err) {
    return {
      id: c.id,
      title: c.title,
      objective: c.objective,
      request: body,
      result: {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
    }
  }
}

function buildCases() {
  return [
    {
      id: 'A_nonstream_web',
      title: 'A: Non-stream with web plugin',
      objective: 'Verify message.annotations in non-stream response',
      stream: false,
      buildBody: (ctx) => ({
        model: ctx.baseModel,
        stream: false,
        max_tokens: 220,
        messages: [{ role: 'user', content: PROMPT }],
        plugins: [{ id: 'web' }],
      }),
    },
    {
      id: 'A_stream_web',
      title: 'A: Stream with web plugin',
      objective: 'Verify whether annotations arrive in delta or final packet',
      stream: true,
      buildBody: (ctx) => ({
        model: ctx.baseModel,
        stream: true,
        max_tokens: 220,
        messages: [{ role: 'user', content: PROMPT }],
        plugins: [{ id: 'web' }],
      }),
    },
    {
      id: 'B_engine_auto',
      title: 'B: engine=auto',
      objective: 'Check auto fallback behavior on non-native model',
      stream: false,
      buildBody: (ctx) => ({
        model: ctx.baseModel,
        stream: false,
        max_tokens: 220,
        messages: [{ role: 'user', content: PROMPT }],
        plugins: [{ id: 'web' }],
      }),
    },
    {
      id: 'B_engine_native',
      title: 'B: engine=native',
      objective: 'Check native engine failure behavior on non-native model',
      stream: false,
      buildBody: (ctx) => ({
        model: ctx.baseModel,
        stream: false,
        max_tokens: 220,
        messages: [{ role: 'user', content: PROMPT }],
        plugins: [{ id: 'web', engine: 'native' }],
      }),
    },
    {
      id: 'B_engine_exa',
      title: 'B: engine=exa',
      objective: 'Check explicit exa behavior',
      stream: false,
      buildBody: (ctx) => ({
        model: ctx.baseModel,
        stream: false,
        max_tokens: 220,
        messages: [{ role: 'user', content: PROMPT }],
        plugins: [{ id: 'web', engine: 'exa' }],
      }),
    },
    {
      id: 'C_context_high_exa',
      title: 'C: search_context_size=high with exa',
      objective: 'Check if chat/completions accepts search_context_size on exa',
      stream: false,
      buildBody: (ctx) => ({
        model: ctx.baseModel,
        stream: false,
        max_tokens: 220,
        messages: [{ role: 'user', content: PROMPT }],
        plugins: [{ id: 'web', engine: 'exa' }],
        web_search_options: { search_context_size: 'high' },
      }),
    },
    {
      id: 'C_context_invalid_exa',
      title: 'C: search_context_size=ultra with exa',
      objective: 'Check validation behavior for invalid search_context_size on exa',
      stream: false,
      buildBody: (ctx) => ({
        model: ctx.baseModel,
        stream: false,
        max_tokens: 220,
        messages: [{ role: 'user', content: PROMPT }],
        plugins: [{ id: 'web', engine: 'exa' }],
        web_search_options: { search_context_size: 'ultra' },
      }),
    },
    {
      id: 'C_context_high_native',
      title: 'C: search_context_size=high with native',
      objective: 'Check native path with search_context_size',
      stream: false,
      buildBody: (ctx) => ({
        model: ctx.baseModel,
        stream: false,
        max_tokens: 220,
        messages: [{ role: 'user', content: PROMPT }],
        plugins: [{ id: 'web', engine: 'native' }],
        web_search_options: { search_context_size: 'high' },
      }),
    },
    {
      id: 'D_baseline_no_plugins',
      title: 'D: Baseline no plugins',
      objective: 'Baseline behavior when no request-level plugin is specified',
      stream: false,
      buildBody: (ctx) => ({
        model: ctx.baseModel,
        stream: false,
        max_tokens: 220,
        messages: [{ role: 'user', content: PROMPT }],
      }),
    },
    {
      id: 'D_plugins_enabled_false',
      title: 'D: plugins enabled=false',
      objective: 'Check whether request-level enabled:false disables web plugin',
      stream: false,
      buildBody: (ctx) => ({
        model: ctx.baseModel,
        stream: false,
        max_tokens: 220,
        messages: [{ role: 'user', content: PROMPT }],
        plugins: [{ id: 'web', enabled: false }],
      }),
    },
    {
      id: 'D_plugins_enabled_true',
      title: 'D: plugins enabled=true',
      objective: 'Control case for enabled:true',
      stream: false,
      buildBody: (ctx) => ({
        model: ctx.baseModel,
        stream: false,
        max_tokens: 220,
        messages: [{ role: 'user', content: PROMPT }],
        plugins: [{ id: 'web', enabled: true }],
      }),
    },
    {
      id: 'EQ_suffix_online',
      title: 'Equivalence: :online suffix',
      objective: 'Check :online model suffix behavior',
      stream: false,
      buildBody: (ctx) => ({
        model: `${ctx.baseModel}:online`,
        stream: false,
        max_tokens: 220,
        messages: [{ role: 'user', content: PROMPT }],
      }),
    },
    {
      id: 'EQ_suffix_online_plus_disable',
      title: 'Equivalence: :online + enabled=false',
      objective: 'Check precedence when suffix and plugins disabled are both present',
      stream: false,
      buildBody: (ctx) => ({
        model: `${ctx.baseModel}:online`,
        stream: false,
        max_tokens: 220,
        messages: [{ role: 'user', content: PROMPT }],
        plugins: [{ id: 'web', enabled: false }],
      }),
    },
    {
      id: 'EQ_plugins_object_shape',
      title: 'Equivalence: plugins object shape',
      objective: 'Check whether plugins accepts object vs array',
      stream: false,
      buildBody: (ctx) => ({
        model: ctx.baseModel,
        stream: false,
        max_tokens: 220,
        messages: [{ role: 'user', content: PROMPT }],
        plugins: { id: 'web' },
      }),
    },
    {
      id: 'B_native_model_probe',
      title: 'B: native probe on native-candidate model',
      objective: 'Try engine=native on a native-candidate model for availability check',
      stream: false,
      buildBody: (ctx) => ({
        model: ctx.nativeModel,
        stream: false,
        max_tokens: 220,
        messages: [{ role: 'user', content: PROMPT }],
        plugins: [{ id: 'web', engine: 'native' }],
      }),
    },
  ]
}

function pickCaseById(results, id) {
  return results.find((r) => r.id === id)
}

function summarizeMatrix(results) {
  const getStatus = (id) => pickCaseById(results, id)?.result?.status ?? null
  const getAnn = (id) => pickCaseById(results, id)?.result?.annotations?.count ?? null
  const getErr = (id) => pickCaseById(results, id)?.result?.error ?? null
  const streamA = pickCaseById(results, 'A_stream_web')?.result

  return {
    keyFacts: {
      A_nonstream_annotations: getAnn('A_nonstream_web'),
      A_stream_first_delta_annotation_event: streamA?.stream?.firstDeltaAnnotationEvent ?? null,
      A_stream_first_message_annotation_event: streamA?.stream?.firstMessageAnnotationEvent ?? null,
      B_auto_status: getStatus('B_engine_auto'),
      B_native_status: getStatus('B_engine_native'),
      B_exa_status: getStatus('B_engine_exa'),
      B_native_error: getErr('B_engine_native'),
      C_high_exa_status: getStatus('C_context_high_exa'),
      C_invalid_exa_status: getStatus('C_context_invalid_exa'),
      C_high_native_status: getStatus('C_context_high_native'),
      D_baseline_annotations: getAnn('D_baseline_no_plugins'),
      D_enabled_false_annotations: getAnn('D_plugins_enabled_false'),
      D_enabled_true_annotations: getAnn('D_plugins_enabled_true'),
      EQ_suffix_online_annotations: getAnn('EQ_suffix_online'),
      EQ_suffix_online_plus_disable_annotations: getAnn('EQ_suffix_online_plus_disable'),
      EQ_plugins_object_shape_status: getStatus('EQ_plugins_object_shape'),
    },
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const key = await resolveApiKey(args)
  if (!key) {
    console.error('No working OpenRouter API key found. Provide --api-key or set OPENROUTER_API_KEY.')
    process.exit(1)
  }

  const outDir =
    args.outDir ||
    path.join(process.cwd(), 'artifacts', 'openrouter', 'web-plugin-boundary', nowTag())
  ensureDir(outDir)

  const ctx = {
    apiKey: key.key,
    keySource: key.source,
    keyHash: key.keyHash,
    baseModel: args.baseModel,
    nativeModel: args.nativeModel,
    timeoutMs: args.timeoutMs,
    outDir,
  }

  const cases = buildCases()
  const results = []

  for (const c of cases) {
    process.stdout.write(`Running ${c.id}...\n`)
    const result = await runCase(ctx, c)
    results.push(result)
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    toolVersion: '2026-02-18',
    keySource: ctx.keySource,
    keyHash: ctx.keyHash,
    baseModel: ctx.baseModel,
    nativeModel: ctx.nativeModel,
    cases: results,
    matrix: summarizeMatrix(results),
    notes: [
      'D default-plugin verification requires account-side default web plugin ON. This script can only probe behavior under current account settings.',
      'If account has Prevent overrides enabled, request-level enabled:false may be ignored; verify with an account where that policy is enabled.',
    ],
  }

  fs.writeFileSync(path.join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')

  const md = []
  md.push('# OpenRouter Web Plugin Boundary Probe')
  md.push('')
  md.push(`- generatedAt: ${summary.generatedAt}`)
  md.push(`- outDir: ${outDir}`)
  md.push(`- keySource: ${summary.keySource}`)
  md.push(`- keyHash: ${summary.keyHash}`)
  md.push(`- baseModel: ${summary.baseModel}`)
  md.push(`- nativeModel: ${summary.nativeModel}`)
  md.push('')
  md.push('## Matrix Quick View')
  md.push('')
  md.push('| Case | Status | Annotations | Error |')
  md.push('|---|---:|---:|---|')
  for (const c of results) {
    const status = c.result?.status ?? ''
    const ann = c.result?.annotations?.count ?? c.result?.stream?.deltaAnnotations?.count ?? ''
    const err = c.result?.error ? String(c.result.error).replace(/\|/g, '\\|') : ''
    md.push(`| ${c.id} | ${status} | ${ann} | ${err} |`)
  }
  md.push('')
  md.push('## Notes')
  for (const n of summary.notes) md.push(`- ${n}`)
  md.push('')
  fs.writeFileSync(path.join(outDir, 'README.md'), `${md.join('\n')}\n`, 'utf8')

  process.stdout.write(`Done. Summary: ${path.join(outDir, 'summary.json')}\n`)
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.stack || err.message : String(err)}\n`)
  process.exit(1)
})

