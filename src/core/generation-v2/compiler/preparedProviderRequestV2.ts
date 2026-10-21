import { ImmutablePreparedBodyV2, isImmutablePreparedBodyV2, stableSerializeProviderRequestV2 } from './stableSerialize'
import {
  isSemanticConsumptionLedgerV2,
  type SemanticConsumptionLedgerV2,
} from './semanticConsumptionLedgerV2'
import type { AttachmentIntentV2 } from '../domain/generationIntentV2'
import type { GenerationIntentLayerV2 } from '../domain/generationIntentV2'
import { projectGenerationIntentLayerV2 } from '../domain/generationIntentProjectionV2'
import type { EffectiveRequestPlanV2 } from './effectiveRequestPlanV2'
import { sha256Hex } from '../../../shared/crypto/sha256Hex'
import { requestAdaptationLedgerV2 } from './requestAdaptationV2'
import {
  decodeGenerationExecutionProviderId,
  type GenerationExecutionProviderId,
} from '../domain/generationExecutionProviderId'
import { decodeEffectiveRequestPlanV2 } from './effectiveRequestPlanV2'
import { readApiRequestBodyContractV2 } from '../contracts/apiRequestBodyContractV2'
import {
  readEndpointTransportDefinitionByRevisionV2,
  type EndpointTransportDefinitionV2,
} from '../contracts/endpointTransportDefinitionV2'
import { resolveEncodingCoverageRegistryV2 } from '../capability/encodingCoverageRegistryV2'

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
  providerId: GenerationExecutionProviderId
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
  /** Present on newly planned requests after their encoded fields are checked against this body. */
  wireEncodingProof?: PreparedProviderRequestWireEncodingProofV2
  capabilityRevision: string
  encoderRevision: string
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

export type PreparedProviderRequestWireValueAssertionV2 = Readonly<{
  semanticPath: string
  nativeField: string
  value: unknown
}>

export type PreparedProviderRequestWireEncodingProofV2 = Readonly<{
  schemaVersion: 1
  requestPlanHash: string
  bodySha256: string
  ledgerSha256: string
  resolvedFieldsSha256: string
  /** Digests only: the encoded values themselves are never copied into the ledger or proof. */
  identityAssertions: readonly Readonly<{
    semanticPath: string
    nativeField: string
    expectedValueSha256: string
  }>[]
  proofSha256: string
}>

