import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { ProxyAgent } from 'undici'

const MAX_REQUESTS_PER_PROVIDER = 5
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024
const DEFAULT_OUTPUT_DIR = path.resolve('tmp', 'provider-model-catalog-audit')
const auditProxyUrl = String(process.env.STARVERSE_AUDIT_PROXY_URL ?? '').trim()
const auditDispatcher = auditProxyUrl ? new ProxyAgent(auditProxyUrl) : undefined

const PROVIDERS = Object.freeze({
  openrouter: Object.freeze({
    env: 'STARVERSE_AUDIT_OPENROUTER_API_KEY',
    initialUrl: 'https://openrouter.ai/api/v1/models',
    headers: (key) => ({ authorization: `Bearer ${key}` }),
    items: (body) => body?.data,
    next: () => null,
  }),
  openai: Object.freeze({
    env: 'STARVERSE_AUDIT_OPENAI_API_KEY',
    initialUrl: 'https://api.openai.com/v1/models',
    headers: (key) => ({ authorization: `Bearer ${key}` }),
    items: (body) => body?.data,
    next: () => null,
  }),
  gemini: Object.freeze({
    env: 'STARVERSE_AUDIT_GEMINI_API_KEY',
    initialUrl: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=100',
    headers: (key) => ({ 'x-goog-api-key': key }),
    items: (body) => body?.models,
    next: (body) => typeof body?.nextPageToken === 'string' && body.nextPageToken.length > 0
      ? `https://generativelanguage.googleapis.com/v1beta/models?pageSize=100&pageToken=${encodeURIComponent(body.nextPageToken)}`
      : null,
  }),
  anthropic: Object.freeze({
    env: 'STARVERSE_AUDIT_ANTHROPIC_API_KEY',
    initialUrl: 'https://api.anthropic.com/v1/models?limit=100',
    headers: (key) => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01' }),
    items: (body) => body?.data,
    next: (body) => body?.has_more === true && typeof body?.last_id === 'string'
      ? `https://api.anthropic.com/v1/models?limit=100&after_id=${encodeURIComponent(body.last_id)}`
      : null,
  }),
  deepseek: Object.freeze({
    env: 'STARVERSE_AUDIT_DEEPSEEK_API_KEY',
    initialUrl: 'https://api.deepseek.com/models',
    headers: (key) => ({ authorization: `Bearer ${key}` }),
    items: (body) => body?.data,
    next: () => null,
  }),
})

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function sanitizeUrl(value) {
  try {
    const url = new URL(value)
    url.username = ''
    url.password = ''
    for (const key of [...url.searchParams.keys()]) {
      if (/key|token|secret|credential|signature|auth/i.test(key)) url.searchParams.set(key, '[REDACTED]')
    }
    return url.toString()
  } catch {
    return value
  }
}

function sanitize(value, keyPath = '$') {
  if (Array.isArray(value)) return value.map((item, index) => sanitize(item, `${keyPath}[${index}]`))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => {
      if (/authorization|api[_-]?key|cookie|credential|password|secret|access[_-]?token/i.test(key)) {
        return [key, '[REDACTED]']
      }
      return [key, sanitize(child, `${keyPath}.${key}`)]
    }))
  }
  if (typeof value === 'string' && /^https?:\/\//iu.test(value)) return sanitizeUrl(value)
  return value
}

function safeErrorFact(error) {
  if (!(error instanceof Error)) return Object.freeze({ message: String(error) })
  const cause = error.cause instanceof Error
    ? Object.freeze({
        name: error.cause.name,
        code: typeof error.cause.code === 'string' ? error.cause.code : null,
        message: error.cause.message,
      })
    : null
  return Object.freeze(sanitize({
    name: error.name,
    message: error.message,
    cause,
  }))
}

function ownPropertyAudit(record) {
  return Object.fromEntries(Object.keys(record).sort().map((key) => [key, Object.freeze({
    ownProperty: Object.prototype.hasOwnProperty.call(record, key),
    type: record[key] === null ? 'null' : Array.isArray(record[key]) ? 'array' : typeof record[key],
  })]))
}

async function readBody(response) {
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.byteLength > MAX_RESPONSE_BYTES) {
    throw new Error(`MODEL_CATALOG_AUDIT_RESPONSE_TOO_LARGE:${buffer.byteLength}`)
  }
  const text = buffer.toString('utf8')
  let json = null
  try { json = JSON.parse(text) } catch { /* raw text is retained below */ }
  return { buffer, text, json }
}

