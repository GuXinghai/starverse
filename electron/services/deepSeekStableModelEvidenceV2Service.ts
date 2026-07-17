import type BetterSqlite3 from 'better-sqlite3'
import { session } from 'electron'
import {
  isEpoch2RuntimeCredentialLease,
  type Epoch2RuntimeCredentialLease,
  type Epoch2RuntimeCredentialService,
} from '../credentials/epoch2RuntimeCredentialService'
import type { CredentialScopeIdV2 } from '../../infra/security/credentialScopeV2Primitive'
import {
  canonicalizeDeepSeekStableModelsEvidenceV2,
  decodeDeepSeekStableModelsEvidenceJsonV2,
  DeepSeekStableModelsEvidenceV2Error,
  DEEPSEEK_STABLE_MODELS_EVIDENCE_MAX_BYTES_V2,
  type DecodedDeepSeekStableModelsEvidenceV2,
} from '../../src/next/generation-v2/providers/deepseek/stableModelsEvidenceV2'
import {
  isVerifiedDeepSeekStableEndpointProfileV2,
  type VerifiedDeepSeekStableEndpointProfileV2,
} from '../../src/next/generation-v2/providers/deepseek/stableEndpointProfileV2'
import {
  isGenerationV2Identity,
  readGenerationV2Digest,
  readGenerationV2Identity,
  GenerationV2Digest,
  GenerationV2Identity,
  type GenerationV2Identity as GenerationIdentity,
} from '../../src/next/generation-v2/domain/identityV2'
import { stableSerializeProviderRequestV2 } from '../../src/next/generation-v2/compiler/stableSerialize'

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

export type VerifiedDeepSeekStableModelEvidenceV2 = Readonly<{
  classification: 'verified_deepseek_stable_model_visibility_evidence'
  trust: 'verified_deepseek_stable_model_evidence'
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
  ownedBy: string
  rowGeneration: number
  observedAtMs: number
  modelsResponseRevision: string
  modelsResponseDigest: GenerationV2Digest<'evidence_digest'>
  assertCurrent(): void
}>

export class DeepSeekStableModelEvidenceV2ServiceError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_INPUT_INVALID'
    | 'GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_PROFILE_INVALID'
    | 'GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_HTTP_FAILED'
    | 'GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_TRANSPORT_FAILED'
    | 'GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_RESPONSE_INCOMPLETE'
    | 'GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_RESPONSE_TOO_LARGE'
    | 'GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_RESPONSE_INVALID'
    | 'GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_MODEL_MISSING'
    | 'GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_CAS_CONFLICT'
    | 'GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_STATE_INVALID'
    | 'GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_CLOCK_REGRESSION'
    | 'GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_GENERATION_EXHAUSTED') {
    super(code)
    this.name = 'DeepSeekStableModelEvidenceV2ServiceError'
  }
}

const modelEvidenceAuthorities = new WeakSet<object>()
const DEEPSEEK_STABLE_MODELS_REFRESH_TIMEOUT_MS_V2 = 30_000

export function isVerifiedDeepSeekStableModelEvidenceV2(
  value: unknown,
): value is VerifiedDeepSeekStableModelEvidenceV2 {
  return Boolean(value && typeof value === 'object' && modelEvidenceAuthorities.has(value))
}

function abortScope(external: AbortSignal | undefined): Readonly<{
  signal: AbortSignal
  dispose(): void
}> {
  const controller = new AbortController()
  const onExternalAbort = () => controller.abort()
  if (external?.aborted) controller.abort()
  else external?.addEventListener('abort', onExternalAbort, { once: true })
  const timer = setTimeout(() => controller.abort(), DEEPSEEK_STABLE_MODELS_REFRESH_TIMEOUT_MS_V2)
  ;(timer as NodeJS.Timeout).unref?.()
  return Object.freeze({
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer)
      external?.removeEventListener('abort', onExternalAbort)
    },
  })
}

