const { app, safeStorage, session } = require('electron')
const fs = require('fs')
const os = require('os')
const path = require('path')

const PROMPT = 'Reply with OK.'
const PROVIDER_KEY = 'openai_responses'
const DEFAULT_BASE_URL = 'https://api.openai.com/v1'
const DEFAULT_OUT_DIR = path.join('docs', 'diagnostics', 'openai-responses-reasoning-effort-probe', 'latest')
const DELAY_MS = 750
const MAX_PREVIEW_CHARS = 160
const MAX_SAFE_MESSAGE_CHARS = 500

const CASES = [
  { caseName: 'omitted', reasoning: undefined, requestDelta: 'reasoning omitted' },
  { caseName: 'reasoning_empty', reasoning: {}, requestDelta: 'reasoning: {}' },
  { caseName: 'effort_none', reasoning: { effort: 'none' }, requestDelta: 'reasoning.effort=none' },
  { caseName: 'effort_minimal', reasoning: { effort: 'minimal' }, requestDelta: 'reasoning.effort=minimal' },
  { caseName: 'effort_low', reasoning: { effort: 'low' }, requestDelta: 'reasoning.effort=low' },
  { caseName: 'effort_medium', reasoning: { effort: 'medium' }, requestDelta: 'reasoning.effort=medium' },
  { caseName: 'effort_high', reasoning: { effort: 'high' }, requestDelta: 'reasoning.effort=high' },
  { caseName: 'effort_xhigh', reasoning: { effort: 'xhigh' }, requestDelta: 'reasoning.effort=xhigh' },
  { caseName: 'effort_auto_negative', reasoning: { effort: 'auto' }, requestDelta: 'reasoning.effort=auto' },
]

const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
const starverseUserData = path.join(appData, 'Starverse')
app.setName('Starverse')
app.setPath('userData', starverseUserData)

function parseArgs(argv) {
  const args = {
    models: null,
    outDir: DEFAULT_OUT_DIR,
    includeAutoNegative: true,
    help: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i]
    if (value === '--help' || value === '-h') {
      args.help = true
    } else if (value === '--include-auto-negative') {
      args.includeAutoNegative = true
    } else if (value.startsWith('--models=')) {
      args.models = splitCsv(value.slice('--models='.length))
    } else if (value === '--models') {
      args.models = splitCsv(argv[i + 1] || '')
      i += 1
    } else if (value.startsWith('--out=')) {
      args.outDir = value.slice('--out='.length)
    } else if (value === '--out') {
      args.outDir = argv[i + 1] || DEFAULT_OUT_DIR
      i += 1
    }
  }
  return args
}

function splitCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function printHelp() {
  console.log([
    'Usage:',
    '  npm run diagnose:openai-responses-o-reasoning -- [--models=o3,o4-mini] [--out=docs/...]',
    '',
    'Default model source is the current Starverse userData config/catalog only.',
    'This probe never calls /models and never sends GPT or pro model requests.',
  ].join('\n'))
}

function sanitizeMessage(value) {
  return String(value ?? '')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/sk-[A-Za-z0-9._-]+/g, 'sk-[REDACTED]')
    .replace(/AIza[0-9A-Za-z_-]+/g, '[REDACTED_GOOGLE_KEY]')
    .replace(/([?&](?:key|api_key|token|access_token|client_secret)=)[^&\s]+/gi, '$1[REDACTED]')
    .slice(0, MAX_SAFE_MESSAGE_CHARS)
}

