import { describe, expect, it } from 'vitest'
import { createReviewedRequestRulePacksV2 } from '../../../../scripts/rules/reviewedRequestRulePacksV2'
import { bindRequestRulesToSubjectsV2 } from '../../../core/generation-v2/capability-rules/boundRequestRulesV2'
import { resolveRequestRulesV2 } from '../../../core/generation-v2/capability-rules/requestRuleResolverV2'
import { createResolvedInvocationV2 } from '../../../core/generation-v2/compiler/resolvedInvocationV2'
import { createEffectiveRequestPlanV2, decodeEffectiveRequestPlanV2 } from '../../../core/generation-v2/compiler/effectiveRequestPlanV2'
import { canonicalizeResolvedCapabilityV2 } from '../../../core/generation-v2/capability/resolvedCapabilityV2'
import { MODEL_CAPABILITY_SEMANTIC_PATHS_V2 } from '../../../core/generation-v2/capability/modelCapabilitySchemaV2'
import { listReviewedProviderContractDefinitionsV2 } from '../../../core/generation-v2/contracts/providerContractRegistryV2'
import { readEndpointTransportDefinitionV2 } from '../../../core/generation-v2/contracts/endpointTransportDefinitionV2'
import { decodeResolvedGenerationIntentV2 } from '../../../core/generation-v2/domain/resolvedGenerationIntentV2'
import { createSemanticConsumptionLedgerV2 } from '../../../core/generation-v2/compiler/semanticConsumptionLedgerV2'
import { issuePreparedProviderRequestV2, createBearerAuthorizationHeaderPlanV2, createGoogleApiKeyHeaderPlanV2,
  createNoCredentialHeaderPlanV2, createOpenAICompatibleCredentialHeaderPlanV2 } from '../../../core/generation-v2/compiler/preparedProviderRequestV2'
import { ImmutablePreparedBodyV2 } from '../../../core/generation-v2/compiler/stableSerialize'
import { createAnthropicMessagesNonSecretHeaderPlanV2 } from '../../../core/generation-v2/contracts/anthropicDeveloperApiContractV2'
import { compileAnthropicMessagesRequestV1 } from '../../../core/generation-v2/providers/anthropic/messagesRequestV1'
import { compileOpenAIResponsesRequestV1 } from '../../../core/generation-v2/providers/openai-responses/responsesRequestV1'
import { compileOpenRouterChatRequestV1 } from '../../../core/generation-v2/providers/openrouter/chatRequestV1'
import { compileOpenRouterImageRequestV1 } from '../../../core/generation-v2/providers/openrouter-images/imageRequestV1'
import { decodeCanonicalOpenRouterImageDescriptorSetV2 } from '../../../core/generation-v2/providers/openrouter-images/canonicalDescriptorV2'
import { compileDeepSeekStableChatRequestV1 } from '../../../core/generation-v2/providers/deepseek/chatRequestV1'
import { compileGeminiGenerateContentRequestV1 } from '../../../core/generation-v2/providers/gemini/generateContentRequestV1'
import { compileGeminiInteractionsRequestV1 } from '../../../core/generation-v2/providers/gemini/interactionsRequestV1'
import { compileGenericLocalOpenAIChatRequestV1 } from '../../../core/generation-v2/providers/generic-local-openai-chat/chatRequestV1'
import { compileOllamaNativeChatRequestV1 } from '../../../core/generation-v2/providers/ollama-chat/chatRequestV1'
import { compileLmStudioOpenResponsesRequestV1 } from '../../../core/generation-v2/providers/lmstudio-openresponses/responsesRequestV1'
import { buildCompatibleChatRequest } from '../../../shared/provider/openai-chat-compatible/request/buildCompatibleChatRequest'
import { compatibleRequestProfileConfigSchema } from '../../../shared/provider/openai-chat-compatible/schemas'

const definitions = listReviewedProviderContractDefinitionsV2()
const evidenceIds = ['test:unknown']
const user = [{ role: 'user' as const, content: 'Keep the blue plan.' }]

