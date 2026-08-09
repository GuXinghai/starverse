import { describe, expect, it } from 'vitest'
import { ImmutablePreparedBodyV2 } from './stableSerialize'
import { createSemanticConsumptionLedgerV2 } from './semanticConsumptionLedgerV2'
import {
  createBearerAuthorizationHeaderPlanV2,
  type PreparedAttachmentEncodingProofV2,
  type PreparedAttachmentRequirementV2,
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

describe('PreparedProviderRequestV2 attachment encoding proof', () => {
  const requirement: PreparedAttachmentRequirementV2 = {
    semanticPath: 'attachments[0]', kind: 'managed_file',
    assetRevisionId: 'revision:1', assetSha256: 'a'.repeat(64),
  }
  const body = ImmutablePreparedBodyV2.fromNativeRequest({
    input: [{ type: 'input_file', file_id: 'file-1' }], stream: true,
  })
  const proof: PreparedAttachmentEncodingProofV2 = {
    semanticPath: requirement.semanticPath, requirement,
    wireFragment: { type: 'input_file', file_id: 'file-1' },
  }
  const issueWithProof = (requirements: readonly PreparedAttachmentRequirementV2[], proofs: readonly PreparedAttachmentEncodingProofV2[], preparedBody = body) =>
    issuePreparedProviderRequestV2({
      operationId: 'operation-proof', answerRootId: 'answer-proof', requestSequence: 1,
      providerId: 'openai_responses', endpointProfileId: 'profile-proof', credentialScopeId: 'scope-proof',
      contractId: 'openai-responses-v1', modelId: 'model-proof', effectiveEndpointId: 'endpoint-proof',
      endpoint: 'https://example.com/v1/responses', headersPlan: createBearerAuthorizationHeaderPlanV2(),
      body: preparedBody, ledger: createSemanticConsumptionLedgerV2([{
        kind: 'consumed', path: 'attachments[].include', disposition: 'encoded',
        nativeField: 'input[].content[].input_file', evidence: 'test',
      }]), attachmentRequirements: requirements, attachmentEncodingProofs: proofs,
      capabilityRevision: 'capability-proof', snapshotHash: 'a'.repeat(64),
    })

  it('requires exactly one proof whose fragment occurs in the immutable body', () => {
    expect(issueWithProof([requirement], [proof]).body.copyUtf8Text()).toContain('file-1')
  })

  it.each([
    ['missing', [], 'GENERATION_V2_PREPARED_REQUEST_ATTACHMENT_PROOF_MISSING'],
    ['duplicate', [proof, proof], 'GENERATION_V2_PREPARED_REQUEST_ATTACHMENT_PROOF_DUPLICATE'],
    ['wrong identity', [{ ...proof, requirement: { ...requirement, assetSha256: 'b'.repeat(64) } }], 'GENERATION_V2_PREPARED_REQUEST_ATTACHMENT_PROOF_MISMATCH'],
    ['fragment absent', [{ ...proof, wireFragment: { type: 'input_file', file_id: 'file-other' } }], 'GENERATION_V2_PREPARED_REQUEST_ATTACHMENT_FRAGMENT_MISSING'],
  ] as const)('rejects %s before a prepared request can be issued', (_, proofs, code) => {
    expect(() => issueWithProof([requirement], proofs)).toThrow(code)
  })

  it('does not require a wire proof when the requirement set is empty', () => {
    expect(issueWithProof([], [], ImmutablePreparedBodyV2.fromNativeRequest({ stream: true }))).toBeTruthy()
  })
})