export class PreparedProviderRequestV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_PREPARED_REQUEST_INVALID_VALUE'
    | 'GENERATION_V2_PREPARED_REQUEST_UNBRANDED_BODY'
    | 'GENERATION_V2_PREPARED_REQUEST_UNBRANDED_LEDGER'
    | 'GENERATION_V2_PREPARED_REQUEST_ATTACHMENT_PROOF_MISSING'
    | 'GENERATION_V2_PREPARED_REQUEST_ATTACHMENT_PROOF_DUPLICATE'
    | 'GENERATION_V2_PREPARED_REQUEST_ATTACHMENT_PROOF_MISMATCH'
    | 'GENERATION_V2_PREPARED_REQUEST_ATTACHMENT_FRAGMENT_MISSING'
    | 'GENERATION_V2_PREPARED_REQUEST_LEDGER_PATH_INVALID'
    | 'GENERATION_V2_PREPARED_REQUEST_LEDGER_FIELD_MISSING'
    | 'GENERATION_V2_PREPARED_REQUEST_LEDGER_WIRE_VALUE_MISMATCH'
    | 'GENERATION_V2_PREPARED_REQUEST_LEDGER_PROOF_INVALID'
    | 'GENERATION_V2_PREPARED_REQUEST_TRANSPORT_MISMATCH') {
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
  /** Optional for frozen legacy receipts. New snapshots provide this plan to enable wire proofing. */
  requestPlan?: EffectiveRequestPlanV2
  /** Exact native values exposed by encoders, supplied transiently and persisted only as digests. */
  identityWireAssertions?: readonly PreparedProviderRequestWireValueAssertionV2[]
  /** Used only to derive exact assertions for identity ledger entries that expose no encoder value. */
  identitySemanticSource?: GenerationIntentLayerV2
  /** Preserved on receipt restoration; the issuer rechecks it against body and ledger. */
  wireEncodingProof?: PreparedProviderRequestWireEncodingProofV2
  attachmentRequirements?: readonly PreparedAttachmentRequirementV2[]
  attachmentEncodingProofs?: readonly PreparedAttachmentEncodingProofV2[]
  capabilityRevision: string
  encoderRevision: string
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
  const headersPlan = validateNonSecretHeaderPlan(input.headersPlan)
  if (input.requestPlan?.schemaVersion === 2) {
    validatePreparedRequestTransportV2({
      providerId: input.providerId,
      modelId: input.modelId,
      endpoint,
      headersPlan,
      body: input.body,
      requestPlan: input.requestPlan,
    })
  }
  // Frozen legacy receipts must retain their exact historical ledger. Request-local
  // adaptation decisions are included only when a new request plan enables proofing.
  const ledger = input.requestPlan ? requestAdaptationLedgerV2(input.operationId, input.ledger) : input.ledger
  const identitySemanticSource = input.identitySemanticSource === undefined
    ? undefined : projectGenerationIntentLayerV2(input.identitySemanticSource)
  const explicitIdentityAssertions = input.identityWireAssertions ?? []
  const explicitIdentityPaths = new Set(explicitIdentityAssertions.map((assertion) => assertion.semanticPath))
  const derivedIdentityAssertions = input.wireEncodingProof || identitySemanticSource === undefined ? [] : ledger.entries.flatMap((entry) => {
    if (entry.disposition !== 'encoded' || entry.encodingKind !== 'identity' || explicitIdentityPaths.has(entry.path)) return []
    const values = resolveNativeFieldValuesV2(identitySemanticSource, entry.path)
    if (values.length !== 1 || values[0] === undefined) {
      throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_LEDGER_PROOF_INVALID')
    }
    return [{ semanticPath: entry.path, nativeField: entry.nativeField!, value: values[0] }]
  })
  const identityWireAssertions = [...derivedIdentityAssertions, ...explicitIdentityAssertions]
  const wireEncodingProof = input.wireEncodingProof
    ? validatePreparedProviderRequestWireEncodingProofV2({
      body: input.body, ledger, proof: input.wireEncodingProof,
      expectedRequestPlanHash: input.requestPlan?.planHash,
    })
    : input.requestPlan
      ? createPreparedProviderRequestWireEncodingProofV2({
        body: input.body, ledger,
        requestPlanHash: input.requestPlan.planHash,
        identityWireAssertions,
      })
      : undefined
  const request = Object.freeze({
    trust: 'prepared_provider_request_v2' as const,
    operationId: identifier(input.operationId),
    answerRootId: identifier(input.answerRootId),
    requestSequence: input.requestSequence,
    plannedAttempt: 1 as const,
    providerId: decodeGenerationExecutionProviderId(input.providerId),
    endpointProfileId: identifier(input.endpointProfileId),
    credentialScopeId: identifier(input.credentialScopeId),
    contractId: identifier(input.contractId),
    modelId: identifier(input.modelId),
    effectiveEndpointId: identifier(input.effectiveEndpointId),
    endpoint: endpoint.toString(),
    method: 'POST' as const,
    headersPlan,
    body: input.body,
    bodySha256: input.body.sha256,
    bodyByteLength: input.body.byteLength,
    ledger,
    ...(wireEncodingProof === undefined ? {} : { wireEncodingProof }),
    capabilityRevision: identifier(input.capabilityRevision),
    encoderRevision: identifier(input.encoderRevision),
    snapshotHash: input.snapshotHash,
  })
  preparedRequests.add(request)
  return request
}

