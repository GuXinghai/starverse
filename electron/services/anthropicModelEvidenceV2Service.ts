import { createHash } from 'node:crypto'
import type BetterSqlite3 from 'better-sqlite3'
import { session } from 'electron'
import {
  isEpoch2RuntimeCredentialLease,
  type Epoch2RuntimeCredentialLease,
  type Epoch2RuntimeCredentialService,
} from '../credentials/epoch2RuntimeCredentialService'
import type { CredentialScopeIdV2 } from '../../infra/security/credentialScopeV2Primitive'
import {
  ANTHROPIC_STANDARD_API_VERSION_V2,
  readAnthropicDeveloperApiContractV2,
  resolveAnthropicDeveloperApiEndpointV2,
} from '../../src/next/generation-v2/contracts/anthropicDeveloperApiContractV2'
import {
  isVerifiedAnthropicEndpointProfileV2,
  type VerifiedAnthropicEndpointProfileV2,
} from '../../src/next/generation-v2/providers/anthropic/verifiedEndpointProfileV2'
import { stableSerializeProviderRequestV2 } from '../../src/next/generation-v2/compiler/stableSerialize'
import {
  isGenerationV2Identity,
  GenerationV2Digest,
  GenerationV2Identity,
  type GenerationV2Identity as GenerationIdentity,
} from '../../src/next/generation-v2/domain/identityV2'

const MAX_RESPONSE_BYTES = 64 * 1024
const REFRESH_TIMEOUT_MS = 30_000
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,511}$/u
const DISPLAY_NAME = /^[^\u0000-\u001f\u007f]{1,512}$/u

type DecodedModelResponse = Readonly<{
  modelId: GenerationIdentity<'model_id'>
  displayName: string
  createdAt: string
  maxInputTokens: number
  maxTokens: number
  capabilities: AnthropicModelCapabilitiesV2
  supportedThinkingTypes: readonly AnthropicThinkingTypeV2[]
  supportedEfforts: readonly AnthropicEffortV2[]
  responseRevision: string
  responseDigest: GenerationV2Digest<'evidence_digest'>
  canonicalJson: string
}>

export type AnthropicThinkingTypeV2 = 'adaptive' | 'enabled'
export type AnthropicEffortV2 = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
type CapabilitySupportV2 = Readonly<{ supported: boolean }>
export type AnthropicModelCapabilitiesV2 = Readonly<{
  batch: CapabilitySupportV2
  citations: CapabilitySupportV2
  code_execution: CapabilitySupportV2
  context_management: Readonly<{
    clear_thinking_20251015: CapabilitySupportV2
    clear_tool_uses_20250919: CapabilitySupportV2
    compact_20260112: CapabilitySupportV2
    supported: boolean
  }>
  effort: Readonly<{
    high: CapabilitySupportV2
    low: CapabilitySupportV2
    max: CapabilitySupportV2
    medium: CapabilitySupportV2
    supported: boolean
    xhigh: CapabilitySupportV2
  }>
  image_input: CapabilitySupportV2
  pdf_input: CapabilitySupportV2
  structured_outputs: CapabilitySupportV2
  thinking: Readonly<{
    supported: boolean
    types: Readonly<{
      adaptive: CapabilitySupportV2
      enabled: CapabilitySupportV2
    }>
  }>
}>

type EvidenceRow = Readonly<{
  credential_scope_id: string
  endpoint_profile_id: string
  model_id: string
  row_generation: unknown
  endpoint_set_revision: string
  descriptor_revision: string
  descriptor_digest: string
  observed_at_ms: unknown
  response_revision: string
  response_digest: string
  response_json: string
}>

