import {
  canonicalSourceFactDigestV1,
  canonicalizeCanonicalFactValueV1,
  type CanonicalFactValueV1,
  type CanonicalSemanticPathV1,
} from '../model-facts/canonicalSourceFactsV1'
import {
  CAPABILITY_RULE_PRIORITY_MAX_V1,
  CAPABILITY_RULE_PRIORITY_MIN_V1,
  CapabilityRuleCoreV1Error,
  decodeCapabilityRuleEvidenceV1,
  decodeCapabilityRuleCoreRuleV1,
  decodeCapabilityRuleOwnershipSnapshotV1,
  decodeCapabilityRuleSelectorV1,
  type CapabilityRuleConfiguredStateV1,
  type CapabilityRuleDefaultActivationPolicyV1,
  type CapabilityRuleEvidenceV1,
  type CapabilityRulePackModeV1,
  type CapabilityRulePackTargetV1,
  type CapabilityRuleSelectorV1,
} from './capabilityRuleCoreV1'
import { decodeRequestedParametersPolicyV2, type RequestedParametersPolicyV2 } from './operations/requestedParametersV2'

export const CAPABILITY_RULE_CORE_SCHEMA_DIGEST_V2 = canonicalSourceFactDigestV1({
  schemaVersion: 2,
  ownership: ['cloud', 'user'],
  configured: ['default', 'on', 'off'],
  packMode: ['override', 'default_only', 'no_control'],
  packTarget: ['enabled', 'disabled'],
  priority: { min: CAPABILITY_RULE_PRIORITY_MIN_V1, max: CAPABILITY_RULE_PRIORITY_MAX_V1 },
  selector: ['exact', 'regex'],
  categories: ['reasoning', 'sampling', 'context_quotas', 'input', 'tools',
    'search_citations', 'image_generation', 'output', 'operations'],
  predicate: 'closed-request-context-v2',
  effect: 'typed-closed-v2',
  decisionGraph: 'decision-key-dependencies-v2',
})

export type CapabilityRuleCategoryV2 =
  | 'reasoning'
  | 'sampling'
  | 'context_quotas'
  | 'input'
  | 'tools'
  | 'search_citations'
  | 'image_generation'
  | 'output'
  | 'operations'

/** Explicitly classifies every canonical fact path. Keep this exhaustive when the fact ontology grows. */
export const CAPABILITY_RULE_CATEGORY_BY_CANONICAL_PATH_V2 = Object.freeze({
  'limits.contextWindow.maxTokens': 'context_quotas',
  'limits.input.maxTokens': 'context_quotas',
  'limits.output.maxTokens': 'context_quotas',
  'limits.output.providerDefaultTokens': 'context_quotas',
  'modalities.input': 'input',
  'modalities.output': 'output',
  'input.attachments.support': 'input',
  'operations.supported': 'operations',
  'reasoning.support': 'reasoning',
  'reasoning.required': 'reasoning',
  'reasoning.toggle.support': 'reasoning',
  'reasoning.modes.nativeValues': 'reasoning',
  'reasoning.effort.nativeValues': 'reasoning',
  'reasoning.effort.providerDefault': 'reasoning',
  'reasoning.budgetTokens.support': 'reasoning',
  'reasoning.budgetTokens.domain': 'reasoning',
  'anthropic.messages.thinking.acceptedTypes': 'reasoning',
  'anthropic.messages.thinking.omittedBehavior': 'reasoning',
  'anthropic.messages.thinking.recommendedMode': 'reasoning',
  'anthropic.messages.thinking.manualBudgetDomain': 'reasoning',
  'anthropic.messages.thinking.disabledAllowedEfforts': 'reasoning',
  'anthropic.messages.thinking.required': 'reasoning',
  'anthropic.messages.thinking.defaultDisplay': 'reasoning',
  'gemini.generateContent.text.thinkingBudget.domain': 'reasoning',
  'gemini.generateContent.text.thinkingBudget.providerDefault': 'reasoning',
  'gemini.generateContent.text.thinkingLevel.nativeValues': 'reasoning',
  'gemini.generateContent.text.thinkingLevel.providerDefault': 'reasoning',
  'gemini.generateContent.text.thinking.required': 'reasoning',
  'gemini.generateContent.text.thinking.defaultEnabled': 'reasoning',
  'gemini.generateContent.text.thinking.includeThoughts.support': 'reasoning',
  'gemini.interactions.imageGenerate.thinkingLevel.nativeValues': 'reasoning',
  'gemini.interactions.imageGenerate.thinkingLevel.providerDefault': 'reasoning',
  'gemini.interactions.imageGenerate.thinking.required': 'reasoning',
  'gemini.interactions.imageGenerate.thinking.defaultEnabled': 'reasoning',
  'gemini.interactions.imageGenerate.thinking.summaries.support': 'reasoning',
  'generation.effort.nativeValues': 'reasoning',
  'generation.effort.providerDefault': 'reasoning',
  'sampling.temperature.support': 'sampling',
  'sampling.temperature.providerDefault': 'sampling',
  'sampling.temperature.modelMaximum': 'sampling',
  'sampling.topP.providerDefault': 'sampling',
  'sampling.topK.support': 'sampling',
  'sampling.topK.providerDefault': 'sampling',
  'tools.calling.support': 'tools',
  'tools.trainingForToolUse': 'tools',
  'tools.codeExecution.support': 'tools',
  'structuredOutput.support': 'output',
  'image.generation.support': 'image_generation',
  'image.generation.aspectRatios': 'image_generation',
  'image.generation.resolutionPresets.nativeValues': 'image_generation',
  'image.generation.resolutionPreset.providerDefault': 'image_generation',
  'search.web.support': 'search_citations',
  'search.image.support': 'search_citations',
  'documents.citations.support': 'search_citations',
  'contextManagement.support': 'context_quotas',
  'contextManagement.actions.nativeValues': 'context_quotas',
} satisfies Readonly<Record<CanonicalSemanticPathV1, CapabilityRuleCategoryV2>>)

