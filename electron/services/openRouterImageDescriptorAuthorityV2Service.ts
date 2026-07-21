import type BetterSqlite3 from 'better-sqlite3'
import { session } from 'electron'
import {
  OpenRouterImageEndpointRepo,
  OpenRouterImageEndpointRepoV2Error,
} from '../../infra/db/repo/openRouterImageEndpointRepo'
import type { CredentialScopeIdV2 } from '../../infra/security/credentialScopeV2Primitive'
import {
  OPENROUTER_IMAGE_DESCRIPTOR_CACHE_MAX_BYTES_V2,
} from '../../src/next/generation-v2/providers/openrouter-images/canonicalDescriptorV2'
import {
  decideOpenRouterImageDescriptorFreshnessV2,
  type OpenRouterImageDescriptorFreshnessDecisionV2,
} from '../../src/next/generation-v2/providers/openrouter-images/descriptorFreshnessDecisionV2'
import {
  decodeOpenRouterImageDescriptorFreshnessPairV2,
  type OpenRouterImageDescriptorFreshnessPairV2,
} from '../../src/next/generation-v2/providers/openrouter-images/descriptorFreshnessSettingsV2'
import type { DecodedOpenRouterImageDescriptorCacheRecordV2 } from '../../src/next/generation-v2/providers/openrouter-images/descriptorCacheRecordV2'
import { GenerationV2Identity } from '../../src/next/generation-v2/domain/identityV2'
import type { Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'

const OPENROUTER_IMAGES_ORIGIN_V2 = 'https://openrouter.ai' as const

type Fetch = (url: string, init: RequestInit) => Promise<Response>

export class OpenRouterImageDescriptorAuthorityV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENROUTER_DESCRIPTOR_AUTHORITY_INVALID'
    | 'GENERATION_V2_OPENROUTER_DESCRIPTOR_CREDENTIAL_REJECTED'
    | 'GENERATION_V2_OPENROUTER_DESCRIPTOR_MODEL_NOT_FOUND'
    | 'GENERATION_V2_OPENROUTER_DESCRIPTOR_REFRESH_REQUIRED'
    | 'GENERATION_V2_OPENROUTER_DESCRIPTOR_RESPONSE_INVALID') {
    super(code)
    this.name = 'OpenRouterImageDescriptorAuthorityV2Error'
  }
}

function responseContentLength(response: Response): number | null {
  const raw = response.headers.get('content-length')
  if (raw === null) return null
  if (!/^[0-9]+$/u.test(raw)) return null
  const length = Number(raw)
  return Number.isSafeInteger(length) ? length : null
}

function descriptorUrl(modelId: string): string {
  return `${OPENROUTER_IMAGES_ORIGIN_V2}/api/v1/images/models/${encodeURIComponent(modelId)}/endpoints`
}

function freshness(
  cache: DecodedOpenRouterImageDescriptorCacheRecordV2 | null,
  nowMs: number,
  settings: OpenRouterImageDescriptorFreshnessPairV2,
): OpenRouterImageDescriptorFreshnessDecisionV2 {
  return decideOpenRouterImageDescriptorFreshnessV2({
    fetchedAtMs: cache?.fetchedAtMs ?? null,
    nowMs,
    settings,
  })
}

/**
 * Authority for the user-configured descriptor freshness policy. It is the
 * only component permitted to perform the bounded descriptor GET. Generation
 * transports never call it and therefore stay one-attempt/no-fallback.
 */
