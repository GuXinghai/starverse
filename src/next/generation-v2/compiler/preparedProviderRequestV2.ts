import { ImmutablePreparedBodyV2, isImmutablePreparedBodyV2, stableSerializeProviderRequestV2 } from './stableSerialize'
import {
  isSemanticConsumptionLedgerV2,
  type SemanticConsumptionLedgerV2,
} from './semanticConsumptionLedgerV2'
import type { AttachmentIntentV2 } from '../domain/generationIntentV2'

export type NonSecretHeaderPlanV2 = Readonly<{
  contentType: 'application/json'
  accept: 'text/event-stream'
  /** Endpoint-owned, publicly stored headers. Credentials are always separate. */
  ordinaryHeaders?: readonly Readonly<{ name: string; value: string }>[]
  credential:
    | Readonly<{ kind: 'no_credential' }>
    | Readonly<{ kind: 'bearer_authorization'; headerName: 'authorization'; scheme: 'Bearer' }>
    | Readonly<{
        kind: 'anthropic_x_api_key'
        headerName: string
        apiVersion: Readonly<{ headerName: string; value: string }>
      }>
    | Readonly<{
        kind: 'openai_compatible_credential'
        authMode: 'bearer' | 'basic' | 'custom_headers'
      }>
    | Readonly<{
        kind: 'google_x_goog_api_key'
        headerName: 'x-goog-api-key'
      }>
}>

export type PreparedProviderRequestV2 = Readonly<{
  trust: 'prepared_provider_request_v2'
  operationId: string
  answerRootId: string
  requestSequence: number
  plannedAttempt: 1
  providerId: string
  endpointProfileId: string
  credentialScopeId: string
  contractId: string
  modelId: string
  effectiveEndpointId: string
  endpoint: string
  method: 'POST'
  headersPlan: NonSecretHeaderPlanV2
  body: ImmutablePreparedBodyV2
  bodySha256: string
  bodyByteLength: number
  ledger: SemanticConsumptionLedgerV2
  capabilityRevision: string
  snapshotHash: string
}>

export type PreparedAttachmentRequirementV2 = Readonly<{
  semanticPath: string
  kind: 'managed_file'
  assetRevisionId: string
  assetSha256: string
} | {
  semanticPath: string
  kind: 'url_reference'
  referenceRevision: string
  urlDigest: string
}>

export type PreparedAttachmentEncodingProofV2 = Readonly<{
  semanticPath: string
  requirement: PreparedAttachmentRequirementV2
  /** The exact provider-native fragment that must occur in the immutable body. */
  wireFragment: unknown
}>

export class PreparedProviderRequestV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_PREPARED_REQUEST_INVALID_VALUE'
    | 'GENERATION_V2_PREPARED_REQUEST_UNBRANDED_BODY'
    | 'GENERATION_V2_PREPARED_REQUEST_UNBRANDED_LEDGER'
    | 'GENERATION_V2_PREPARED_REQUEST_ATTACHMENT_PROOF_MISSING'
    | 'GENERATION_V2_PREPARED_REQUEST_ATTACHMENT_PROOF_DUPLICATE'
    | 'GENERATION_V2_PREPARED_REQUEST_ATTACHMENT_PROOF_MISMATCH'
    | 'GENERATION_V2_PREPARED_REQUEST_ATTACHMENT_FRAGMENT_MISSING') {
    super(code)
    this.name = 'PreparedProviderRequestV2Error'
  }
}

export function createPreparedAttachmentRequirementsV2(
  attachments: readonly AttachmentIntentV2[],
): readonly PreparedAttachmentRequirementV2[] {
  const requirements: PreparedAttachmentRequirementV2[] = []
  attachments.forEach((attachment, index) => {
    if (!attachment.include) return
    const semanticPath = `attachments[${index}]`
    if (attachment.kind === 'managed_file') {
      requirements.push(Object.freeze({
        semanticPath,
        kind: 'managed_file' as const,
        assetRevisionId: attachment.assetRevisionId.value,
        assetSha256: attachment.assetSha256.value,
      }))
      return
    }
    requirements.push(Object.freeze({
      semanticPath,
      kind: 'url_reference' as const,
      referenceRevision: attachment.referenceRevision.value,
      urlDigest: attachment.urlDigest.value,
    }))
  })
  return Object.freeze(requirements)
}