export type CapabilityRuleRequestContextPathV2 =
  | 'target.protocolContractId'
  | 'target.operation'
  | 'target.providerId'
  | 'requested.generation.temperature'
  | 'requested.generation.topP'
  | 'requested.generation.maxOutputTokens'
  | 'requested.image.aspectRatio'
  | 'requested.image.resolution'
  | 'requested.image.outputMode'
  | 'effective.image.mode'
  | 'effective.image.aspectRatio'
  | 'effective.image.resolution'
  | 'effective.image.outputMode'
  | 'effective.generation.temperature'
  | 'effective.generation.topP'
  | 'effective.generation.maxOutputTokens'
  | 'requested.reasoning.mode'
  | 'requested.reasoning.effort'
  | 'requested.reasoning.budgetTokens'
  | 'effective.reasoning.mode'
  | 'effective.reasoning.effort'
  | 'effective.reasoning.budgetTokens'
  | 'requested.providerExtension.manualThinkingBudgetTokens'
  | 'requested.providerExtension.thinkingMode'
  | 'requested.providerExtension.thinkingBudget'
  | 'requested.providerExtension.thinkingLevel'
  | 'effective.providerExtension.manualThinkingBudgetTokens'
  | 'effective.providerExtension.thinkingMode'
  | 'effective.providerExtension.thinkingBudget'
  | 'effective.providerExtension.thinkingLevel'

export type CapabilityRuleEffectiveWritableContextPathV2 =
  | 'effective.generation.temperature'
  | 'effective.generation.topP'
  | 'effective.generation.maxOutputTokens'
  | 'effective.reasoning.mode'
  | 'effective.reasoning.effort'
  | 'effective.reasoning.budgetTokens'
  | 'effective.providerExtension.manualThinkingBudgetTokens'
  | 'effective.providerExtension.thinkingMode'
  | 'effective.providerExtension.thinkingBudget'
  | 'effective.providerExtension.thinkingLevel'

export type CapabilityRuleScalarV2 = string | number | boolean | null

export type CapabilityRulePredicateV2 =
  | Readonly<{ kind: 'exists'; path: CapabilityRuleRequestContextPathV2 }>
  | Readonly<{ kind: 'eq'; path: CapabilityRuleRequestContextPathV2; value: CapabilityRuleScalarV2 }>
  | Readonly<{ kind: 'in'; path: CapabilityRuleRequestContextPathV2; values: readonly CapabilityRuleScalarV2[] }>
  | Readonly<{ kind: 'lt' | 'lte'; path: CapabilityRuleRequestContextPathV2;
      right: number | Readonly<{ path: CapabilityRuleRequestContextPathV2 }> }>
  | Readonly<{ kind: 'all' | 'any'; predicates: readonly CapabilityRulePredicateV2[] }>
  | Readonly<{ kind: 'not'; predicate: CapabilityRulePredicateV2 }>