export type VerifiedAnthropicModelEvidenceV2 = Readonly<{
  classification: 'verified_anthropic_model_visibility_evidence'
  trust: 'verified_anthropic_model_evidence'
  usage: 'provider_binding_capability_input_only'
  executionAuthority: 'none'
  providerId: GenerationIdentity<'provider_id'>
  credentialScopeId: GenerationIdentity<'credential_scope_id'>
  credentialRevision: number
  endpointProfileId: GenerationIdentity<'endpoint_profile_id'>
  endpointSetRevision: GenerationIdentity<'endpoint_set_revision'>
  descriptorRevision: GenerationIdentity<'descriptor_revision'>
  descriptorDigest: GenerationV2Digest<'descriptor_digest'>
  modelId: GenerationIdentity<'model_id'>
  displayName: string
  createdAt: string
  maxInputTokens: number
  maxTokens: number
  capabilities: AnthropicModelCapabilitiesV2
  supportedThinkingTypes: readonly AnthropicThinkingTypeV2[]
  supportedEfforts: readonly AnthropicEffortV2[]
  rowGeneration: number
  observedAtMs: number
  modelResponseRevision: string
  modelResponseDigest: GenerationV2Digest<'evidence_digest'>
  assertCurrent(): void
}>

export class AnthropicModelEvidenceV2ServiceError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_INPUT_INVALID'
    | 'GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_PROFILE_INVALID'
    | 'GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_HTTP_FAILED'
    | 'GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_TRANSPORT_FAILED'
    | 'GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_RESPONSE_INCOMPLETE'
    | 'GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_RESPONSE_TOO_LARGE'
    | 'GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_RESPONSE_INVALID'
    | 'GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_MODEL_MISMATCH'
    | 'GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_CAS_CONFLICT'
    | 'GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_STATE_INVALID'
    | 'GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_CLOCK_REGRESSION'
    | 'GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_GENERATION_EXHAUSTED') {
    super(code)
    this.name = 'AnthropicModelEvidenceV2ServiceError'
  }
}

const authorities = new WeakSet<object>()

export function isVerifiedAnthropicModelEvidenceV2(value: unknown): value is VerifiedAnthropicModelEvidenceV2 {
  return Boolean(value && typeof value === 'object' && authorities.has(value))
}

function fail(code: AnthropicModelEvidenceV2ServiceError['code']): never {
  throw new AnthropicModelEvidenceV2ServiceError(code)
}

function exactProfile(value: unknown): asserts value is VerifiedAnthropicEndpointProfileV2 {
  if (!isVerifiedAnthropicEndpointProfileV2(value)) fail('GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_PROFILE_INVALID')
}

function positiveInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) fail('GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_STATE_INVALID')
  return value as number
}

function nonnegativeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail('GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_STATE_INVALID')
  return value as number
}

function closedObject(value: unknown, keys: readonly string[]): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    return fail('GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_RESPONSE_INVALID')
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.keys(descriptors).sort().join('\0') !== [...keys].sort().join('\0') ||
      Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined)) {
    return fail('GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_RESPONSE_INVALID')
  }
  return Object.freeze(Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value])))
}

function capabilitySupport(value: unknown): CapabilitySupportV2 {
  const support = closedObject(value, ['supported'])
  if (typeof support.supported !== 'boolean') return fail('GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_RESPONSE_INVALID')
  return Object.freeze({ supported: support.supported })
}

