import { session } from 'electron'
import type { CredentialScopeIdV2 } from '../../infra/security/credentialScopeV2Primitive'
import { GenerationV2Digest, GenerationV2Identity, type GenerationV2Identity as Identity } from '../../src/next/generation-v2/domain/identityV2'
import {
  decodeOpenRouterChatModelsEvidenceV1,
  OPENROUTER_CHAT_MODELS_MAX_BYTES_V1,
} from '../../src/next/generation-v2/providers/openrouter/chatModelsEvidenceV1'
import {
  isVerifiedOpenRouterFirstPartyEndpointProfileV2,
  type VerifiedOpenRouterFirstPartyEndpointProfileV2,
} from '../../src/next/generation-v2/providers/openrouter/verifiedFirstPartyEndpointProfileV2'
import {
  isEpoch2RuntimeCredentialLease,
  type Epoch2RuntimeCredentialService,
} from '../credentials/epoch2RuntimeCredentialService'

type Fetch = (url: string, init: RequestInit) => Promise<Response>

export type VerifiedOpenRouterChatModelEvidenceV2 = Readonly<{
  trust: 'verified_openrouter_chat_model_evidence_v2'
  providerId: Identity<'provider_id'>
  endpointProfileId: Identity<'endpoint_profile_id'>
  endpointSetRevision: Identity<'endpoint_set_revision'>
  descriptorRevision: Identity<'descriptor_revision'>
  descriptorDigest: GenerationV2Digest<'descriptor_digest'>
  credentialScopeId: CredentialScopeIdV2
  credentialRevision: number
  modelId: Identity<'model_id'>
  supportedParameters: readonly string[]
  inputModalities: readonly string[]
  outputModalities: readonly string[]
  responseDigest: GenerationV2Digest<'evidence_digest'>
  observedAtMs: number
  assertCurrent(): void
}>

export class OpenRouterChatModelEvidenceV2ServiceError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENROUTER_CHAT_MODEL_EVIDENCE_INVALID'
    | 'GENERATION_V2_OPENROUTER_CHAT_MODEL_EVIDENCE_TRANSPORT_FAILED'
    | 'GENERATION_V2_OPENROUTER_CHAT_MODEL_EVIDENCE_HTTP_FAILED'
    | 'GENERATION_V2_OPENROUTER_CHAT_MODEL_EVIDENCE_RESPONSE_INVALID'
    | 'GENERATION_V2_OPENROUTER_CHAT_MODEL_MISSING') {
    super(code)
    this.name = 'OpenRouterChatModelEvidenceV2ServiceError'
  }
}

const authorities = new WeakSet<object>()
export function isVerifiedOpenRouterChatModelEvidenceV2(value: unknown): value is VerifiedOpenRouterChatModelEvidenceV2 {
  return Boolean(value && typeof value === 'object' && authorities.has(value))
}

