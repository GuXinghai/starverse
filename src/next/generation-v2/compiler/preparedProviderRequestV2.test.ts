import { describe, expect, it } from 'vitest'
import { ImmutablePreparedBodyV2, stableSerializeProviderRequestV2 } from '../../../core/generation-v2/compiler/stableSerialize'
import { sha256Hex } from '../../../shared/crypto/sha256Hex'
import { createSemanticConsumptionLedgerV2 } from '../../../core/generation-v2/compiler/semanticConsumptionLedgerV2'
import {
  createBearerAuthorizationHeaderPlanV2,
  type PreparedAttachmentEncodingProofV2,
  type PreparedAttachmentRequirementV2,
  createOpenAICompatibleCredentialHeaderPlanV2,
  issuePreparedProviderRequestV2,
  PreparedProviderRequestV2Error,
  isPreparedProviderRequestV2,
  verifyPreparedProviderRequestWireEncodingProofV2,
} from '../../../core/generation-v2/compiler/preparedProviderRequestV2'
import { createAnthropicMessagesNonSecretHeaderPlanV2 } from '../../../core/generation-v2/contracts/anthropicDeveloperApiContractV2'
import { decodeGenerationIntentLayerV2 } from '../../../core/generation-v2/domain/generationIntentV2'
import { recordRequestAdaptationV2, withRequestAdaptationScopeV2 } from '../../../core/generation-v2/compiler/requestAdaptationV2'

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
      encodingKind: 'identity',
      evidence: 'provider contract',
    }]),
    capabilityRevision: 'capability-1',
    encoderRevision: 'encoder-v2:test',
    snapshotHash: 'a'.repeat(64),
  })
}

const REQUEST_PLAN = { planHash: 'b'.repeat(64) } as NonNullable<Parameters<typeof issuePreparedProviderRequestV2>[0]['requestPlan']>

function issuePlanned(
  body: ReturnType<typeof ImmutablePreparedBodyV2.fromNativeRequest>,
  ledger: ReturnType<typeof createSemanticConsumptionLedgerV2>,
  identityWireAssertions: Parameters<typeof issuePreparedProviderRequestV2>[0]['identityWireAssertions'] = [],
    identitySemanticSource?: Parameters<typeof issuePreparedProviderRequestV2>[0]['identitySemanticSource'],
) {
  return issuePreparedProviderRequestV2({
    operationId: 'operation-wire-proof', answerRootId: 'answer-wire-proof', requestSequence: 1,
    providerId: 'deepseek', endpointProfileId: 'profile-wire-proof', credentialScopeId: 'scope-wire-proof',
    contractId: 'deepseek-chat-completions', modelId: 'model-wire-proof', effectiveEndpointId: 'endpoint-wire-proof',
    endpoint: 'https://example.com/v1/chat/completions', headersPlan: createBearerAuthorizationHeaderPlanV2(),
    body, ledger, requestPlan: REQUEST_PLAN, identityWireAssertions, identitySemanticSource,
    capabilityRevision: 'capability-wire-proof', encoderRevision: 'encoder-v2:test', snapshotHash: 'c'.repeat(64),
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
        kind: 'consumed', path: 'streaming.enabled', disposition: 'encoded', nativeField: 'stream', encodingKind: 'identity', evidence: 'provider contract',
      }]), capabilityRevision: 'capability-ordinary', encoderRevision: 'encoder-v2:test', snapshotHash: 'a'.repeat(64),
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
        nativeField: 'input[].content[].input_file', encodingKind: 'structural', evidence: 'test',
      }]), attachmentRequirements: requirements, attachmentEncodingProofs: proofs,
      capabilityRevision: 'capability-proof', encoderRevision: 'encoder-v2:test', snapshotHash: 'a'.repeat(64),
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

  it('requires an attachment fragment to exist as a complete JSON value, not as body text', () => {
    expect(() => issueWithProof(
      [requirement], [{ ...proof, wireFragment: 1 }], ImmutablePreparedBodyV2.fromNativeRequest({ unrelated: 10 }),
    )).toThrow('GENERATION_V2_PREPARED_REQUEST_ATTACHMENT_FRAGMENT_MISSING')
  })

  it('does not require a wire proof when the requirement set is empty', () => {
    expect(issueWithProof([], [], ImmutablePreparedBodyV2.fromNativeRequest({ stream: true }))).toBeTruthy()
  })
})