export function createOpenRouterImageDescriptorAuthorityV2Service(input: Readonly<{
  db: BetterSqlite3.Database
  credentialService: Epoch2RuntimeCredentialService
  fetchImpl?: Fetch
  nowMs?: () => number
}>) {
  const endpointRepo = new OpenRouterImageEndpointRepo(input.db, input.nowMs)
  const fetchImpl = input.fetchImpl ?? session.defaultSession.fetch.bind(session.defaultSession)
  const nowMs = input.nowMs ?? Date.now
  if (typeof fetchImpl !== 'function') {
    throw new OpenRouterImageDescriptorAuthorityV2Error('GENERATION_V2_OPENROUTER_DESCRIPTOR_AUTHORITY_INVALID')
  }

  async function refresh(inputValue: Readonly<{
    modelId: string
    credentialRevision: number
    credentialScopeId: CredentialScopeIdV2
    expectedGeneration: number | null
    signal?: AbortSignal
  }>): Promise<DecodedOpenRouterImageDescriptorCacheRecordV2> {
    return input.credentialService.withCredential({
      providerKey: 'openrouter',
      expectedRevision: inputValue.credentialRevision,
      expectedCredentialScopeId: inputValue.credentialScopeId,
      consume: async (lease) => {
        lease.assertCurrent()
        let response: Response
        try {
          response = await fetchImpl(descriptorUrl(inputValue.modelId), {
            method: 'GET',
            headers: { Authorization: `Bearer ${lease.credential}`, Accept: 'application/json' },
            signal: inputValue.signal,
          })
        } catch (error) {
          if (inputValue.signal?.aborted) throw error
          throw new OpenRouterImageDescriptorAuthorityV2Error('GENERATION_V2_OPENROUTER_DESCRIPTOR_REFRESH_REQUIRED')
        }
        if (response.status === 401 || response.status === 403) {
          try { await response.body?.cancel() } catch { /* best effort */ }
          throw new OpenRouterImageDescriptorAuthorityV2Error('GENERATION_V2_OPENROUTER_DESCRIPTOR_CREDENTIAL_REJECTED')
        }
        if (response.status === 404) {
          try { await response.body?.cancel() } catch { /* best effort */ }
          if (inputValue.expectedGeneration !== null) {
            try {
              endpointRepo.invalidateCurrentDescriptorSet({
                credentialScopeId: GenerationV2Identity.create('credential_scope_id', inputValue.credentialScopeId),
                modelId: GenerationV2Identity.create('model_id', inputValue.modelId),
                expectedGeneration: inputValue.expectedGeneration,
              })
            } catch (error) {
              // A concurrent successful refresh may have replaced the exact
              // descriptor we observed. That newer generation must not be
              // deleted by this stale 404. Every other repository failure is
              // an authority failure, never a disguised model-not-found.
              if (!(error instanceof OpenRouterImageEndpointRepoV2Error) ||
                  error.code !== 'GENERATION_V2_OPENROUTER_CACHE_CAS_CONFLICT') {
                throw new OpenRouterImageDescriptorAuthorityV2Error(
                  'GENERATION_V2_OPENROUTER_DESCRIPTOR_AUTHORITY_INVALID',
                )
              }
            }
          }
          throw new OpenRouterImageDescriptorAuthorityV2Error('GENERATION_V2_OPENROUTER_DESCRIPTOR_MODEL_NOT_FOUND')
        }
        if (!response.ok || responseContentLength(response) !== null && responseContentLength(response)! > OPENROUTER_IMAGE_DESCRIPTOR_CACHE_MAX_BYTES_V2) {
          try { await response.body?.cancel() } catch { /* best effort */ }
          throw new OpenRouterImageDescriptorAuthorityV2Error('GENERATION_V2_OPENROUTER_DESCRIPTOR_REFRESH_REQUIRED')
        }
        let text: string
        try { text = await response.text() } catch {
          throw new OpenRouterImageDescriptorAuthorityV2Error('GENERATION_V2_OPENROUTER_DESCRIPTOR_RESPONSE_INVALID')
        }
        if (Buffer.byteLength(text, 'utf8') > OPENROUTER_IMAGE_DESCRIPTOR_CACHE_MAX_BYTES_V2) {
          throw new OpenRouterImageDescriptorAuthorityV2Error('GENERATION_V2_OPENROUTER_DESCRIPTOR_RESPONSE_INVALID')
        }
        let responseBody: unknown
        try { responseBody = JSON.parse(text) } catch {
          throw new OpenRouterImageDescriptorAuthorityV2Error('GENERATION_V2_OPENROUTER_DESCRIPTOR_RESPONSE_INVALID')
        }
        lease.assertCurrent()
        try {
          return endpointRepo.commitSuccessfulDescriptorResponse({
            credentialScopeId: GenerationV2Identity.create('credential_scope_id', inputValue.credentialScopeId),
            requestedModelId: GenerationV2Identity.create('model_id', inputValue.modelId),
            response: responseBody,
            expectedGeneration: inputValue.expectedGeneration,
          })
        } catch (error) {
          if (error instanceof OpenRouterImageEndpointRepoV2Error) {
            throw new OpenRouterImageDescriptorAuthorityV2Error('GENERATION_V2_OPENROUTER_DESCRIPTOR_RESPONSE_INVALID')
          }
          throw error
        }
      },
    })
  }

  return Object.freeze({
    resolve: async (request: Readonly<{
      modelId: string
      credentialRevision: number
      credentialScopeId: CredentialScopeIdV2
      settings: unknown
      signal?: AbortSignal
    }>): Promise<DecodedOpenRouterImageDescriptorCacheRecordV2> => {
      const modelId = GenerationV2Identity.create('model_id', request.modelId)
      const scope = GenerationV2Identity.create('credential_scope_id', request.credentialScopeId)
      const settings = decodeOpenRouterImageDescriptorFreshnessPairV2(request.settings)
      const cached = endpointRepo.getCurrentDescriptorSet(scope, modelId)
      const decision = freshness(cached, nowMs(), settings)
      if (decision.kind === 'use_cached') return cached!
      const expectedGeneration = cached?.rowGeneration ?? null
      try {
        return await refresh({
          modelId: modelId.value,
          credentialRevision: request.credentialRevision,
          credentialScopeId: request.credentialScopeId,
          expectedGeneration,
          signal: request.signal,
        })
      } catch (error) {
        if (decision.kind === 'refresh_soft' && cached &&
            error instanceof OpenRouterImageDescriptorAuthorityV2Error &&
            error.code === 'GENERATION_V2_OPENROUTER_DESCRIPTOR_REFRESH_REQUIRED') {
          return cached
        }
        throw error
      }
    },
  })
}