describe('applied Rule resolution through protocol encoding and prepared transport', () => {
  it.each(definitions.map(definition => [definition.protocolContractId.value, definition] as const))('%s', (protocol, definition) => {
    const operation = definition.operations.includes('text') ? 'text' : 'image_generate'
    const model = 'test-model'
    const imageDescriptors = protocol === 'openrouter-images-v1' ? decodeCanonicalOpenRouterImageDescriptorSetV2({ id: model,
      endpoints: [{ provider_name: 'Test', provider_tag: 'test', provider_slug: 'test', supported_parameters: {},
        allowed_passthrough_parameters: [], supports_streaming: false }] }) : undefined
    const imageDescriptor = imageDescriptors?.descriptors[0]
    const endpointProfileId = 'test-request-rules-profile'
    const subject = { providerAuthorityId: definition.providerId.value, endpointProfileId, nativeModelId: model }
    const capability = canonicalizeResolvedCapabilityV2({ binding: {
      providerId: definition.providerId.value, endpointProfileId, modelId: model, operation,
      credentialScopeId: 'scope:test', protocolContractId: protocol, contractRevision: definition.contractRevision.value,
      contractDefinitionDigest: definition.definitionDigest.value, registryRevision: definition.registryRevision.value,
      endpointBinding: imageDescriptor ? { kind: 'pinned', selector: { kind: 'openrouter_images_v1', providerTag: imageDescriptor.providerTag.value,
        providerSlug: imageDescriptor.providerSlug.value, descriptorRevision: imageDescriptor.descriptorRevision.value,
        descriptorDigest: imageDescriptor.descriptorDigest.value, selectedBy: 'user', selectedAt: '2026-10-17T00:00:00.000Z' } }
        : { kind: 'provider_managed_set', endpointSetRevision: 'endpoint:1', descriptors: [{ endpointId: 'endpoint:test', descriptorRevision: 'descriptor:1' }] },
    }, fields: MODEL_CAPABILITY_SEMANTIC_PATHS_V2.map(path => ({ path, state: 'unknown', constraints: [], evidenceIds,
      ...(protocol.startsWith('gemini') && path === 'reasoning.mode' ? { state: 'supported', evidenceIds: ['test:support'],
        domain: { kind: 'enum', values: ['enabled'] }, defaultValue: 'enabled' } : {}),
      ...(protocol.startsWith('anthropic') && path === 'reasoning.mode' ? { state: 'supported', evidenceIds: ['test:support'],
        domain: { kind: 'enum', values: ['enabled', 'disabled'] } } : {}),
      ...(protocol.startsWith('anthropic') && path === 'providerExtension.thinkingMode' ? { state: 'supported', evidenceIds: ['test:support'],
        domain: { kind: 'enum', values: ['manual', 'disabled'] }, defaultValue: 'manual' } : {}),
    })),
    evidence: [{ evidenceId: evidenceIds[0], kind: 'contract_invariant', effect: 'unknown', sourceRef: 'test:unknown',
      verifiedAt: '2026-10-17T00:00:00.000Z', contentDigest: 'a'.repeat(64) }, { evidenceId: 'test:support', kind: 'contract_invariant', effect: 'supports',
      sourceRef: 'test:continuation', verifiedAt: '2026-10-17T00:00:00.000Z', contentDigest: 'b'.repeat(64) }],
      continuation: { kind: 'none', evidenceIds: ['test:support'] } })
    const packs = createReviewedRequestRulePacksV2([{ ...subject, protocolContractId: protocol, nativeModelIds: [model] }]).map(packet => packet.pack)
    const bundle = bindRequestRulesToSubjectsV2({ snapshots: [{ schemaVersion: 2, ownership: 'user', ownerId: 'local-user', packs }],
      subjects: [subject], defaultActivationPolicies: { cloud: 'enabled', user: 'enabled' } })[0]!
    const requested = decodeResolvedGenerationIntentV2({ schemaVersion: 2, generation: protocol === 'openrouter-images-v1' ? {} : { temperature: 0 }, reasoning: { mode: 'disabled' },
      web: { mode: 'disabled' }, image: { mode: 'disabled' }, tools: { mode: 'disabled' }, attachments: [], providerExtension: { kind: 'none' } }).value
    const result = resolveRequestRulesV2({ requested, capability, bundle })
    expect(result.decisions.some(decision => decision.outcome === 'applied')).toBe(true)
    if (protocol !== 'openrouter-images-v1') expect(result.intent.value.generation.temperature).toBe(0)
    const resolution = createResolvedInvocationV2({ requested, capability, bundle, resolution: result })
    const plan = createEffectiveRequestPlanV2({ requested, effective: result.intent.value, capability, resolution, decisions: result.adaptations })
    const frozenPlan = decodeEffectiveRequestPlanV2(JSON.parse(JSON.stringify(plan)))
    expect(frozenPlan.resolution?.ruleBundleRevision).toBe(bundle.bundleRevision)
    const intent = result.intent.value
    const revision = resolution.bodySchemaRevision
    let body: ImmutablePreparedBodyV2
    switch (protocol) {
      case 'openai-responses-v1': body = compileOpenAIResponsesRequestV1({ model, priorArtifact: null, clientItems: [{ role: 'user', content: [{ type: 'input_text', text: user[0].content }] }],
        generation: intent.generation }, operation, revision).preparedBody; break
      case 'anthropic-messages-2023-06-01': body = compileAnthropicMessagesRequestV1({ modelId: model, intent, messages: user }, operation, revision).preparedBody!; break
      case 'openrouter-chat-completions-v1': body = compileOpenRouterChatRequestV1({ model, messages: user, generation: intent.generation }, operation, revision).preparedBody; break
      case 'deepseek-stable-chat-v1': body = compileDeepSeekStableChatRequestV1({ model, priorArtifact: null,
        clientEntries: user.map(message => ({ kind: 'client', message })), thinking: { type: 'disabled' }, generation: intent.generation }, operation, revision).preparedBody; break
      case 'gemini-generate-content-v1beta': body = compileGeminiGenerateContentRequestV1({ priorArtifact: null,
        clientContents: [{ role: 'user', parts: [{ text: user[0].content }] }], generation: intent.generation }, operation, revision).preparedBody; break
      case 'gemini-interactions-v1beta': body = compileGeminiInteractionsRequestV1({ model, prompt: user[0].content,
        outputMode: 'image_only', image: { mimeType: 'image/jpeg' }, generation: intent.generation }, operation, revision).preparedBody; break
      case 'generic-local-openai-chat-completions': body = compileGenericLocalOpenAIChatRequestV1({ model, messages: user, generation: intent.generation }, operation, revision).preparedBody; break
      case 'ollama-chat-v1': body = compileOllamaNativeChatRequestV1({ model, messages: user, generation: intent.generation, thinking: false }, operation, revision).preparedBody; break
      case 'lmstudio-openresponses': body = compileLmStudioOpenResponsesRequestV1({ model, priorArtifact: null, clientItems: [{ role: 'user', content: [{ type: 'input_text', text: user[0].content }] }],
        generation: intent.generation }, operation, revision).preparedBody; break
      case 'openai_chat_compatible': {
        const compiled = buildCompatibleChatRequest({ modelId: model, messages: user, stream: true,
          profile: compatibleRequestProfileConfigSchema.parse({ schemaVersion: 1, standardFieldOwnership: 'builder', unsupportedFieldPolicy: 'error_before_fetch',
            defaults: {}, extraBody: { enabled: false, maxDepth: 8, maxKeys: 64, maxBytes: 65536 } }),
          fields: { temperature: { state: 'explicit', value: intent.generation.temperature! } } }, 'text', revision)
        body = ImmutablePreparedBodyV2.fromNativeRequest(compiled.body); break
      }
      case 'openrouter-images-v1': {
        const descriptorSet = decodeCanonicalOpenRouterImageDescriptorSetV2({ id: model, endpoints: [{ provider_name: 'Test', provider_tag: 'test', provider_slug: 'test',
          supported_parameters: {}, allowed_passthrough_parameters: [], supports_streaming: false }] })
        body = compileOpenRouterImageRequestV1({ modelId: model, providerTag: 'test', providerSlug: 'test', descriptorSet,
          prompt: user[0].content, wireFields: [] }, operation, revision).preparedBody; break
      }
      default: throw new Error(`uncovered protocol ${protocol}`)
    }
    const transport = readEndpointTransportDefinitionV2(definition.providerId.value, operation, resolution.transportRevision)
    const endpoint = new URL(`${transport.apiVersion ? `/${transport.apiVersion}` : ''}${transport.requestPath.replace(/\{[^{}]+\}/gu, encodeURIComponent(model))}`,
      transport.apiOrigin ?? 'http://127.0.0.1:11434')
    Object.entries(transport.fixedQuery).forEach(([key, value]) => endpoint.searchParams.set(key, value))
    const headersPlan = protocol.startsWith('anthropic') ? createAnthropicMessagesNonSecretHeaderPlanV2()
      : protocol.startsWith('gemini') ? createGoogleApiKeyHeaderPlanV2()
        : protocol === 'openai_chat_compatible' ? createOpenAICompatibleCredentialHeaderPlanV2('bearer')
          : transport.apiOrigin === null ? createNoCredentialHeaderPlanV2() : createBearerAuthorizationHeaderPlanV2()
    const prepared = issuePreparedProviderRequestV2({ operationId: `operation:${definition.providerId.value}`, answerRootId: 'answer:test', requestSequence: 1,
      providerId: definition.providerId.value, endpointProfileId, credentialScopeId: 'scope:test', contractId: protocol, modelId: model,
      effectiveEndpointId: 'endpoint:test', endpoint: endpoint.href, headersPlan, body,
      ledger: createSemanticConsumptionLedgerV2([{ kind: 'consumed', path: 'streaming.enabled', disposition: 'accepted_no_wire',
        nativeField: null, encodingKind: 'omitted', evidence: 'test:protocol-transport' }]), requestPlan: frozenPlan,
      capabilityRevision: capability.modelFacts.capabilityRevision, encoderRevision: frozenPlan.encoderRevision, snapshotHash: 'b'.repeat(64) })
    expect(prepared.body.copyUtf8Text()).toBe(body.copyUtf8Text())
    const wire = JSON.parse(body.copyUtf8Text())
    if (protocol !== 'openrouter-images-v1') {
      const parameters = protocol === 'ollama-chat-v1' ? wire.options : protocol === 'gemini-generate-content-v1beta' ? wire.generationConfig
        : protocol === 'gemini-interactions-v1beta' ? wire.generation_config : wire
      expect(parameters.temperature).toBe(0)
    }
  })
})