function sanitizePreview(value) {
  return sanitizeMessage(value).replace(/\s+/g, ' ').trim().slice(0, MAX_PREVIEW_CHARS)
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function readConfig() {
  const configPath = path.join(starverseUserData, 'config.json')
  return {
    configPath,
    config: readJsonFile(configPath),
  }
}

function readSecureKey(config, providerKey) {
  const record = config?.providerCredentials?.v1?.[providerKey]
  if (!record) return { ok: false, reason: 'secure-store record missing' }
  if (record.providerKey && record.providerKey !== providerKey) return { ok: false, reason: 'providerKey mismatch' }
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

async function applyProxyPolicy(config) {
  const policy = config?.networkProxyPolicy || config?.proxyPolicy || null
  const mode = policy && typeof policy === 'object' && !Array.isArray(policy) ? policy.mode : null
  if (!mode) return { applied: false, mode: 'default_session_existing' }

  const proxyConfig = {}
  if (mode === 'direct' || mode === 'system' || mode === 'auto_detect') {
    proxyConfig.mode = mode
  } else if (mode === 'fixed_servers') {
    proxyConfig.mode = 'fixed_servers'
    if (typeof policy.proxyRules === 'string') proxyConfig.proxyRules = policy.proxyRules
    if (typeof policy.proxyBypassRules === 'string') proxyConfig.proxyBypassRules = policy.proxyBypassRules
  } else if (mode === 'pac_script') {
    proxyConfig.mode = 'pac_script'
    if (typeof policy.pacScript === 'string') proxyConfig.pacScript = policy.pacScript
    if (typeof policy.proxyBypassRules === 'string') proxyConfig.proxyBypassRules = policy.proxyBypassRules
  } else {
    return { applied: false, mode: sanitizeMessage(mode), warning: 'unsupported proxy policy mode for diagnostic script' }
  }

  await session.defaultSession.setProxy(proxyConfig)
  if (typeof session.defaultSession.forceReloadProxyConfig === 'function') {
    await session.defaultSession.forceReloadProxyConfig()
  }
  return { applied: true, mode: proxyConfig.mode }
}

function resolveBaseUrl(config) {
  const candidates = [
    config?.openAIResponsesBaseUrl,
    config?.openaiResponsesBaseUrl,
    config?.providers?.openai_responses?.baseUrl,
    config?.providers?.openaiResponses?.baseUrl,
    config?.openAIBaseUrl,
    config?.openaiBaseUrl,
  ]
  const value = candidates.find((item) => typeof item === 'string' && item.trim())
  return (value || DEFAULT_BASE_URL).trim().replace(/\/+$/, '')
}

function responseUrl(baseUrl) {
  return `${baseUrl.replace(/\/+$/, '')}/responses`
}

function openAIHeaders(apiKey, config) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }
  const organization = config?.openAIOrganization || config?.openaiOrganization || config?.providers?.openai_responses?.organization
  const project = config?.openAIProject || config?.openaiProject || config?.providers?.openai_responses?.project
  if (typeof organization === 'string' && organization.trim()) headers['OpenAI-Organization'] = organization.trim()
  if (typeof project === 'string' && project.trim()) headers['OpenAI-Project'] = project.trim()
  return headers
}

function classifyModel(modelId, source) {
  const id = String(modelId || '').trim()
  const lower = id.toLowerCase()
  if (!id) return { status: 'skip', reason: 'empty_model_id', result: 'skipped_forbidden_model', source }
  if (lower.startsWith('gpt-')) return { status: 'skip', reason: 'gpt_model_forbidden', result: 'skipped_forbidden_model', source }
  if (lower.includes('-pro') || lower.includes('.pro') || lower.includes('_pro') || /(^|[-._/])pro($|[-._/])/.test(lower)) {
    return { status: 'skip', reason: 'pro_model_forbidden', result: 'skipped_forbidden_model', source }
  }
  if (!/^o\d(?:$|[-._])/.test(lower)) {
    return { status: 'skip', reason: 'not_o_series', result: 'skipped_forbidden_model', source }
  }
  return { status: 'allow', reason: 'allowed_non_pro_o_series', source }
}

function uniqueByModel(candidates) {
  const seen = new Set()
  const out = []
  for (const candidate of candidates) {
    const modelId = String(candidate.modelId || '').trim()
    const key = modelId.toLowerCase()
    if (!modelId || seen.has(key)) continue
    seen.add(key)
    out.push({ ...candidate, modelId })
  }
  return out
}

function tableExists(db, name) {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name)
  return Boolean(row)
}

