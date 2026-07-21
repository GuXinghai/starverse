import type BetterSqlite3 from 'better-sqlite3'
import { session } from 'electron'
import {
  isEpoch2RuntimeCredentialLease,
  type Epoch2RuntimeCredentialLease,
  type Epoch2RuntimeCredentialService,
} from '../credentials/epoch2RuntimeCredentialService'
import type { CredentialScopeIdV2 } from '../../infra/security/credentialScopeV2Primitive'
import {
  canonicalizeOpenAIResponsesModelsEvidenceV2,
  decodeOpenAIResponsesModelsEvidenceV2,
  OpenAIResponsesModelsEvidenceV2Error,
  OPENAI_RESPONSES_MODELS_MAX_BYTES_V2,
  type DecodedOpenAIResponsesModelsEvidenceV2,
} from '../../src/next/generation-v2/providers/openai-responses/modelsEvidenceV2'
import {
  isVerifiedOpenAIResponsesEndpointProfileV2,
  type VerifiedOpenAIResponsesEndpointProfileV2,
} from '../../src/next/generation-v2/providers/openai-responses/verifiedEndpointProfileV2'
import {
  isResolvedOpenAIResponsesModelCapabilityV2,
  resolveOpenAIResponsesModelCapabilityV2,
  type ResolvedOpenAIResponsesModelCapabilityV2,
} from '../../src/next/generation-v2/providers/openai-responses/modelCapabilityManifestV2'
import {
  isGenerationV2Identity,
  GenerationV2Digest,
  GenerationV2Identity,
  type GenerationV2Identity as GenerationIdentity,
} from '../../src/next/generation-v2/domain/identityV2'

type EvidenceRow = Readonly<{
  credential_scope_id: string
  endpoint_profile_id: string
  row_generation: unknown
  endpoint_set_revision: string
  descriptor_revision: string
  descriptor_digest: string
  observed_at_ms: unknown
  response_revision: string
  response_digest: string
  response_json: string
}>

export type VerifiedOpenAIResponsesModelEvidenceV2 = Readonly<{
  classification: 'verified_openai_responses_model_visibility_evidence'
  trust: 'verified_openai_responses_model_evidence'
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
  created: number
  ownedBy: string
  rowGeneration: number
  observedAtMs: number
  modelsResponseRevision: string
  modelsResponseDigest: GenerationV2Digest<'evidence_digest'>
  modelCapability: ResolvedOpenAIResponsesModelCapabilityV2
  assertCurrent(): void
}>

export class OpenAIResponsesModelEvidenceV2ServiceError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENAI_MODEL_EVIDENCE_INPUT_INVALID'
    | 'GENERATION_V2_OPENAI_MODEL_EVIDENCE_PROFILE_INVALID'
    | 'GENERATION_V2_OPENAI_MODEL_EVIDENCE_HTTP_FAILED'
    | 'GENERATION_V2_OPENAI_MODEL_EVIDENCE_TRANSPORT_FAILED'
    | 'GENERATION_V2_OPENAI_MODEL_EVIDENCE_RESPONSE_INCOMPLETE'
    | 'GENERATION_V2_OPENAI_MODEL_EVIDENCE_RESPONSE_TOO_LARGE'
    | 'GENERATION_V2_OPENAI_MODEL_EVIDENCE_RESPONSE_INVALID'
    | 'GENERATION_V2_OPENAI_MODEL_EVIDENCE_MODEL_MISSING'
    | 'GENERATION_V2_OPENAI_MODEL_EVIDENCE_CAPABILITY_UNAVAILABLE'
    | 'GENERATION_V2_OPENAI_MODEL_EVIDENCE_CAS_CONFLICT'
    | 'GENERATION_V2_OPENAI_MODEL_EVIDENCE_STATE_INVALID'
    | 'GENERATION_V2_OPENAI_MODEL_EVIDENCE_CLOCK_REGRESSION'
    | 'GENERATION_V2_OPENAI_MODEL_EVIDENCE_GENERATION_EXHAUSTED') {
    super(code)
    this.name = 'OpenAIResponsesModelEvidenceV2ServiceError'
  }
}