function decodeCapabilities(value: unknown): AnthropicModelCapabilitiesV2 {
  const input = closedObject(value, [
    'batch', 'citations', 'code_execution', 'context_management', 'effort',
    'image_input', 'pdf_input', 'structured_outputs', 'thinking',
  ])
  const context = closedObject(input.context_management, [
    'clear_thinking_20251015', 'clear_tool_uses_20250919', 'compact_20260112', 'supported',
  ])
  const effort = closedObject(input.effort, ['high', 'low', 'max', 'medium', 'supported', 'xhigh'])
  const thinking = closedObject(input.thinking, ['supported', 'types'])
  const thinkingTypes = closedObject(thinking.types, ['adaptive', 'enabled'])
  if (typeof context.supported !== 'boolean' || typeof effort.supported !== 'boolean' ||
      typeof thinking.supported !== 'boolean') {
    return fail('GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_RESPONSE_INVALID')
  }
  return Object.freeze({
    batch: capabilitySupport(input.batch),
    citations: capabilitySupport(input.citations),
    code_execution: capabilitySupport(input.code_execution),
    context_management: Object.freeze({
      clear_thinking_20251015: capabilitySupport(context.clear_thinking_20251015),
      clear_tool_uses_20250919: capabilitySupport(context.clear_tool_uses_20250919),
      compact_20260112: capabilitySupport(context.compact_20260112),
      supported: context.supported,
    }),
    effort: Object.freeze({
      high: capabilitySupport(effort.high),
      low: capabilitySupport(effort.low),
      max: capabilitySupport(effort.max),
      medium: capabilitySupport(effort.medium),
      supported: effort.supported,
      xhigh: capabilitySupport(effort.xhigh),
    }),
    image_input: capabilitySupport(input.image_input),
    pdf_input: capabilitySupport(input.pdf_input),
    structured_outputs: capabilitySupport(input.structured_outputs),
    thinking: Object.freeze({
      supported: thinking.supported,
      types: Object.freeze({
        adaptive: capabilitySupport(thinkingTypes.adaptive),
        enabled: capabilitySupport(thinkingTypes.enabled),
      }),
    }),
  })
}

function decodeModelResponse(value: unknown, expectedModelId?: string): DecodedModelResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    return fail('GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_RESPONSE_INVALID')
  }
  const input = closedObject(value, [
    'id', 'type', 'display_name', 'created_at', 'max_input_tokens', 'max_tokens', 'capabilities',
  ])
  const id = input.id
  const displayName = input.display_name
  const createdAt = input.created_at
  if (input.type !== 'model' || typeof id !== 'string' || !MODEL_ID.test(id) ||
      typeof displayName !== 'string' || displayName.trim() !== displayName || !DISPLAY_NAME.test(displayName) ||
      typeof createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u.test(createdAt) ||
      !Number.isFinite(Date.parse(createdAt)) || !Number.isSafeInteger(input.max_input_tokens) ||
      (input.max_input_tokens as number) < 0 || !Number.isSafeInteger(input.max_tokens) ||
      (input.max_tokens as number) < 0) {
    return fail('GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_RESPONSE_INVALID')
  }
  if (expectedModelId !== undefined && id !== expectedModelId) {
    return fail('GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_MODEL_MISMATCH')
  }
  const capabilities = decodeCapabilities(input.capabilities)
  const maxInputTokens = input.max_input_tokens as number
  const maxTokens = input.max_tokens as number
  const supportedThinkingTypes = Object.freeze((['adaptive', 'enabled'] as const)
    .filter((type) => capabilities.thinking.supported && capabilities.thinking.types[type].supported))
  const supportedEfforts = Object.freeze((['low', 'medium', 'high', 'xhigh', 'max'] as const)
    .filter((effort) => capabilities.effort.supported && capabilities.effort[effort].supported))
  const semantic = Object.freeze({
    id,
    type: 'model' as const,
    display_name: displayName,
    created_at: createdAt,
    max_input_tokens: maxInputTokens,
    max_tokens: maxTokens,
    capabilities,
  })
  const semanticJson = stableSerializeProviderRequestV2(semantic)
  const digest = createHash('sha256').update(semanticJson, 'utf8').digest('hex')
  const persisted = Object.freeze({ ...semantic, response_digest: digest, response_revision: `anthropic-model-v1:${digest}` })
  return Object.freeze({
    modelId: GenerationV2Identity.create('model_id', id),
    displayName,
    createdAt,
    maxInputTokens,
    maxTokens,
    capabilities,
    supportedThinkingTypes,
    supportedEfforts,
    responseRevision: persisted.response_revision,
    responseDigest: GenerationV2Digest.create('evidence_digest', digest),
    canonicalJson: stableSerializeProviderRequestV2(persisted),
  })
}

