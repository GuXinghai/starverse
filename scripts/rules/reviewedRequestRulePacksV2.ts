import { anthropicThinkingRulesSnapshotV2 } from '../../src/core/generation-v2/capability-rules/anthropicThinkingRulesV2'
import { geminiThinkingRulesSnapshotV2 } from '../../src/core/generation-v2/capability-rules/geminiThinkingRulesV2'
import { openAIResponsesThinkingRulesSnapshotV2 } from '../../src/core/generation-v2/capability-rules/openAIResponsesThinkingRulesV2'
import { decodeCapabilityRuleCorePackV2, migrateCapabilityRuleOwnershipSnapshotV1ToV2,
  type CapabilityRuleCoreRuleV2, type CapabilityRulePredicateV2, type CapabilityRuleEffectV2 } from '../../src/core/generation-v2/capability-rules/capabilityRuleCoreV2'
import { createUserRulePackTransferV2 } from '../../src/core/generation-v2/capability-rules/userRulePackTransferV2'
import { canonicalSourceFactDigestV1 } from '../../src/core/generation-v2/model-facts/canonicalSourceFactsV1'
import { authorRequestedParametersPolicyV2, type RequestedParameterExtensionKindV2 } from '../../src/core/generation-v2/capability-rules/operations/requestedParametersV2'

export type RequestRuleScopeV2 = Readonly<{ providerAuthorityId: string; endpointProfileId: string; protocolContractId: string;
  nativeModelIds?: readonly string[] }>
const firstPartyScopes: readonly RequestRuleScopeV2[] = [
  { providerAuthorityId: 'openai', endpointProfileId: 'openai-api-v1', protocolContractId: 'openai-responses-v1' },
  { providerAuthorityId: 'anthropic', endpointProfileId: 'anthropic-developer-api-2023-06-01', protocolContractId: 'anthropic-messages-2023-06-01' },
  { providerAuthorityId: 'google-ai-studio', endpointProfileId: 'gemini-developer-api-v1beta', protocolContractId: 'gemini-generate-content-v1beta' },
  { providerAuthorityId: 'google-ai-studio', endpointProfileId: 'gemini-developer-api-v1beta', protocolContractId: 'gemini-interactions-v1beta' },
  { providerAuthorityId: 'openrouter', endpointProfileId: 'openrouter-first-party-v1', protocolContractId: 'openrouter-chat-completions-v1' },
  { providerAuthorityId: 'openrouter', endpointProfileId: 'openrouter-first-party-v1', protocolContractId: 'openrouter-images-v1' },
  { providerAuthorityId: 'deepseek', endpointProfileId: 'deepseek-stable-api-v1', protocolContractId: 'deepseek-stable-chat-v1' },
]
const protocolRecipe: Readonly<Record<string, {
  extension: string; disabled: readonly ('reasoning' | 'web' | 'image' | 'tools')[]; reasoning?: 'reasoning_openai' | 'reasoning_anthropic' | 'reasoning_gemini';
  gemini?: 'generate_content' | 'interactions'; defaultEffort?: string; webTypes?: readonly string[]
}>> = {
  'openai-responses-v1': { extension: 'openai_responses', disabled: [], reasoning: 'reasoning_openai' },
  'anthropic-messages-2023-06-01': { extension: 'anthropic_messages', disabled: ['image'], reasoning: 'reasoning_anthropic', webTypes: ['web'] },
  'gemini-generate-content-v1beta': { extension: 'gemini_generate_content', disabled: ['image'], reasoning: 'reasoning_gemini', gemini: 'generate_content', webTypes: ['web'] },
  'gemini-interactions-v1beta': { extension: 'gemini_interactions', disabled: [], reasoning: 'reasoning_gemini', gemini: 'interactions' },
  'openrouter-chat-completions-v1': { extension: 'openrouter_chat', disabled: ['image'] },
  'openrouter-images-v1': { extension: 'none', disabled: [] },
  'deepseek-stable-chat-v1': { extension: 'none', disabled: ['web', 'image'] },
  'generic-local-openai-chat-completions': { extension: 'none', disabled: ['reasoning', 'web', 'image', 'tools'] },
  'ollama-chat-v1': { extension: 'none', disabled: ['web', 'image', 'tools'], defaultEffort: 'medium' },
  'lmstudio-openresponses': { extension: 'none', disabled: ['web', 'image'] },
  'openai_chat_compatible': { extension: 'none', disabled: ['web', 'image', 'tools'] },
}