export type CapabilityRuleRegisteredOperationV2 =
  | Readonly<{ operationId: 'requested_parameters'; parameters: RequestedParametersPolicyV2 }>
  | Readonly<{ operationId: 'parameter_default'; parameters: Readonly<{
      path: 'web.maxResults' | 'web.searchContextSize' | 'web.engine' | 'image.outputMode'
      value: number | string
      origin: 'application_fallback' | 'provider_default'
    }> }>
  | Readonly<{ operationId: 'image_aspect_ratio_to_size'; parameters: Readonly<{
      mappings: readonly Readonly<{ from: '1:1' | '3:4' | '4:3' | '16:9'; width: number; height: number }>[]
    }> }>
  | Readonly<{ operationId: 'reasoning_openai'; parameters: Readonly<{ samplingBehavior: 'preserve' }> }>
  | Readonly<{ operationId: 'reasoning_anthropic'; parameters: Readonly<{
      maxOutputFallback?: number
      manualBudgetFallback?: number
      budgetConflict: 'validate_only'
    }> }>
  | Readonly<{ operationId: 'reasoning_gemini'; parameters: Readonly<{
      protocol: 'generate_content' | 'interactions'
    }> }>
  | Readonly<{ operationId: 'parameter_support'; parameters: Readonly<{
      unsupported: 'preserve' | 'defer'
      phase?: 'controls' | 'values'
      providerExtensionKind?: 'none' | 'openai_responses' | 'anthropic_messages' | 'gemini_generate_content' |
        'gemini_interactions' | 'openrouter_chat'
      disabledControls?: readonly ('reasoning' | 'web' | 'image' | 'tools')[]
      defaultEffort?: string
      webTypes?: readonly ('web' | 'image')[]
    }> }>
  | Readonly<{ operationId: 'attachment_transport'; parameters: Readonly<Record<string, never>> }>
  | Readonly<{ operationId: 'tool_choice'; parameters: Readonly<{ thinkingRequiredAuto: boolean }> }>
  | Readonly<{ operationId: 'tool_definition_defaults'; parameters: Readonly<{ parameters: 'empty_object'; strict: boolean }> }>

export type CapabilityRuleEffectV2 =
  | Readonly<{ kind: 'fact_assertion'; path: CanonicalSemanticPathV1; value: CanonicalFactValueV1 }>
  | Readonly<{ kind: 'fact_default'; path: CanonicalSemanticPathV1; value: CanonicalFactValueV1 }>
  | Readonly<{ kind: 'enum_mapping'; path: CapabilityRuleEffectiveWritableContextPathV2;
      mappings: readonly Readonly<{ from: string; to: string }>[] }>
  | Readonly<{ kind: 'validation'; predicate: CapabilityRulePredicateV2; code: string }>
  | Readonly<{ kind: 'registered_operation' } & CapabilityRuleRegisteredOperationV2>

export type CapabilityRuleCoreRuleV2 = Readonly<{
  ruleId: string
  label: string | null
  description: string | null
  priority: number
  configured: CapabilityRuleConfiguredStateV1
  providerAuthorityId: string
  endpointProfileId: string
  selector: CapabilityRuleSelectorV1
  evidence: CapabilityRuleEvidenceV1 | null
  category: CapabilityRuleCategoryV2
  when: CapabilityRulePredicateV2 | null
  effect: CapabilityRuleEffectV2
  decisionKey: string
  dependencies: readonly string[]
}>

export type CapabilityRuleCorePackV2 = Readonly<{
  schemaVersion: 2
  packId: string
  displayName: string
  description: string | null
  priority: number
  mode: CapabilityRulePackModeV1
  target: CapabilityRulePackTargetV1
  rules: readonly CapabilityRuleCoreRuleV2[]
}>

export type CapabilityRuleOwnershipSnapshotV2 = Readonly<{
  schemaVersion: 2
  ownership: 'cloud' | 'user'
  ownerId: string
  packs: readonly CapabilityRuleCorePackV2[]
}>

export type ProjectedCapabilityRuleCoreRuleV2 = Readonly<{
  definition: CapabilityRuleCoreRuleV2
  contentDigest: string
  ruleRevision: string
}>

export type ProjectedCapabilityRuleCorePackV2 = Readonly<{
  definition: CapabilityRuleCorePackV2
  contentDigest: string
  packRevision: string
  rules: readonly ProjectedCapabilityRuleCoreRuleV2[]
}>

export type ProjectedCapabilityRuleOwnershipSnapshotV2 = Readonly<{
  definition: CapabilityRuleOwnershipSnapshotV2
  contentDigest: string
  snapshotRevision: string
  packs: readonly ProjectedCapabilityRuleCorePackV2[]
}>

export class CapabilityRuleCoreV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_CAPABILITY_RULE_CORE_INVALID') {
    super(code)
    this.name = 'CapabilityRuleCoreV2Error'
  }
}

const CONTEXT_PATHS = new Set<string>([
  'target.protocolContractId', 'target.operation', 'target.providerId',
  'requested.generation.temperature', 'requested.generation.topP', 'requested.generation.maxOutputTokens',
  'requested.image.aspectRatio', 'requested.image.resolution', 'requested.image.outputMode',
  'effective.image.mode', 'effective.image.aspectRatio', 'effective.image.resolution', 'effective.image.outputMode',
  'effective.generation.temperature', 'effective.generation.topP', 'effective.generation.maxOutputTokens',
  'requested.reasoning.mode', 'requested.reasoning.effort', 'requested.reasoning.budgetTokens',
  'effective.reasoning.mode', 'effective.reasoning.effort', 'effective.reasoning.budgetTokens',
  'requested.providerExtension.manualThinkingBudgetTokens', 'requested.providerExtension.thinkingMode',
  'requested.providerExtension.thinkingBudget', 'requested.providerExtension.thinkingLevel',
  'effective.providerExtension.manualThinkingBudgetTokens', 'effective.providerExtension.thinkingMode',
  'effective.providerExtension.thinkingBudget', 'effective.providerExtension.thinkingLevel',
])
const WRITABLE_CONTEXT_PATHS = new Set<string>([
  'effective.generation.temperature', 'effective.generation.topP', 'effective.generation.maxOutputTokens',
  'effective.reasoning.mode', 'effective.reasoning.effort', 'effective.reasoning.budgetTokens',
  'effective.providerExtension.manualThinkingBudgetTokens', 'effective.providerExtension.thinkingMode',
  'effective.providerExtension.thinkingBudget', 'effective.providerExtension.thinkingLevel',
])