function validatePreparedRequestTransportV2(input: Readonly<{
  providerId: string
  modelId: string
  endpoint: URL
  headersPlan: NonSecretHeaderPlanV2
  body: ImmutablePreparedBodyV2
  requestPlan: EffectiveRequestPlanV2
}>): void {
  try {
    const plan = decodeEffectiveRequestPlanV2(input.requestPlan)
    const resolution = plan.resolution
    if (!resolution || plan.schemaVersion !== 2) throw new Error('request plan lacks resolved transport proof')
    const transport = readEndpointTransportDefinitionByRevisionV2(input.providerId, resolution.transportRevision)
    const bodyContract = readApiRequestBodyContractV2(input.providerId, transport.operation, resolution.bodySchemaRevision)
    const encoder = resolveEncodingCoverageRegistryV2({
      providerId: input.providerId,
      protocolContractId: transport.protocolContractId,
      operation: transport.operation,
      encoderRevision: resolution.encoderRevision,
    })
    if (resolution.bodySchemaRevision !== bodyContract.bodySchemaRevision ||
        encoder.bodySchemaRevision !== bodyContract.bodySchemaRevision ||
        encoder.transportRevision !== transport.transportRevision ||
        plan.encoderRevision !== resolution.encoderRevision || transport.method !== 'POST' ||
        input.headersPlan.contentType !== transport.contentType) {
      throw new Error('resolved transport does not match the prepared request')
    }
    validateEndpointAgainstTransportV2(input.endpoint, input.modelId, transport)
    validateTransportAuthenticationV2(input.headersPlan, transport)
    const body = JSON.parse(input.body.copyUtf8Text()) as unknown
    bodyContract.validateBody(body)
    if (transport.streamPolicy.location === 'body') {
      const streamValue = body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>)[transport.streamPolicy.field] : undefined
      if (!body || typeof body !== 'object' || Array.isArray(body) ||
          transport.streamPolicy.requiredValue !== undefined && streamValue !== transport.streamPolicy.requiredValue ||
          transport.streamPolicy.requiredValue === undefined && streamValue !== undefined && typeof streamValue !== 'boolean') {
        throw new Error('body stream policy does not match the endpoint transport')
      }
    }
  } catch {
    throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_TRANSPORT_MISMATCH')
  }
}

function validateEndpointAgainstTransportV2(endpoint: URL, modelId: string, transport: EndpointTransportDefinitionV2): void {
  if (transport.apiOrigin !== null) {
    const expectedOrigin = new URL(transport.apiOrigin)
    if (endpoint.origin !== expectedOrigin.origin) throw new Error('endpoint origin does not match the transport')
  }
  const relativePath = transport.requestPath.replace(/\{[^{}]+\}/gu, encodeURIComponent(modelId))
  if (/[{}]/u.test(relativePath)) throw new Error('endpoint path template is incomplete')
  const expectedPath = `${transport.apiVersion ? `/${transport.apiVersion}` : ''}${relativePath}`
  const pathMatches = transport.apiOrigin === null
    ? endpoint.pathname === expectedPath || endpoint.pathname.endsWith(expectedPath)
    : endpoint.pathname === expectedPath
  if (!pathMatches) throw new Error('endpoint path does not match the transport')
  for (const [key, value] of Object.entries(transport.fixedQuery)) {
    if (endpoint.searchParams.get(key) !== value) throw new Error('endpoint query does not match the transport')
  }
}

function validateTransportAuthenticationV2(
  headersPlan: NonSecretHeaderPlanV2,
  transport: EndpointTransportDefinitionV2,
): void {
  const auth: Readonly<Record<string, unknown>> = transport.auth && typeof transport.auth === 'object'
    ? transport.auth as Readonly<Record<string, unknown>> : Object.freeze({})
  const credential = headersPlan.credential
  const authKind = auth.kind
  const authName = typeof auth.name === 'string' ? auth.name.toLowerCase() : ''
  const authScheme = typeof auth.scheme === 'string' ? auth.scheme.toLowerCase() : ''
  if ((authKind === 'bearer_header' || authName === 'authorization' && authScheme === 'bearer') &&
      credential.kind !== 'bearer_authorization') throw new Error('transport bearer auth plan mismatch')
  if (authName === 'x-api-key' &&
      (credential.kind !== 'anthropic_x_api_key' || credential.headerName.toLowerCase() !== authName)) {
    throw new Error('transport API-key auth plan mismatch')
  }
  if (authName === 'x-goog-api-key' &&
      (credential.kind !== 'google_x_goog_api_key' || credential.headerName.toLowerCase() !== authName)) {
    throw new Error('transport Google auth plan mismatch')
  }
  if (transport.apiVersionHeader &&
      (credential.kind !== 'anthropic_x_api_key' ||
       credential.apiVersion.headerName.toLowerCase() !== transport.apiVersionHeader.name.toLowerCase() ||
       credential.apiVersion.value !== transport.apiVersionHeader.value)) {
    throw new Error('transport API version header mismatch')
  }
}

