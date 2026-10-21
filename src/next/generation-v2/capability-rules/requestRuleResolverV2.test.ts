import { describe, expect, it } from 'vitest'
import { createReviewedRequestRulePacksV2 } from '../../../../scripts/rules/reviewedRequestRulePacksV2'
import { bindRequestRulesToSubjectsV2, assertBoundRequestRuleDecisionsV2 } from '../../../core/generation-v2/capability-rules/boundRequestRulesV2'
import { resolveRequestRulesV2 } from '../../../core/generation-v2/capability-rules/requestRuleResolverV2'
import { createResolvedInvocationV2, assertResolvedInvocationBindingV2 } from '../../../core/generation-v2/compiler/resolvedInvocationV2'
import { createEffectiveRequestPlanV2, decodeEffectiveRequestPlanV2 } from '../../../core/generation-v2/compiler/effectiveRequestPlanV2'
import { canonicalizeResolvedCapabilityV2 } from '../../../core/generation-v2/capability/resolvedCapabilityV2'
import { MODEL_CAPABILITY_SEMANTIC_PATHS_V2 } from '../../../core/generation-v2/capability/modelCapabilitySchemaV2'
import { listReviewedProviderContractDefinitionsV2 } from '../../../core/generation-v2/contracts/providerContractRegistryV2'
import { decodeResolvedGenerationIntentV2 } from '../../../core/generation-v2/domain/resolvedGenerationIntentV2'
import type { CapabilityRuleOwnershipSnapshotV2 } from '../../../core/generation-v2/capability-rules/capabilityRuleCoreV2'
import { highestPriorityFactClaimsV2 } from '../../../core/generation-v2/model-facts/resolveModelFactsV1'
import { compileAnthropicMessagesRequestV1 } from '../../../core/generation-v2/providers/anthropic/messagesRequestV1'
import { readApiRequestBodyContractV2 } from '../../../core/generation-v2/contracts/apiRequestBodyContractV2'
import { resolveGeminiInteractionsImageOutputModeV2 } from '../../../../electron/services/geminiInteractionsImagePreparedRequestCompilerV2'