function invalid(): never {
  throw new CapabilityRuleCoreV2Error('GENERATION_V2_CAPABILITY_RULE_CORE_INVALID')
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null))
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  const actual = Object.keys(value).sort()
  const expected = [...allowed].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) invalid()
}

function identifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u.test(value)) invalid()
  return value
}

function identityValue(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 512 || value.trim() !== value ||
      /[\u0000-\u001f\u007f]/u.test(value)) invalid()
  return value
}

function boundedText(value: unknown, maxLength: number, nullable = false): string | null {
  if (nullable && value === null) return null
  if (typeof value !== 'string' || value.length < 1 || value.length > maxLength || value.trim() !== value ||
      /[\u0000-\u001f\u007f]/u.test(value)) invalid()
  return value
}

function priority(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < CAPABILITY_RULE_PRIORITY_MIN_V1 ||
      (value as number) > CAPABILITY_RULE_PRIORITY_MAX_V1) invalid()
  return value as number
}

function scalar(value: unknown): CapabilityRuleScalarV2 {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return invalid()
}

function contextPath(value: unknown): CapabilityRuleRequestContextPathV2 {
  if (typeof value !== 'string' || !CONTEXT_PATHS.has(value)) invalid()
  return value as CapabilityRuleRequestContextPathV2
}

function decodePredicate(value: unknown, depth = 0, budget = { count: 0 }): CapabilityRulePredicateV2 {
  if (!plainObject(value) || depth > 16 || ++budget.count > 256 || typeof value.kind !== 'string') invalid()
  if (value.kind === 'exists') {
    exactKeys(value, ['kind', 'path'])
    return Object.freeze({ kind: 'exists', path: contextPath(value.path) })
  }
  if (value.kind === 'eq') {
    exactKeys(value, ['kind', 'path', 'value'])
    return Object.freeze({ kind: 'eq', path: contextPath(value.path), value: scalar(value.value) })
  }
  if (value.kind === 'in') {
    exactKeys(value, ['kind', 'path', 'values'])
    if (!Array.isArray(value.values) || value.values.length < 1 || value.values.length > 64) invalid()
    const values = value.values.map(scalar)
    if (new Set(values.map(item => `${typeof item}:${String(item)}`)).size !== values.length) invalid()
    return Object.freeze({ kind: 'in', path: contextPath(value.path), values: Object.freeze(values) })
  }
  if (value.kind === 'lt' || value.kind === 'lte') {
    exactKeys(value, ['kind', 'path', 'right'])
    const right = typeof value.right === 'number' && Number.isFinite(value.right)
      ? value.right
      : plainObject(value.right) ? Object.freeze((() => {
          exactKeys(value.right as Record<string, unknown>, ['path'])
          return { path: contextPath((value.right as Record<string, unknown>).path) }
        })())
      : invalid()
    return Object.freeze({ kind: value.kind, path: contextPath(value.path), right })
  }
  if (value.kind === 'all' || value.kind === 'any') {
    exactKeys(value, ['kind', 'predicates'])
    if (!Array.isArray(value.predicates) || value.predicates.length < 1 || value.predicates.length > 64) invalid()
    return Object.freeze({ kind: value.kind,
      predicates: Object.freeze(value.predicates.map(child => decodePredicate(child, depth + 1, budget))) })
  }
  if (value.kind === 'not') {
    exactKeys(value, ['kind', 'predicate'])
    return Object.freeze({ kind: 'not', predicate: decodePredicate(value.predicate, depth + 1, budget) })
  }
  return invalid()
}