/** Authoring tool only. Application startup never imports or applies these packs. */
export function createReviewedRequestRulePacksV2(extraScopes: readonly RequestRuleScopeV2[] = []) {
  const facts = [anthropicThinkingRulesSnapshotV2(), geminiThinkingRulesSnapshotV2(), openAIResponsesThinkingRulesSnapshotV2()]
    .map(snapshot => migrateCapabilityRuleOwnershipSnapshotV1ToV2(snapshot)).flatMap(snapshot => snapshot.packs)
    .map(pack => decodeCapabilityRuleCorePackV2({ ...pack,
      displayName: pack.displayName.replace('(bundled documentation)', '(imported documentation)'),
      rules: pack.rules.filter(rule => !(rule.effect.kind === 'fact_assertion' && rule.effect.path === 'sampling.temperature.support')) }))
  const rules: CapabilityRuleCoreRuleV2[] = []
  function add(scope: RequestRuleScopeV2, suffix: string, category: CapabilityRuleCoreRuleV2['category'], effect: CapabilityRuleEffectV2,
    options: { when?: CapabilityRulePredicateV2; dependencies?: readonly string[]; model?: string; decisionKey?: string; priority?: number } = {}) {
    const target: CapabilityRulePredicateV2 = { kind: 'eq', path: 'target.protocolContractId', value: scope.protocolContractId }
    rules.push({ ruleId: `request-v2.${canonicalSourceFactDigestV1(scope).slice(0, 20)}.${suffix}`,
      label: null, description: 'Reviewed request policy, imported through the User rule-pack lifecycle.',
      configured: 'default', priority: options.priority ?? 0, providerAuthorityId: scope.providerAuthorityId, endpointProfileId: scope.endpointProfileId,
      selector: options.model ? { kind: 'exact', nativeModelIds: [options.model] }
        : { kind: 'exact', nativeModelIds: scope.nativeModelIds! },
      evidence: null, category, when: options.when ? { kind: 'all', predicates: [target, options.when] } : target,
      effect, decisionKey: options.decisionKey ?? `request.${suffix}`, dependencies: options.dependencies ?? [] })
  }
  const authoredScopes = new Map<string, RequestRuleScopeV2>()
  for (const scope of [...firstPartyScopes, ...extraScopes]) {
    const key = `${scope.providerAuthorityId}/${scope.endpointProfileId}/${scope.protocolContractId}`
    const known = facts.flatMap(pack => pack.rules.filter(rule => rule.providerAuthorityId === scope.providerAuthorityId &&
      rule.endpointProfileId === scope.endpointProfileId).flatMap(rule => rule.selector.kind === 'exact' ? rule.selector.nativeModelIds : []))
    const nativeModelIds = [...new Set([...(authoredScopes.get(key)?.nativeModelIds ?? []), ...(scope.nativeModelIds ?? known)])].sort()
    authoredScopes.set(key, { ...scope, nativeModelIds })
  }
  const chunks = [...authoredScopes.values()].flatMap(scope => {
    const values: RequestRuleScopeV2[] = []
    for (let offset = 0; offset < (scope.nativeModelIds?.length ?? 0); offset += 256)
      values.push({ ...scope, nativeModelIds: scope.nativeModelIds!.slice(offset, offset + 256) })
    return values
  })
  for (const scope of chunks) {
    const recipe = protocolRecipe[scope.protocolContractId]
    if (!recipe) throw new Error('GENERATION_V2_RULE_AUTHORING_UNKNOWN_PROTOCOL')
    add(scope, 'requested-parameters', 'operations', { kind: 'registered_operation', operationId: 'requested_parameters',
      parameters: authorRequestedParametersPolicyV2(recipe.extension as RequestedParameterExtensionKindV2) },
    { decisionKey: 'request.requestedParameters' })
    add(scope, 'controls', 'operations', { kind: 'registered_operation', operationId: 'parameter_support', parameters: {
      unsupported: 'defer', phase: 'controls', disabledControls: recipe.disabled,
    } }, { decisionKey: 'request.controls', dependencies: ['request.requestedParameters'] })
    if (recipe.reasoning) {
      const parameters = recipe.reasoning === 'reasoning_openai' ? { samplingBehavior: 'preserve' }
        : recipe.reasoning === 'reasoning_anthropic' ? { maxOutputFallback: 4096, manualBudgetFallback: 1024, budgetConflict: 'validate_only' }
          : { protocol: recipe.gemini }
      add(scope, 'reasoning', 'reasoning', { kind: 'registered_operation', operationId: recipe.reasoning, parameters } as CapabilityRuleEffectV2,
        { dependencies: ['request.controls'] })
    }
    add(scope, 'parameters', 'sampling', { kind: 'registered_operation', operationId: 'parameter_support', parameters: {
      unsupported: 'defer', phase: 'values', providerExtensionKind: recipe.extension, disabledControls: recipe.disabled,
      ...(recipe.defaultEffort ? { defaultEffort: recipe.defaultEffort } : {}), ...(recipe.webTypes ? { webTypes: recipe.webTypes } : {}),
    } } as CapabilityRuleEffectV2, { dependencies: recipe.reasoning ? ['request.reasoning'] : ['request.controls'] })
    add(scope, 'attachments', 'input', { kind: 'registered_operation', operationId: 'attachment_transport', parameters: {} })
    if (scope.protocolContractId === 'openai-responses-v1' || scope.protocolContractId === 'lmstudio-openresponses')
      add(scope, 'tool-definition-defaults', 'tools', { kind: 'registered_operation', operationId: 'tool_definition_defaults',
        parameters: { parameters: 'empty_object', strict: true } }, { decisionKey: 'tools:definitionDefaults' })
    const webDefaults: readonly ['web.maxResults' | 'web.searchContextSize', number | string][] =
      scope.protocolContractId === 'openai-responses-v1' ? [['web.searchContextSize', 'medium']]
        : scope.protocolContractId === 'anthropic-messages-2023-06-01' ? [['web.maxResults', 5]]
          : scope.protocolContractId === 'openrouter-chat-completions-v1' ? [['web.maxResults', 5], ['web.searchContextSize', 'medium']] : []
    for (const [path, value] of webDefaults) add(scope, `default-${path}`, 'search_citations', {
      kind: 'registered_operation', operationId: 'parameter_default', parameters: { path, value, origin: 'application_fallback' },
    }, { decisionKey: `default:${path}` })
    if (scope.protocolContractId === 'gemini-interactions-v1beta') add(scope, 'default-image.outputMode', 'image_generation', {
      kind: 'registered_operation', operationId: 'parameter_default',
      parameters: { path: 'image.outputMode', value: 'image_only', origin: 'application_fallback' },
    }, { decisionKey: 'default:image.outputMode' })
    if (scope.protocolContractId === 'openai-responses-v1') add(scope, 'image-ratio-size', 'image_generation', {
      kind: 'registered_operation', operationId: 'image_aspect_ratio_to_size', parameters: { mappings: [
        { from: '1:1', width: 1024, height: 1024 }, { from: '3:4', width: 1024, height: 1536 },
        { from: '4:3', width: 1536, height: 1024 }, { from: '16:9', width: 1536, height: 1024 },
      ] },
    }, { when: { kind: 'eq', path: 'effective.image.mode', value: 'generate' }, decisionKey: 'image:aspectRatioToSize' })
    if (recipe.reasoning === 'reasoning_anthropic') {
      add(scope, 'manual-budget', 'reasoning', { kind: 'validation',
        predicate: { kind: 'lt', path: 'effective.providerExtension.manualThinkingBudgetTokens', right: { path: 'effective.generation.maxOutputTokens' } },
        code: 'GENERATION_V2_RULE_THINKING_BUDGET_NOT_BELOW_OUTPUT' }, {
        when: { kind: 'eq', path: 'effective.providerExtension.thinkingMode', value: 'manual' }, dependencies: ['request.reasoning'] })
      add(scope, 'tool-choice', 'tools', { kind: 'registered_operation', operationId: 'tool_choice', parameters: { thinkingRequiredAuto: true } },
        { dependencies: ['request.reasoning'] })
    }
    if (scope.protocolContractId === 'openai-responses-v1') for (const model of ['gpt-6-luna']) {
      if (!scope.nativeModelIds!.includes(model)) continue
      const none: CapabilityRulePredicateV2 = { kind: 'eq', path: 'effective.reasoning.effort', value: 'none' }
      for (const supported of [true, false]) add(scope, `${model}.temperature-${supported}`, 'sampling', {
        kind: 'fact_assertion', path: 'sampling.temperature.support', value: { kind: 'support', value: supported ? 'supported' : 'unsupported' },
      }, { model, when: supported ? none : { kind: 'not', predicate: none },
        decisionKey: 'fact:sampling.temperature.support', dependencies: ['request.reasoning'], priority: 1 })
      add(scope, `${model}.temperature-validation`, 'sampling', { kind: 'validation', predicate: none,
        code: 'GENERATION_V2_RULE_TEMPERATURE_REQUIRES_NONE' }, { model,
        when: { kind: 'exists', path: 'requested.generation.temperature' }, dependencies: ['request.reasoning'] })
    }
  }
  const policy = decodeCapabilityRuleCorePackV2({ schemaVersion: 2, packId: 'reviewed-request-policy-v2',
    displayName: 'Reviewed request policies V2', description: 'Explicit import; no automatic installation or cloud publication.',
    priority: 0, mode: 'no_control', target: 'enabled', rules })
  return [...facts, policy].map(pack => createUserRulePackTransferV2({ pack }))
}