const preparedRequests = new WeakSet<object>()

function identifier(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value ||
      /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_INVALID_VALUE')
  }
  return value
}

export function issuePreparedProviderRequestV2(input: Readonly<{
  operationId: string
  answerRootId: string
  requestSequence: number
  providerId: string
  endpointProfileId: string
  credentialScopeId: string
  contractId: string
  modelId: string
  effectiveEndpointId: string
  endpoint: string
  headersPlan: NonSecretHeaderPlanV2
  body: ImmutablePreparedBodyV2
  ledger: SemanticConsumptionLedgerV2
  attachmentRequirements?: readonly PreparedAttachmentRequirementV2[]
  attachmentEncodingProofs?: readonly PreparedAttachmentEncodingProofV2[]
  capabilityRevision: string
  snapshotHash: string
}>): PreparedProviderRequestV2 {
  if (!isImmutablePreparedBodyV2(input.body)) {
    throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_UNBRANDED_BODY')
  }
  if (!isSemanticConsumptionLedgerV2(input.ledger)) {
    throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_UNBRANDED_LEDGER')
  }
  validateAttachmentProofs(input.body, input.attachmentRequirements ?? [], input.attachmentEncodingProofs ?? [])
  if (!Number.isSafeInteger(input.requestSequence) || input.requestSequence < 1 ||
      !/^[0-9a-f]{64}$/u.test(input.snapshotHash)) {
    throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_INVALID_VALUE')
  }
  let endpoint: URL
  try { endpoint = new URL(input.endpoint) } catch {
    throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_INVALID_VALUE')
  }
  if ((endpoint.protocol !== 'https:' && endpoint.protocol !== 'http:') ||
      endpoint.username !== '' || endpoint.password !== '' || endpoint.hash !== '') {
    throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_INVALID_VALUE')
  }
  const request = Object.freeze({
    trust: 'prepared_provider_request_v2' as const,
    operationId: identifier(input.operationId),
    answerRootId: identifier(input.answerRootId),
    requestSequence: input.requestSequence,
    plannedAttempt: 1 as const,
    providerId: identifier(input.providerId),
    endpointProfileId: identifier(input.endpointProfileId),
    credentialScopeId: identifier(input.credentialScopeId),
    contractId: identifier(input.contractId),
    modelId: identifier(input.modelId),
    effectiveEndpointId: identifier(input.effectiveEndpointId),
    endpoint: endpoint.toString(),
    method: 'POST' as const,
    headersPlan: validateNonSecretHeaderPlan(input.headersPlan),
    body: input.body,
    bodySha256: input.body.sha256,
    bodyByteLength: input.body.byteLength,
    ledger: input.ledger,
    capabilityRevision: identifier(input.capabilityRevision),
    snapshotHash: input.snapshotHash,
  })
  preparedRequests.add(request)
  return request
}