function decodeEffect(value: unknown): CapabilityRuleEffectV2 {
  if (!plainObject(value) || typeof value.kind !== 'string') invalid()
  if (value.kind === 'fact_assertion' || value.kind === 'fact_default') {
    exactKeys(value, ['kind', 'path', 'value'])
    const path = value.path
    if (typeof path !== 'string') invalid()
    const canonicalPath = path as CanonicalSemanticPathV1
    const canonicalValue = canonicalizeCanonicalFactValueV1(canonicalPath, value.value)
    return value.kind === 'fact_assertion'
      ? Object.freeze({ kind: 'fact_assertion', path: canonicalPath, value: canonicalValue })
      : Object.freeze({ kind: 'fact_default', path: canonicalPath, value: canonicalValue })
  }
  if (value.kind === 'enum_mapping') {
    exactKeys(value, ['kind', 'path', 'mappings'])
    if (typeof value.path !== 'string' || !WRITABLE_CONTEXT_PATHS.has(value.path) ||
        !Array.isArray(value.mappings) || value.mappings.length < 1 || value.mappings.length > 128) invalid()
    const mappings = value.mappings.map((entry): Readonly<{ from: string; to: string }> => {
      if (!plainObject(entry)) invalid()
      exactKeys(entry, ['from', 'to'])
      return Object.freeze({ from: boundedText(entry.from, 128)!, to: boundedText(entry.to, 128)! })
    })
    if (new Set(mappings.map(entry => entry.from)).size !== mappings.length) invalid()
    return Object.freeze({ kind: 'enum_mapping', path: value.path as CapabilityRuleEffectiveWritableContextPathV2,
      mappings: Object.freeze(mappings) })
  }
  if (value.kind === 'validation') {
    exactKeys(value, ['kind', 'predicate', 'code'])
    if (typeof value.code !== 'string' || !/^[A-Z][A-Z0-9_]{0,127}$/u.test(value.code)) invalid()
    return Object.freeze({ kind: 'validation', predicate: decodePredicate(value.predicate), code: value.code })
  }
  if (value.kind === 'registered_operation') {
    exactKeys(value, ['kind', 'operationId', 'parameters'])
    if (!plainObject(value.parameters)) invalid()
    const parameters = value.parameters
    switch (value.operationId) {
      case 'requested_parameters':
        return Object.freeze({ kind: 'registered_operation', operationId: value.operationId,
          parameters: decodeRequestedParametersPolicyV2(parameters) })
      case 'parameter_default': {
        exactKeys(parameters, ['path', 'value', 'origin'])
        if (parameters.origin !== 'application_fallback' && parameters.origin !== 'provider_default') invalid()
        if (parameters.path === 'web.maxResults') {
          if (!Number.isSafeInteger(parameters.value) || (parameters.value as number) < 1) invalid()
        } else if (parameters.path === 'web.searchContextSize') {
          if (!['low', 'medium', 'high'].includes(parameters.value as string)) invalid()
        } else if (parameters.path === 'web.engine') {
          if (!['auto', 'native', 'exa'].includes(parameters.value as string)) invalid()
        } else if (parameters.path === 'image.outputMode') {
          if (!['image_only', 'image_and_text'].includes(parameters.value as string)) invalid()
        } else invalid()
        return Object.freeze({ kind: 'registered_operation', operationId: 'parameter_default', parameters: Object.freeze({
          path: parameters.path as 'web.maxResults' | 'web.searchContextSize' | 'web.engine' | 'image.outputMode', value: parameters.value as number | string,
          origin: parameters.origin as 'application_fallback' | 'provider_default' }) })
      }
      case 'reasoning_openai':
        exactKeys(parameters, ['samplingBehavior'])
        if (parameters.samplingBehavior !== 'preserve') invalid()
        return Object.freeze({ kind: 'registered_operation', operationId: value.operationId,
          parameters: Object.freeze({ samplingBehavior: 'preserve' }) })
      case 'reasoning_anthropic': {
        const allowed = ['maxOutputFallback', 'manualBudgetFallback', 'budgetConflict']
        if (Object.keys(parameters).some(key => !allowed.includes(key)) ||
            !Object.prototype.hasOwnProperty.call(parameters, 'budgetConflict') ||
            parameters.budgetConflict !== 'validate_only') invalid()
        const maxOutputFallback = parameters.maxOutputFallback
        const manualBudgetFallback = parameters.manualBudgetFallback
        if (maxOutputFallback !== undefined && (!Number.isSafeInteger(maxOutputFallback) || (maxOutputFallback as number) < 1) ||
            manualBudgetFallback !== undefined && (!Number.isSafeInteger(manualBudgetFallback) || (manualBudgetFallback as number) < 1)) invalid()
        return Object.freeze({ kind: 'registered_operation', operationId: value.operationId,
          parameters: Object.freeze({ ...(maxOutputFallback === undefined ? {} : { maxOutputFallback: maxOutputFallback as number }),
            ...(manualBudgetFallback === undefined ? {} : { manualBudgetFallback: manualBudgetFallback as number }),
            budgetConflict: 'validate_only' as const }) })
      }
      case 'reasoning_gemini':
        exactKeys(parameters, ['protocol'])
        if (parameters.protocol !== 'generate_content' && parameters.protocol !== 'interactions') invalid()
        return Object.freeze({ kind: 'registered_operation', operationId: value.operationId,
          parameters: Object.freeze({ protocol: parameters.protocol }) })
      case 'parameter_support':
        {
        const allowed = ['unsupported', 'phase', 'providerExtensionKind', 'disabledControls', 'defaultEffort', 'webTypes']
        if (Object.keys(parameters).some(key => !allowed.includes(key)) ||
            !Object.prototype.hasOwnProperty.call(parameters, 'unsupported')) invalid()
        if (parameters.unsupported !== 'preserve' && parameters.unsupported !== 'defer') invalid()
        if (parameters.phase !== undefined && parameters.phase !== 'controls' && parameters.phase !== 'values') invalid()
        const extensionKindValues = ['none', 'openai_responses', 'anthropic_messages',
          'gemini_generate_content', 'gemini_interactions', 'openrouter_chat'] as const
        const extensionKind = parameters.providerExtensionKind
        if (extensionKind !== undefined && (typeof extensionKind !== 'string' ||
            !extensionKindValues.includes(extensionKind as typeof extensionKindValues[number]))) invalid()
        const disabledControls = parameters.disabledControls
        const allowedControls = ['reasoning', 'web', 'image', 'tools'] as const
        if (disabledControls !== undefined && (!Array.isArray(disabledControls) ||
            disabledControls.some(value => !allowedControls.includes(value as typeof allowedControls[number])) ||
            new Set(disabledControls).size !== disabledControls.length)) invalid()
        const defaultEffort = parameters.defaultEffort
        if (defaultEffort !== undefined) boundedText(defaultEffort, 128)
        const webTypes = parameters.webTypes
        const allowedWebTypes = ['web', 'image'] as const
        if (webTypes !== undefined && (!Array.isArray(webTypes) ||
            webTypes.some(value => !allowedWebTypes.includes(value as typeof allowedWebTypes[number])) ||
            new Set(webTypes).size !== webTypes.length)) invalid()
        return Object.freeze({ kind: 'registered_operation', operationId: value.operationId,
          parameters: Object.freeze({ unsupported: parameters.unsupported,
            ...(parameters.phase === undefined ? {} : { phase: parameters.phase as 'controls' | 'values' }),
            ...(extensionKind === undefined ? {} : { providerExtensionKind: extensionKind as typeof extensionKindValues[number] }),
            ...(disabledControls === undefined ? {} : { disabledControls: Object.freeze([...disabledControls] as
              ('reasoning' | 'web' | 'image' | 'tools')[]) }),
            ...(defaultEffort === undefined ? {} : { defaultEffort: defaultEffort as string }),
            ...(webTypes === undefined ? {} : { webTypes: Object.freeze([...webTypes] as ('web' | 'image')[]) }),
          }) })
        }
      case 'image_aspect_ratio_to_size': {
        exactKeys(parameters, ['mappings'])
        if (!Array.isArray(parameters.mappings) || parameters.mappings.length < 1 || parameters.mappings.length > 4) invalid()
        const mappings = parameters.mappings.map(entry => {
          if (!plainObject(entry)) invalid()
          exactKeys(entry, ['from', 'width', 'height'])
          const from = entry.from
          const width = entry.width
          const height = entry.height
          if (!['1:1', '3:4', '4:3', '16:9'].includes(from as string) ||
              !Number.isSafeInteger(width) || (width as number) < 1 ||
              !Number.isSafeInteger(height) || (height as number) < 1) invalid()
          return Object.freeze({ from: from as '1:1' | '3:4' | '4:3' | '16:9',
            width: width as number, height: height as number })
        })
        if (new Set(mappings.map(entry => entry.from)).size !== mappings.length) invalid()
        return Object.freeze({ kind: 'registered_operation', operationId: value.operationId,
          parameters: Object.freeze({ mappings: Object.freeze(mappings) }) })
      }
      case 'attachment_transport':
        exactKeys(parameters, [])
        return Object.freeze({ kind: 'registered_operation', operationId: value.operationId,
          parameters: Object.freeze({}) })
      case 'tool_choice':
        exactKeys(parameters, ['thinkingRequiredAuto'])
        if (typeof parameters.thinkingRequiredAuto !== 'boolean') invalid()
        return Object.freeze({ kind: 'registered_operation', operationId: value.operationId,
          parameters: Object.freeze({ thinkingRequiredAuto: parameters.thinkingRequiredAuto }) })
      case 'tool_definition_defaults':
        exactKeys(parameters, ['parameters', 'strict'])
        if (parameters.parameters !== 'empty_object' || typeof parameters.strict !== 'boolean') invalid()
        return Object.freeze({ kind: 'registered_operation', operationId: value.operationId,
          parameters: Object.freeze({ parameters: 'empty_object', strict: parameters.strict }) })
      default:
        return invalid()
    }
  }
  return invalid()
}