function decodePersistedResponse(json: string, expectedModelId: string): DecodedModelResponse {
  let raw: unknown
  try { raw = JSON.parse(json) } catch { return fail('GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_STATE_INVALID') }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return fail('GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_STATE_INVALID')
  }
  const input = raw as Record<string, unknown>
  const actualDigest = input.response_digest
  const actualRevision = input.response_revision
  let decoded: DecodedModelResponse
  try {
    decoded = decodeModelResponse({
      id: input.id,
      type: input.type,
      display_name: input.display_name,
      created_at: input.created_at,
      max_input_tokens: input.max_input_tokens,
      max_tokens: input.max_tokens,
      capabilities: input.capabilities,
    }, expectedModelId)
  } catch {
    return fail('GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_STATE_INVALID')
  }
  if (Object.keys(input).sort().join('\0') !== [
    'capabilities', 'created_at', 'display_name', 'id', 'max_input_tokens', 'max_tokens',
    'response_digest', 'response_revision', 'type',
  ].sort().join('\0') ||
      actualDigest !== decoded.responseDigest.value || actualRevision !== decoded.responseRevision) {
    return fail('GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_STATE_INVALID')
  }
  return decoded
}

function abortScope(external: AbortSignal | undefined) {
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  if (external?.aborted) controller.abort()
  else external?.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS)
  ;(timer as NodeJS.Timeout).unref?.()
  return Object.freeze({
    signal: controller.signal,
    dispose: () => { clearTimeout(timer); external?.removeEventListener('abort', onAbort) },
  })
}

async function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return fail('GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_TRANSPORT_FAILED')
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new AnthropicModelEvidenceV2ServiceError('GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_TRANSPORT_FAILED'))
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

async function readCompleteBody(response: Response, signal: AbortSignal): Promise<Uint8Array> {
  const contentLength = response.headers.get('content-length')
  if (contentLength !== null && (!/^\d+$/u.test(contentLength) || Number(contentLength) > MAX_RESPONSE_BYTES)) {
    return fail('GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_RESPONSE_TOO_LARGE')
  }
  const contentEncoding = response.headers.get('content-encoding')?.trim().toLowerCase()
  const expectedLength = contentLength === null || (contentEncoding && contentEncoding !== 'identity')
    ? null
    : Number(contentLength)
  const reader = response.body?.getReader()
  if (!reader) return fail('GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_RESPONSE_INCOMPLETE')
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const result = await abortable(reader.read(), signal)
      if (result.done) break
      const chunk = Uint8Array.from(result.value)
      total += chunk.byteLength
      if (total > MAX_RESPONSE_BYTES) {
        chunk.fill(0)
        return fail('GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_RESPONSE_TOO_LARGE')
      }
      chunks.push(chunk)
    }
    if (expectedLength !== null && total !== expectedLength) {
      return fail('GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_RESPONSE_INCOMPLETE')
    }
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; chunk.fill(0) }
    return bytes
  } catch (error) {
    for (const chunk of chunks) chunk.fill(0)
    try { await reader.cancel() } catch { /* best effort */ }
    if (error instanceof AnthropicModelEvidenceV2ServiceError) throw error
    return fail('GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_RESPONSE_INCOMPLETE')
  }
}