function validateAttachmentProofs(
  body: ImmutablePreparedBodyV2,
  requirements: readonly PreparedAttachmentRequirementV2[],
  proofs: readonly PreparedAttachmentEncodingProofV2[],
): void {
  if (!Array.isArray(requirements) || !Array.isArray(proofs)) {
    throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_INVALID_VALUE')
  }
  let bodyValue: unknown
  try { bodyValue = JSON.parse(body.copyUtf8Text()) } catch {
    throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_ATTACHMENT_FRAGMENT_MISSING')
  }
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
    let fragment: unknown
    try { fragment = JSON.parse(stableSerializeProviderRequestV2(proof.wireFragment)) } catch {
      throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_ATTACHMENT_PROOF_MISMATCH')
    }
    if (!containsStructuralValueV2(bodyValue, fragment)) {
      throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_ATTACHMENT_FRAGMENT_MISSING')
    }
    proofKeys.add(proof.semanticPath)
  }
  if (proofKeys.size !== requirementKeys.size) {
    throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_ATTACHMENT_PROOF_MISSING')
  }
}

function containsStructuralValueV2(root: unknown, expected: unknown): boolean {
  const equal = (left: unknown, right: unknown): boolean => {
    const pending: Array<readonly [unknown, unknown]> = [[left, right]]
    while (pending.length > 0) {
      const [currentLeft, currentRight] = pending.pop()!
      if (currentLeft === null || currentRight === null || typeof currentLeft !== 'object' || typeof currentRight !== 'object') {
        if (currentLeft !== currentRight) return false
        continue
      }
      const leftArray = Array.isArray(currentLeft)
      const rightArray = Array.isArray(currentRight)
      if (leftArray !== rightArray) return false
      if (leftArray && rightArray) {
        if (currentLeft.length !== currentRight.length) return false
        for (let index = 0; index < currentLeft.length; index += 1) pending.push([currentLeft[index], currentRight[index]])
        continue
      }
      const leftRecord = currentLeft as Record<string, unknown>
      const rightRecord = currentRight as Record<string, unknown>
      const leftKeys = Object.keys(leftRecord).sort()
      const rightKeys = Object.keys(rightRecord).sort()
      if (leftKeys.length !== rightKeys.length || leftKeys.some((key, index) => key !== rightKeys[index])) return false
      for (const key of leftKeys) pending.push([leftRecord[key], rightRecord[key]])
    }
    return true
  }

  const pending: unknown[] = [root]
  while (pending.length > 0) {
    const current = pending.pop()
    if (equal(current, expected)) return true
    if (Array.isArray(current)) pending.push(...current)
    else if (current && typeof current === 'object') pending.push(...Object.values(current as Record<string, unknown>))
  }
  return false
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
  if (!value || typeof value !== 'object' || !preparedRequests.has(value)) return false
  const request = value as PreparedProviderRequestV2
  return request.wireEncodingProof === undefined || verifyPreparedProviderRequestWireEncodingProofV2({
    body: request.body, ledger: request.ledger, proof: request.wireEncodingProof,
  })
}

const MAX_WIRE_PROOF_ASSERTIONS_V2 = 512
const MAX_WIRE_PROOF_BYTES_V2 = 256 * 1024
const DIGEST_V2 = /^[0-9a-f]{64}$/u

type NativePathTokenV2 = Readonly<{ kind: 'property'; value: string } | { kind: 'array_wildcard' } | { kind: 'array_index'; value: number }>