function validateAttachmentProofs(
  body: ImmutablePreparedBodyV2,
  requirements: readonly PreparedAttachmentRequirementV2[],
  proofs: readonly PreparedAttachmentEncodingProofV2[],
): void {
  if (!Array.isArray(requirements) || !Array.isArray(proofs)) {
    throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_INVALID_VALUE')
  }
  const bodyText = body.copyUtf8Text()
  const requirementKeys = new Set<string>()
  for (const requirement of requirements) {
    if (!requirement || typeof requirement !== 'object' || typeof requirement.semanticPath !== 'string' ||
        requirementKeys.has(requirement.semanticPath)) {
      throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_ATTACHMENT_PROOF_DUPLICATE')
    }
    if (requirement.kind === 'managed_file') {
      if (typeof requirement.assetRevisionId !== 'string' || !/^[0-9a-f]{64}$/u.test(requirement.assetSha256)) {
        throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_INVALID_VALUE')
      }
    } else if (requirement.kind === 'url_reference') {
      if (typeof requirement.referenceRevision !== 'string' || requirement.referenceRevision.length === 0 ||
          !/^[0-9a-f]{64}$/u.test(requirement.urlDigest)) {
        throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_INVALID_VALUE')
      }
    } else {
      throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_INVALID_VALUE')
    }
    requirementKeys.add(requirement.semanticPath)
  }
  const proofKeys = new Set<string>()
  for (const proof of proofs) {
    if (!proof || typeof proof !== 'object' || typeof proof.semanticPath !== 'string' || proofKeys.has(proof.semanticPath)) {
      throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_ATTACHMENT_PROOF_DUPLICATE')
    }
    if (!requirementKeys.has(proof.semanticPath) || !proof.requirement ||
        proof.requirement.semanticPath !== proof.semanticPath) {
      throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_ATTACHMENT_PROOF_MISMATCH')
    }
    const expected = requirements.find((requirement) => requirement.semanticPath === proof.semanticPath)
    if (!expected || stableRequirementKey(expected) !== stableRequirementKey(proof.requirement)) {
      throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_ATTACHMENT_PROOF_MISMATCH')
    }
    let fragment: string
    try { fragment = stableSerializeProviderRequestV2(proof.wireFragment) } catch {
      throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_ATTACHMENT_PROOF_MISMATCH')
    }
    if (!bodyText.includes(fragment)) {
      throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_ATTACHMENT_FRAGMENT_MISSING')
    }
    proofKeys.add(proof.semanticPath)
  }
  if (proofKeys.size !== requirementKeys.size) {
    throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_ATTACHMENT_PROOF_MISSING')
  }
}

function stableRequirementKey(value: PreparedAttachmentRequirementV2): string {
  return stableSerializeProviderRequestV2(value)
}

function validateOrdinaryHeaders(value: unknown): readonly Readonly<{ name: string; value: string }>[] {
  if (!Array.isArray(value) || value.length > 64) throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_INVALID_VALUE')
  const seen = new Set<string>()
  return Object.freeze(value.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_INVALID_VALUE')
    const raw = entry as { name?: unknown; value?: unknown }; const name = raw.name; const headerValue = raw.value
    if (typeof name !== 'string' || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}$/u.test(name) || typeof headerValue !== 'string' ||
        headerValue.length > 8192 || /[\r\n]/u.test(headerValue)) throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_INVALID_VALUE')
    const normalized = name.toLowerCase()
    if (seen.has(normalized) || ['host', 'content-length', 'connection', 'authorization', 'content-type', 'accept'].includes(normalized) || normalized.startsWith('proxy-') || normalized.startsWith('sec-')) {
      throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_INVALID_VALUE')
    }
    seen.add(normalized); return Object.freeze({ name, value: headerValue })
  }))
}
function optionalOrdinaryHeaders(value: unknown): Readonly<Record<string, never> | { ordinaryHeaders: readonly Readonly<{ name: string; value: string }>[] }> {
  const headers = validateOrdinaryHeaders(value)
  return headers.length === 0 ? Object.freeze({}) : Object.freeze({ ordinaryHeaders: headers })
}

export function createBearerAuthorizationHeaderPlanV2(ordinaryHeaders: readonly Readonly<{ name: string; value: string }>[] = []): NonSecretHeaderPlanV2 {
  return Object.freeze({
    contentType: 'application/json' as const,
    accept: 'text/event-stream' as const,
    ...optionalOrdinaryHeaders(ordinaryHeaders),
    credential: Object.freeze({
      kind: 'bearer_authorization' as const,
      headerName: 'authorization' as const,
      scheme: 'Bearer' as const,
    }),
  })
}