describe('PreparedProviderRequestV2 body-bound semantic ledger proof', () => {
  it('rejects a new planned request when an encoded native field is absent from its final body', () => {
    const ledger = createSemanticConsumptionLedgerV2([{
      kind: 'consumed', path: 'reasoning.effort', disposition: 'encoded',
      nativeField: 'thinking.display', encodingKind: 'identity', evidence: 'compiler output',
    }])
    expect(() => issuePlanned(ImmutablePreparedBodyV2.fromNativeRequest({ thinking: { type: 'adaptive' } }), ledger))
      .toThrow('GENERATION_V2_PREPARED_REQUEST_LEDGER_FIELD_MISSING')
  })

  it('seals body and ledger hashes and verifies the encoded paths at the prepared-request boundary', () => {
    const body = ImmutablePreparedBodyV2.fromNativeRequest({ stream: true, thinking: { display: 'summarized' } })
    const ledger = createSemanticConsumptionLedgerV2([
      { kind: 'consumed', path: 'streaming.enabled', disposition: 'encoded', nativeField: 'stream', encodingKind: 'identity', evidence: 'contract' },
      { kind: 'consumed', path: 'providerExtension.thinkingDisplay', disposition: 'encoded', nativeField: 'thinking.display', encodingKind: 'identity', evidence: 'contract' },
    ])
    const request = issuePlanned(body, ledger, [
      { semanticPath: 'streaming.enabled', nativeField: 'stream', value: true },
      { semanticPath: 'providerExtension.thinkingDisplay', nativeField: 'thinking.display', value: 'summarized' },
    ])
    expect(request.wireEncodingProof).toMatchObject({
      schemaVersion: 1, requestPlanHash: REQUEST_PLAN.planHash,
      bodySha256: body.sha256, ledgerSha256: ledger.sha256,
    })
    expect(isPreparedProviderRequestV2(request)).toBe(true)
    expect(verifyPreparedProviderRequestWireEncodingProofV2({
      body, ledger, proof: request.wireEncodingProof!, expectedRequestPlanHash: REQUEST_PLAN.planHash,
    })).toBe(true)
    expect(verifyPreparedProviderRequestWireEncodingProofV2({
      body, ledger, proof: request.wireEncodingProof!, expectedRequestPlanHash: 'd'.repeat(64),
    })).toBe(false)
  })

  it('checks exact identity values when the encoder supplies them, without storing raw values in the proof', () => {
    const body = ImmutablePreparedBodyV2.fromNativeRequest({ output_config: { effort: 'high' } })
    const ledger = createSemanticConsumptionLedgerV2([{
      kind: 'consumed', path: 'reasoning.effort', disposition: 'encoded',
      nativeField: 'output_config.effort', encodingKind: 'identity', evidence: 'anthropic contract',
    }])
    expect(() => issuePlanned(body, ledger, [{ semanticPath: 'reasoning.effort', nativeField: 'output_config.effort', value: 'low' }]))
      .toThrow('GENERATION_V2_PREPARED_REQUEST_LEDGER_WIRE_VALUE_MISMATCH')
    const request = issuePlanned(body, ledger, [{ semanticPath: 'reasoning.effort', nativeField: 'output_config.effort', value: 'high' }])
    expect(JSON.stringify(request.wireEncodingProof)).not.toContain('high')
    expect(request.wireEncodingProof?.identityAssertions).toEqual([expect.objectContaining({
      semanticPath: 'reasoning.effort', nativeField: 'output_config.effort', expectedValueSha256: expect.any(String),
    })])
  })

  it('requires a complete identity assertion set when creating and verifying a proof', () => {
    const body = ImmutablePreparedBodyV2.fromNativeRequest({ temperature: 0.4 })
    const ledger = createSemanticConsumptionLedgerV2([{
      kind: 'consumed', path: 'generation.temperature', disposition: 'encoded',
      nativeField: 'temperature', encodingKind: 'identity', evidence: 'provider contract',
    }])
    expect(() => issuePlanned(body, ledger)).toThrow('GENERATION_V2_PREPARED_REQUEST_LEDGER_PROOF_INVALID')
    const request = issuePlanned(body, ledger, [{ semanticPath: 'generation.temperature', nativeField: 'temperature', value: 0.4 }])
    const proof = request.wireEncodingProof!
    const incompleteBase = {
      schemaVersion: proof.schemaVersion,
      requestPlanHash: proof.requestPlanHash,
      bodySha256: proof.bodySha256,
      ledgerSha256: proof.ledgerSha256,
      resolvedFieldsSha256: proof.resolvedFieldsSha256,
      identityAssertions: [],
    }
    const incompleteProof = {
      ...incompleteBase,
      proofSha256: sha256Hex(stableSerializeProviderRequestV2(incompleteBase)),
    } as typeof proof
    expect(verifyPreparedProviderRequestWireEncodingProofV2({ body, ledger, proof: incompleteProof })).toBe(false)
  })

  it('derives identity assertions from semantic intent when the encoder only emits a path', () => {
    const body = ImmutablePreparedBodyV2.fromNativeRequest({ temperature: 0.4 })
    const ledger = createSemanticConsumptionLedgerV2([{
      kind: 'consumed', path: 'generation.temperature', disposition: 'encoded',
      nativeField: 'temperature', encodingKind: 'identity', evidence: 'provider contract',
    }])
    const intent = (temperature: number) => decodeGenerationIntentLayerV2({
      schemaVersion: 2, generation: { temperature }, reasoning: { mode: 'disabled' }, web: { mode: 'disabled' },
      image: { mode: 'disabled' }, tools: { mode: 'disabled' }, attachments: [], providerExtension: { kind: 'none' },
    })
    expect(() => issuePlanned(body, ledger, [], intent(0.2)))
      .toThrow('GENERATION_V2_PREPARED_REQUEST_LEDGER_WIRE_VALUE_MISMATCH')
    const request = issuePlanned(body, ledger, [], intent(0.4))
    expect(request.wireEncodingProof?.identityAssertions).toEqual([expect.objectContaining({
      semanticPath: 'generation.temperature', nativeField: 'temperature', expectedValueSha256: expect.any(String),
    })])
    expect(JSON.stringify(request.wireEncodingProof)).not.toContain('0.4')
  })

  it('resolves explicit array-wildcard and numeric-index native paths', () => {
    const body = ImmutablePreparedBodyV2.fromNativeRequest({
      input: [{ content: [{ input_file: { file_id: 'f-1' } }] }],
      vendor: { settings: [{ effort: 'high' }] },
    })
    const ledger = createSemanticConsumptionLedgerV2([
      { kind: 'consumed', path: 'attachments[0].include', disposition: 'encoded', nativeField: 'input[].content[].input_file', encodingKind: 'structural', evidence: 'contract' },
      { kind: 'consumed', path: 'reasoning.effort', disposition: 'encoded', nativeField: 'vendor.settings[0].effort', encodingKind: 'identity', evidence: 'contract' },
    ])
    expect(issuePlanned(body, ledger, [{ semanticPath: 'reasoning.effort', nativeField: 'vendor.settings[0].effort', value: 'high' }]).wireEncodingProof).toBeTruthy()
  })

  it('resolves compatible mapping paths without confusing dots, slashes, or numeric indexes', () => {
    const body = ImmutablePreparedBodyV2.fromNativeRequest({
      vendor: { 'reasoning.effort': [{ 'control/effort': 'high' }] },
    })
    const ledger = createSemanticConsumptionLedgerV2([{
      kind: 'consumed', path: 'reasoning.effort', disposition: 'encoded',
      nativeField: 'compat:vendor/reasoning.effort/[0]/control%2Feffort', encodingKind: 'identity', evidence: 'compatible mapping',
    }])
    expect(issuePlanned(body, ledger, [], decodeGenerationIntentLayerV2({
      schemaVersion: 2, reasoning: { mode: 'enabled', effort: 'high' },
    })).wireEncodingProof).toBeTruthy()
  })

  it('resolves explicit final-segment field alternatives when one listed field exists', () => {
    const body = ImmutablePreparedBodyV2.fromNativeRequest({ input: [{ content: [{ input_image: { image_url: 'data:image/png;base64,AA==' } }] }] })
    const ledger = createSemanticConsumptionLedgerV2([{
      kind: 'consumed', path: 'attachments[].include', disposition: 'encoded',
      nativeField: 'input[].content[].input_file|input_image', encodingKind: 'structural', evidence: 'provider contract',
    }])
    expect(issuePlanned(body, ledger).wireEncodingProof).toBeTruthy()
  })

  it('resolves the actual OpenAI Responses attachment discriminator path', () => {
    const body = ImmutablePreparedBodyV2.fromNativeRequest({ input: [{ content: [{ type: 'input_image', image_url: 'data:image/png;base64,AA==' }] }] })
    const ledger = createSemanticConsumptionLedgerV2([{
      kind: 'consumed', path: 'attachments[].include', disposition: 'encoded',
      nativeField: 'input[].content[].type', encodingKind: 'structural', evidence: 'provider contract',
    }])
    expect(issuePlanned(body, ledger).wireEncodingProof).toBeTruthy()
  })

  it('keeps legacy no-plan issuance proof-free and readable even when a frozen ledger field is absent', () => {
    const request = issuePreparedProviderRequestV2({
      operationId: 'legacy-operation', answerRootId: 'legacy-answer', requestSequence: 1,
      providerId: 'deepseek', endpointProfileId: 'legacy-profile', credentialScopeId: 'legacy-scope',
      contractId: 'deepseek-chat-completions', modelId: 'legacy-model', effectiveEndpointId: 'legacy-endpoint',
      endpoint: 'https://example.com/v1/chat/completions', headersPlan: createBearerAuthorizationHeaderPlanV2(),
      body: ImmutablePreparedBodyV2.fromNativeRequest({}),
      ledger: createSemanticConsumptionLedgerV2([{
        kind: 'consumed', path: 'streaming.enabled', disposition: 'encoded', nativeField: 'stream', encodingKind: 'identity', evidence: 'frozen legacy',
      }]),
      capabilityRevision: 'capability-legacy', encoderRevision: 'encoder-v1', snapshotHash: 'a'.repeat(64),
    })
    expect(request.wireEncodingProof).toBeUndefined()
    expect(isPreparedProviderRequestV2(request)).toBe(true)
  })

  it('does not rewrite a frozen legacy ledger from request-local adaptation state', () => {
    const ledger = createSemanticConsumptionLedgerV2([{
      kind: 'consumed', path: 'streaming.enabled', disposition: 'encoded',
      nativeField: 'stream', encodingKind: 'identity', evidence: 'frozen legacy evidence',
    }])
    const request = withRequestAdaptationScopeV2(() => {
      recordRequestAdaptationV2('legacy-adaptation', { path: 'reasoning.effort', outcome: 'deferred', reason: 'legacy frozen request' })
      return issuePreparedProviderRequestV2({
        operationId: 'legacy-adaptation', answerRootId: 'legacy-answer', requestSequence: 1,
        providerId: 'deepseek', endpointProfileId: 'legacy-profile', credentialScopeId: 'legacy-scope',
        contractId: 'deepseek-chat-completions', modelId: 'legacy-model', effectiveEndpointId: 'legacy-endpoint',
        endpoint: 'https://example.com/v1/chat/completions', headersPlan: createBearerAuthorizationHeaderPlanV2(),
        body: ImmutablePreparedBodyV2.fromNativeRequest({ stream: true }), ledger,
        capabilityRevision: 'capability-legacy', encoderRevision: 'encoder-v1', snapshotHash: 'a'.repeat(64),
      })
    })
    expect(request.ledger).toBe(ledger)
    expect(request.ledger.sha256).toBe(ledger.sha256)
    expect(request.wireEncodingProof).toBeUndefined()
  })
})
