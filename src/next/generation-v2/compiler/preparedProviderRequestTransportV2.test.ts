import { describe, expect, it } from 'vitest'
import { ImmutablePreparedBodyV2 } from '../../../core/generation-v2/compiler/stableSerialize'
import { issuePreparedProviderRequestV2, createBearerAuthorizationHeaderPlanV2,
  createGoogleApiKeyHeaderPlanV2, createNoCredentialHeaderPlanV2 } from '../../../core/generation-v2/compiler/preparedProviderRequestV2'
import { decodeEffectiveRequestPlanV2, requestIntentDigestV2 } from '../../../core/generation-v2/compiler/effectiveRequestPlanV2'
import { createSemanticConsumptionLedgerV2 } from '../../../core/generation-v2/compiler/semanticConsumptionLedgerV2'
import { stableSerializeProviderRequestBoundedV2 } from '../../../core/generation-v2/compiler/stableSerialize'
import { decodeGenerationIntentLayerV2 } from '../../../core/generation-v2/domain/generationIntentV2'
import { projectGenerationIntentLayerV2 } from '../../../core/generation-v2/domain/generationIntentProjectionV2'
import { readApiRequestBodyContractV2 } from '../../../core/generation-v2/contracts/apiRequestBodyContractV2'
import { readEndpointTransportDefinitionV2 } from '../../../core/generation-v2/contracts/endpointTransportDefinitionV2'
import { resolveEncodingCoverageRegistryV2 } from '../../../core/generation-v2/capability/encodingCoverageRegistryV2'
import { sha256Hex } from '../../../shared/crypto/sha256Hex'

const intent = decodeGenerationIntentLayerV2({ schemaVersion: 2, generation: { temperature: 0.2 },
  reasoning: { mode: 'disabled' }, web: { mode: 'disabled' }, image: { mode: 'disabled' },
  tools: { mode: 'disabled' }, attachments: [], providerExtension: { kind: 'none' } })

function digest(value: unknown): string {
  return sha256Hex(stableSerializeProviderRequestBoundedV2(value, 1024 * 1024))
}

function requestPlan(providerId: string, operation: 'text' | 'tool_continue' | 'image_generate') {
  const bodyContract = readApiRequestBodyContractV2(providerId, operation)
  const transport = readEndpointTransportDefinitionV2(providerId, operation)
  const encoder = resolveEncodingCoverageRegistryV2({ providerId, protocolContractId: transport.protocolContractId,
    operation, encoderRevision: undefined })
  const resolverRevision = 'request-rule-resolver-v2:test'
  const targetFingerprint = 'f'.repeat(64)
  const baseCapabilityRevision = 'capability-test'
  const requestedIntent = projectGenerationIntentLayerV2(intent)
  const effectiveIntentDigest = requestIntentDigestV2(intent)
  const resolutionPayload = {
    schemaVersion: 2 as const, resolverRevision,
    requestedIntentDigest: effectiveIntentDigest, effectiveIntentDigest, targetFingerprint,
    baseCapabilityRevision, baseSemanticFieldsDigest: 'a'.repeat(64), sourcePriorityConfigRevision: null,
    ruleBundleRevision: 'rule-bundle-test', ownerSnapshotRevisions: [], decisions: [], capabilityFields: [], capabilityEvidence: [],
    nativeParameters: { generation: { temperature: 0.2 }, reasoning: { mode: 'disabled' }, providerExtension: { kind: 'none' } },
    bodySchemaRevision: bodyContract.bodySchemaRevision, transportRevision: transport.transportRevision,
    encoderRevision: encoder.encoderRevision,
  }
  const resolution = { ...resolutionPayload, invocationHash: digest(resolutionPayload) }
  const planPayload = {
    schemaVersion: 2 as const, policyRevision: resolverRevision, requestedIntent, effectiveIntentDigest,
    targetFingerprint, capabilityRevision: baseCapabilityRevision, encoderRevision: encoder.encoderRevision,
    resolution, decisions: [],
  }
  return decodeEffectiveRequestPlanV2({ ...planPayload, planHash: digest(planPayload) })
}