function parseNativeFieldPathV2(nativeField: string): readonly NativePathTokenV2[] {
  if (!nativeField || nativeField.length > 8192 || nativeField.trim() !== nativeField) {
    throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_LEDGER_PATH_INVALID')
  }
  if (nativeField.startsWith('compat:')) {
    const segments = nativeField.slice('compat:'.length).split('/')
    if (segments.length === 0 || segments.length > 32 || segments.some((segment) => segment.length === 0)) {
      throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_LEDGER_PATH_INVALID')
    }
    return Object.freeze(segments.map((segment) => {
      const index = /^\[([0-9]{1,4})\]$/u.exec(segment)
      if (index) return Object.freeze({ kind: 'array_index' as const, value: Number(index[1]) })
      let property: string
      try { property = decodeURIComponent(segment) } catch {
        throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_LEDGER_PATH_INVALID')
      }
      if (!property || ['__proto__', 'prototype', 'constructor'].includes(property)) {
        throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_LEDGER_PATH_INVALID')
      }
      return Object.freeze({ kind: 'property' as const, value: property })
    }))
  }
  const tokens: NativePathTokenV2[] = []
  for (const segment of nativeField.split('.')) {
    const match = /^([A-Za-z0-9_$-]+)((?:\[\]|\[0\]|\[[1-9][0-9]{0,5}\])*)$/u.exec(segment)
    if (!match || ['__proto__', 'prototype', 'constructor'].includes(match[1]!)) {
      throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_LEDGER_PATH_INVALID')
    }
    tokens.push(Object.freeze({ kind: 'property', value: match[1]! }))
    const indices = match[2]!.match(/\[\]|\[0\]|\[[1-9][0-9]{0,5}\]/gu) ?? []
    for (const index of indices) tokens.push(index === '[]'
      ? Object.freeze({ kind: 'array_wildcard' as const })
      : Object.freeze({ kind: 'array_index' as const, value: Number(index.slice(1, -1)) }))
  }
  if (tokens.length === 0) throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_LEDGER_PATH_INVALID')
  return Object.freeze(tokens)
}

function resolveNativeFieldValuesV2(root: unknown, nativeField: string): readonly unknown[] {
  const segments = nativeField.split('.')
  const leaf = segments.pop() ?? ''
  const alternatives = leaf.includes('|')
    ? leaf.split('|').map((alternative) => [...segments, alternative].join('.'))
    : [nativeField]
  if (alternatives.some((alternative) => !alternative || alternative.includes('|'))) {
    throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_LEDGER_PATH_INVALID')
  }
  const tokensByAlternative = alternatives.map(parseNativeFieldPathV2)
  const resolve = (value: unknown, tokens: readonly NativePathTokenV2[], index: number): unknown[] => {
    if (index === tokens.length) return [value]
    const token = tokens[index]!
    if (token.kind === 'property') {
      if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.prototype.hasOwnProperty.call(value, token.value)) return []
      return resolve((value as Record<string, unknown>)[token.value], tokens, index + 1)
    }
    if (!Array.isArray(value)) return []
    if (token.kind === 'array_index') {
      return token.value < value.length && Object.prototype.hasOwnProperty.call(value, token.value)
        ? resolve(value[token.value], tokens, index + 1) : []
    }
    return value.flatMap((entry) => resolve(entry, tokens, index + 1))
  }
  return Object.freeze(tokensByAlternative.flatMap((tokens) => resolve(root, tokens, 0)))
}

function canonicalValueSha256V2(value: unknown): string {
  return sha256Hex(stableSerializeProviderRequestV2(value))
}

function resolvedFieldsSha256V2(bodyValue: unknown, ledger: SemanticConsumptionLedgerV2): string {
  const fields = ledger.entries.filter((entry) => entry.disposition === 'encoded').map((entry) => {
    const values = resolveNativeFieldValuesV2(bodyValue, entry.nativeField!)
    if (values.length === 0) throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_LEDGER_FIELD_MISSING')
    return Object.freeze({ semanticPath: entry.path, nativeField: entry.nativeField, valuesSha256: canonicalValueSha256V2(values) })
  })
  return sha256Hex(stableSerializeProviderRequestV2(fields))
}