export function createOpenRouterChatModelEvidenceV2Service(input: Readonly<{
  credentialService: Epoch2RuntimeCredentialService
  fetchImpl?: Fetch
  nowMs?: () => number
}>) {
  const fetchImpl = input.fetchImpl ?? session.defaultSession.fetch.bind(session.defaultSession)
  const nowMs = input.nowMs ?? Date.now
  return Object.freeze({
    withExactModelEvidence: async <T>(request: Readonly<{
      endpointProfile: VerifiedOpenRouterFirstPartyEndpointProfileV2
      expectedCredentialRevision: number
      expectedCredentialScopeId: CredentialScopeIdV2
      modelId: Identity<'model_id'>
      signal?: AbortSignal
      consume: (evidence: VerifiedOpenRouterChatModelEvidenceV2) => Promise<T> | T
    }>): Promise<T> => {
      if (!isVerifiedOpenRouterFirstPartyEndpointProfileV2(request.endpointProfile)) {
        throw new OpenRouterChatModelEvidenceV2ServiceError('GENERATION_V2_OPENROUTER_CHAT_MODEL_EVIDENCE_INVALID')
      }
      return input.credentialService.withCredential({
        providerKey: 'openrouter',
        expectedRevision: request.expectedCredentialRevision,
        expectedCredentialScopeId: request.expectedCredentialScopeId,
        consume: async (lease) => {
          if (!isEpoch2RuntimeCredentialLease(lease)) {
            throw new OpenRouterChatModelEvidenceV2ServiceError('GENERATION_V2_OPENROUTER_CHAT_MODEL_EVIDENCE_INVALID')
          }
          let response: Response
          try {
            response = await fetchImpl(request.endpointProfile.operations.chat_completions.modelsUrl, {
              method: 'GET',
              headers: { Accept: 'application/json', Authorization: `Bearer ${lease.credential}` },
              redirect: 'error', credentials: 'omit', cache: 'no-store', signal: request.signal,
            })
          } catch {
            throw new OpenRouterChatModelEvidenceV2ServiceError('GENERATION_V2_OPENROUTER_CHAT_MODEL_EVIDENCE_TRANSPORT_FAILED')
          }
          const contentLength = response.headers.get('content-length')
          if (!response.ok || (contentLength !== null && (!/^\d+$/u.test(contentLength) || Number(contentLength) > OPENROUTER_CHAT_MODELS_MAX_BYTES_V1))) {
            try { await response.body?.cancel() } catch { /* best effort */ }
            throw new OpenRouterChatModelEvidenceV2ServiceError('GENERATION_V2_OPENROUTER_CHAT_MODEL_EVIDENCE_HTTP_FAILED')
          }
          let body: string
          try { body = await response.text() } catch {
            throw new OpenRouterChatModelEvidenceV2ServiceError('GENERATION_V2_OPENROUTER_CHAT_MODEL_EVIDENCE_RESPONSE_INVALID')
          }
          if (Buffer.byteLength(body, 'utf8') > OPENROUTER_CHAT_MODELS_MAX_BYTES_V1) {
            throw new OpenRouterChatModelEvidenceV2ServiceError('GENERATION_V2_OPENROUTER_CHAT_MODEL_EVIDENCE_RESPONSE_INVALID')
          }
          let decoded
          try { decoded = decodeOpenRouterChatModelsEvidenceV1(JSON.parse(body)) } catch {
            throw new OpenRouterChatModelEvidenceV2ServiceError('GENERATION_V2_OPENROUTER_CHAT_MODEL_EVIDENCE_RESPONSE_INVALID')
          }
          const model = decoded.models.find((candidate) => candidate.modelId === request.modelId.value)
          if (!model) throw new OpenRouterChatModelEvidenceV2ServiceError('GENERATION_V2_OPENROUTER_CHAT_MODEL_MISSING')
          lease.assertCurrent()
          const observedAtMs = nowMs()
          if (!Number.isSafeInteger(observedAtMs) || observedAtMs < 0) {
            throw new OpenRouterChatModelEvidenceV2ServiceError('GENERATION_V2_OPENROUTER_CHAT_MODEL_EVIDENCE_INVALID')
          }
          const descriptor = request.endpointProfile.operations.chat_completions.descriptor
          const authority: VerifiedOpenRouterChatModelEvidenceV2 = Object.freeze({
            trust: 'verified_openrouter_chat_model_evidence_v2',
            providerId: request.endpointProfile.providerId,
            endpointProfileId: request.endpointProfile.endpointProfileId,
            endpointSetRevision: request.endpointProfile.endpointSetRevision,
            descriptorRevision: descriptor.descriptorRevision,
            descriptorDigest: descriptor.descriptorDigest,
            credentialScopeId: lease.credentialScopeId,
            credentialRevision: lease.revision,
            modelId: GenerationV2Identity.create('model_id', model.modelId),
            supportedParameters: model.supportedParameters,
            inputModalities: model.inputModalities,
            outputModalities: model.outputModalities,
            responseDigest: GenerationV2Digest.create('evidence_digest', decoded.responseDigest),
            observedAtMs,
            assertCurrent: () => {
              if (!authorities.has(authority)) {
                throw new OpenRouterChatModelEvidenceV2ServiceError('GENERATION_V2_OPENROUTER_CHAT_MODEL_EVIDENCE_INVALID')
              }
              lease.assertCurrent()
            },
          })
          authorities.add(authority)
          return request.consume(authority)
        },
      })
    },
  })
}