function issueDeepSeek(endpoint: string, headersPlan = createBearerAuthorizationHeaderPlanV2()) {
  const body = ImmutablePreparedBodyV2.fromNativeRequest({ model: 'deepseek-test',
    messages: [{ role: 'user', content: 'hello' }], stream: true, stream_options: { include_usage: true },
    thinking: { type: 'disabled' } })
  return issuePreparedProviderRequestV2({
    operationId: 'transport-proof-test', answerRootId: 'transport-proof-answer', requestSequence: 1,
    providerId: 'deepseek', endpointProfileId: 'deepseek-profile', credentialScopeId: 'deepseek-scope',
    contractId: 'deepseek-stable-chat-v1', modelId: 'deepseek-test', effectiveEndpointId: 'deepseek-endpoint',
    endpoint, headersPlan, body,
    ledger: createSemanticConsumptionLedgerV2([{ kind: 'consumed', path: 'streaming.enabled', disposition: 'encoded',
      nativeField: 'stream', encodingKind: 'identity', evidence: 'transport proof test' }]),
    requestPlan: requestPlan('deepseek', 'text'),
    identityWireAssertions: [{ semanticPath: 'streaming.enabled', nativeField: 'stream', value: true }],
    capabilityRevision: 'capability-test', encoderRevision: requestPlan('deepseek', 'text').encoderRevision,
    snapshotHash: 'b'.repeat(64),
  })
}

describe('prepared request resolved transport proof', () => {
  it('accepts a current request only at its protocol endpoint with the declared auth and JSON content type', () => {
    const request = issueDeepSeek('https://api.deepseek.com/chat/completions')
    expect(request.endpoint).toBe('https://api.deepseek.com/chat/completions')
    expect(request.headersPlan.contentType).toBe('application/json')
  })

  it('rejects endpoint-origin, endpoint-path, and auth drift before a request can be issued', () => {
    expect(() => issueDeepSeek('https://attacker.example/chat/completions'))
      .toThrow('GENERATION_V2_PREPARED_REQUEST_TRANSPORT_MISMATCH')
    expect(() => issueDeepSeek('https://api.deepseek.com/v2/chat/completions'))
      .toThrow('GENERATION_V2_PREPARED_REQUEST_TRANSPORT_MISMATCH')
    expect(() => issueDeepSeek('https://api.deepseek.com/chat/completions', createNoCredentialHeaderPlanV2()))
      .toThrow('GENERATION_V2_PREPARED_REQUEST_TRANSPORT_MISMATCH')
  })

  it('validates route-based Gemini streaming and its fixed query without inventing a body stream field', () => {
    const body = ImmutablePreparedBodyV2.fromNativeRequest({
      contents: [{ role: 'user', parts: [{ text: 'hello' }] }], generationConfig: {},
    })
    const plan = requestPlan('google_ai_studio', 'text')
    const request = issuePreparedProviderRequestV2({
      operationId: 'gemini-transport-proof', answerRootId: 'gemini-transport-answer', requestSequence: 1,
      providerId: 'google_ai_studio', endpointProfileId: 'gemini-profile', credentialScopeId: 'gemini-scope',
      contractId: 'gemini-generate-content-v1beta', modelId: 'gemini-test', effectiveEndpointId: 'gemini-endpoint',
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:streamGenerateContent?alt=sse',
      headersPlan: createGoogleApiKeyHeaderPlanV2(), body,
      ledger: createSemanticConsumptionLedgerV2([{ kind: 'consumed', path: 'streaming.enabled', disposition: 'accepted_no_wire',
        nativeField: null, encodingKind: 'omitted', evidence: 'route based streaming' }]), requestPlan: plan,
      capabilityRevision: 'capability-test', encoderRevision: plan.encoderRevision, snapshotHash: 'c'.repeat(64),
    })
    expect(request.endpoint).toContain('alt=sse')
    expect(() => issuePreparedProviderRequestV2({
      operationId: 'gemini-transport-bad-query', answerRootId: 'gemini-transport-answer', requestSequence: 1,
      providerId: 'google_ai_studio', endpointProfileId: 'gemini-profile', credentialScopeId: 'gemini-scope',
      contractId: 'gemini-generate-content-v1beta', modelId: 'gemini-test', effectiveEndpointId: 'gemini-endpoint',
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:streamGenerateContent',
      headersPlan: createGoogleApiKeyHeaderPlanV2(), body,
      ledger: createSemanticConsumptionLedgerV2([{ kind: 'consumed', path: 'streaming.enabled', disposition: 'accepted_no_wire',
        nativeField: null, encodingKind: 'omitted', evidence: 'route based streaming' }]), requestPlan: plan,
      capabilityRevision: 'capability-test', encoderRevision: plan.encoderRevision, snapshotHash: 'c'.repeat(64),
    })).toThrow('GENERATION_V2_PREPARED_REQUEST_TRANSPORT_MISMATCH')
  })
})