function parseJsonMaybe(value) {
  if (!value || typeof value !== 'string') return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function readDatabaseCandidates(dbPath) {
  if (!fs.existsSync(dbPath)) return { candidates: [], replayContexts: [], notes: [`chat.db not found at ${dbPath}`] }

  let Database
  try {
    Database = require('better-sqlite3')
  } catch (error) {
    return {
      candidates: [],
      replayContexts: [],
      notes: [`better-sqlite3 unavailable: ${sanitizeMessage(error?.message)}`],
    }
  }

  const candidates = []
  const replayContexts = []
  const notes = []
  let globalLayer = null
  let db
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true })

    if (tableExists(db, 'catalog_models') && tableExists(db, 'catalog_scope_meta')) {
      const activeScopes = db.prepare(`
        SELECT active_snapshot_id, model_count, visible_model_count, last_sync_at_ms
        FROM catalog_scope_meta
        WHERE provider_key = ?
          AND active_snapshot_id IS NOT NULL
        ORDER BY last_sync_at_ms DESC
      `).all(PROVIDER_KEY)
      const activeSnapshotIds = Array.from(new Set(
        activeScopes
          .map((row) => String(row.active_snapshot_id || '').trim())
          .filter(Boolean),
      ))
      if (activeSnapshotIds.length > 0) {
        const placeholders = activeSnapshotIds.map(() => '?').join(', ')
        const rows = db.prepare(`
          SELECT model_id, status, visibility, display_name, snapshot_id
          FROM catalog_models
          WHERE provider_key = ?
            AND snapshot_id IN (${placeholders})
            AND lower(model_id) GLOB 'o[0-9]*'
          ORDER BY model_id ASC
        `).all(PROVIDER_KEY, ...activeSnapshotIds)
        for (const row of rows) {
          candidates.push({
            modelId: row.model_id,
            source: 'catalog_models_active_snapshot',
            status: row.status,
            visibility: row.visibility,
            displayName: row.display_name,
            snapshotId: row.snapshot_id,
          })
        }
        notes.push(`catalog_models active OpenAI Responses o-series candidates=${rows.length}`)
      } else {
        notes.push('catalog_scope_meta has no active OpenAI Responses snapshot')
      }
    }

    if (tableExists(db, 'models')) {
      const rows = db.prepare(`
        SELECT model_id, status, visibility
        FROM models
        WHERE provider_key = ?
        ORDER BY model_id ASC
      `).all(PROVIDER_KEY)
      for (const row of rows) {
        candidates.push({
          modelId: row.model_id,
          source: 'provider_catalog',
          status: row.status,
          visibility: row.visibility,
        })
      }
    }

    if (tableExists(db, 'convo')) {
      const rows = db.prepare(`
        SELECT id, project_id, meta, updated_at
        FROM convo
        WHERE meta IS NOT NULL
        ORDER BY updated_at DESC
      `).all()
      for (const row of rows) {
        const meta = parseJsonMaybe(row.meta)
        const modelId = extractSelectedOpenAIResponsesModel(meta)
        if (!modelId) continue
        candidates.push({
          modelId,
          source: 'conversation_meta',
          convoId: row.id,
          projectId: row.project_id,
          updatedAt: row.updated_at,
        })
        replayContexts.push({
          modelId,
          source: 'latest_matching_conversation',
          convoId: row.id,
          projectId: row.project_id,
          updatedAt: row.updated_at,
          conversationLayer: extractGenerationParamsLayer(meta),
        })
      }
    }

    globalLayer = readSettingsLayer(db, 'generation_params.defaults')
    const projectLayers = readProjectLayers(db)
    for (const context of replayContexts) {
      context.globalLayer = globalLayer
      context.projectLayer = context.projectId ? projectLayers.get(String(context.projectId)) || null : null
    }
  } catch (error) {
    notes.push(`database read failed: ${sanitizeMessage(error?.message)}`)
  } finally {
    if (db) db.close()
  }

  return { candidates: uniqueByModel(candidates), replayContexts, globalLayer, notes }
}

function extractSelectedOpenAIResponsesModel(meta) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null
  const providerId = meta.selectedProviderId || meta.providerId || meta.runtimeProviderId
  const modelKey = meta.selectedModelKey || meta.modelId || meta.runtimeModelId
  if (providerId !== PROVIDER_KEY) return null
  if (typeof modelKey !== 'string' || !modelKey.trim()) return null
  return modelKey.includes('::') ? modelKey.split('::').pop() : modelKey.trim()
}

function extractGenerationParamsLayer(meta) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null
  return unwrapGenerationParamsLayer(
    meta.generationParamsOverride ||
    meta.generationParams?.override ||
    meta.generationParams ||
    null,
  )
}

function readSettingsLayer(db, key) {
  if (!tableExists(db, 'settings_kv')) return null
  try {
    const row = db.prepare('SELECT value_json FROM settings_kv WHERE key = ?').get(key)
    return unwrapGenerationParamsLayer(parseJsonMaybe(row?.value_json))
  } catch {
    return null
  }
}