export function createAnthropicModelEvidenceV2Service(input: Readonly<{
  db: BetterSqlite3.Database
  credentialService: Epoch2RuntimeCredentialService
  fetchImpl?: typeof fetch
  nowMs?: () => number
}>): Readonly<{
  withRefreshedExactModelEvidence<T>(request: Readonly<{
    expectedCredentialRevision: number
    expectedCredentialScopeId: CredentialScopeIdV2
    endpointProfile: VerifiedAnthropicEndpointProfileV2
    modelId: GenerationIdentity<'model_id'>
    signal?: AbortSignal
    consume: (evidence: VerifiedAnthropicModelEvidenceV2) => Promise<T> | T
  }>): Promise<T>
}> {
  const db = input.db
  const nowMs = input.nowMs ?? Date.now
  const fetchImpl = input.fetchImpl ?? session.defaultSession.fetch.bind(session.defaultSession)
  db.pragma('foreign_keys = ON')
  if (db.pragma('foreign_keys', { simple: true }) !== 1) fail('GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_STATE_INVALID')

  function readRow(scope: string, profileId: string, modelId: string): EvidenceRow | undefined {
    return db.prepare(`SELECT credential_scope_id, endpoint_profile_id, model_id, row_generation,
      endpoint_set_revision, descriptor_revision, descriptor_digest, observed_at_ms,
      response_revision, response_digest, response_json FROM anthropic_model_evidence_sets
      WHERE credential_scope_id=? AND endpoint_profile_id=? AND model_id=?`).get(scope, profileId, modelId) as EvidenceRow | undefined
  }

  function readClock(scope: string, profileId: string, modelId: string): number | undefined {
    const row = db.prepare(`SELECT last_generation FROM anthropic_model_evidence_generation_clock
      WHERE credential_scope_id=? AND endpoint_profile_id=? AND model_id=?`).get(scope, profileId, modelId) as { last_generation: unknown } | undefined
    return row ? positiveInteger(row.last_generation) : undefined
  }

  function validateRow(row: EvidenceRow, profile: VerifiedAnthropicEndpointProfileV2, scope: string, modelId: string) {
    const rowGeneration = positiveInteger(row.row_generation)
    const observedAtMs = nonnegativeInteger(row.observed_at_ms)
    if (row.credential_scope_id !== scope || row.endpoint_profile_id !== profile.endpointProfileId.value ||
        row.model_id !== modelId || row.endpoint_set_revision !== profile.endpointSetRevision.value ||
        row.descriptor_revision !== profile.descriptor.descriptorRevision.value ||
        row.descriptor_digest !== profile.descriptor.descriptorDigest.value) {
      return fail('GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_STATE_INVALID')
    }
    const response = decodePersistedResponse(row.response_json, modelId)
    if (response.responseRevision !== row.response_revision || response.responseDigest.value !== row.response_digest) {
      return fail('GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_STATE_INVALID')
    }
    return Object.freeze({ rowGeneration, observedAtMs, response })
  }

  function commit(lease: Epoch2RuntimeCredentialLease, profile: VerifiedAnthropicEndpointProfileV2, response: DecodedModelResponse) {
    if (!isEpoch2RuntimeCredentialLease(lease) || lease.providerKey !== 'anthropic') {
      return fail('GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_INPUT_INVALID')
    }
    const observedAtMs = nowMs()
    if (!Number.isSafeInteger(observedAtMs) || observedAtMs < 0) return fail('GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_CLOCK_REGRESSION')
    const scope = lease.credentialScopeId
    const profileId = profile.endpointProfileId.value
    const modelId = response.modelId.value
    const transaction = db.transaction(() => {
      lease.assertCurrent()
      const current = readRow(scope, profileId, modelId)
      const clock = readClock(scope, profileId, modelId)
      let prior = 0
      if (current) {
        const validated = validateRow(current, profile, scope, modelId)
        if (clock !== validated.rowGeneration) return fail('GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_STATE_INVALID')
        if (observedAtMs < validated.observedAtMs) return fail('GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_CLOCK_REGRESSION')
        prior = validated.rowGeneration
      } else if (clock !== undefined) return fail('GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_STATE_INVALID')
      if (prior >= Number.MAX_SAFE_INTEGER) return fail('GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_GENERATION_EXHAUSTED')
      const next = prior + 1
      const clockWrite = current
        ? db.prepare(`UPDATE anthropic_model_evidence_generation_clock SET last_generation=?
            WHERE credential_scope_id=? AND endpoint_profile_id=? AND model_id=? AND last_generation=?`)
          .run(next, scope, profileId, modelId, prior)
        : db.prepare(`INSERT INTO anthropic_model_evidence_generation_clock
            (credential_scope_id, endpoint_profile_id, model_id, last_generation) VALUES (?, ?, ?, ?)
            ON CONFLICT(credential_scope_id, endpoint_profile_id, model_id) DO NOTHING`).run(scope, profileId, modelId, next)
      if (clockWrite.changes !== 1) return fail('GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_CAS_CONFLICT')
      const values = [scope, profileId, modelId, next, profile.endpointSetRevision.value,
        profile.descriptor.descriptorRevision.value, profile.descriptor.descriptorDigest.value,
        observedAtMs, response.responseRevision, response.responseDigest.value, response.canonicalJson] as const
      const write = current
        ? db.prepare(`UPDATE anthropic_model_evidence_sets SET row_generation=?, endpoint_set_revision=?,
            descriptor_revision=?, descriptor_digest=?, observed_at_ms=?, response_revision=?, response_digest=?, response_json=?
            WHERE credential_scope_id=? AND endpoint_profile_id=? AND model_id=? AND row_generation=?`)
          .run(next, values[4], values[5], values[6], observedAtMs, values[8], values[9], values[10], scope, profileId, modelId, prior)
        : db.prepare(`INSERT INTO anthropic_model_evidence_sets
            (credential_scope_id, endpoint_profile_id, model_id, row_generation, endpoint_set_revision,
             descriptor_revision, descriptor_digest, observed_at_ms, response_revision, response_digest, response_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(credential_scope_id, endpoint_profile_id, model_id) DO NOTHING`).run(...values)
      if (write.changes !== 1) return fail('GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_CAS_CONFLICT')
      lease.assertCurrent()
      return Object.freeze({ rowGeneration: next, observedAtMs })
    })
    try { return transaction.immediate() } catch (error) {
      if (error instanceof AnthropicModelEvidenceV2ServiceError) throw error
      const code = (error as { code?: unknown })?.code
      if (code === 'SQLITE_BUSY' || code === 'SQLITE_BUSY_SNAPSHOT' || code === 'SQLITE_LOCKED') {
        return fail('GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_CAS_CONFLICT')
      }
      throw error
    }
  }

  async function fetchAndCommit(request: Readonly<{
    endpointProfile: VerifiedAnthropicEndpointProfileV2
    modelId: GenerationIdentity<'model_id'>
    signal?: AbortSignal
  }>, lease: Epoch2RuntimeCredentialLease) {
    if (!isEpoch2RuntimeCredentialLease(lease) || lease.providerKey !== 'anthropic') {
      return fail('GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_INPUT_INVALID')
    }
    const endpoint = resolveAnthropicDeveloperApiEndpointV2(readAnthropicDeveloperApiContractV2(), {
      surfaceId: 'anthropic-models-2023-06-01', operation: 'get_model', resourceId: request.modelId.value,
    })
    if (endpoint.method !== 'GET' || !endpoint.url.startsWith(`${request.endpointProfile.descriptor.apiOrigin}/`)) {
      return fail('GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_PROFILE_INVALID')
    }
    const lifecycle = abortScope(request.signal)
    let http: Response | undefined
    try {
      try {
        http = await abortable(fetchImpl(endpoint.url, {
          method: 'GET',
          headers: Object.freeze({
            Accept: 'application/json',
            'x-api-key': lease.credential,
            'anthropic-version': ANTHROPIC_STANDARD_API_VERSION_V2,
          }),
          redirect: 'error', credentials: 'omit', cache: 'no-store', signal: lifecycle.signal,
        }), lifecycle.signal)
      } catch (error) {
        if (error instanceof AnthropicModelEvidenceV2ServiceError) throw error
        return fail('GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_TRANSPORT_FAILED')
      }
      const responseUrl = typeof http.url === 'string' ? http.url.trim() : ''
      if (http.status !== 200 || (responseUrl.length > 0 && responseUrl !== endpoint.url)) {
        try { void http.body?.cancel().catch(() => undefined) } catch { /* best effort */ }
        return fail('GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_HTTP_FAILED')
      }
      if (http.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
        try { void http.body?.cancel().catch(() => undefined) } catch { /* best effort */ }
        return fail('GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_RESPONSE_INVALID')
      }
      const bytes = await readCompleteBody(http, lifecycle.signal)
      try {
        let raw: unknown
        try { raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) } catch {
          return fail('GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_RESPONSE_INVALID')
        }
        const decoded = decodeModelResponse(raw, request.modelId.value)
        lease.assertCurrent()
        return Object.freeze({ committed: commit(lease, request.endpointProfile, decoded), response: decoded })
      } finally { bytes.fill(0) }
    } finally { lifecycle.dispose() }
  }

  return Object.freeze({
    withRefreshedExactModelEvidence: async <T>(request: Readonly<{
      expectedCredentialRevision: number
      expectedCredentialScopeId: CredentialScopeIdV2
      endpointProfile: VerifiedAnthropicEndpointProfileV2
      modelId: GenerationIdentity<'model_id'>
      signal?: AbortSignal
      consume: (evidence: VerifiedAnthropicModelEvidenceV2) => Promise<T> | T
    }>): Promise<T> => {
      exactProfile(request.endpointProfile)
      if (!isGenerationV2Identity(request.modelId, 'model_id') || typeof request.consume !== 'function') {
        return fail('GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_INPUT_INVALID')
      }
      return input.credentialService.withCredential({
        providerKey: 'anthropic', expectedRevision: request.expectedCredentialRevision,
        expectedCredentialScopeId: request.expectedCredentialScopeId,
        consume: async (lease) => {
          const refreshed = await fetchAndCommit(request, lease)
          const scope = lease.credentialScopeId
          const profileId = request.endpointProfile.endpointProfileId.value
          const modelId = request.modelId.value
          const authority = Object.freeze({
            classification: 'verified_anthropic_model_visibility_evidence' as const,
            trust: 'verified_anthropic_model_evidence' as const,
            usage: 'provider_binding_capability_input_only' as const,
            executionAuthority: 'none' as const,
            providerId: request.endpointProfile.providerId,
            credentialScopeId: GenerationV2Identity.create('credential_scope_id', scope),
            credentialRevision: lease.revision,
            endpointProfileId: request.endpointProfile.endpointProfileId,
            endpointSetRevision: request.endpointProfile.endpointSetRevision,
            descriptorRevision: request.endpointProfile.descriptor.descriptorRevision,
            descriptorDigest: request.endpointProfile.descriptor.descriptorDigest,
            modelId: request.modelId,
            displayName: refreshed.response.displayName,
            createdAt: refreshed.response.createdAt,
            maxInputTokens: refreshed.response.maxInputTokens,
            maxTokens: refreshed.response.maxTokens,
            capabilities: refreshed.response.capabilities,
            supportedThinkingTypes: refreshed.response.supportedThinkingTypes,
            supportedEfforts: refreshed.response.supportedEfforts,
            rowGeneration: refreshed.committed.rowGeneration,
            observedAtMs: refreshed.committed.observedAtMs,
            modelResponseRevision: refreshed.response.responseRevision,
            modelResponseDigest: refreshed.response.responseDigest,
            assertCurrent: () => {
              if (!authorities.has(authority)) return fail('GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_CAS_CONFLICT')
              lease.assertCurrent()
              const row = readRow(scope, profileId, modelId)
              if (!row || readClock(scope, profileId, modelId) !== refreshed.committed.rowGeneration) {
                return fail('GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_CAS_CONFLICT')
              }
              const current = validateRow(row, request.endpointProfile, scope, modelId)
              if (current.rowGeneration !== refreshed.committed.rowGeneration ||
                  current.response.responseDigest.value !== refreshed.response.responseDigest.value) {
                return fail('GENERATION_V2_ANTHROPIC_MODEL_EVIDENCE_CAS_CONFLICT')
              }
            },
          })
          authorities.add(authority)
          try {
            const result = await request.consume(authority)
            authority.assertCurrent()
            return result
          } finally { authorities.delete(authority) }
        },
      })
    },
  })
}