function decodeRule(value: unknown): CapabilityRuleCoreRuleV2 {
  if (!plainObject(value)) invalid()
  exactKeys(value, ['ruleId', 'label', 'description', 'priority', 'configured', 'providerAuthorityId',
    'endpointProfileId', 'selector', 'evidence', 'category', 'when', 'effect', 'decisionKey', 'dependencies'])
  if (value.configured !== 'default' && value.configured !== 'on' && value.configured !== 'off') invalid()
  const categoryValues = new Set<string>([
    'reasoning', 'sampling', 'context_quotas', 'input', 'tools', 'search_citations', 'image_generation', 'output', 'operations',
  ])
  if (typeof value.category !== 'string' || !categoryValues.has(value.category)) invalid()
  if (!Array.isArray(value.dependencies) || value.dependencies.length > 256) invalid()
  const dependencies = value.dependencies.map(identifier).sort()
  if (new Set(dependencies).size !== dependencies.length) invalid()
  const effect = decodeEffect(value.effect)
  const category = value.category as CapabilityRuleCategoryV2
  if ((effect.kind === 'fact_assertion' || effect.kind === 'fact_default') &&
      category !== CAPABILITY_RULE_CATEGORY_BY_CANONICAL_PATH_V2[effect.path]) invalid()
  return Object.freeze({
    ruleId: identifier(value.ruleId),
    label: boundedText(value.label, 256, true),
    description: boundedText(value.description, 4096, true),
    priority: priority(value.priority),
    configured: value.configured as CapabilityRuleConfiguredStateV1,
    providerAuthorityId: identifier(value.providerAuthorityId),
    endpointProfileId: identityValue(value.endpointProfileId),
    selector: decodeCapabilityRuleSelectorV1(value.selector),
    evidence: decodeCapabilityRuleEvidenceV1(value.evidence),
    category,
    when: value.when === null ? null : decodePredicate(value.when),
    effect,
    decisionKey: identifier(value.decisionKey),
    dependencies: Object.freeze(dependencies),
  })
}