export function createNoCredentialHeaderPlanV2(ordinaryHeaders: readonly Readonly<{ name: string; value: string }>[] = []): NonSecretHeaderPlanV2 {
  return Object.freeze({
    contentType: 'application/json' as const,
    accept: 'text/event-stream' as const,
    ...optionalOrdinaryHeaders(ordinaryHeaders),
    credential: Object.freeze({ kind: 'no_credential' as const }),
  })
}

export function createGoogleApiKeyHeaderPlanV2(ordinaryHeaders: readonly Readonly<{ name: string; value: string }>[] = []): NonSecretHeaderPlanV2 {
  return Object.freeze({
    contentType: 'application/json' as const,
    accept: 'text/event-stream' as const,
    ...optionalOrdinaryHeaders(ordinaryHeaders),
    credential: Object.freeze({
      kind: 'google_x_goog_api_key' as const,
      headerName: 'x-goog-api-key' as const,
    }),
  })
}

export function createOpenAICompatibleCredentialHeaderPlanV2(
  authMode: 'bearer' | 'basic' | 'custom_headers',
  ordinaryHeaders: readonly Readonly<{ name: string; value: string }>[] = [],
): NonSecretHeaderPlanV2 {
  return Object.freeze({
    contentType: 'application/json' as const,
    accept: 'text/event-stream' as const,
    ...optionalOrdinaryHeaders(ordinaryHeaders),
    credential: Object.freeze({ kind: 'openai_compatible_credential' as const, authMode }),
  })
}

function validateNonSecretHeaderPlan(input: NonSecretHeaderPlanV2): NonSecretHeaderPlanV2 {
  if (input.contentType !== 'application/json' || input.accept !== 'text/event-stream') {
    throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_INVALID_VALUE')
  }
  const ordinaryHeaders = validateOrdinaryHeaders(input.ordinaryHeaders ?? [])
  if (input.credential.kind === 'no_credential') return createNoCredentialHeaderPlanV2(ordinaryHeaders)
  if (input.credential.kind === 'bearer_authorization') {
    if (input.credential.headerName !== 'authorization' || input.credential.scheme !== 'Bearer') {
      throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_INVALID_VALUE')
    }
    return createBearerAuthorizationHeaderPlanV2(ordinaryHeaders)
  }
  if (input.credential.kind === 'google_x_goog_api_key') {
    if (input.credential.headerName !== 'x-goog-api-key') {
      throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_INVALID_VALUE')
    }
    return createGoogleApiKeyHeaderPlanV2(ordinaryHeaders)
  }
  if (input.credential.kind === 'openai_compatible_credential') {
    if (input.credential.authMode !== 'bearer' && input.credential.authMode !== 'basic' && input.credential.authMode !== 'custom_headers') {
      throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_INVALID_VALUE')
    }
    return createOpenAICompatibleCredentialHeaderPlanV2(input.credential.authMode, ordinaryHeaders)
  }
  if (input.credential.kind !== 'anthropic_x_api_key' ||
      identifier(input.credential.headerName) !== input.credential.headerName ||
      identifier(input.credential.apiVersion.headerName) !== input.credential.apiVersion.headerName ||
      identifier(input.credential.apiVersion.value) !== input.credential.apiVersion.value) {
    throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_INVALID_VALUE')
  }
  return Object.freeze({
    contentType: 'application/json' as const,
    accept: 'text/event-stream' as const,
    ...(ordinaryHeaders.length === 0 ? {} : { ordinaryHeaders }),
    credential: Object.freeze({
      kind: 'anthropic_x_api_key' as const,
      headerName: input.credential.headerName,
      apiVersion: Object.freeze({
        headerName: input.credential.apiVersion.headerName,
        value: input.credential.apiVersion.value,
      }),
    }),
  })
}

export function isPreparedProviderRequestV2(value: unknown): value is PreparedProviderRequestV2 {
  return Boolean(value && typeof value === 'object' && preparedRequests.has(value))
}