const evidenceIds = ['test.rule']
function fixture(protocol = 'openai-responses-v1', modelId = 'gpt-6-luna') {
  const definition = listReviewedProviderContractDefinitionsV2().find(value => value.protocolContractId.value === protocol)!
  const anthropic = protocol.startsWith('anthropic')
  const google = protocol.startsWith('gemini')
  const interactions = protocol === 'gemini-interactions-v1beta'
  const endpointProfileId = anthropic ? 'anthropic-developer-api-2023-06-01' : google ? 'gemini-developer-api-v1beta' : 'openai-api-v1'
  const providerAuthorityId = anthropic ? 'anthropic' : google ? 'google-ai-studio' : 'openai'
  const subject = { providerAuthorityId, endpointProfileId, nativeModelId: modelId }
  const capability = canonicalizeResolvedCapabilityV2({ binding: {
    providerId: definition.providerId.value, endpointProfileId, modelId, credentialScopeId: 'credential:test', operation: interactions ? 'image_generate' : 'text',
    protocolContractId: protocol, contractRevision: definition.contractRevision.value, contractDefinitionDigest: definition.definitionDigest.value,
    registryRevision: definition.registryRevision.value, endpointBinding: { kind: 'provider_managed_set', endpointSetRevision: 'endpoint:1',
      descriptors: [{ endpointId: 'endpoint:test', descriptorRevision: 'descriptor:1' }] },
  }, evidence: [{ evidenceId: evidenceIds[0], kind: 'official_documentation', effect: 'supports',
    sourceRef: 'https://example.test/rules', verifiedAt: '2026-10-17T00:00:00.000Z', contentDigest: 'a'.repeat(64) },
    { evidenceId: 'test.unknown', kind: 'contract_invariant', effect: 'unknown', sourceRef: 'test:unknown', verifiedAt: '2026-10-17T00:00:00.000Z', contentDigest: 'b'.repeat(64) }],
  fields: MODEL_CAPABILITY_SEMANTIC_PATHS_V2.map(path => ({ path, state: 'unknown', constraints: [], evidenceIds: ['test.unknown'],
    ...(path === 'reasoning.mode' ? { state: 'supported', evidenceIds, domain: { kind: 'enum', values: interactions ? ['enabled'] : ['enabled', 'disabled'] },
      ...(interactions ? { defaultValue: 'enabled' } : {}) } : {}),
    ...(path === 'reasoning.effort' ? { state: 'supported', evidenceIds, domain: { kind: 'enum', values: ['none', 'low', 'medium', 'high'] }, defaultValue: 'medium' } : {}),
    ...(path === 'providerExtension.thinkingMode' && anthropic ? { state: 'supported', evidenceIds, domain: { kind: 'enum', values: ['model_recommended', 'provider_default', 'manual', 'disabled'] }, defaultValue: 'manual' } : {}),
    ...(path === 'image.mode' && interactions ? { state: 'supported', evidenceIds, domain: { kind: 'enum', values: ['disabled', 'generate'] } } : {}),
    ...(path === 'image.outputMode' && interactions ? { state: 'supported', evidenceIds, domain: { kind: 'enum', values: ['image_only', 'image_and_text'] } } : {}),
  })), continuation: { kind: 'none', evidenceIds } })
  const transfers = createReviewedRequestRulePacksV2([{ providerAuthorityId, endpointProfileId,
    protocolContractId: protocol, nativeModelIds: [modelId] }])
  const snapshot: CapabilityRuleOwnershipSnapshotV2 = { schemaVersion: 2, ownership: 'user', ownerId: 'local-user', packs: transfers.map(value => value.pack) }
  const bundle = bindRequestRulesToSubjectsV2({ snapshots: [snapshot], subjects: [subject], defaultActivationPolicies: { cloud: 'enabled', user: 'enabled' } })[0]!
  return { capability, bundle, snapshot, subject }
}
function requested(reasoning: unknown, temperature?: number) {
  return decodeResolvedGenerationIntentV2({ schemaVersion: 2, generation: temperature === undefined ? {} : { temperature }, reasoning,
    web: { mode: 'disabled' }, image: { mode: 'disabled' }, tools: { mode: 'disabled' }, attachments: [], providerExtension: { kind: 'openai_responses' } }).value
}