async function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    throw new DeepSeekStableModelEvidenceV2ServiceError(
      'GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_TRANSPORT_FAILED',
    )
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DeepSeekStableModelEvidenceV2ServiceError(
      'GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_TRANSPORT_FAILED',
    ))
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

function cancelBody(response: Response): void {
  try { void response.body?.cancel().catch(() => undefined) } catch { /* best-effort connection release */ }
}

async function readCompleteBody(response: Response, signal: AbortSignal): Promise<Uint8Array> {
  const contentLength = response.headers.get('content-length')
  if (contentLength !== null && (!/^\d+$/u.test(contentLength) ||
      Number(contentLength) > DEEPSEEK_STABLE_MODELS_EVIDENCE_MAX_BYTES_V2)) {
    throw new DeepSeekStableModelEvidenceV2ServiceError(
      'GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_RESPONSE_TOO_LARGE',
    )
  }
  const contentEncoding = response.headers.get('content-encoding')?.trim().toLowerCase()
  const expectedLength = contentLength === null || (contentEncoding && contentEncoding !== 'identity')
    ? null
    : Number(contentLength)
  const reader = response.body?.getReader()
  if (!reader) {
    throw new DeepSeekStableModelEvidenceV2ServiceError(
      'GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_RESPONSE_INCOMPLETE',
    )
  }
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const result = await abortable(reader.read(), signal)
      if (result.done) break
      if (!ArrayBuffer.isView(result.value) || result.value.BYTES_PER_ELEMENT !== 1) {
        throw new DeepSeekStableModelEvidenceV2ServiceError(
          'GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_RESPONSE_INCOMPLETE',
        )
      }
      const chunk = new Uint8Array(
        result.value.buffer,
        result.value.byteOffset,
        result.value.byteLength,
      )
      if (chunk.byteLength === 0) continue
      total += chunk.byteLength
      if (total > DEEPSEEK_STABLE_MODELS_EVIDENCE_MAX_BYTES_V2) {
        try { void reader.cancel().catch(() => undefined) } catch { /* best-effort connection release */ }
        throw new DeepSeekStableModelEvidenceV2ServiceError(
          'GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_RESPONSE_TOO_LARGE',
        )
      }
      chunks.push(Uint8Array.from(chunk))
    }
  } catch (error) {
    for (const chunk of chunks) chunk.fill(0)
    try { void reader.cancel().catch(() => undefined) } catch { /* best-effort connection release */ }
    if (error instanceof DeepSeekStableModelEvidenceV2ServiceError) throw error
    throw new DeepSeekStableModelEvidenceV2ServiceError(
      'GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_RESPONSE_INCOMPLETE',
    )
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
    chunk.fill(0)
  }
  if (expectedLength !== null && total !== expectedLength) {
    bytes.fill(0)
    throw new DeepSeekStableModelEvidenceV2ServiceError(
      'GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_RESPONSE_INCOMPLETE',
    )
  }
  return bytes
}

function exactProfile(value: unknown): asserts value is VerifiedDeepSeekStableEndpointProfileV2 {
  if (!isVerifiedDeepSeekStableEndpointProfileV2(value)) {
    throw new DeepSeekStableModelEvidenceV2ServiceError(
      'GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_PROFILE_INVALID',
    )
  }
}