const authorities = new WeakSet<object>()
const REFRESH_TIMEOUT_MS = 30_000

export function isVerifiedOpenAIResponsesModelEvidenceV2(
  value: unknown,
): value is VerifiedOpenAIResponsesModelEvidenceV2 {
  return Boolean(value && typeof value === 'object' && authorities.has(value))
}

function profile(value: unknown): asserts value is VerifiedOpenAIResponsesEndpointProfileV2 {
  if (!isVerifiedOpenAIResponsesEndpointProfileV2(value)) {
    throw new OpenAIResponsesModelEvidenceV2ServiceError('GENERATION_V2_OPENAI_MODEL_EVIDENCE_PROFILE_INVALID')
  }
}

function positiveInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new OpenAIResponsesModelEvidenceV2ServiceError('GENERATION_V2_OPENAI_MODEL_EVIDENCE_STATE_INVALID')
  }
  return value as number
}

function nonnegativeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new OpenAIResponsesModelEvidenceV2ServiceError('GENERATION_V2_OPENAI_MODEL_EVIDENCE_STATE_INVALID')
  }
  return value as number
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
    dispose: () => {
      clearTimeout(timer)
      external?.removeEventListener('abort', onAbort)
    },
  })
}

async function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    throw new OpenAIResponsesModelEvidenceV2ServiceError('GENERATION_V2_OPENAI_MODEL_EVIDENCE_TRANSPORT_FAILED')
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new OpenAIResponsesModelEvidenceV2ServiceError(
      'GENERATION_V2_OPENAI_MODEL_EVIDENCE_TRANSPORT_FAILED',
    ))
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

function cancelBody(response: Response): void {
  try { void response.body?.cancel().catch(() => undefined) } catch { /* best-effort release */ }
}

async function readCompleteBody(response: Response, signal: AbortSignal): Promise<Uint8Array> {
  const contentLength = response.headers.get('content-length')
  if (contentLength !== null && (!/^\d+$/u.test(contentLength) ||
      Number(contentLength) > OPENAI_RESPONSES_MODELS_MAX_BYTES_V2)) {
    throw new OpenAIResponsesModelEvidenceV2ServiceError('GENERATION_V2_OPENAI_MODEL_EVIDENCE_RESPONSE_TOO_LARGE')
  }
  const contentEncoding = response.headers.get('content-encoding')?.trim().toLowerCase()
  const expectedLength = contentLength === null || (contentEncoding && contentEncoding !== 'identity')
    ? null : Number(contentLength)
  const reader = response.body?.getReader()
  if (!reader) {
    throw new OpenAIResponsesModelEvidenceV2ServiceError('GENERATION_V2_OPENAI_MODEL_EVIDENCE_RESPONSE_INCOMPLETE')
  }
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const result = await abortable(reader.read(), signal)
      if (result.done) break
      if (!ArrayBuffer.isView(result.value) || result.value.BYTES_PER_ELEMENT !== 1) {
        throw new OpenAIResponsesModelEvidenceV2ServiceError('GENERATION_V2_OPENAI_MODEL_EVIDENCE_RESPONSE_INCOMPLETE')
      }
      const chunk = Uint8Array.from(new Uint8Array(
        result.value.buffer, result.value.byteOffset, result.value.byteLength,
      ))
      if (chunk.byteLength === 0) continue
      total += chunk.byteLength
      if (total > OPENAI_RESPONSES_MODELS_MAX_BYTES_V2) {
        chunk.fill(0)
        throw new OpenAIResponsesModelEvidenceV2ServiceError('GENERATION_V2_OPENAI_MODEL_EVIDENCE_RESPONSE_TOO_LARGE')
      }
      chunks.push(chunk)
    }
    if (expectedLength !== null && total !== expectedLength) {
      throw new OpenAIResponsesModelEvidenceV2ServiceError('GENERATION_V2_OPENAI_MODEL_EVIDENCE_RESPONSE_INCOMPLETE')
    }
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
      chunk.fill(0)
    }
    return bytes
  } catch (error) {
    for (const chunk of chunks) chunk.fill(0)
    try { void reader.cancel().catch(() => undefined) } catch { /* best-effort release */ }
    if (error instanceof OpenAIResponsesModelEvidenceV2ServiceError) throw error
    throw new OpenAIResponsesModelEvidenceV2ServiceError('GENERATION_V2_OPENAI_MODEL_EVIDENCE_RESPONSE_INCOMPLETE')
  }
}