function readProjectLayers(db) {
  const layers = new Map()
  if (!tableExists(db, 'project')) return layers
  try {
    const rows = db.prepare('SELECT id, meta FROM project WHERE meta IS NOT NULL').all()
    for (const row of rows) {
      const meta = parseJsonMaybe(row.meta)
      const layer = extractGenerationParamsLayer(meta)
      if (layer) layers.set(String(row.id), layer)
    }
  } catch {
    return layers
  }
  return layers
}

function unwrapGenerationParamsLayer(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw
  const candidate = record.params && typeof record.params === 'object' && !Array.isArray(record.params)
    ? record.params
    : record
  const out = {}
  for (const key of ['reasoningEffort', 'reasoningSummary']) {
    const setting = normalizeGenerationParamSetting(candidate[key])
    if (setting) out[key] = setting
  }
  return Object.keys(out).length > 0 ? out : null
}

function normalizeGenerationParamSetting(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  if (raw.mode === 'inherit') return { mode: 'inherit' }
  if (raw.mode === 'omit') return { mode: 'omit' }
  if (raw.mode === 'custom') return { mode: 'custom', value: raw.value }
  return null
}

function discoverModels(args) {
  if (args.models && args.models.length > 0) {
    return {
      candidates: args.models.map((modelId) => ({ modelId, source: 'cli_models' })),
      replayContexts: [],
      notes: ['model source: --models argument; no /models discovery performed'],
    }
  }
  const dbPath = path.join(starverseUserData, 'chat.db')
  const discovered = readDatabaseCandidates(dbPath)
  discovered.notes.unshift('model source: current Starverse userData chat.db/config only; no /models discovery performed')
  return discovered
}

function buildRequestBody(modelId, reasoning) {
  const body = {
    model: modelId,
    input: [{ role: 'user', content: PROMPT }],
    stream: false,
  }
  if (reasoning !== undefined) body.reasoning = reasoning
  return body
}

async function runProbeCase({ modelId, testCase, apiKey, config, baseUrl }) {
  const started = Date.now()
  const body = buildRequestBody(modelId, testCase.reasoning)
  try {
    const response = await session.defaultSession.fetch(responseUrl(baseUrl), {
      method: 'POST',
      headers: openAIHeaders(apiKey, config),
      body: JSON.stringify(body),
    })
    const bodyText = await response.text()
    const latencyMs = Date.now() - started
    return classifyHttpResponse({
      modelId,
      caseName: testCase.caseName,
      requestDelta: testCase.requestDelta,
      response,
      bodyText,
      latencyMs,
      phase: response.ok ? 'non_stream' : 'post_stream',
    })
  } catch (error) {
    return {
      modelId,
      caseName: testCase.caseName,
      requestDelta: testCase.requestDelta,
      result: 'network_error',
      httpStatus: null,
      providerCode: null,
      safeMessage: sanitizeMessage(error?.message || 'Network request failed.'),
      phase: 'request',
      latencyMs: Date.now() - started,
      outputPreview: '',
      notes: 'session.defaultSession.fetch threw before receiving an HTTP response',
    }
  }
}

function classifyHttpResponse({ modelId, caseName, requestDelta, response, bodyText, latencyMs, phase }) {
  const parsed = parseProviderBody(bodyText)
  const providerCode = extractProviderCode(parsed, response.status)
  const safeMessage = extractSafeProviderMessage(parsed, bodyText, response)
  if (response.ok) {
    const outputPreview = extractOutputPreview(parsed, bodyText)
    return {
      modelId,
      caseName,
      requestDelta,
      result: outputPreview ? 'supported' : 'parser_error',
      httpStatus: response.status,
      providerCode,
      safeMessage: outputPreview ? 'OK' : 'HTTP 2xx but no output text was parsed.',
      phase: outputPreview ? phase : 'parser',
      latencyMs,
      outputPreview,
      notes: parsed.kind,
    }
  }

  return {
    modelId,
    caseName,
    requestDelta,
    result: classifyProviderError(response.status, providerCode, safeMessage),
    httpStatus: response.status,
    providerCode,
    safeMessage,
    phase,
    latencyMs,
    outputPreview: '',
    notes: parsed.kind,
  }
}