function wireProofPayloadV2(input: Omit<PreparedProviderRequestWireEncodingProofV2, 'proofSha256'>): string {
  return stableSerializeProviderRequestV2(input)
}

export function createPreparedProviderRequestWireEncodingProofV2(input: Readonly<{
  body: ImmutablePreparedBodyV2
  ledger: SemanticConsumptionLedgerV2
  requestPlanHash: string
  identityWireAssertions: readonly PreparedProviderRequestWireValueAssertionV2[]
}>): PreparedProviderRequestWireEncodingProofV2 {
  if (!isImmutablePreparedBodyV2(input.body) || !isSemanticConsumptionLedgerV2(input.ledger) ||
      !DIGEST_V2.test(input.requestPlanHash) || !Array.isArray(input.identityWireAssertions) ||
      input.identityWireAssertions.length > MAX_WIRE_PROOF_ASSERTIONS_V2) {
    throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_LEDGER_PROOF_INVALID')
  }
  let bodyValue: unknown
  try { bodyValue = JSON.parse(input.body.copyUtf8Text()) } catch {
    throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_LEDGER_PROOF_INVALID')
  }
  const resolvedFieldsSha256 = resolvedFieldsSha256V2(bodyValue, input.ledger)
  const identityAssertions = input.identityWireAssertions.map((assertion) => {
    if (!assertion || typeof assertion.semanticPath !== 'string' || typeof assertion.nativeField !== 'string') {
      throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_LEDGER_PROOF_INVALID')
    }
    const entry = input.ledger.entries.find((candidate) => candidate.path === assertion.semanticPath)
    if (!entry || entry.disposition !== 'encoded' || entry.encodingKind !== 'identity' || entry.nativeField !== assertion.nativeField) {
      throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_LEDGER_PROOF_INVALID')
    }
    const values = resolveNativeFieldValuesV2(bodyValue, assertion.nativeField)
    if (values.length !== 1 || canonicalValueSha256V2(values[0]) !== canonicalValueSha256V2(assertion.value)) {
      throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_LEDGER_WIRE_VALUE_MISMATCH')
    }
    return Object.freeze({
      semanticPath: assertion.semanticPath,
      nativeField: assertion.nativeField,
      expectedValueSha256: canonicalValueSha256V2(assertion.value),
    })
  })
  if (new Set(identityAssertions.map((assertion) => assertion.semanticPath)).size !== identityAssertions.length) {
    throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_LEDGER_PROOF_INVALID')
  }
  const encodedIdentityEntries = input.ledger.entries.filter((entry) => entry.disposition === 'encoded' && entry.encodingKind === 'identity')
  if (identityAssertions.length !== encodedIdentityEntries.length || encodedIdentityEntries.some((entry) =>
    !identityAssertions.some((assertion) => assertion.semanticPath === entry.path && assertion.nativeField === entry.nativeField))) {
    throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_LEDGER_PROOF_INVALID')
  }
  const base = Object.freeze({
    schemaVersion: 1 as const,
    requestPlanHash: input.requestPlanHash,
    bodySha256: input.body.sha256,
    ledgerSha256: input.ledger.sha256,
    resolvedFieldsSha256,
    identityAssertions: Object.freeze(identityAssertions),
  })
  const proofSha256 = sha256Hex(wireProofPayloadV2(base))
  const proof = Object.freeze({ ...base, proofSha256 })
  if (new TextEncoder().encode(stableSerializeProviderRequestV2(proof)).byteLength > MAX_WIRE_PROOF_BYTES_V2) {
    throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_LEDGER_PROOF_INVALID')
  }
  return proof
}