export function createDeepSeekStableModelEvidenceV2Service(input: Readonly<{
  db: BetterSqlite3.Database
  credentialService: Epoch2RuntimeCredentialService
  nowMs?: () => number
}>): Readonly<{
  refresh(input: Readonly<{
    expectedCredentialRevision: number
    expectedCredentialScopeId: CredentialScopeIdV2
    endpointProfile: VerifiedDeepSeekStableEndpointProfileV2
    signal?: AbortSignal
  }>): Promise<Readonly<{ rowGeneration: number; observedAtMs: number; modelCount: number }>>
  withRefreshedExactModelEvidence<T>(input: Readonly<{
    expectedCredentialRevision: number
    expectedCredentialScopeId: CredentialScopeIdV2
    endpointProfile: VerifiedDeepSeekStableEndpointProfileV2
    modelId: GenerationIdentity<'model_id'>
    signal?: AbortSignal
    consume: (evidence: VerifiedDeepSeekStableModelEvidenceV2) => Promise<T> | T
  }>): Promise<T>
}> {
  const db = input.db
  const nowMs = input.nowMs ?? Date.now
  db.pragma('foreign_keys = ON')
  if (db.pragma('foreign_keys', { simple: true }) !== 1) {
    throw new DeepSeekStableModelEvidenceV2ServiceError('GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_STATE_INVALID')
  }

  function positiveInteger(value: unknown): number {
    if (!Number.isSafeInteger(value) || (value as number) <= 0) {
      throw new DeepSeekStableModelEvidenceV2ServiceError('GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_STATE_INVALID')
    }
    return value as number
  }

  function nonNegativeInteger(value: unknown): number {
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
      throw new DeepSeekStableModelEvidenceV2ServiceError('GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_STATE_INVALID')
    }
    return value as number
  }

  function readRow(scope: string, profileId: string): EvidenceRow | undefined {
    return db.prepare(`
      SELECT credential_scope_id, endpoint_profile_id, row_generation, endpoint_set_revision,
             descriptor_revision, descriptor_digest, observed_at_ms, response_revision,
             response_digest, response_json
      FROM deepseek_stable_model_evidence_sets
      WHERE credential_scope_id = ? AND endpoint_profile_id = ?
    `).get(scope, profileId) as EvidenceRow | undefined
  }

  function readClock(scope: string, profileId: string): number | undefined {
    const row = db.prepare(`
      SELECT last_generation FROM deepseek_stable_model_evidence_generation_clock
      WHERE credential_scope_id = ? AND endpoint_profile_id = ?
    `).get(scope, profileId) as { last_generation: unknown } | undefined
    return row ? positiveInteger(row.last_generation) : undefined
  }

  function validateRow(
    row: EvidenceRow,
    profile: VerifiedDeepSeekStableEndpointProfileV2,
    scope: string,
  ): Readonly<{
    rowGeneration: number
    observedAtMs: number
    response: DecodedDeepSeekStableModelsEvidenceV2
  }> {
    const profileId = readGenerationV2Identity(profile.endpointProfileId, 'endpoint_profile_id')
    const rowGeneration = positiveInteger(row.row_generation)
    const observedAtMs = nonNegativeInteger(row.observed_at_ms)
    if (row.credential_scope_id !== scope || row.endpoint_profile_id !== profileId ||
        row.endpoint_set_revision !== profile.endpointSetRevision.value ||
        row.descriptor_revision !== profile.descriptor.descriptorRevision.value ||
        row.descriptor_digest !== profile.descriptor.descriptorDigest.value) {
      throw new DeepSeekStableModelEvidenceV2ServiceError('GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_STATE_INVALID')
    }
    let response: DecodedDeepSeekStableModelsEvidenceV2
    try { response = decodeDeepSeekStableModelsEvidenceJsonV2(row.response_json) } catch (error) {
      if (error instanceof DeepSeekStableModelsEvidenceV2Error) {
        throw new DeepSeekStableModelEvidenceV2ServiceError('GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_STATE_INVALID')
      }
      throw error
    }
    if (response.responseRevision !== row.response_revision || response.responseDigest.value !== row.response_digest) {
      throw new DeepSeekStableModelEvidenceV2ServiceError('GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_STATE_INVALID')
    }
    return Object.freeze({ rowGeneration, observedAtMs, response })
  }

  function runImmediate<T>(transaction: { immediate(): T }): T {
    try { return transaction.immediate() } catch (error) {
      if (error instanceof DeepSeekStableModelEvidenceV2ServiceError) throw error
      const code = (error as { code?: unknown })?.code
      if (code === 'SQLITE_BUSY' || code === 'SQLITE_BUSY_SNAPSHOT' || code === 'SQLITE_LOCKED') {
        throw new DeepSeekStableModelEvidenceV2ServiceError('GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_CAS_CONFLICT')
      }
      throw error
    }
  }

  function commitCompleteResponse(args: Readonly<{
    credentialLease: Epoch2RuntimeCredentialLease
    profile: VerifiedDeepSeekStableEndpointProfileV2
    response: DecodedDeepSeekStableModelsEvidenceV2
  }>): Readonly<{ rowGeneration: number; observedAtMs: number; modelCount: number }> {
    if (!isEpoch2RuntimeCredentialLease(args.credentialLease) || args.credentialLease.providerKey !== 'deepseek') {
      throw new DeepSeekStableModelEvidenceV2ServiceError('GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_INPUT_INVALID')
    }
    const observedAtMs = nowMs()
    if (!Number.isSafeInteger(observedAtMs) || observedAtMs < 0) {
      throw new DeepSeekStableModelEvidenceV2ServiceError('GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_CLOCK_REGRESSION')
    }
    const scope = args.credentialLease.credentialScopeId
    const profileId = args.profile.endpointProfileId.value
    const transaction = db.transaction(() => {
      args.credentialLease.assertCurrent()
      const current = readRow(scope, profileId)
      const clock = readClock(scope, profileId)
      let priorGeneration = 0
      if (current) {
        const validated = validateRow(current, args.profile, scope)
        if (clock !== validated.rowGeneration) {
          throw new DeepSeekStableModelEvidenceV2ServiceError('GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_STATE_INVALID')
        }
        if (observedAtMs < validated.observedAtMs) {
          throw new DeepSeekStableModelEvidenceV2ServiceError('GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_CLOCK_REGRESSION')
        }
        priorGeneration = validated.rowGeneration
      } else if (clock !== undefined) {
        throw new DeepSeekStableModelEvidenceV2ServiceError('GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_STATE_INVALID')
      }
      if (priorGeneration >= Number.MAX_SAFE_INTEGER) {
        throw new DeepSeekStableModelEvidenceV2ServiceError('GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_GENERATION_EXHAUSTED')
      }
      const rowGeneration = priorGeneration + 1
      const clockWrite = current
        ? db.prepare(`UPDATE deepseek_stable_model_evidence_generation_clock SET last_generation = ?
            WHERE credential_scope_id = ? AND endpoint_profile_id = ? AND last_generation = ?`)
          .run(rowGeneration, scope, profileId, priorGeneration)
        : db.prepare(`INSERT INTO deepseek_stable_model_evidence_generation_clock (
            credential_scope_id, endpoint_profile_id, last_generation
          ) VALUES (?, ?, ?) ON CONFLICT(credential_scope_id, endpoint_profile_id) DO NOTHING`)
          .run(scope, profileId, rowGeneration)
      if (clockWrite.changes !== 1) {
        throw new DeepSeekStableModelEvidenceV2ServiceError('GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_CAS_CONFLICT')
      }
      const values = [
        scope, profileId, rowGeneration,
        args.profile.endpointSetRevision.value,
        args.profile.descriptor.descriptorRevision.value,
        readGenerationV2Digest(args.profile.descriptor.descriptorDigest, 'descriptor_digest'),
        observedAtMs, args.response.responseRevision,
        readGenerationV2Digest(args.response.responseDigest, 'evidence_digest'),
        args.response.canonicalJson,
      ] as const
      const write = current
        ? db.prepare(`UPDATE deepseek_stable_model_evidence_sets SET
            row_generation = ?, endpoint_set_revision = ?, descriptor_revision = ?, descriptor_digest = ?,
            observed_at_ms = ?, response_revision = ?, response_digest = ?, response_json = ?
          WHERE credential_scope_id = ? AND endpoint_profile_id = ? AND row_generation = ?`)
          .run(rowGeneration, values[3], values[4], values[5], observedAtMs,
            values[7], values[8], values[9], scope, profileId, priorGeneration)
        : db.prepare(`INSERT INTO deepseek_stable_model_evidence_sets (
            credential_scope_id, endpoint_profile_id, row_generation, endpoint_set_revision,
            descriptor_revision, descriptor_digest, observed_at_ms, response_revision,
            response_digest, response_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(credential_scope_id, endpoint_profile_id) DO NOTHING`).run(...values)
      if (write.changes !== 1) {
        throw new DeepSeekStableModelEvidenceV2ServiceError('GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_CAS_CONFLICT')
      }
      args.credentialLease.assertCurrent()
      return Object.freeze({ rowGeneration, observedAtMs, modelCount: args.response.models.length })
    })
    return runImmediate(transaction)
  }

  async function fetchAndCommit(request: Readonly<{
    endpointProfile: VerifiedDeepSeekStableEndpointProfileV2
    signal?: AbortSignal
  }>, credentialLease: Epoch2RuntimeCredentialLease): Promise<Readonly<{
    committed: Readonly<{ rowGeneration: number; observedAtMs: number; modelCount: number }>
    response: DecodedDeepSeekStableModelsEvidenceV2
  }>> {
    if (!isEpoch2RuntimeCredentialLease(credentialLease) || credentialLease.providerKey !== 'deepseek') {
      throw new DeepSeekStableModelEvidenceV2ServiceError('GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_INPUT_INVALID')
    }
    const url = `${request.endpointProfile.descriptor.apiOrigin}${request.endpointProfile.descriptor.modelsPath}`
    const lifecycle = abortScope(request.signal)
    let response: Response | undefined
    try {
      try {
        response = await abortable(session.defaultSession.fetch(url, {
          method: 'GET',
          headers: Object.freeze({
            Accept: 'application/json',
            Authorization: `Bearer ${credentialLease.credential}`,
          }),
          redirect: 'error',
          credentials: 'omit',
          cache: 'no-store',
          signal: lifecycle.signal,
        }), lifecycle.signal)
      } catch (error) {
        if (error instanceof DeepSeekStableModelEvidenceV2ServiceError) throw error
        throw new DeepSeekStableModelEvidenceV2ServiceError(
          'GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_TRANSPORT_FAILED',
        )
      }
      if (response.status !== 200 || response.url !== url) {
        cancelBody(response)
        throw new DeepSeekStableModelEvidenceV2ServiceError(
          'GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_HTTP_FAILED',
        )
      }
      const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
      if (contentType !== 'application/json') {
        cancelBody(response)
        throw new DeepSeekStableModelEvidenceV2ServiceError(
          'GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_RESPONSE_INVALID',
        )
      }
      const bytes = await readCompleteBody(response, lifecycle.signal)
      try {
        let text: string
        try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch {
          throw new DeepSeekStableModelEvidenceV2ServiceError(
            'GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_RESPONSE_INVALID',
          )
        }
        let raw: unknown
        try { raw = JSON.parse(text) } catch {
          throw new DeepSeekStableModelEvidenceV2ServiceError(
            'GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_RESPONSE_INVALID',
          )
        }
        let decoded: DecodedDeepSeekStableModelsEvidenceV2
        try {
          const persisted = canonicalizeDeepSeekStableModelsEvidenceV2(raw)
          decoded = decodeDeepSeekStableModelsEvidenceJsonV2(stableSerializeProviderRequestV2(persisted))
        } catch (error) {
          if (error instanceof DeepSeekStableModelsEvidenceV2Error) {
            throw new DeepSeekStableModelEvidenceV2ServiceError(
              'GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_RESPONSE_INVALID',
            )
          }
          throw error
        }
        credentialLease.assertCurrent()
        const committed = commitCompleteResponse({
          credentialLease, profile: request.endpointProfile, response: decoded,
        })
        return Object.freeze({ committed, response: decoded })
      } finally { bytes.fill(0) }
    } finally {
      lifecycle.dispose()
    }
  }

  return Object.freeze({
    refresh: async (request) => {
      exactProfile(request.endpointProfile)
      return input.credentialService.withCredential({
        providerKey: 'deepseek',
        expectedRevision: request.expectedCredentialRevision,
        expectedCredentialScopeId: request.expectedCredentialScopeId,
        consume: async (credentialLease) =>
          (await fetchAndCommit(request, credentialLease)).committed,
      })
    },
    withRefreshedExactModelEvidence: async (request) => {
      exactProfile(request.endpointProfile)
      if (!isGenerationV2Identity(request.modelId, 'model_id') || typeof request.consume !== 'function') {
        throw new DeepSeekStableModelEvidenceV2ServiceError('GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_INPUT_INVALID')
      }
      return input.credentialService.withCredential({
        providerKey: 'deepseek',
        expectedRevision: request.expectedCredentialRevision,
        expectedCredentialScopeId: request.expectedCredentialScopeId,
        consume: async (credentialLease) => {
          const refreshed = await fetchAndCommit(request, credentialLease)
          const model = refreshed.response.models.find((item) => item.modelId.value === request.modelId.value)
          if (!model) {
            throw new DeepSeekStableModelEvidenceV2ServiceError('GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_MODEL_MISSING')
          }
          const scope = credentialLease.credentialScopeId
          const profileId = request.endpointProfile.endpointProfileId.value
          const authority = Object.freeze({
            classification: 'verified_deepseek_stable_model_visibility_evidence' as const,
            trust: 'verified_deepseek_stable_model_evidence' as const,
            usage: 'provider_binding_capability_input_only' as const,
            executionAuthority: 'none' as const,
            providerId: request.endpointProfile.providerId,
            credentialScopeId: GenerationV2Identity.create('credential_scope_id', scope),
            credentialRevision: credentialLease.revision,
            endpointProfileId: request.endpointProfile.endpointProfileId,
            endpointSetRevision: request.endpointProfile.endpointSetRevision,
            descriptorRevision: request.endpointProfile.descriptor.descriptorRevision,
            descriptorDigest: request.endpointProfile.descriptor.descriptorDigest,
            modelId: request.modelId,
            ownedBy: model.ownedBy,
            rowGeneration: refreshed.committed.rowGeneration,
            observedAtMs: refreshed.committed.observedAtMs,
            modelsResponseRevision: refreshed.response.responseRevision,
            modelsResponseDigest: refreshed.response.responseDigest,
            assertCurrent: () => {
              if (!modelEvidenceAuthorities.has(authority)) {
                throw new DeepSeekStableModelEvidenceV2ServiceError('GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_CAS_CONFLICT')
              }
              credentialLease.assertCurrent()
              const current = readRow(scope, profileId)
              const currentClock = readClock(scope, profileId)
              if (!current || currentClock !== refreshed.committed.rowGeneration) {
                throw new DeepSeekStableModelEvidenceV2ServiceError('GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_CAS_CONFLICT')
              }
              const currentValue = validateRow(current, request.endpointProfile, scope)
              if (currentValue.rowGeneration !== refreshed.committed.rowGeneration ||
                  currentValue.response.responseDigest.value !== refreshed.response.responseDigest.value ||
                  !currentValue.response.models.some((item) => item.modelId.value === request.modelId.value)) {
                throw new DeepSeekStableModelEvidenceV2ServiceError('GENERATION_V2_DEEPSEEK_MODEL_EVIDENCE_CAS_CONFLICT')
              }
            },
          })
          modelEvidenceAuthorities.add(authority)
          try {
            const result = await request.consume(authority)
            authority.assertCurrent()
            return result
          } finally { modelEvidenceAuthorities.delete(authority) }
        },
      })
    },
  })
}