describe('Rule-owned request resolution', () => {
  it('selects search defaults only through applied Rules and preserves explicit requested values', () => {
    const { capability, bundle } = fixture()
    const intent = (context?: string) => decodeResolvedGenerationIntentV2({ schemaVersion: 2, generation: {},
      reasoning: { mode: 'enabled', effort: 'low' }, web: { mode: 'provider_search', types: ['web'],
        ...(context === undefined ? {} : { searchContextSize: context }) },
      image: { mode: 'disabled' }, tools: { mode: 'disabled' }, attachments: [], providerExtension: { kind: 'none' } }).value
    const result = resolveRequestRulesV2({ requested: intent(), capability, bundle })
    expect(result.intent.value.web).toMatchObject({ searchContextSize: 'medium' })
    expect(result.adaptations).toContainEqual(expect.objectContaining({ path: 'web.searchContextSize', reason: 'rule_parameter_default',
      source: { value: 'medium', origin: 'application_fallback' } }))
    expect(resolveRequestRulesV2({ requested: intent('low'), capability, bundle }).intent.value.web).toMatchObject({ searchContextSize: 'low' })
    const noDefault = { ...bundle, rules: bundle.rules.filter(rule => rule.definition.effect.kind !== 'registered_operation' ||
      rule.definition.effect.operationId !== 'parameter_default') }
    expect(resolveRequestRulesV2({ requested: intent(), capability, bundle: noDefault }).intent.value.web).not.toHaveProperty('searchContextSize')
  })
  it('requires the Rule-projected Gemini image output mode for request plans V2', () => {
    const { capability, bundle } = fixture('gemini-interactions-v1beta', 'gemini-3.1-flash-image')
    const original = decodeResolvedGenerationIntentV2({ schemaVersion: 2, generation: {}, reasoning: { mode: 'disabled' },
      web: { mode: 'disabled' }, image: { mode: 'generate', aspectRatio: '1:1' }, tools: { mode: 'disabled' }, attachments: [],
      providerExtension: { kind: 'gemini_interactions' } }).value
    const resolved = resolveRequestRulesV2({ requested: original, capability, bundle })
    expect(resolved.intent.value.image).toMatchObject({ mode: 'generate', outputMode: 'image_only', aspectRatio: { value: '1:1' } })
    expect(resolveGeminiInteractionsImageOutputModeV2(resolved.intent.value.image.mode === 'generate'
      ? resolved.intent.value.image.outputMode : undefined, 2)).toBe('image_only')

    const withoutImageDefault = { ...bundle, rules: bundle.rules.filter(rule =>
      !(rule.definition.effect.kind === 'registered_operation' && rule.definition.effect.operationId === 'parameter_default' &&
        rule.definition.effect.parameters.path === 'image.outputMode')) }
    const unresolved = resolveRequestRulesV2({ requested: original, capability, bundle: withoutImageDefault })
    expect(unresolved.intent.value.image).not.toHaveProperty('outputMode')
    expect(() => resolveGeminiInteractionsImageOutputModeV2(undefined, 2))
      .toThrow('GENERATION_V2_GEMINI_INTERACTIONS_COMPILER_SEMANTIC_REJECTED')
    expect(resolveGeminiInteractionsImageOutputModeV2(undefined, 1)).toBe('image_only')
  })
  it('uses only the explicit OpenAI image ratio table and records unsupported source values as deferred', () => {
    const { capability, bundle } = fixture('openai-responses-v1', 'gpt-6-luna')
    const original = decodeResolvedGenerationIntentV2({ schemaVersion: 2, generation: {}, reasoning: { mode: 'disabled' },
      web: { mode: 'disabled' }, image: { mode: 'generate', aspectRatio: '3:4', resolution: '2K' },
      tools: { mode: 'disabled' }, attachments: [], providerExtension: { kind: 'openai_responses' } }).value
    const result = resolveRequestRulesV2({ requested: original, capability, bundle })
    expect(result.intent.value.image).toMatchObject({ mode: 'generate', size: { width: 1024, height: 1536 } })
    expect(result.intent.value.image).not.toHaveProperty('aspectRatio')
    expect(result.intent.value.image).not.toHaveProperty('resolution')
    expect(result.adaptations).toContainEqual(expect.objectContaining({ path: 'image.aspectRatio', outcome: 'converted',
      reason: 'rule_image_aspect_ratio_to_size', source: { aspectRatio: '3:4', size: { width: 1024, height: 1536 } } }))
    expect(result.adaptations).toContainEqual(expect.objectContaining({ path: 'image.resolution', outcome: 'deferred',
      reason: 'rule_image_ratio_mapping_does_not_encode_resolution', source: '2K' }))

    const unmapped = decodeResolvedGenerationIntentV2({ schemaVersion: 2, generation: {}, reasoning: { mode: 'disabled' },
      web: { mode: 'disabled' }, image: { mode: 'generate', aspectRatio: '2:3' },
      tools: { mode: 'disabled' }, attachments: [], providerExtension: { kind: 'openai_responses' } }).value
    const unmappedResult = resolveRequestRulesV2({ requested: unmapped, capability, bundle })
    expect(unmappedResult.intent.value.image).not.toHaveProperty('aspectRatio')
    expect(unmappedResult.intent.value.image).not.toHaveProperty('size')
    expect(unmappedResult.adaptations).toContainEqual(expect.objectContaining({ path: 'image.aspectRatio', outcome: 'deferred',
      reason: 'rule_image_aspect_ratio_unmapped', source: '2:3' }))
  })
  it('recognizes protocol-native active modes rather than coercing image generate to enabled', () => {
    const { capability, bundle } = fixture('gemini-interactions-v1beta', 'gemini-3.1-flash-image')
    const requiredImage = { ...capability, modelFacts: { ...capability.modelFacts, fields: capability.modelFacts.fields.map(field =>
      field.path === 'image.mode' ? { ...field, state: 'supported' as const, domain: { kind: 'enum' as const, values: ['generate'] } } : field) } }
    const original = decodeResolvedGenerationIntentV2({ schemaVersion: 2, generation: {}, reasoning: { mode: 'disabled' },
      web: { mode: 'disabled' }, image: { mode: 'disabled' }, tools: { mode: 'disabled' }, attachments: [],
      providerExtension: { kind: 'gemini_interactions' } }).value
    const supportRule = bundle.rules.filter(rule => rule.definition.effect.kind === 'registered_operation' &&
      rule.definition.effect.operationId === 'parameter_support')
    const result = resolveRequestRulesV2({ requested: original, capability: requiredImage, bundle: { ...bundle, rules: supportRule } })
    expect(result.intent.value.image).toEqual({ mode: 'generate' })
  })
  it('resolves a required image control before selecting its Rule-owned output default', () => {
    const { capability, bundle } = fixture('gemini-interactions-v1beta', 'gemini-3.1-flash-image')
    const requiredImage = { ...capability, modelFacts: { ...capability.modelFacts, fields: capability.modelFacts.fields.map(field =>
      field.path === 'image.mode' ? { ...field, state: 'supported' as const, domain: { kind: 'enum' as const, values: ['generate'] } } : field) } }
    const original = decodeResolvedGenerationIntentV2({ schemaVersion: 2, generation: {}, reasoning: { mode: 'disabled' },
      web: { mode: 'disabled' }, image: { mode: 'disabled' }, tools: { mode: 'disabled' }, attachments: [],
      providerExtension: { kind: 'gemini_interactions' } }).value
    const result = resolveRequestRulesV2({ requested: original, capability: requiredImage, bundle })
    expect(result.intent.value.image).toMatchObject({ mode: 'generate', outputMode: 'image_only' })
    expect(original.image).toEqual({ mode: 'disabled' })
    expect(result.adaptations).toContainEqual(expect.objectContaining({ path: 'image.outputMode', reason: 'rule_parameter_default' }))
  })
  it.each(['reasoning', 'web', 'image'] as const)('rejects active %s when its control fact is missing', group => {
    const { capability, bundle } = fixture()
    const missing = { ...capability, modelFacts: { ...capability.modelFacts, fields: capability.modelFacts.fields.map(field =>
      field.path === `${group}.mode` ? { ...field, state: 'missing' as const, domain: undefined } : field) } }
    const original = decodeResolvedGenerationIntentV2({ schemaVersion: 2, generation: {},
      reasoning: { mode: group === 'reasoning' ? 'enabled' : 'disabled' },
      web: group === 'web' ? { mode: 'provider_search', types: ['web'] } : { mode: 'disabled' },
      image: { mode: group === 'image' ? 'generate' : 'disabled' }, tools: { mode: 'disabled' }, attachments: [],
      providerExtension: { kind: 'openai_responses' } }).value
    const rules = bundle.rules.filter(rule => rule.definition.effect.kind === 'registered_operation' &&
      rule.definition.effect.operationId === 'parameter_support')
    expect(() => resolveRequestRulesV2({ requested: original, capability: missing, bundle: { ...bundle, rules } }))
      .toThrow('GENERATION_V2_RULE_REQUIRED_PARAMETER_UNRESOLVED')
  })
  it('enforces known control and parameter facts even with no applicable policy Rules', () => {
    const { capability, bundle } = fixture()
    const noRules = { ...bundle, rules: [] }
    const unsupportedMode = { ...capability, modelFacts: { ...capability.modelFacts, fields: capability.modelFacts.fields.map(field =>
      field.path === 'reasoning.mode' ? { ...field, state: 'unsupported' as const, domain: undefined } : field) } }
    expect(() => resolveRequestRulesV2({ requested: requested({ mode: 'enabled', effort: 'low' }), capability: unsupportedMode, bundle: noRules }))
      .toThrow('GENERATION_V2_RULE_PARAMETER_UNSUPPORTED')
    const unsupportedTemperature = { ...capability, modelFacts: { ...capability.modelFacts, fields: capability.modelFacts.fields.map(field =>
      field.path === 'generation.temperature' ? { ...field, state: 'unsupported' as const, domain: undefined } : field) } }
    const original = requested({ mode: 'disabled' }, 0.4)
    expect(() => resolveRequestRulesV2({ requested: original, capability: unsupportedTemperature, bundle: noRules }))
      .toThrow('GENERATION_V2_RULE_PARAMETER_UNSUPPORTED')
    expect(original.generation.temperature).toBe(0.4)
    expect(resolveRequestRulesV2({ requested: requested({ mode: 'disabled' }), capability, bundle: noRules }).intent.value.reasoning)
      .toEqual({ mode: 'disabled' })
  })
  it.each([0, 0.4])('preserves temperature %s for resolved none and freezes the complete policy binding', temperature => {
    const { capability, bundle } = fixture()
    const original = requested({ mode: 'disabled' }, temperature)
    const resolution = resolveRequestRulesV2({ requested: original, capability, bundle })
    expect(resolution.intent.value.generation.temperature).toBe(temperature)
    expect(resolution.intent.value.reasoning).toEqual({ mode: 'disabled', effort: 'none' })
    expect(original.reasoning).toEqual({ mode: 'disabled' })
    const invocation = createResolvedInvocationV2({ requested: original, capability, bundle, resolution })
    const plan = createEffectiveRequestPlanV2({ requested: original, effective: resolution.intent.value, capability, resolution: invocation, decisions: [] })
    expect(plan.schemaVersion).toBe(2)
    expect(decodeEffectiveRequestPlanV2(JSON.parse(JSON.stringify(plan)))).toEqual(plan)
    expect(() => assertResolvedInvocationBindingV2(invocation, { effective: resolution.intent.value,
      binding: capability.executionContext.binding, capabilityRevision: capability.modelFacts.capabilityRevision,
      encoderRevision: 'changed-encoder' })).toThrow('GENERATION_V2_RESOLVED_INVOCATION_BINDING_MISMATCH')
  })
  it('retains an inherited thinking omission while producing a complete frozen invocation', () => {
    const { capability, bundle } = fixture()
    const original = decodeResolvedGenerationIntentV2({ ...requested({ mode: 'enabled', effort: 'low' }),
      requestedParameters: { thinkingEnabled: { mode: 'omit', source: 'project' } } }).value
    const result = resolveRequestRulesV2({ requested: original, capability, bundle })
    expect(['enabled', 'disabled']).toContain(result.intent.value.reasoning.mode)
    expect(result.intent.value).not.toHaveProperty('requestedParameters')
    const invocation = createResolvedInvocationV2({ requested: original, capability, bundle, resolution: result })
    const plan = createEffectiveRequestPlanV2({ requested: original, effective: result.intent.value, capability,
      resolution: invocation, decisions: result.adaptations })
    expect(plan.requestedIntent.requestedParameters).toEqual({ thinkingEnabled: { mode: 'omit', source: 'project' } })
    expect(decodeEffectiveRequestPlanV2(JSON.parse(JSON.stringify(plan)))).toEqual(plan)
  })
  it('rejects non-none plus a supplied temperature; omit passes and preview stays usable', () => {
    const { capability, bundle } = fixture()
    const original = requested({ mode: 'enabled', effort: 'low' }, 0.4)
    expect(() => resolveRequestRulesV2({ requested: original, capability, bundle })).toThrow('GENERATION_V2_RULE_TEMPERATURE_REQUIRES_NONE')
    expect(original.generation.temperature).toBe(0.4)
    expect(resolveRequestRulesV2({ requested: requested({ mode: 'enabled', effort: 'low' }), capability, bundle }).intent.value.reasoning.effort).toBe('low')
    expect(resolveRequestRulesV2({ requested: original, capability, bundle, validationMode: 'preview' }).decisions)
      .toContainEqual(expect.objectContaining({ outcome: 'validation_failed' }))
  })
  it.each([4096, 4097])('rejects manual budget %s at output 4096 without changing either value', budget => {
    const { capability, bundle } = fixture('anthropic-messages-2023-06-01', 'claude-sonnet-4-5')
    const original = decodeResolvedGenerationIntentV2({ schemaVersion: 2, generation: { maxOutputTokens: 4096 }, reasoning: { mode: 'enabled' },
      web: { mode: 'disabled' }, image: { mode: 'disabled' }, tools: { mode: 'disabled' }, attachments: [],
      providerExtension: { kind: 'anthropic_messages', thinkingMode: 'manual', thinkingDisplay: 'provider_default', manualThinkingBudgetTokens: budget } }).value
    expect(() => resolveRequestRulesV2({ requested: original, capability, bundle })).toThrow('GENERATION_V2_RULE_THINKING_BUDGET_NOT_BELOW_OUTPUT')
    expect(original.generation.maxOutputTokens).toBe(4096)
    expect(original.providerExtension).toMatchObject({ manualThinkingBudgetTokens: budget })
    const withoutValidation = { ...bundle, rules: bundle.rules.filter(entry => entry.definition.effect.kind !== 'validation') }
    const result = resolveRequestRulesV2({ requested: original, capability, bundle: withoutValidation })
    expect(result.intent.value.generation.maxOutputTokens).toBe(4096)
    expect(result.intent.value.providerExtension).toMatchObject({ thinkingMode: 'manual', manualThinkingBudgetTokens: budget })
    const wire = compileAnthropicMessagesRequestV1({ modelId: 'claude-sonnet-4-5', intent: result.intent.value,
      messages: [{ role: 'user', content: 'test' }] }, 'text', readApiRequestBodyContractV2('anthropic', 'text').bodySchemaRevision)
    expect(wire.issues).toEqual([])
    expect(wire.nativeRequest).toMatchObject({ max_tokens: 4096, thinking: { type: 'enabled', budget_tokens: budget } })
  })
  it('uses a declared output fallback only when absent; an upper bound is never a default', () => {
    const { capability, bundle } = fixture('anthropic-messages-2023-06-01', 'claude-sonnet-4-5')
    const original = decodeResolvedGenerationIntentV2({ schemaVersion: 2, generation: {}, reasoning: { mode: 'enabled' },
      web: { mode: 'disabled' }, image: { mode: 'disabled' }, tools: { mode: 'disabled' }, attachments: [],
      providerExtension: { kind: 'anthropic_messages', thinkingMode: 'manual', thinkingDisplay: 'provider_default', manualThinkingBudgetTokens: 1024 } }).value
    expect(resolveRequestRulesV2({ requested: original, capability, bundle }).intent.value.generation.maxOutputTokens).toBe(4096)
  })
  it('respects disabled default policies when binding; there is no implicit policy execution', () => {
    const { capability, snapshot, subject } = fixture()
    const bundle = bindRequestRulesToSubjectsV2({ snapshots: [snapshot], subjects: [subject], defaultActivationPolicies: { cloud: 'disabled', user: 'disabled' } })[0]!
    expect(bundle.rules).toHaveLength(0)
    const original = requested({ mode: 'enabled', effort: 'low' }, 0.4)
    expect(resolveRequestRulesV2({ requested: original, capability, bundle }).intent.value).toEqual(original)
  })
  it('does not claim Anthropic thinking is on by omitting an unresolved thinking mode', () => {
    const { capability, bundle } = fixture('anthropic-messages-2023-06-01', 'claude-sonnet-4-5')
    const unknown = capability.modelFacts.fields.find(field => field.state === 'unknown')!
    const unresolved = { ...capability, modelFacts: { ...capability.modelFacts, fields: capability.modelFacts.fields.map(field =>
      field.path === 'providerExtension.thinkingMode' ? { ...unknown, path: field.path } : field) } }
    const original = requested({ mode: 'enabled' })
    expect(() => resolveRequestRulesV2({ requested: original, capability: unresolved, bundle }))
      .toThrow('GENERATION_V2_RULE_REQUIRED_PARAMETER_UNRESOLVED')
  })
  it('shares source and exact/regex arbitration without changing saved source priorities', () => {
    const claims = [
      { sourceKind: 'models_dev' as const, sourcePriority: 1, value: false },
      { sourceKind: 'capability_rule' as const, sourcePriority: 2, selectorKind: 'regex' as const, rulePriority: 100, value: false },
      { sourceKind: 'capability_rule' as const, sourcePriority: 2, selectorKind: 'exact' as const, rulePriority: -100, value: true },
    ]
    expect(highestPriorityFactClaimsV2(claims, value => value).map(value => value.value)).toEqual([true])
    const userOrder = claims.map(value => ({ ...value, sourcePriority: value.sourceKind === 'models_dev' ? 3 : 2 }))
    expect(highestPriorityFactClaimsV2(userOrder, value => value).map(value => value.value)).toEqual([false])
  })
  it('rejects publication-time same-condition conflicts and cross-owner dependency cycles', () => {
    const { bundle } = fixture()
    const base = bundle.rules[0]!
    const a = { ...base, definition: { ...base.definition, when: null, decisionKey: 'test.a', dependencies: [] } }
    const b = { ...base, ownerId: 'other-owner', definition: { ...base.definition, ruleId: 'test.other', when: null,
      decisionKey: 'test.a', dependencies: [], effect: { kind: 'validation' as const, code: 'GENERATION_V2_TEST',
        predicate: { kind: 'exists' as const, path: 'requested.generation.temperature' as const } } } }
    expect(() => assertBoundRequestRuleDecisionsV2([a, b])).toThrow('GENERATION_V2_RULE_STATIC_CONFLICT')
    expect(() => assertBoundRequestRuleDecisionsV2([a, { ...b, packPriority: b.packPriority + 1 }])).not.toThrow()
    expect(() => assertBoundRequestRuleDecisionsV2([{ ...a, definition: { ...a.definition, dependencies: ['test.b'] } },
      { ...b, definition: { ...b.definition, decisionKey: 'test.b', dependencies: ['test.a'] } }]))
      .toThrow('GENERATION_V2_RULE_DEPENDENCY_CYCLE')
  })
  it('applies model mode support through the Rule while retaining the original enabled preference', () => {
    const { capability, bundle } = fixture()
    const original = requested({ mode: 'enabled', effort: 'low' })
    const unavailable = { ...capability, modelFacts: { ...capability.modelFacts,
      fields: capability.modelFacts.fields.map(field => field.path === 'reasoning.mode'
        ? { path: field.path, state: 'unsupported' as const, constraints: [], evidenceIds: field.evidenceIds } : field) } }
    const parameterRule = bundle.rules.filter(entry => entry.definition.effect.kind === 'registered_operation' && entry.definition.effect.operationId === 'parameter_support')
    const result = resolveRequestRulesV2({ requested: original, capability: unavailable, bundle: { ...bundle, rules: parameterRule } })
    expect(result.intent.value.reasoning).toEqual({ mode: 'disabled' })
    expect(original.reasoning).toEqual({ mode: 'enabled', effort: 'low' })
    expect(result.adaptations).toContainEqual(expect.objectContaining({ path: 'reasoning', reason: 'rule_target_control_unsupported' }))
  })
})
