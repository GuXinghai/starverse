import { createHash, randomUUID } from 'node:crypto'
import type BetterSqlite3 from 'better-sqlite3'
import type { Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'
import type { ProviderCredentialKey } from '../credentials/providerCredentialContract'
import { createElectronSessionProviderFetch, type ProviderFetch } from '../net/providerHttpTransport'
import {
  OPENAI_RESPONSES_ENDPOINT_ID, OPENAI_RESPONSES_PROVIDER_KEY,
  listOpenAIProviderModelAvailability,
} from '../../src/next/provider/openai-responses/openAIResponsesModelSource'
import {
  ANTHROPIC_MESSAGES_ENDPOINT_ID, ANTHROPIC_MESSAGES_PROVIDER_KEY,
  listAnthropicProviderModelAvailability,
} from '../../src/next/provider/anthropic/anthropicModelSource'
import {
  GOOGLE_AI_STUDIO_ENDPOINT_ID, GOOGLE_AI_STUDIO_PROVIDER_KEY,
  listGeminiProviderModelAvailability,
} from '../../src/next/provider/gemini/geminiModelSource'
import {
  DEEPSEEK_OFFICIAL_ENDPOINT_ID, DEEPSEEK_OFFICIAL_PROVIDER_KEY,
  listDeepSeekProviderModelAvailability,
} from '../../src/next/provider/deepseek/deepSeekModelSource'
import type { RegisterInvoke } from './types'
import { decodeOpenRouterChatModelsEvidenceV1, OPENROUTER_CHAT_MODELS_MAX_BYTES_V1 } from '../../src/next/generation-v2/providers/openrouter/chatModelsEvidenceV1'
import { OPENROUTER_FIRST_PARTY_ENDPOINT_PROFILE_ID_V2, readVerifiedOpenRouterFirstPartyEndpointProfileV2 } from '../../src/next/generation-v2/providers/openrouter/verifiedFirstPartyEndpointProfileV2'
import { stableSerializeProviderRequestBoundedV2 } from '../../src/next/generation-v2/compiler/stableSerialize'
import { OPENROUTER_MODEL_CATEGORIES, type OpenRouterModelCategory } from '../../src/next/modelCatalog/openRouterCategoryCache'
import { CATALOG_RETENTION_PRESETS_MS } from '../../src/shared/modelCatalog/catalogSyncSettings'
import { mapOpenRouterModelToCatalogModel } from '../../src/shared/modelCatalog/providers/openrouter/openRouterCatalogClient'
import { ModelCatalogV2Repo, type ModelCatalogScopeIdentityV2 } from '../../infra/db/repo/modelCatalogV2Repo'

export const GENERATION_V2_MODEL_AVAILABILITY_IPC_CHANNELS = Object.freeze([
  'openai-responses-models:list-availability',
  'anthropic-models:list-availability',
  'google-ai-studio-models:list-availability',
  'deepseek-models:list-availability',
  'generation-v2:openrouter-models:list',
] as const)

export const GENERATION_V2_MODEL_CATALOG_AUTHORITY_IPC_CHANNELS = Object.freeze([
  'generation-v2:model-catalog:sync',
  'generation-v2:model-catalog:status',
  'generation-v2:model-catalog:clear-current',
  'generation-v2:model-catalog:clear-all',
] as const)

const DEFAULT_TIMEOUT_MS = 30_000
const MIN_TIMEOUT_MS = 1_000
const MAX_TIMEOUT_MS = 120_000

type ProviderCatalogKey = 'openrouter' | 'openai_responses' | 'anthropic_messages' | 'google_ai_studio' | 'deepseek'
const PROVIDER_CATALOG_KEYS = new Set<ProviderCatalogKey>([
  'openrouter', 'openai_responses', 'anthropic_messages', 'google_ai_studio', 'deepseek',
])
type ProviderResult = Readonly<Record<string, unknown>>
type ProviderConfig = Readonly<{
  providerKey: ProviderCredentialKey
  sourceProviderKey: ProviderCatalogKey
  endpointId: string
  profileId: string
  operationContractId: string
  list: (credential: string, signal: AbortSignal, category?: OpenRouterModelCategory) => Promise<ProviderResult>
}>

function jsonString(value: unknown): string | null {
  try { return JSON.stringify(value) } catch { return null }
}

function projectOpenRouterCatalogItems(input: Readonly<{
  canonicalJson: string
  modelsUrl: string
  observedAtMs: number
}>): readonly Readonly<Record<string, unknown>>[] {
  const parsed = JSON.parse(input.canonicalJson) as { data: Record<string, unknown>[] }
  return Object.freeze(parsed.data.map((raw) => {
    const model = mapOpenRouterModelToCatalogModel(raw, {
      providerKey: 'openrouter', source: 'models', fetchedAtMs: input.observedAtMs, baseUrl: input.modelsUrl,
    })
    if (!model) throw new Error('invalid_response')
    const expirationAtSec = model.expirationDate ? Date.parse(model.expirationDate) / 1_000 : Number.NaN
    return Object.freeze({
      providerKey: 'openrouter', modelId: model.modelId, modelKey: model.modelKey,
      canonicalSlug: model.canonicalSlug ?? null, displayName: model.displayName,
      description: model.description ?? null, vendor: model.vendor ?? null, family: model.family ?? null,
      status: model.status, visibility: model.visibility, contextLength: model.contextLength ?? null,
      maxOutputTokens: model.maxOutputTokens ?? null, architectureModality: model.architectureModality ?? null,
      inputModalities: Object.freeze([...model.inputModalities]), outputModalities: Object.freeze([...model.outputModalities]),
      tokenizer: model.tokenizer ?? null, instructType: model.instructType ?? null,
      supportedParameters: Object.freeze([...model.supportedParameters]), capabilities: Object.freeze({ ...model.capabilities }),
      pricing: Object.freeze({ ...(model.pricing ?? {}) }), createdAtSec: model.createdAtSec ?? null,
      expirationDate: model.expirationDate ?? null,
      expirationAtSec: Number.isFinite(expirationAtSec) ? Math.trunc(expirationAtSec) : null,
      unknownExpiration: model.expirationDate ? 0 : 1,
      hasPerRequestLimits: model.perRequestLimits == null ? 0 : 1,
      hasDefaultParameters: model.defaultParameters == null ? 0 : 1,
      perRequestLimitsJson: jsonString(model.perRequestLimits), defaultParametersJson: jsonString(model.defaultParameters),
      topProviderContextLength: model.topProviderContextLength ?? null,
      topProviderIsModerated: typeof model.topProviderIsModerated === 'boolean' ? (model.topProviderIsModerated ? 1 : 0) : null,
      tags: Object.freeze(model.tags.map((tag) => tag.key)), firstSeenAtMs: input.observedAtMs,
      lastSeenAtMs: input.observedAtMs, syncedAtMs: input.observedAtMs,
      raw: Object.freeze({ rawJson: jsonString(raw), inputModalitiesJson: jsonString(model.inputModalities),
        outputModalitiesJson: jsonString(model.outputModalities), supportedParametersJson: jsonString(model.supportedParameters),
        capabilitiesJson: jsonString(model.capabilities), pricingJson: jsonString(model.pricing) }),
    })
  }))
}

function requestOptions(payload: unknown, allowProvider = false): Readonly<{
  timeoutMs: number
  providerKey?: ProviderCatalogKey
  category?: OpenRouterModelCategory
  retentionMs?: number | 'never'
}> {
  if (payload === undefined || payload === null) return Object.freeze({ timeoutMs: DEFAULT_TIMEOUT_MS })
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.getPrototypeOf(payload) !== Object.prototype) {
    throw new Error('invalid_payload')
  }
  const record = payload as Record<string, unknown>
  const allowed = new Set(['timeoutMs', 'category', ...(allowProvider ? ['providerKey', 'retentionMs'] : [])])
  if (Reflect.ownKeys(record).some((key) => typeof key !== 'string' || !allowed.has(key))) throw new Error('invalid_payload')
  const timeoutValue = record.timeoutMs
  if (timeoutValue !== undefined && (typeof timeoutValue !== 'number' || !Number.isFinite(timeoutValue))) throw new Error('invalid_payload')
  const providerKey = record.providerKey
  if (providerKey !== undefined && (!allowProvider || !PROVIDER_CATALOG_KEYS.has(providerKey as ProviderCatalogKey))) throw new Error('invalid_payload')
  const category = record.category
  if (category !== undefined && !(OPENROUTER_MODEL_CATEGORIES as readonly unknown[]).includes(category)) throw new Error('invalid_payload')
  if (category !== undefined && providerKey !== undefined && providerKey !== 'openrouter') throw new Error('invalid_payload')
  const retentionMs = record.retentionMs
  if (retentionMs !== undefined && retentionMs !== 'never' && !(CATALOG_RETENTION_PRESETS_MS as readonly unknown[]).includes(retentionMs)) {
    throw new Error('invalid_payload')
  }
  return Object.freeze({
    timeoutMs: timeoutValue === undefined ? DEFAULT_TIMEOUT_MS : Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.trunc(timeoutValue))),
    ...(providerKey === undefined ? {} : { providerKey: providerKey as ProviderCatalogKey }),
    ...(category === undefined ? {} : { category: category as OpenRouterModelCategory }),
    ...(retentionMs === undefined ? {} : { retentionMs: retentionMs as number | 'never' }),
  })
}

