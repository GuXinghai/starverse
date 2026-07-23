import type BetterSqlite3 from 'better-sqlite3'
import { session } from 'electron'
import type { CredentialScopeIdV2 } from '../../infra/security/credentialScopeV2Primitive'
import {
  isEpoch2RuntimeCredentialLease,
  type Epoch2RuntimeCredentialLease,
  type Epoch2RuntimeCredentialService,
} from '../credentials/epoch2RuntimeCredentialService'
import {
  decodeGeminiModelsEvidenceV1,
  GEMINI_MODELS_EVIDENCE_MAX_BYTES_V1,
  type GeminiModelVisibilityRecordV1,
  type GeminiModelsEvidenceV1,
} from '../../src/next/generation-v2/providers/gemini/modelsEvidenceV1'
import {
  isVerifiedGeminiDeveloperApiEndpointProfileV2,
  type VerifiedGeminiDeveloperApiEndpointProfileV2,
} from '../../src/next/generation-v2/providers/gemini/verifiedEndpointProfileV2'
import { GenerationV2Digest, GenerationV2Identity, isGenerationV2Identity,
  type GenerationV2Identity as Identity } from '../../src/next/generation-v2/domain/identityV2'

type Row = Readonly<{
  credential_scope_id: string; endpoint_profile_id: string; row_generation: unknown
  endpoint_set_revision: string; descriptor_revision: string; descriptor_digest: string
  observed_at_ms: unknown; response_revision: string; response_digest: string; response_json: string
}>

export type VerifiedGeminiModelVisibilityEvidenceV2 = Readonly<{
  trust: 'verified_gemini_model_visibility_evidence'
  usage: 'provider_binding_capability_input_only'
  executionAuthority: 'none'
  providerId: Identity<'provider_id'>
  credentialScopeId: Identity<'credential_scope_id'>
  credentialRevision: number
  endpointProfileId: Identity<'endpoint_profile_id'>
  endpointSetRevision: Identity<'endpoint_set_revision'>
  descriptorRevision: Identity<'descriptor_revision'>
  descriptorDigest: GenerationV2Digest<'descriptor_digest'>
  modelId: Identity<'model_id'>
  model: GeminiModelVisibilityRecordV1
  rowGeneration: number
  observedAtMs: number
  modelsResponseRevision: string
  modelsResponseDigest: GenerationV2Digest<'evidence_digest'>
  assertCurrent(): void
}>

export class GeminiModelEvidenceV2ServiceError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_GEMINI_MODEL_EVIDENCE_INVALID'
    | 'GENERATION_V2_GEMINI_MODEL_EVIDENCE_HTTP_FAILED'
    | 'GENERATION_V2_GEMINI_MODEL_EVIDENCE_TRANSPORT_FAILED'
    | 'GENERATION_V2_GEMINI_MODEL_EVIDENCE_RESPONSE_INVALID'
    | 'GENERATION_V2_GEMINI_MODEL_EVIDENCE_MODEL_MISSING'
    | 'GENERATION_V2_GEMINI_MODEL_EVIDENCE_METHOD_UNAVAILABLE'
    | 'GENERATION_V2_GEMINI_MODEL_EVIDENCE_CAS_CONFLICT') {
    super(code)
    this.name = 'GeminiModelEvidenceV2ServiceError'
  }
}

const authorities = new WeakSet<object>()
export function isVerifiedGeminiModelVisibilityEvidenceV2(
  value: unknown,
): value is VerifiedGeminiModelVisibilityEvidenceV2 {
  return Boolean(value && typeof value === 'object' && authorities.has(value))
}

function positive(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new GeminiModelEvidenceV2ServiceError('GENERATION_V2_GEMINI_MODEL_EVIDENCE_INVALID')
  return value as number
}
function nonnegative(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new GeminiModelEvidenceV2ServiceError('GENERATION_V2_GEMINI_MODEL_EVIDENCE_INVALID')
  return value as number
}