export function validatePreparedProviderRequestWireEncodingProofV2(input: Readonly<{
  body: ImmutablePreparedBodyV2
  ledger: SemanticConsumptionLedgerV2
  proof: PreparedProviderRequestWireEncodingProofV2
  expectedRequestPlanHash?: string
}>): PreparedProviderRequestWireEncodingProofV2 {
  if (!verifyPreparedProviderRequestWireEncodingProofV2(input)) {
    throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_LEDGER_PROOF_INVALID')
  }
  return Object.freeze({ ...input.proof, identityAssertions: Object.freeze(input.proof.identityAssertions.map((item) => Object.freeze({ ...item }))) })
}

export function verifyPreparedProviderRequestWireEncodingProofV2(input: Readonly<{
  body: ImmutablePreparedBodyV2
  ledger: SemanticConsumptionLedgerV2
  proof: PreparedProviderRequestWireEncodingProofV2
  expectedRequestPlanHash?: string
}>): boolean {
  try {
    const proof = input.proof as unknown as Record<string, unknown>
    const keys = ['schemaVersion', 'requestPlanHash', 'bodySha256', 'ledgerSha256', 'resolvedFieldsSha256', 'identityAssertions', 'proofSha256']
    if (!isImmutablePreparedBodyV2(input.body) || !isSemanticConsumptionLedgerV2(input.ledger) ||
        !proof || typeof proof !== 'object' || Array.isArray(proof) || Object.keys(proof).sort().join('\0') !== [...keys].sort().join('\0') ||
        proof.schemaVersion !== 1 || typeof proof.requestPlanHash !== 'string' || !DIGEST_V2.test(proof.requestPlanHash) ||
        input.expectedRequestPlanHash !== undefined && proof.requestPlanHash !== input.expectedRequestPlanHash ||
        proof.bodySha256 !== input.body.sha256 || proof.ledgerSha256 !== input.ledger.sha256 ||
        typeof proof.resolvedFieldsSha256 !== 'string' || !DIGEST_V2.test(proof.resolvedFieldsSha256) ||
        typeof proof.proofSha256 !== 'string' || !DIGEST_V2.test(proof.proofSha256) ||
        !Array.isArray(proof.identityAssertions) || proof.identityAssertions.length > MAX_WIRE_PROOF_ASSERTIONS_V2 ||
        new TextEncoder().encode(stableSerializeProviderRequestV2(proof)).byteLength > MAX_WIRE_PROOF_BYTES_V2) return false
    const bodyValue = JSON.parse(input.body.copyUtf8Text()) as unknown
    if (resolvedFieldsSha256V2(bodyValue, input.ledger) !== proof.resolvedFieldsSha256) return false
    const expectedEntries = new Set<string>()
    for (const assertion of proof.identityAssertions as unknown[]) {
      if (!assertion || typeof assertion !== 'object' || Array.isArray(assertion)) return false
      const item = assertion as Record<string, unknown>
      if (Object.keys(item).sort().join('\0') !== ['semanticPath', 'nativeField', 'expectedValueSha256'].sort().join('\0') ||
          typeof item.semanticPath !== 'string' || typeof item.nativeField !== 'string' ||
          typeof item.expectedValueSha256 !== 'string' || !DIGEST_V2.test(item.expectedValueSha256)) return false
      const entry = input.ledger.entries.find((candidate) => candidate.path === item.semanticPath)
      if (!entry || entry.disposition !== 'encoded' || entry.encodingKind !== 'identity' || entry.nativeField !== item.nativeField ||
          expectedEntries.has(item.semanticPath)) return false
      const values = resolveNativeFieldValuesV2(bodyValue, item.nativeField)
      if (values.length !== 1 || canonicalValueSha256V2(values[0]) !== item.expectedValueSha256) return false
      expectedEntries.add(item.semanticPath)
    }
    const encodedIdentityEntries = input.ledger.entries.filter((entry) => entry.disposition === 'encoded' && entry.encodingKind === 'identity')
    if (expectedEntries.size !== encodedIdentityEntries.length || encodedIdentityEntries.some((entry) => !expectedEntries.has(entry.path))) return false
    const { proofSha256, ...base } = proof
    return sha256Hex(wireProofPayloadV2(base as unknown as Omit<PreparedProviderRequestWireEncodingProofV2, 'proofSha256'>)) === proofSha256
  } catch {
    return false
  }
}