function canonicalDigest(items: readonly unknown[]): string {
  return createHash('sha256').update(stableSerializeProviderRequestBoundedV2(items, 32 * 1024 * 1024), 'utf8').digest('hex')
}

async function fetchOpenRouterModels(input: Readonly<{
  credential: string
  signal: AbortSignal
  category?: OpenRouterModelCategory
  fetchImpl: ProviderFetch
}>): Promise<ProviderResult> {
  const profile = readVerifiedOpenRouterFirstPartyEndpointProfileV2()
  const modelsUrl = new URL(profile.operations.chat_completions.modelsUrl)
  if (input.category) modelsUrl.searchParams.set('category', input.category)
  let response: Response
  try {
    response = await input.fetchImpl(modelsUrl.toString(), { method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${input.credential}` }, redirect: 'error',
      credentials: 'omit', cache: 'no-store', signal: input.signal })
  } catch { return Object.freeze({ ok: false, code: 'network_error' }) }
  const contentLength = response.headers.get('content-length')
  if (!response.ok || contentLength !== null && (!/^\d+$/u.test(contentLength) || Number(contentLength) > OPENROUTER_CHAT_MODELS_MAX_BYTES_V1)) {
    try { await response.body?.cancel() } catch { /* best effort */ }
    return Object.freeze({ ok: false, code: response.status === 401 || response.status === 403 ? 'credential_invalid' : 'http_error' })
  }
  let body: string
  try { body = await response.text() } catch { return Object.freeze({ ok: false, code: 'invalid_response' }) }
  if (Buffer.byteLength(body, 'utf8') > OPENROUTER_CHAT_MODELS_MAX_BYTES_V1) return Object.freeze({ ok: false, code: 'invalid_response' })
  try {
    const observedAtMs = Date.now()
    const decoded = decodeOpenRouterChatModelsEvidenceV1(JSON.parse(body))
    return Object.freeze({ ok: true, responseDigest: decoded.responseDigest, observedAtMs,
      items: projectOpenRouterCatalogItems({ canonicalJson: decoded.canonicalJson, modelsUrl: modelsUrl.toString(), observedAtMs }) })
  } catch { return Object.freeze({ ok: false, code: 'invalid_response' }) }
}

function createProviderConfigs(fetchImpl: ProviderFetch): Readonly<Record<ProviderCatalogKey, ProviderConfig>> {
  return Object.freeze({
    openrouter: Object.freeze({ providerKey: 'openrouter', sourceProviderKey: 'openrouter',
      endpointId: 'openrouter-first-party-models', profileId: OPENROUTER_FIRST_PARTY_ENDPOINT_PROFILE_ID_V2,
      operationContractId: 'openrouter-chat-models-v1',
      list: (credential: string, signal: AbortSignal, category?: OpenRouterModelCategory) =>
        fetchOpenRouterModels({ credential, signal, category, fetchImpl }) }),
    openai_responses: Object.freeze({ providerKey: 'openai_responses', sourceProviderKey: OPENAI_RESPONSES_PROVIDER_KEY,
      endpointId: OPENAI_RESPONSES_ENDPOINT_ID, profileId: 'openai-api-v1',
      operationContractId: 'openai-models-v1',
      list: (credential: string, signal: AbortSignal) =>
        listOpenAIProviderModelAvailability({ apiKey: credential, fetchImpl, signal }) as Promise<ProviderResult> }),
    anthropic_messages: Object.freeze({ providerKey: 'anthropic', sourceProviderKey: ANTHROPIC_MESSAGES_PROVIDER_KEY,
      endpointId: ANTHROPIC_MESSAGES_ENDPOINT_ID, profileId: 'anthropic-developer-api-2023-06-01',
      operationContractId: 'anthropic-models-2023-06-01',
      list: (credential: string, signal: AbortSignal) =>
        listAnthropicProviderModelAvailability({ apiKey: credential, fetchImpl, signal }) as Promise<ProviderResult> }),
    google_ai_studio: Object.freeze({ providerKey: 'google_ai_studio', sourceProviderKey: GOOGLE_AI_STUDIO_PROVIDER_KEY,
      endpointId: GOOGLE_AI_STUDIO_ENDPOINT_ID, profileId: 'gemini-developer-api-v1beta',
      operationContractId: 'gemini-models-v1beta',
      list: (credential: string, signal: AbortSignal) =>
        listGeminiProviderModelAvailability({ apiKey: credential, fetchImpl, signal }) as Promise<ProviderResult> }),
    deepseek: Object.freeze({ providerKey: 'deepseek', sourceProviderKey: DEEPSEEK_OFFICIAL_PROVIDER_KEY,
      endpointId: DEEPSEEK_OFFICIAL_ENDPOINT_ID, profileId: 'deepseek-stable-api-v1',
      operationContractId: 'deepseek-stable-models-v1',
      list: (credential: string, signal: AbortSignal) =>
        listDeepSeekProviderModelAvailability({ apiKey: credential, fetchImpl, signal }) as Promise<ProviderResult> }),
  })
}

function scopeFor(config: ProviderConfig, credentialScopeId: string, category?: OpenRouterModelCategory): ModelCatalogScopeIdentityV2 {
  return Object.freeze({ providerKey: config.sourceProviderKey, credentialScopeId,
    endpointProfileId: config.profileId, operationContractId: config.operationContractId,
    ...(category ? { categoryKey: category } : {}) })
}

function snapshotResult(repo: ModelCatalogV2Repo, scope: ModelCatalogScopeIdentityV2, config?: ProviderConfig) {
  const active = repo.readActive(scope)
  const status = repo.readStatus(scope)
  const providerFields = config ? { providerKey: config.sourceProviderKey, endpointId: config.endpointId,
    profileId: config.profileId } : {}
  if (!active) return Object.freeze({ ok: true, ...providerFields, items: Object.freeze([]), models: Object.freeze([]), status: status?.syncState === 'syncing' ? 'syncing' :
    status?.syncState === 'error' ? 'failed' : 'not_synced', responseDigest: null, observedAtMs: null,
    modelCount: 0, visibleModelCount: 0, hiddenModelCount: 0, errorCode: status?.errorCode ?? null })
  return Object.freeze({ ok: true, ...providerFields, items: active.items, models: active.items,
    status: status?.syncState === 'syncing' ? 'syncing' : status?.syncState === 'error' ? 'failed' : 'synced',
    responseDigest: active.status.activeSnapshotDigest, observedAtMs: active.observedAtMs,
    modelCount: active.status.modelCount, visibleModelCount: active.status.visibleModelCount,
    hiddenModelCount: active.status.hiddenModelCount, errorCode: active.status.errorCode })
}

export function registerGenerationV2ModelAvailabilityIpc(input: Readonly<{
  registerInvoke: RegisterInvoke
  credentialService: Epoch2RuntimeCredentialService
  db: BetterSqlite3.Database
  fetchImpl?: ProviderFetch
}>): readonly string[] {
  const fetchImpl = input.fetchImpl ?? createElectronSessionProviderFetch()
  const providerConfigs = createProviderConfigs(fetchImpl)
  const repo = new ModelCatalogV2Repo(input.db)

  const resolveScope = async (config: ProviderConfig, category?: OpenRouterModelCategory) => {
    try {
      const status = await input.credentialService.getStatus(config.providerKey)
      if (!status.configured || !status.credentialScopeId) return { error: 'credential_missing' as const }
      return { status, scope: scopeFor(config, status.credentialScopeId, category) }
    } catch { return { error: 'store_unavailable' as const } }
  }

  const registerList = (channel: typeof GENERATION_V2_MODEL_AVAILABILITY_IPC_CHANNELS[number], config: ProviderConfig) =>
    input.registerInvoke(channel, async (_event: unknown, payload: unknown) => {
      let request: ReturnType<typeof requestOptions>
      try { request = requestOptions(payload) } catch { return Object.freeze({ ok: false, code: 'invalid_payload' }) }
      if (request.category && config.sourceProviderKey !== 'openrouter') return Object.freeze({ ok: false, code: 'invalid_payload' })
      const resolved = await resolveScope(config, request.category)
      if ('error' in resolved) return Object.freeze({ ok: false, code: resolved.error })
      return snapshotResult(repo, resolved.scope, config)
    })

  const orderedConfigs = [providerConfigs.openai_responses, providerConfigs.anthropic_messages,
    providerConfigs.google_ai_studio, providerConfigs.deepseek, providerConfigs.openrouter] as const
  GENERATION_V2_MODEL_AVAILABILITY_IPC_CHANNELS.forEach((channel, index) => registerList(channel, orderedConfigs[index]!))

  input.registerInvoke(GENERATION_V2_MODEL_CATALOG_AUTHORITY_IPC_CHANNELS[0], async (_event: unknown, payload: unknown) => {
    let request: ReturnType<typeof requestOptions>
    try { request = requestOptions(payload, true) } catch { return Object.freeze({ ok: false, code: 'invalid_payload' }) }
    const config = request.providerKey ? providerConfigs[request.providerKey] : null
    if (!config) return Object.freeze({ ok: false, code: 'invalid_payload' })
    const resolved = await resolveScope(config, request.category)
    if ('error' in resolved) return Object.freeze({ ok: false, code: resolved.error })
    const attemptId = randomUUID()
    repo.beginSync(resolved.scope, attemptId)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort('timeout'), request.timeoutMs)
    try {
      const result = await input.credentialService.withCredential({ providerKey: config.providerKey,
        expectedRevision: resolved.status.revision, expectedCredentialScopeId: resolved.status.credentialScopeId!,
        consume: (lease) => config.list(lease.credential, controller.signal, request.category) }) as ProviderResult
      if (result.ok !== true) {
        const code = typeof result.code === 'string' ? result.code : 'provider_catalog_sync_failed'
        repo.failSync(resolved.scope, attemptId, code)
        return Object.freeze({ ok: false, code, active: snapshotResult(repo, resolved.scope, config) })
      }
      const items = Array.isArray(result.items) ? result.items : Array.isArray(result.models) ? result.models : null
      if (!items || items.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
        repo.failSync(resolved.scope, attemptId, 'invalid_response')
        return Object.freeze({ ok: false, code: 'invalid_response', active: snapshotResult(repo, resolved.scope, config) })
      }
      const observedAtMs = typeof result.observedAtMs === 'number' && Number.isSafeInteger(result.observedAtMs)
        ? result.observedAtMs : Date.now()
      const responseDigest = typeof result.responseDigest === 'string' && /^[0-9a-f]{64}$/u.test(result.responseDigest)
        ? result.responseDigest : canonicalDigest(items)
      repo.commitSync({ scope: resolved.scope, attemptId, responseDigest, observedAtMs,
        items: items as readonly Readonly<Record<string, unknown>>[] })
      if (typeof request.retentionMs === 'number') repo.cleanupInactiveSnapshots(Date.now() - request.retentionMs)
      return snapshotResult(repo, resolved.scope, config)
    } catch (error) {
      const code = error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'provider_catalog_sync_failed'
      try { repo.failSync(resolved.scope, attemptId, code) } catch { /* a newer attempt owns the scope */ }
      return Object.freeze({ ok: false, code, active: snapshotResult(repo, resolved.scope, config) })
    } finally { clearTimeout(timer) }
  })

  input.registerInvoke(GENERATION_V2_MODEL_CATALOG_AUTHORITY_IPC_CHANNELS[1], async (_event: unknown, payload: unknown) => {
    let request: ReturnType<typeof requestOptions>
    try { request = requestOptions(payload, true) } catch { return Object.freeze({ ok: false, code: 'invalid_payload' }) }
    const config = request.providerKey ? providerConfigs[request.providerKey] : null
    if (!config) return Object.freeze({ ok: false, code: 'invalid_payload' })
    const resolved = await resolveScope(config, request.category)
    if ('error' in resolved) return Object.freeze({ ok: false, code: resolved.error })
    return snapshotResult(repo, resolved.scope, config)
  })

  input.registerInvoke(GENERATION_V2_MODEL_CATALOG_AUTHORITY_IPC_CHANNELS[2], async (_event: unknown, payload: unknown) => {
    let request: ReturnType<typeof requestOptions>
    try { request = requestOptions(payload, true) } catch { return Object.freeze({ ok: false, code: 'invalid_payload' }) }
    const config = request.providerKey ? providerConfigs[request.providerKey] : null
    if (!config) return Object.freeze({ ok: false, code: 'invalid_payload' })
    const resolved = await resolveScope(config, request.category)
    if ('error' in resolved) return Object.freeze({ ok: false, code: resolved.error })
    return Object.freeze({ ok: true, deletedScopes: repo.clearCurrentCredentialScopes(resolved.scope) })
  })

  input.registerInvoke(GENERATION_V2_MODEL_CATALOG_AUTHORITY_IPC_CHANNELS[3], async (_event: unknown, payload: unknown) => {
    let request: ReturnType<typeof requestOptions>
    try { request = requestOptions(payload, true) } catch { return Object.freeze({ ok: false, code: 'invalid_payload' }) }
    const config = request.providerKey ? providerConfigs[request.providerKey] : null
    if (!config || request.category) return Object.freeze({ ok: false, code: 'invalid_payload' })
    return Object.freeze({ ok: true, deletedScopes: repo.clearAllScopes(config.sourceProviderKey) })
  })

  return Object.freeze([...GENERATION_V2_MODEL_AVAILABILITY_IPC_CHANNELS, ...GENERATION_V2_MODEL_CATALOG_AUTHORITY_IPC_CHANNELS])
}