export function decodeCapabilityRuleCoreRuleV2(value: unknown): CapabilityRuleCoreRuleV2 {
  try {
    return decodeRule(value)
  } catch (error) {
    if (error instanceof CapabilityRuleCoreV2Error) throw error
    if (error instanceof CapabilityRuleCoreV1Error) return invalid()
    return invalid()
  }
}

function codePointCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export function decodeCapabilityRuleCorePackV2(value: unknown): CapabilityRuleCorePackV2 {
  if (!plainObject(value)) invalid()
  exactKeys(value, ['schemaVersion', 'packId', 'displayName', 'description', 'priority', 'mode', 'target', 'rules'])
  if (value.schemaVersion !== 2 ||
      (value.mode !== 'override' && value.mode !== 'default_only' && value.mode !== 'no_control') ||
      (value.target !== 'enabled' && value.target !== 'disabled') || !Array.isArray(value.rules) ||
      value.rules.length > 100_000) invalid()
  const rules = value.rules.map(decodeCapabilityRuleCoreRuleV2)
    .sort((left, right) => codePointCompare(left.ruleId, right.ruleId))
  if (new Set(rules.map(rule => rule.ruleId)).size !== rules.length) invalid()
  return Object.freeze({ schemaVersion: 2 as const, packId: identifier(value.packId),
    displayName: boundedText(value.displayName, 256)!, description: boundedText(value.description, 4096, true),
    priority: priority(value.priority), mode: value.mode as CapabilityRulePackModeV1,
    target: value.target as CapabilityRulePackTargetV1, rules: Object.freeze(rules) })
}

export function decodeCapabilityRuleOwnershipSnapshotV2(value: unknown): CapabilityRuleOwnershipSnapshotV2 {
  if (!plainObject(value)) invalid()
  exactKeys(value, ['schemaVersion', 'ownership', 'ownerId', 'packs'])
  if (value.schemaVersion !== 2 || (value.ownership !== 'cloud' && value.ownership !== 'user') ||
      !Array.isArray(value.packs) || value.packs.length > 10_000) invalid()
  const packs = value.packs.map(decodeCapabilityRuleCorePackV2)
    .sort((left, right) => codePointCompare(left.packId, right.packId))
  if (new Set(packs.map(pack => pack.packId)).size !== packs.length) invalid()
  const ruleIds = packs.flatMap(pack => pack.rules.map(rule => rule.ruleId))
  if (new Set(ruleIds).size !== ruleIds.length) invalid()
  const rules = packs.flatMap(pack => pack.rules)
  const decisionKeys = new Set(rules.map(rule => rule.decisionKey))
  const dependenciesByDecision = new Map<string, Set<string>>()
  for (const rule of rules) {
    const dependencies = dependenciesByDecision.get(rule.decisionKey) ?? new Set<string>()
    for (const dependency of rule.dependencies) {
      if (!decisionKeys.has(dependency)) invalid()
      dependencies.add(dependency)
    }
    dependenciesByDecision.set(rule.decisionKey, dependencies)
  }
  const visitState = new Map<string, 'visiting' | 'visited'>()
  const visit = (decisionKey: string): void => {
    const state = visitState.get(decisionKey)
    if (state === 'visiting') invalid()
    if (state === 'visited') return
    visitState.set(decisionKey, 'visiting')
    for (const dependency of dependenciesByDecision.get(decisionKey) ?? []) visit(dependency)
    visitState.set(decisionKey, 'visited')
  }
  for (const decisionKey of decisionKeys) visit(decisionKey)
  return Object.freeze({ schemaVersion: 2 as const, ownership: value.ownership,
    ownerId: identifier(value.ownerId), packs: Object.freeze(packs) })
}