function parseProviderBody(bodyText) {
  const trimmed = String(bodyText || '').trim()
  if (!trimmed) return { kind: 'empty', value: null }
  if (trimmed.startsWith('data:') || trimmed.includes('\ndata:')) {
    const events = []
    for (const line of trimmed.split(/\r?\n/)) {
      const next = line.trim()
      if (!next.startsWith('data:')) continue
      const data = next.slice('data:'.length).trim()
      if (!data || data === '[DONE]') continue
      try {
        events.push(JSON.parse(data))
      } catch {
        events.push({ type: 'unparsed_sse_data', data: sanitizePreview(data) })
      }
    }
    return { kind: 'sse', value: events }
  }
  try {
    return { kind: 'json', value: JSON.parse(trimmed) }
  } catch {
    return { kind: 'text', value: sanitizeMessage(trimmed) }
  }
}

function extractProviderCode(parsed, status) {
  const error = firstErrorObject(parsed)
  return sanitizeMessage(error?.code || error?.type || error?.param || (status ? `http_${status}` : ''))
}

function extractSafeProviderMessage(parsed, bodyText, response) {
  const error = firstErrorObject(parsed)
  const raw = error?.message || error?.error?.message || (parsed.kind === 'text' ? parsed.value : '') || response.statusText || bodyText
  return sanitizeMessage(raw)
}

function firstErrorObject(parsed) {
  const value = parsed?.value
  if (!value) return null
  if (Array.isArray(value)) {
    for (const event of value) {
      if (event?.error) return event.error
      if (event?.type === 'error') return event
    }
    return null
  }
  if (value.error) return value.error
  return value
}

function classifyProviderError(status, providerCode, safeMessage) {
  const codeAndMessage = `${providerCode || ''} ${safeMessage || ''}`.toLowerCase()
  if (status === 401) return 'auth_error'
  if (status === 429 || codeAndMessage.includes('rate_limit')) return 'rate_limited'
  if (
    status === 403 ||
    status === 404 ||
    codeAndMessage.includes('model_not_found') ||
    codeAndMessage.includes('not found') ||
    codeAndMessage.includes('organization must be verified') ||
    codeAndMessage.includes('does not have access') ||
    codeAndMessage.includes('no access') ||
    codeAndMessage.includes('not permitted') ||
    codeAndMessage.includes('permission')
  ) {
    return 'unavailable'
  }
  if (status === 400) {
    if (
      codeAndMessage.includes('unsupported_value') ||
      codeAndMessage.includes('unsupported value') ||
      codeAndMessage.includes('not supported') ||
      (codeAndMessage.includes('invalid_value') && codeAndMessage.includes('supported values'))
    ) {
      return 'rejected_unsupported_value'
    }
    if (
      codeAndMessage.includes('unknown parameter') ||
      codeAndMessage.includes('unknown_param') ||
      codeAndMessage.includes('invalid parameter') ||
      codeAndMessage.includes('invalid_param') ||
      codeAndMessage.includes('unrecognized')
    ) {
      return 'rejected_unknown_param'
    }
    return 'rejected_other_400'
  }
  return 'network_error'
}