async function auditProvider(providerKey, config, outputDir) {
  const key = process.env[config.env]
  if (!key) return Object.freeze({ providerKey, status: 'skipped', reason: `missing ${config.env}` })

  const providerDir = path.join(outputDir, providerKey)
  await mkdir(providerDir, { recursive: true })
  const pages = []
  const observations = []
  let url = config.initialUrl
  let complete = false

  for (let requestNumber = 1; requestNumber <= MAX_REQUESTS_PER_PROVIDER && url; requestNumber += 1) {
    const requestedAt = new Date().toISOString()
    const response = await fetch(url, {
      method: 'GET',
      headers: config.headers(key),
      redirect: 'error',
      ...(auditDispatcher ? { dispatcher: auditDispatcher } : {}),
    })
    const body = await readBody(response)
    const safeBody = sanitize(body.json ?? body.text)
    const rawFile = `page-${requestNumber}.json`
    await writeFile(path.join(providerDir, rawFile), `${JSON.stringify(safeBody, null, 2)}\n`, 'utf8')

    const requestId = response.headers.get('x-request-id') ?? response.headers.get('request-id')
    pages.push(Object.freeze({
      requestNumber,
      requestedAt,
      endpoint: sanitizeUrl(url),
      httpStatus: response.status,
      httpStatusText: response.statusText,
      requestId,
      responseBytes: body.buffer.byteLength,
      responseSha256: sha256(body.buffer),
      rawFile,
    }))

    if (!response.ok) {
      return Object.freeze({ providerKey, status: 'failed', complete: false, pages, providerError: safeBody })
    }
    if (!body.json || typeof body.json !== 'object') {
      return Object.freeze({ providerKey, status: 'failed', complete: false, pages, error: 'MODEL_CATALOG_AUDIT_JSON_INVALID' })
    }

    const items = config.items(body.json)
    if (!Array.isArray(items) || items.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
      return Object.freeze({ providerKey, status: 'failed', complete: false, pages, error: 'MODEL_CATALOG_AUDIT_ITEMS_INVALID' })
    }
    for (const item of items) {
      observations.push(Object.freeze({ raw: sanitize(item), ownProperties: ownPropertyAudit(item) }))
    }

    url = config.next(body.json)
    complete = url === null
  }

  const report = Object.freeze({
    providerKey,
    status: complete ? 'complete' : 'incomplete',
    complete,
    verifiedAt: new Date().toISOString(),
    requestCount: pages.length,
    maxRequestCount: MAX_REQUESTS_PER_PROVIDER,
    modelCount: observations.length,
    pages,
    aggregateResponseDigest: sha256(pages.map((page) => page.responseSha256).join('\n')),
    observations,
  })
  await writeFile(path.join(providerDir, 'audit.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return report
}

function parseArgs(argv) {
  const providers = []
  let outputDir = DEFAULT_OUTPUT_DIR
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--provider') providers.push(argv[++index])
    else if (argv[index] === '--output') outputDir = path.resolve(argv[++index])
    else throw new Error(`Unknown argument: ${argv[index]}`)
  }
  const selected = providers.length === 0 || providers.includes('all') ? Object.keys(PROVIDERS) : providers
  for (const provider of selected) if (!PROVIDERS[provider]) throw new Error(`Unknown provider: ${provider}`)
  return { providers: [...new Set(selected)], outputDir }
}

const args = parseArgs(process.argv.slice(2))
await mkdir(args.outputDir, { recursive: true })
const results = []
for (const providerKey of args.providers) {
  try {
    results.push(await auditProvider(providerKey, PROVIDERS[providerKey], args.outputDir))
  } catch (error) {
    results.push(Object.freeze({
      providerKey,
      status: 'failed',
      complete: false,
      error: safeErrorFact(error),
    }))
  }
}
const summary = Object.freeze({
  auditedAt: new Date().toISOString(),
  outputDir: args.outputDir,
  requestLimitPerProvider: MAX_REQUESTS_PER_PROVIDER,
  transport: auditDispatcher ? 'explicit_audit_proxy' : 'direct',
  results: results.map(({ observations: _observations, providerError: _providerError, ...result }) => result),
})
await writeFile(path.join(args.outputDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)

if (results.some((result) => result.status === 'failed' || result.status === 'incomplete')) process.exitCode = 1