async function readBody(response: Response, signal: AbortSignal): Promise<unknown> {
  const reader = response.body?.getReader()
  if (!reader) throw new GeminiModelEvidenceV2ServiceError('GENERATION_V2_GEMINI_MODEL_EVIDENCE_RESPONSE_INVALID')
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      if (signal.aborted) throw new GeminiModelEvidenceV2ServiceError('GENERATION_V2_GEMINI_MODEL_EVIDENCE_TRANSPORT_FAILED')
      const item = await reader.read()
      if (item.done) break
      const chunk = Uint8Array.from(item.value)
      total += chunk.byteLength
      if (total > GEMINI_MODELS_EVIDENCE_MAX_BYTES_V1) {
        throw new GeminiModelEvidenceV2ServiceError('GENERATION_V2_GEMINI_MODEL_EVIDENCE_RESPONSE_INVALID')
      }
      chunks.push(chunk)
    }
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; chunk.fill(0) }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) }
    catch { throw new GeminiModelEvidenceV2ServiceError('GENERATION_V2_GEMINI_MODEL_EVIDENCE_RESPONSE_INVALID') }
    finally { bytes.fill(0) }
  } finally {
    for (const chunk of chunks) chunk.fill(0)
  }
}

export function createGeminiModelEvidenceV2Service(input: Readonly<{
  db: BetterSqlite3.Database
  credentialService: Epoch2RuntimeCredentialService
  fetchImpl?: typeof fetch
  nowMs?: () => number
}>) {
  const db = input.db
  const nowMs = input.nowMs ?? Date.now
  const fetchImpl = input.fetchImpl ?? session.defaultSession.fetch.bind(session.defaultSession)
  db.pragma('foreign_keys = ON')

  function readRow(scope: string, profileId: string): Row | undefined {
    return db.prepare(`SELECT credential_scope_id, endpoint_profile_id, row_generation, endpoint_set_revision,
      descriptor_revision, descriptor_digest, observed_at_ms, response_revision, response_digest, response_json
      FROM gemini_model_evidence_sets WHERE credential_scope_id=? AND endpoint_profile_id=?`).get(scope, profileId) as Row | undefined
  }
  function readClock(scope: string, profileId: string): number | undefined {
    const row = db.prepare(`SELECT last_generation FROM gemini_model_evidence_generation_clock
      WHERE credential_scope_id=? AND endpoint_profile_id=?`).get(scope, profileId) as { last_generation?: unknown } | undefined
    return row ? positive(row.last_generation) : undefined
  }
  function validateRow(row: Row, profile: VerifiedGeminiDeveloperApiEndpointProfileV2, scope: string) {
    const rowGeneration = positive(row.row_generation)
    const observedAtMs = nonnegative(row.observed_at_ms)
    if (row.credential_scope_id !== scope || row.endpoint_profile_id !== profile.endpointProfileId.value ||
        row.endpoint_set_revision !== profile.endpointSetRevision.value ||
        row.descriptor_revision !== profile.descriptors.models.descriptorRevision.value ||
        row.descriptor_digest !== profile.descriptors.models.descriptorDigest.value) {
      throw new GeminiModelEvidenceV2ServiceError('GENERATION_V2_GEMINI_MODEL_EVIDENCE_INVALID')
    }
    let response: GeminiModelsEvidenceV1
    try { response = decodeGeminiModelsEvidenceV1(JSON.parse(row.response_json)) } catch {
      throw new GeminiModelEvidenceV2ServiceError('GENERATION_V2_GEMINI_MODEL_EVIDENCE_INVALID')
    }
    if (response.responseRevision !== row.response_revision || response.responseDigest !== row.response_digest) {
      throw new GeminiModelEvidenceV2ServiceError('GENERATION_V2_GEMINI_MODEL_EVIDENCE_INVALID')
    }
    return Object.freeze({ rowGeneration, observedAtMs, response })
  }
  function commit(lease: Epoch2RuntimeCredentialLease, profile: VerifiedGeminiDeveloperApiEndpointProfileV2,
    response: GeminiModelsEvidenceV1) {
    if (!isEpoch2RuntimeCredentialLease(lease) || lease.providerKey !== 'google_ai_studio') {
      throw new GeminiModelEvidenceV2ServiceError('GENERATION_V2_GEMINI_MODEL_EVIDENCE_INVALID')
    }
    const observedAtMs = nowMs()
    const scope = lease.credentialScopeId
    const profileId = profile.endpointProfileId.value
    const transaction = db.transaction(() => {
      lease.assertCurrent()
      const current = readRow(scope, profileId)
      const clock = readClock(scope, profileId)
      const prior = current ? validateRow(current, profile, scope) : null
      if ((prior?.rowGeneration ?? undefined) !== clock || (prior && observedAtMs < prior.observedAtMs)) {
        throw new GeminiModelEvidenceV2ServiceError('GENERATION_V2_GEMINI_MODEL_EVIDENCE_CAS_CONFLICT')
      }
      const next = (prior?.rowGeneration ?? 0) + 1
      const clockWrite = prior
        ? db.prepare(`UPDATE gemini_model_evidence_generation_clock SET last_generation=?
            WHERE credential_scope_id=? AND endpoint_profile_id=? AND last_generation=?`).run(next, scope, profileId, prior.rowGeneration)
        : db.prepare(`INSERT INTO gemini_model_evidence_generation_clock
            (credential_scope_id, endpoint_profile_id, last_generation) VALUES (?, ?, ?)
            ON CONFLICT DO NOTHING`).run(scope, profileId, next)
      if (clockWrite.changes !== 1) throw new GeminiModelEvidenceV2ServiceError('GENERATION_V2_GEMINI_MODEL_EVIDENCE_CAS_CONFLICT')
      const values = [scope, profileId, next, profile.endpointSetRevision.value,
        profile.descriptors.models.descriptorRevision.value, profile.descriptors.models.descriptorDigest.value,
        observedAtMs, response.responseRevision, response.responseDigest, response.canonicalJson] as const
      const write = prior
        ? db.prepare(`UPDATE gemini_model_evidence_sets SET row_generation=?, endpoint_set_revision=?, descriptor_revision=?,
            descriptor_digest=?, observed_at_ms=?, response_revision=?, response_digest=?, response_json=?
            WHERE credential_scope_id=? AND endpoint_profile_id=? AND row_generation=?`).run(
            next, values[3], values[4], values[5], observedAtMs, values[7], values[8], values[9], scope, profileId, prior.rowGeneration)
        : db.prepare(`INSERT INTO gemini_model_evidence_sets (credential_scope_id, endpoint_profile_id, row_generation,
            endpoint_set_revision, descriptor_revision, descriptor_digest, observed_at_ms, response_revision,
            response_digest, response_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`).run(...values)
      if (write.changes !== 1) throw new GeminiModelEvidenceV2ServiceError('GENERATION_V2_GEMINI_MODEL_EVIDENCE_CAS_CONFLICT')
      lease.assertCurrent()
      return Object.freeze({ rowGeneration: next, observedAtMs })
    })
    return transaction.immediate()
  }

  async function refresh(profile: VerifiedGeminiDeveloperApiEndpointProfileV2, lease: Epoch2RuntimeCredentialLease,
    externalSignal?: AbortSignal) {
    const controller = new AbortController()
    const abort = () => controller.abort()
    externalSignal?.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(abort, 30_000); (timer as NodeJS.Timeout).unref?.()
    try {
      const all: GeminiModelVisibilityRecordV1[] = []
      let pageToken: string | null = null
      for (let page = 0; page < 100; page += 1) {
        const url = new URL(profile.descriptors.models.endpoint)
        url.searchParams.set('pageSize', '1000')
        if (pageToken) url.searchParams.set('pageToken', pageToken)
        let response: Response
        try {
          response = await fetchImpl(url.toString(), {
            method: 'GET', headers: Object.freeze({ Accept: 'application/json', 'x-goog-api-key': lease.credential }),
            redirect: 'error', credentials: 'omit', cache: 'no-store', signal: controller.signal,
          })
        } catch {
          throw new GeminiModelEvidenceV2ServiceError('GENERATION_V2_GEMINI_MODEL_EVIDENCE_TRANSPORT_FAILED')
        }
        const responseUrl = typeof response.url === 'string' ? response.url.trim() : ''
        if (response.status !== 200 || (responseUrl.length > 0 && responseUrl !== url.toString()) ||
            response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
          try { void response.body?.cancel() } catch { /* release only */ }
          throw new GeminiModelEvidenceV2ServiceError('GENERATION_V2_GEMINI_MODEL_EVIDENCE_HTTP_FAILED')
        }
        const rawModels = await readBody(response, controller.signal)
        const decoded = decodeGeminiModelsEvidenceV1(rawModels)
        all.push(...decoded.models)
        pageToken = decoded.nextPageToken
        if (!pageToken) break
        if (page === 99) throw new GeminiModelEvidenceV2ServiceError('GENERATION_V2_GEMINI_MODEL_EVIDENCE_RESPONSE_INVALID')
      }
      const combined = decodeGeminiModelsEvidenceV1({ models: all })
      lease.assertCurrent()
      return Object.freeze({ response: combined, committed: commit(lease, profile, combined) })
    } finally {
      clearTimeout(timer)
      externalSignal?.removeEventListener('abort', abort)
    }
  }

  return Object.freeze({
    withRefreshedExactModelEvidence: async <T>(request: Readonly<{
      expectedCredentialRevision: number
      expectedCredentialScopeId: CredentialScopeIdV2
      endpointProfile: VerifiedGeminiDeveloperApiEndpointProfileV2
      modelId: Identity<'model_id'>
      signal?: AbortSignal
      consume: (authority: VerifiedGeminiModelVisibilityEvidenceV2) => Promise<T> | T
    }>): Promise<T> => {
      if (!isVerifiedGeminiDeveloperApiEndpointProfileV2(request.endpointProfile) ||
          !isGenerationV2Identity(request.modelId, 'model_id') || request.modelId.value.startsWith('models/') ||
          typeof request.consume !== 'function') {
        throw new GeminiModelEvidenceV2ServiceError('GENERATION_V2_GEMINI_MODEL_EVIDENCE_INVALID')
      }
      return input.credentialService.withCredential({
        providerKey: 'google_ai_studio', expectedRevision: request.expectedCredentialRevision,
        expectedCredentialScopeId: request.expectedCredentialScopeId,
        consume: async (lease) => {
          const refreshed = await refresh(request.endpointProfile, lease, request.signal)
          const model = refreshed.response.models.find((entry) => entry.baseModelId === request.modelId.value)
          if (!model) throw new GeminiModelEvidenceV2ServiceError('GENERATION_V2_GEMINI_MODEL_EVIDENCE_MODEL_MISSING')
          if (!model.supportedGenerationMethods.includes('generateContent')) {
            throw new GeminiModelEvidenceV2ServiceError('GENERATION_V2_GEMINI_MODEL_EVIDENCE_METHOD_UNAVAILABLE')
          }
          const scope = lease.credentialScopeId
          const authority = Object.freeze({
            trust: 'verified_gemini_model_visibility_evidence' as const,
            usage: 'provider_binding_capability_input_only' as const,
            executionAuthority: 'none' as const,
            providerId: request.endpointProfile.providerId,
            credentialScopeId: GenerationV2Identity.create('credential_scope_id', scope),
            credentialRevision: lease.revision,
            endpointProfileId: request.endpointProfile.endpointProfileId,
            endpointSetRevision: request.endpointProfile.endpointSetRevision,
            descriptorRevision: request.endpointProfile.descriptors.models.descriptorRevision,
            descriptorDigest: request.endpointProfile.descriptors.models.descriptorDigest,
            modelId: request.modelId,
            model,
            rowGeneration: refreshed.committed.rowGeneration,
            observedAtMs: refreshed.committed.observedAtMs,
            modelsResponseRevision: refreshed.response.responseRevision,
            modelsResponseDigest: GenerationV2Digest.create('evidence_digest', refreshed.response.responseDigest),
            assertCurrent: () => {
              if (!authorities.has(authority)) throw new GeminiModelEvidenceV2ServiceError('GENERATION_V2_GEMINI_MODEL_EVIDENCE_CAS_CONFLICT')
              lease.assertCurrent()
              const row = readRow(scope, request.endpointProfile.endpointProfileId.value)
              if (!row || readClock(scope, request.endpointProfile.endpointProfileId.value) !== refreshed.committed.rowGeneration) {
                throw new GeminiModelEvidenceV2ServiceError('GENERATION_V2_GEMINI_MODEL_EVIDENCE_CAS_CONFLICT')
              }
              const current = validateRow(row, request.endpointProfile, scope)
              if (current.response.responseDigest !== refreshed.response.responseDigest ||
                  !current.response.models.some((entry) => entry.baseModelId === request.modelId.value)) {
                throw new GeminiModelEvidenceV2ServiceError('GENERATION_V2_GEMINI_MODEL_EVIDENCE_CAS_CONFLICT')
              }
            },
          })
          authorities.add(authority)
          try { const result = await request.consume(authority); authority.assertCurrent(); return result }
          finally { authorities.delete(authority) }
        },
      })
    },
  })
}