export function createOpenAIResponsesModelEvidenceV2Service(input: Readonly<{
  db: BetterSqlite3.Database
  credentialService: Epoch2RuntimeCredentialService
  fetchImpl?: typeof fetch
  nowMs?: () => number
}>): Readonly<{
  refresh(request: Readonly<{
    expectedCredentialRevision: number
    expectedCredentialScopeId: CredentialScopeIdV2
    endpointProfile: VerifiedOpenAIResponsesEndpointProfileV2
    signal?: AbortSignal
  }>): Promise<Readonly<{ rowGeneration: number; observedAtMs: number; modelCount: number }>>
  withRefreshedExactModelEvidence<T>(request: Readonly<{
    expectedCredentialRevision: number
    expectedCredentialScopeId: CredentialScopeIdV2
    endpointProfile: VerifiedOpenAIResponsesEndpointProfileV2
    modelId: GenerationIdentity<'model_id'>
    signal?: AbortSignal
    consume: (evidence: VerifiedOpenAIResponsesModelEvidenceV2) => Promise<T> | T
  }>): Promise<T>
}> {
  const db = input.db
  const nowMs = input.nowMs ?? Date.now
  const fetchImpl = input.fetchImpl ?? session.defaultSession.fetch.bind(session.defaultSession)
  db.pragma('foreign_keys = ON')
  if (db.pragma('foreign_keys', { simple: true }) !== 1) {
    throw new OpenAIResponsesModelEvidenceV2ServiceError('GENERATION_V2_OPENAI_MODEL_EVIDENCE_STATE_INVALID')
  }

  function readRow(scope: string, profileId: string): EvidenceRow | undefined {
    return db.prepare(`SELECT credential_scope_id, endpoint_profile_id, row_generation,
      endpoint_set_revision, descriptor_revision, descriptor_digest, observed_at_ms,
      response_revision, response_digest, response_json
      FROM openai_responses_model_evidence_sets
      WHERE credential_scope_id=? AND endpoint_profile_id=?`).get(scope, profileId) as EvidenceRow | undefined
  }

  function readClock(scope: string, profileId: string): number | undefined {
    const row = db.prepare(`SELECT last_generation FROM openai_responses_model_evidence_generation_clock
      WHERE credential_scope_id=? AND endpoint_profile_id=?`).get(scope, profileId) as { last_generation: unknown } | undefined
    return row ? positiveInteger(row.last_generation) : undefined
  }

  function validateRow(row: EvidenceRow, endpointProfile: VerifiedOpenAIResponsesEndpointProfileV2, scope: string) {
    const rowGeneration = positiveInteger(row.row_generation)
    const observedAtMs = nonnegativeInteger(row.observed_at_ms)
    if (row.credential_scope_id !== scope || row.endpoint_profile_id !== endpointProfile.endpointProfileId.value ||
        row.endpoint_set_revision !== endpointProfile.endpointSetRevision.value ||
        row.descriptor_revision !== endpointProfile.descriptor.descriptorRevision.value ||
        row.descriptor_digest !== endpointProfile.descriptor.descriptorDigest.value) {
      throw new OpenAIResponsesModelEvidenceV2ServiceError('GENERATION_V2_OPENAI_MODEL_EVIDENCE_STATE_INVALID')
    }
    let response: DecodedOpenAIResponsesModelsEvidenceV2
    try { response = decodeOpenAIResponsesModelsEvidenceV2(JSON.parse(row.response_json)) } catch (error) {
      if (error instanceof OpenAIResponsesModelsEvidenceV2Error || error instanceof SyntaxError) {
        throw new OpenAIResponsesModelEvidenceV2ServiceError('GENERATION_V2_OPENAI_MODEL_EVIDENCE_STATE_INVALID')
      }
      throw error
    }
    if (response.responseRevision !== row.response_revision || response.responseDigest.value !== row.response_digest) {
      throw new OpenAIResponsesModelEvidenceV2ServiceError('GENERATION_V2_OPENAI_MODEL_EVIDENCE_STATE_INVALID')
    }
    return Object.freeze({ rowGeneration, observedAtMs, response })
  }

  function commit(lease: Epoch2RuntimeCredentialLease, endpointProfile: VerifiedOpenAIResponsesEndpointProfileV2,
    response: DecodedOpenAIResponsesModelsEvidenceV2) {
    if (!isEpoch2RuntimeCredentialLease(lease) || lease.providerKey !== 'openai_responses') {
      throw new OpenAIResponsesModelEvidenceV2ServiceError('GENERATION_V2_OPENAI_MODEL_EVIDENCE_INPUT_INVALID')
    }
    const observedAtMs = nowMs()
    if (!Number.isSafeInteger(observedAtMs) || observedAtMs < 0) {
      throw new OpenAIResponsesModelEvidenceV2ServiceError('GENERATION_V2_OPENAI_MODEL_EVIDENCE_CLOCK_REGRESSION')
    }
    const scope = lease.credentialScopeId
    const profileId = endpointProfile.endpointProfileId.value
    const transaction = db.transaction(() => {
      lease.assertCurrent()
      const current = readRow(scope, profileId)
      const clock = readClock(scope, profileId)
      let priorGeneration = 0
      if (current) {
        const value = validateRow(current, endpointProfile, scope)
        if (clock !== value.rowGeneration) {
          throw new OpenAIResponsesModelEvidenceV2ServiceError('GENERATION_V2_OPENAI_MODEL_EVIDENCE_STATE_INVALID')
        }
        if (observedAtMs < value.observedAtMs) {
          throw new OpenAIResponsesModelEvidenceV2ServiceError('GENERATION_V2_OPENAI_MODEL_EVIDENCE_CLOCK_REGRESSION')
        }
        priorGeneration = value.rowGeneration
      } else if (clock !== undefined) {
        throw new OpenAIResponsesModelEvidenceV2ServiceError('GENERATION_V2_OPENAI_MODEL_EVIDENCE_STATE_INVALID')
      }
      if (priorGeneration >= Number.MAX_SAFE_INTEGER) {
        throw new OpenAIResponsesModelEvidenceV2ServiceError('GENERATION_V2_OPENAI_MODEL_EVIDENCE_GENERATION_EXHAUSTED')
      }
      const next = priorGeneration + 1
      const clockWrite = current
        ? db.prepare(`UPDATE openai_responses_model_evidence_generation_clock SET last_generation=?
            WHERE credential_scope_id=? AND endpoint_profile_id=? AND last_generation=?`)
          .run(next, scope, profileId, priorGeneration)
        : db.prepare(`INSERT INTO openai_responses_model_evidence_generation_clock
            (credential_scope_id, endpoint_profile_id, last_generation) VALUES (?, ?, ?)
            ON CONFLICT(credential_scope_id, endpoint_profile_id) DO NOTHING`).run(scope, profileId, next)
      if (clockWrite.changes !== 1) {
        throw new OpenAIResponsesModelEvidenceV2ServiceError('GENERATION_V2_OPENAI_MODEL_EVIDENCE_CAS_CONFLICT')
      }
      const values = [scope, profileId, next, endpointProfile.endpointSetRevision.value,
        endpointProfile.descriptor.descriptorRevision.value, endpointProfile.descriptor.descriptorDigest.value,
        observedAtMs, response.responseRevision, response.responseDigest.value, response.canonicalJson] as const
      const write = current
        ? db.prepare(`UPDATE openai_responses_model_evidence_sets SET row_generation=?, endpoint_set_revision=?,
            descriptor_revision=?, descriptor_digest=?, observed_at_ms=?, response_revision=?, response_digest=?, response_json=?
            WHERE credential_scope_id=? AND endpoint_profile_id=? AND row_generation=?`)
          .run(next, values[3], values[4], values[5], observedAtMs, values[7], values[8], values[9], scope, profileId, priorGeneration)
        : db.prepare(`INSERT INTO openai_responses_model_evidence_sets
            (credential_scope_id, endpoint_profile_id, row_generation, endpoint_set_revision,
             descriptor_revision, descriptor_digest, observed_at_ms, response_revision, response_digest, response_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(credential_scope_id, endpoint_profile_id) DO NOTHING`).run(...values)
      if (write.changes !== 1) {
        throw new OpenAIResponsesModelEvidenceV2ServiceError('GENERATION_V2_OPENAI_MODEL_EVIDENCE_CAS_CONFLICT')
      }
      lease.assertCurrent()
      return Object.freeze({ rowGeneration: next, observedAtMs, modelCount: response.models.length })
    })
    try { return transaction.immediate() } catch (error) {
      if (error instanceof OpenAIResponsesModelEvidenceV2ServiceError) throw error
      const code = (error as { code?: unknown })?.code
      if (code === 'SQLITE_BUSY' || code === 'SQLITE_BUSY_SNAPSHOT' || code === 'SQLITE_LOCKED') {
        throw new OpenAIResponsesModelEvidenceV2ServiceError('GENERATION_V2_OPENAI_MODEL_EVIDENCE_CAS_CONFLICT')
      }
      throw error
    }
  }

  async function fetchAndCommit(request: Readonly<{
    endpointProfile: VerifiedOpenAIResponsesEndpointProfileV2
    signal?: AbortSignal
  }>, lease: Epoch2RuntimeCredentialLease) {
    if (!isEpoch2RuntimeCredentialLease(lease) || lease.providerKey !== 'openai_responses') {
      throw new OpenAIResponsesModelEvidenceV2ServiceError('GENERATION_V2_OPENAI_MODEL_EVIDENCE_INPUT_INVALID')
    }
    const url = `${request.endpointProfile.descriptor.apiOrigin}${request.endpointProfile.descriptor.modelsPath}`
    const lifecycle = abortScope(request.signal)
    let http: Response | undefined
    try {
      try {
        http = await abortable(fetchImpl(url, {
          method: 'GET', headers: Object.freeze({ Accept: 'application/json', Authorization: `Bearer ${lease.credential}` }),
          redirect: 'error', credentials: 'omit', cache: 'no-store', signal: lifecycle.signal,
        }), lifecycle.signal)
      } catch (error) {
        if (error instanceof OpenAIResponsesModelEvidenceV2ServiceError) throw error
        throw new OpenAIResponsesModelEvidenceV2ServiceError('GENERATION_V2_OPENAI_MODEL_EVIDENCE_TRANSPORT_FAILED')
      }
      if (http.status !== 200 || http.url !== url) {
        cancelBody(http)
        throw new OpenAIResponsesModelEvidenceV2ServiceError('GENERATION_V2_OPENAI_MODEL_EVIDENCE_HTTP_FAILED')
      }
      if (http.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
        cancelBody(http)
        throw new OpenAIResponsesModelEvidenceV2ServiceError('GENERATION_V2_OPENAI_MODEL_EVIDENCE_RESPONSE_INVALID')
      }
      const bytes = await readCompleteBody(http, lifecycle.signal)
      try {
        let raw: unknown
        try {
          const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
          raw = JSON.parse(text)
        } catch {
          throw new OpenAIResponsesModelEvidenceV2ServiceError('GENERATION_V2_OPENAI_MODEL_EVIDENCE_RESPONSE_INVALID')
        }
        let decoded: DecodedOpenAIResponsesModelsEvidenceV2
        try {
          decoded = decodeOpenAIResponsesModelsEvidenceV2(canonicalizeOpenAIResponsesModelsEvidenceV2(raw))
        } catch (error) {
          if (error instanceof OpenAIResponsesModelsEvidenceV2Error) {
            throw new OpenAIResponsesModelEvidenceV2ServiceError('GENERATION_V2_OPENAI_MODEL_EVIDENCE_RESPONSE_INVALID')
          }
          throw error
        }
        lease.assertCurrent()
        return Object.freeze({ committed: commit(lease, request.endpointProfile, decoded), response: decoded })
      } finally { bytes.fill(0) }
    } finally { lifecycle.dispose() }
  }

  return Object.freeze({
    refresh: async (request) => {
      profile(request.endpointProfile)
      return input.credentialService.withCredential({
        providerKey: 'openai_responses', expectedRevision: request.expectedCredentialRevision,
        expectedCredentialScopeId: request.expectedCredentialScopeId,
        consume: async (lease) => (await fetchAndCommit(request, lease)).committed,
      })
    },
    withRefreshedExactModelEvidence: async (request) => {
      profile(request.endpointProfile)
      if (!isGenerationV2Identity(request.modelId, 'model_id') || typeof request.consume !== 'function') {
        throw new OpenAIResponsesModelEvidenceV2ServiceError('GENERATION_V2_OPENAI_MODEL_EVIDENCE_INPUT_INVALID')
      }
      return input.credentialService.withCredential({
        providerKey: 'openai_responses', expectedRevision: request.expectedCredentialRevision,
        expectedCredentialScopeId: request.expectedCredentialScopeId,
        consume: async (lease) => {
          const refreshed = await fetchAndCommit(request, lease)
          const model = refreshed.response.models.find((item) => item.modelId.value === request.modelId.value)
          if (!model) {
            throw new OpenAIResponsesModelEvidenceV2ServiceError('GENERATION_V2_OPENAI_MODEL_EVIDENCE_MODEL_MISSING')
          }
          let modelCapability: ResolvedOpenAIResponsesModelCapabilityV2
          try {
            modelCapability = resolveOpenAIResponsesModelCapabilityV2({ modelEvidence: refreshed.response, modelId: request.modelId.value })
          } catch {
            throw new OpenAIResponsesModelEvidenceV2ServiceError('GENERATION_V2_OPENAI_MODEL_EVIDENCE_CAPABILITY_UNAVAILABLE')
          }
          if (!isResolvedOpenAIResponsesModelCapabilityV2(modelCapability)) {
            throw new OpenAIResponsesModelEvidenceV2ServiceError('GENERATION_V2_OPENAI_MODEL_EVIDENCE_CAPABILITY_UNAVAILABLE')
          }
          const scope = lease.credentialScopeId
          const profileId = request.endpointProfile.endpointProfileId.value
          const authority = Object.freeze({
            classification: 'verified_openai_responses_model_visibility_evidence' as const,
            trust: 'verified_openai_responses_model_evidence' as const,
            usage: 'provider_binding_capability_input_only' as const,
            executionAuthority: 'none' as const,
            providerId: request.endpointProfile.providerId,
            credentialScopeId: GenerationV2Identity.create('credential_scope_id', scope),
            credentialRevision: lease.revision,
            endpointProfileId: request.endpointProfile.endpointProfileId,
            endpointSetRevision: request.endpointProfile.endpointSetRevision,
            descriptorRevision: request.endpointProfile.descriptor.descriptorRevision,
            descriptorDigest: request.endpointProfile.descriptor.descriptorDigest,
            modelId: request.modelId, created: model.created, ownedBy: model.ownedBy,
            rowGeneration: refreshed.committed.rowGeneration,
            observedAtMs: refreshed.committed.observedAtMs,
            modelsResponseRevision: refreshed.response.responseRevision,
            modelsResponseDigest: refreshed.response.responseDigest,
            modelCapability,
            assertCurrent: () => {
              if (!authorities.has(authority)) {
                throw new OpenAIResponsesModelEvidenceV2ServiceError('GENERATION_V2_OPENAI_MODEL_EVIDENCE_CAS_CONFLICT')
              }
              lease.assertCurrent()
              const row = readRow(scope, profileId)
              const clock = readClock(scope, profileId)
              if (!row || clock !== refreshed.committed.rowGeneration) {
                throw new OpenAIResponsesModelEvidenceV2ServiceError('GENERATION_V2_OPENAI_MODEL_EVIDENCE_CAS_CONFLICT')
              }
              const current = validateRow(row, request.endpointProfile, scope)
              if (current.rowGeneration !== refreshed.committed.rowGeneration ||
                  current.response.responseDigest.value !== refreshed.response.responseDigest.value ||
                  !current.response.models.some((item) => item.modelId.value === request.modelId.value)) {
                throw new OpenAIResponsesModelEvidenceV2ServiceError('GENERATION_V2_OPENAI_MODEL_EVIDENCE_CAS_CONFLICT')
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
