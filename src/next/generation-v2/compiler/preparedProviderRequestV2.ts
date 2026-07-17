import { ImmutablePreparedBodyV2, isImmutablePreparedBodyV2 } from './stableSerialize'
import {
  isSemanticConsumptionLedgerV2,
  type SemanticConsumptionLedgerV2,
} from './semanticConsumptionLedgerV2'

export type NonSecretHeaderPlanV2 = Readonly<{
  contentType: 'application/json'
  accept: 'text/event-stream'
  authorization: 'bearer_runtime_credential'
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

export class PreparedProviderRequestV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_PREPARED_REQUEST_INVALID_VALUE'
    | 'GENERATION_V2_PREPARED_REQUEST_UNBRANDED_BODY'
    | 'GENERATION_V2_PREPARED_REQUEST_UNBRANDED_LEDGER') {
    super(code)
    this.name = 'PreparedProviderRequestV2Error'
  }
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
  body: ImmutablePreparedBodyV2
  ledger: SemanticConsumptionLedgerV2
  capabilityRevision: string
  snapshotHash: string
}>): PreparedProviderRequestV2 {
  if (!isImmutablePreparedBodyV2(input.body)) {
    throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_UNBRANDED_BODY')
  }
  if (!isSemanticConsumptionLedgerV2(input.ledger)) {
    throw new PreparedProviderRequestV2Error('GENERATION_V2_PREPARED_REQUEST_UNBRANDED_LEDGER')
  }
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
    headersPlan: Object.freeze({
      contentType: 'application/json' as const,
      accept: 'text/event-stream' as const,
      authorization: 'bearer_runtime_credential' as const,
    }),
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

export function isPreparedProviderRequestV2(value: unknown): value is PreparedProviderRequestV2 {
  return Boolean(value && typeof value === 'object' && preparedRequests.has(value))
}