function extractOutputPreview(parsed, bodyText) {
  const parts = []
  const visitResponse = (response) => {
    if (!response || typeof response !== 'object') return
    if (typeof response.output_text === 'string') parts.push(response.output_text)
    const output = Array.isArray(response.output) ? response.output : []
    for (const item of output) {
      const content = Array.isArray(item?.content) ? item.content : []
      for (const part of content) {
        if (typeof part?.text === 'string') parts.push(part.text)
        if (typeof part?.output_text === 'string') parts.push(part.output_text)
      }
    }
  }

  if (parsed.kind === 'sse' && Array.isArray(parsed.value)) {
    for (const event of parsed.value) {
      if (typeof event?.delta === 'string' && event.type === 'response.output_text.delta') parts.push(event.delta)
      if (typeof event?.text === 'string') parts.push(event.text)
      if (event?.response) visitResponse(event.response)
    }
  } else if (parsed.kind === 'json') {
    visitResponse(parsed.value)
  } else if (parsed.kind === 'text') {
    parts.push(bodyText)
  }
  return sanitizePreview(parts.join(''))
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function makeSkippedResult(candidate, reason) {
  return {
    modelId: candidate.modelId,
    caseName: 'model_filter',
    requestDelta: 'no request sent',
    result: 'skipped_forbidden_model',
    httpStatus: null,
    providerCode: null,
    safeMessage: reason,
    phase: 'model_filter',
    latencyMs: 0,
    outputPreview: '',
    notes: `source=${candidate.source || 'unknown'}`,
  }
}

function findReplayContext(modelId, contexts) {
  const lower = modelId.toLowerCase()
  return contexts.find((context) => String(context.modelId || '').toLowerCase() === lower) || null
}

function resolveCurrentReasoningReplay(modelId, context) {
  const layers = [
    { source: 'conversation', layer: context?.conversationLayer || null },
    { source: 'project', layer: context?.projectLayer || null },
    { source: 'global', layer: context?.globalLayer || null },
  ]
  for (const item of layers) {
    const setting = item.layer?.reasoningEffort
    if (!setting || setting.mode === 'inherit') continue
    if (setting.mode === 'omit') {
      return {
        source: item.source,
        model: modelId,
        hasReasoning: false,
        effort: null,
        effortAutoPresent: false,
        reasoning: undefined,
        notes: 'current config explicitly omits reasoningEffort',
      }
    }
    if (setting.mode === 'custom') {
      const effort = String(setting.value || '').trim()
      if (effort === 'auto') {
        return {
          source: item.source,
          model: modelId,
          hasReasoning: false,
          effort: null,
          effortAutoPresent: false,
          reasoning: undefined,
          notes: 'current config is provider auto; Starverse should omit reasoning.effort',
        }
      }
      if (['none', 'minimal', 'low', 'medium', 'high', 'xhigh'].includes(effort)) {
        return {
          source: item.source,
          model: modelId,
          hasReasoning: true,
          effort,
          effortAutoPresent: false,
          reasoning: { effort },
          notes: `current config sends explicit reasoning.effort from ${item.source}`,
        }
      }
      return {
        source: item.source,
        model: modelId,
        hasReasoning: false,
        effort: null,
        effortAutoPresent: effort === 'auto',
        reasoning: undefined,
        notes: `current config has unsupported diagnostic effort value: ${sanitizeMessage(effort)}`,
      }
    }
  }
  return {
    source: context ? context.source : 'none',
    model: modelId,
    hasReasoning: false,
    effort: null,
    effortAutoPresent: false,
    reasoning: undefined,
    notes: 'no current reasoningEffort override found in conversation/project/global layers',
  }
}

async function runReplay({ modelId, replay, apiKey, config, baseUrl }) {
  const testCase = {
    caseName: 'current_config_replay',
    reasoning: replay.reasoning,
    requestDelta: replay.hasReasoning ? `current-config reasoning.effort=${replay.effort}` : 'current-config reasoning.effort omitted',
  }
  const result = await runProbeCase({ modelId, testCase, apiKey, config, baseUrl })
  return {
    ...result,
    safeRequestSummary: {
      model: modelId,
      hasReasoning: replay.hasReasoning,
      effort: replay.effort,
      effortAutoPresent: replay.effortAutoPresent,
      source: replay.source,
    },
    critical: replay.effortAutoPresent,
    notes: `${result.notes}; ${replay.notes}`,
  }
}

function summarizeResults(results, replays) {
  const byModel = new Map()
  for (const row of results) {
    if (!byModel.has(row.modelId)) byModel.set(row.modelId, {})
    byModel.get(row.modelId)[row.caseName] = row.result
  }
  return {
    models: Object.fromEntries(byModel.entries()),
    replayCriticalCount: replays.filter((row) => row.critical).length,
  }
}

function buildMarkdownReport(payload) {
  const lines = []
  lines.push('# OpenAI Responses o-series reasoning.effort probe')
  lines.push('')
  lines.push(`Generated at: ${payload.generatedAt}`)
  lines.push(`Model source: ${payload.modelSource}`)
  lines.push(`No /models discovery performed: ${payload.noModelsDiscovery ? 'yes' : 'no'}`)
  lines.push('')

  lines.push('## Tested Models')
  if (payload.testedModels.length === 0) {
    lines.push('')
    lines.push('当前用户配置中没有可测试的非 pro o 系列模型。')
  } else {
    for (const modelId of payload.testedModels) lines.push(`- ${modelId}`)
  }
  lines.push('')

  lines.push('## Skipped Models')
  if (payload.skippedModels.length === 0) {
    lines.push('')
    lines.push('- none')
  } else {
    for (const item of payload.skippedModels) {
      lines.push(`- ${item.modelId}: ${item.reason} (${item.source || 'unknown'})`)
    }
  }
  lines.push('')

  lines.push('## Support Matrix')
  for (const modelId of payload.testedModels) {
    lines.push('')
    lines.push(`### ${modelId}`)
    lines.push('')
    lines.push('| Case | Result | HTTP | Provider Code | Message | Preview |')
    lines.push('| --- | --- | --- | --- | --- | --- |')
    const rows = payload.results.filter((item) => item.modelId === modelId)
    for (const row of rows) {
      lines.push(`| ${row.caseName} | ${row.result} | ${row.httpStatus ?? ''} | ${escapeMd(row.providerCode || '')} | ${escapeMd(row.safeMessage || '')} | ${escapeMd(row.outputPreview || '')} |`)
    }
    if (rows.length === 0 && payload.scriptStatus === 'failed_config') {
      lines.push('| n/a | skipped_builder_not_supported |  |  | Diagnostic did not send requests because provider credential/config could not be read. |  |')
    }
  }
  lines.push('')

  lines.push('## o3 Result')
  const o3Rows = payload.results.filter((row) => row.modelId.toLowerCase() === 'o3')
  if (o3Rows.length === 0) {
    lines.push('')
    if (payload.testedModels.some((modelId) => modelId.toLowerCase() === 'o3') && payload.scriptStatus === 'failed_config') {
      lines.push('- o3 was selected for a non-streaming probe, but no request was sent because provider credential/config could not be read.')
    } else {
      lines.push('- o3 was not tested because it was not present in the allowed current-user model set.')
    }
  } else {
    for (const row of o3Rows) {
      lines.push(`- ${row.caseName}: ${row.result}${row.httpStatus ? ` (HTTP ${row.httpStatus})` : ''}${row.providerCode ? `, providerCode=${row.providerCode}` : ''}`)
    }
  }
  lines.push('')

  lines.push('## Required Checks')
  const omitted = payload.results.filter((row) => row.caseName === 'omitted')
  const autoNegative = payload.results.filter((row) => row.caseName === 'effort_auto_negative')
  lines.push(`- omitted success: ${omitted.length > 0 ? omitted.map((row) => `${row.modelId}=${row.result}`).join(', ') : 'not tested'}`)
  lines.push(`- auto_negative failure: ${autoNegative.length > 0 ? autoNegative.map((row) => `${row.modelId}=${row.result}`).join(', ') : 'not tested'}`)
  lines.push('')

  lines.push('## Current Config Replay')
  if (payload.currentConfigReplays.length === 0) {
    lines.push('')
    lines.push('- not run')
  } else {
    lines.push('')
    lines.push('| Model | hasReasoning | effort | effort=auto present | Result | HTTP | Provider Code | Message | Critical |')
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |')
    for (const row of payload.currentConfigReplays) {
      const summary = row.safeRequestSummary || {}
      lines.push(`| ${escapeMd(row.modelId)} | ${summary.hasReasoning ? 'yes' : 'no'} | ${escapeMd(summary.effort || '')} | ${summary.effortAutoPresent ? 'yes' : 'no'} | ${row.result} | ${row.httpStatus ?? ''} | ${escapeMd(row.providerCode || '')} | ${escapeMd(row.safeMessage || '')} | ${row.critical ? 'critical' : ''} |`)
    }
  }
  lines.push('')

  lines.push('## Policy Recommendation')
  lines.push('')
  lines.push('- `auto` must be represented in Starverse as omitted `reasoning.effort`, never as the provider wire value `"auto"`.')
  lines.push('- o-series models should only expose explicit effort values that this probe reports as `supported` for the same model.')
  lines.push('- Failed effort values should fail-before-fetch in Starverse policy once the policy is updated.')
  lines.push('- Pro models remain forbidden for this probe and no capability should be inferred for them from these results.')
  lines.push('')

  if (payload.notes.length > 0) {
    lines.push('## Notes')
    lines.push('')
    for (const note of payload.notes) lines.push(`- ${escapeMd(note)}`)
    lines.push('')
  }
  return `${lines.join('\n')}\n`
}

function escapeMd(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

function writeReports(outDir, payload) {
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'results.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  fs.writeFileSync(path.join(outDir, 'report.md'), buildMarkdownReport(payload), 'utf8')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }

  const outDir = path.resolve(process.cwd(), args.outDir)
  const generatedAt = new Date().toISOString()
  const notes = []
  const results = []
  const currentConfigReplays = []
  const skippedModels = []
  let testedModels = []
  let scriptStatus = 'ok'
  let exitCode = 0
  let config = null
  let baseUrl = DEFAULT_BASE_URL
  let modelSource = args.models ? '--models' : 'current_user_config'

  await app.whenReady()

  try {
    const configRead = readConfig()
    config = configRead.config
    notes.push(`configPath=${configRead.configPath}`)
    baseUrl = resolveBaseUrl(config)

    const proxyStatus = await applyProxyPolicy(config)
    notes.push(`proxyPolicy=${proxyStatus.applied ? 'applied' : 'not_applied'}:${proxyStatus.mode}`)
    notes.push('current-config replay sends only model/input/stream=false plus resolved reasoning.effort; non-reasoning generation parameters are intentionally omitted by this diagnostic scope')

    const discovery = discoverModels(args)
    notes.push(...discovery.notes)

    const classified = uniqueByModel(discovery.candidates).map((candidate) => ({
      candidate,
      verdict: classifyModel(candidate.modelId, candidate.source),
    }))
    for (const item of classified) {
      if (item.verdict.status === 'allow') continue
      skippedModels.push({
        modelId: item.candidate.modelId,
        reason: item.verdict.reason,
        source: item.candidate.source,
      })
      if (item.verdict.reason === 'gpt_model_forbidden' || item.verdict.reason === 'pro_model_forbidden') {
        results.push(makeSkippedResult(item.candidate, item.verdict.reason))
      }
    }

    const allowedCandidates = classified
      .filter((item) => item.verdict.status === 'allow')
      .map((item) => item.candidate)
    testedModels = allowedCandidates.map((candidate) => candidate.modelId)

    const key = readSecureKey(config, PROVIDER_KEY)
    if (!key.ok) {
      scriptStatus = 'failed_config'
      exitCode = 2
      notes.push(`credential=${key.reason}`)
    } else if (testedModels.length > 0) {
      const cases = args.includeAutoNegative ? CASES : CASES.filter((item) => item.caseName !== 'effort_auto_negative')
      for (const candidate of allowedCandidates) {
        for (const testCase of cases) {
          const row = await runProbeCase({
            modelId: candidate.modelId,
            testCase,
            apiKey: key.apiKey,
            config,
            baseUrl,
          })
          results.push(row)
          await delay(DELAY_MS)
        }
      }

      for (const candidate of allowedCandidates) {
        const context = findReplayContext(candidate.modelId, discovery.replayContexts) || {
          modelId: candidate.modelId,
          source: 'catalog_models_active_snapshot',
          globalLayer: discovery.globalLayer || null,
          projectLayer: null,
          conversationLayer: null,
        }
        const replay = resolveCurrentReasoningReplay(candidate.modelId, context)
        const row = await runReplay({
          modelId: candidate.modelId,
          replay,
          apiKey: key.apiKey,
          config,
          baseUrl,
        })
        currentConfigReplays.push(row)
        if (row.critical) {
          scriptStatus = 'critical'
          exitCode = 3
        }
        await delay(DELAY_MS)
      }
    }
  } catch (error) {
    scriptStatus = 'failed_exception'
    exitCode = 2
    notes.push(`script exception: ${sanitizeMessage(error?.stack || error?.message || error)}`)
  }

  const payload = {
    generatedAt,
    prompt: PROMPT,
    provider: PROVIDER_KEY,
    baseUrlHost: safeUrlHost(baseUrl),
    modelSource,
    noModelsDiscovery: true,
    testedModels,
    skippedModels,
    results,
    currentConfigReplays,
    summary: summarizeResults(results, currentConfigReplays),
    scriptStatus,
    notes,
  }
  writeReports(outDir, payload)
  console.log(`Wrote ${path.join(outDir, 'results.json')}`)
  console.log(`Wrote ${path.join(outDir, 'report.md')}`)
  process.exitCode = exitCode
}

function safeUrlHost(value) {
  try {
    const url = new URL(value)
    return url.host
  } catch {
    return 'invalid_base_url'
  }
}

main()
  .catch((error) => {
    console.error(sanitizeMessage(error?.stack || error?.message || error))
    process.exitCode = 2
  })
  .finally(() => {
    app.quit()
  })
