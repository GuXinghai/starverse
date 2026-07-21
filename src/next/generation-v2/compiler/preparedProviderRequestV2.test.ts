import { describe, expect, it } from 'vitest'
import { ImmutablePreparedBodyV2 } from './stableSerialize'
import { createSemanticConsumptionLedgerV2 } from './semanticConsumptionLedgerV2'
import {
  createBearerAuthorizationHeaderPlanV2,
  createOpenAICompatibleCredentialHeaderPlanV2,
  issuePreparedProviderRequestV2,
  PreparedProviderRequestV2Error,
} from './preparedProviderRequestV2'
import { createAnthropicMessagesNonSecretHeaderPlanV2 } from '../contracts/anthropicDeveloperApiContractV2'

function issue(credentialPlacement: 'bearer_authorization' | 'anthropic_x_api_key' | 'openai_compatible_credential' | 'unknown') {
  return issuePreparedProviderRequestV2({
    operationId: 'operation-1',
    answerRootId: 'answer-1',
    requestSequence: 1,
    providerId: credentialPlacement === 'anthropic_x_api_key' ? 'anthropic' : 'deepseek',
    endpointProfileId: 'profile-1',
    credentialScopeId: 'scope-1',
    contractId: 'contract-1',
    modelId: 'model-1',
    effectiveEndpointId: 'endpoint-1',
    endpoint: 'https://example.com/v1/messages',
    headersPlan: credentialPlacement === 'bearer_authorization'
      ? createBearerAuthorizationHeaderPlanV2()
      : credentialPlacement === 'anthropic_x_api_key'
        ? createAnthropicMessagesNonSecretHeaderPlanV2()
        : credentialPlacement === 'openai_compatible_credential'
          ? createOpenAICompatibleCredentialHeaderPlanV2('custom_headers')
        : { contentType: 'application/json', accept: 'text/event-stream', credential: { kind: 'unknown' } } as never,
    body: ImmutablePreparedBodyV2.fromNativeRequest({ stream: true }),
    ledger: createSemanticConsumptionLedgerV2([{
      kind: 'consumed',
      path: 'streaming.enabled',
      disposition: 'encoded',
      nativeField: 'stream',
      evidence: 'provider contract',
    }]),
    capabilityRevision: 'capability-1',
    snapshotHash: 'a'.repeat(64),
  })
}

describe('PreparedProviderRequestV2 closed non-secret header plan', () => {
  it('issues the bearer plan without storing a credential value', () => {
    const request = issue('bearer_authorization')
    expect(request.headersPlan).toEqual({
      contentType: 'application/json',
      accept: 'text/event-stream',
      credential: { kind: 'bearer_authorization', headerName: 'authorization', scheme: 'Bearer' },
    })
    expect(JSON.stringify(request)).not.toMatch(/secret|api[_-]?key/i)
  })

  it('issues one closed Anthropic plan including the contract API version and no secret', () => {
    const request = issue('anthropic_x_api_key')
    expect(request.headersPlan).toEqual({
      contentType: 'application/json',
      accept: 'text/event-stream',
      credential: {
        kind: 'anthropic_x_api_key',
        headerName: 'x-api-key',
        apiVersion: { headerName: 'anthropic-version', value: '2023-06-01' },
      },
    })
    expect(JSON.stringify(request)).not.toContain('runtime-credential')
  })

  it('pins the compatible auth mode without putting its header values in the prepared request', () => {
    const request = issue('openai_compatible_credential')
    expect(request.headersPlan.credential).toEqual({ kind: 'openai_compatible_credential', authMode: 'custom_headers' })
    expect(JSON.stringify(request)).not.toMatch(/authorization|secret|password/i)
  })

  it('preserves validated endpoint-owned ordinary headers separately from credentials', () => {
    const request = issuePreparedProviderRequestV2({
      operationId: 'operation-ordinary', answerRootId: 'answer-ordinary', requestSequence: 1, providerId: 'openai_compatible',
      endpointProfileId: 'profile-ordinary', credentialScopeId: 'scope-ordinary', contractId: 'openai_chat_compatible',
      modelId: 'model-ordinary', effectiveEndpointId: 'endpoint-ordinary', endpoint: 'https://example.com/v1/chat/completions',
      headersPlan: createOpenAICompatibleCredentialHeaderPlanV2('bearer', [{ name: 'X-Tenant', value: 'public-tenant' }]),
      body: ImmutablePreparedBodyV2.fromNativeRequest({ stream: true }), ledger: createSemanticConsumptionLedgerV2([{
        kind: 'consumed', path: 'streaming.enabled', disposition: 'encoded', nativeField: 'stream', evidence: 'provider contract',
      }]), capabilityRevision: 'capability-ordinary', snapshotHash: 'a'.repeat(64),
    })
    expect(request.headersPlan.ordinaryHeaders).toEqual([{ name: 'X-Tenant', value: 'public-tenant' }])
  })

  it('rejects unknown credential placement rather than issuing an open header plan', () => {
    expect(() => issue('unknown')).toThrow(PreparedProviderRequestV2Error)
  })
})