export function projectCapabilityRuleCorePackV2(value: unknown): ProjectedCapabilityRuleCorePackV2 {
  const definition = decodeCapabilityRuleCorePackV2(value)
  const rules = Object.freeze(definition.rules.map(rule => {
    const contentDigest = canonicalSourceFactDigestV1({ packId: definition.packId, ...rule })
    return Object.freeze({ definition: rule, contentDigest,
      ruleRevision: `capability-rule-core-v2:${contentDigest}` })
  }))
  const contentDigest = canonicalSourceFactDigestV1({ ...definition,
    rules: rules.map(rule => ({ ruleId: rule.definition.ruleId, ruleRevision: rule.ruleRevision })) })
  return Object.freeze({ definition, contentDigest,
    packRevision: `capability-rule-pack-core-v2:${contentDigest}`, rules })
}

export function projectCapabilityRuleOwnershipSnapshotV2(value: unknown): ProjectedCapabilityRuleOwnershipSnapshotV2 {
  const definition = decodeCapabilityRuleOwnershipSnapshotV2(value)
  const packs = Object.freeze(definition.packs.map(projectCapabilityRuleCorePackV2))
  const contentDigest = canonicalSourceFactDigestV1({ schemaVersion: 2 as const,
    ownership: definition.ownership, ownerId: definition.ownerId,
    packs: packs.map(pack => ({ packId: pack.definition.packId, packRevision: pack.packRevision })) })
  return Object.freeze({ definition, contentDigest,
    snapshotRevision: `capability-rule-owner-snapshot-v2:${contentDigest}`, packs })
}

export function projectUnconditionalCapabilityRuleFactsV2(
  snapshot: CapabilityRuleOwnershipSnapshotV2,
): readonly Readonly<{ rule: CapabilityRuleCoreRuleV2; path: CanonicalSemanticPathV1; value: CanonicalFactValueV1; effect: 'fact_assertion' | 'fact_default' }>[] {
  const decoded = decodeCapabilityRuleOwnershipSnapshotV2(snapshot)
  return Object.freeze(decoded.packs.flatMap(pack => pack.rules.flatMap(rule =>
    rule.when === null && (rule.effect.kind === 'fact_assertion' || rule.effect.kind === 'fact_default')
      ? [Object.freeze({ rule, path: rule.effect.path, value: rule.effect.value, effect: rule.effect.kind })]
      : [])))
}

export type CapabilityRuleEffectiveActivationInputV2 = Readonly<{
  mode: CapabilityRulePackModeV1
  target: CapabilityRulePackTargetV1
  configured: CapabilityRuleConfiguredStateV1
  defaultPolicy: CapabilityRuleDefaultActivationPolicyV1
}>

/** One canonical conversion for legacy imports and existing fact-authoring controls. */
export function migrateCapabilityRuleCoreRuleV1ToV2(value: unknown): CapabilityRuleCoreRuleV2 {
  const rule = decodeCapabilityRuleCoreRuleV1(value)
  return decodeCapabilityRuleCoreRuleV2({
    ruleId: rule.ruleId, label: rule.label, description: rule.description,
    priority: rule.priority, configured: rule.configured,
    providerAuthorityId: rule.providerAuthorityId, endpointProfileId: rule.endpointProfileId,
    selector: rule.selector, evidence: rule.evidence,
    category: CAPABILITY_RULE_CATEGORY_BY_CANONICAL_PATH_V2[rule.assertion.path], when: null,
    effect: { kind: 'fact_assertion', ...rule.assertion }, decisionKey: `fact:${rule.assertion.path}`, dependencies: [],
  })
}

/** Explicitly migrates legacy V1 facts while retaining owner, identifiers, priorities and evidence. */
export function migrateCapabilityRuleOwnershipSnapshotV1ToV2(
  value: unknown,
): CapabilityRuleOwnershipSnapshotV2 {
  const legacy = decodeCapabilityRuleOwnershipSnapshotV1(value)
  const packs = legacy.packs.map(pack => ({
    schemaVersion: 2 as const,
    packId: pack.packId,
    displayName: pack.displayName,
    description: pack.description,
    priority: pack.priority,
    mode: pack.mode,
    target: pack.target,
    rules: pack.rules.map(migrateCapabilityRuleCoreRuleV1ToV2),
  }))
  return decodeCapabilityRuleOwnershipSnapshotV2({ schemaVersion: 2,
    ownership: legacy.ownership, ownerId: legacy.ownerId, packs })
}
