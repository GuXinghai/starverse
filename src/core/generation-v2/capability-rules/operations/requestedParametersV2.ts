import {
  REQUESTED_PARAMETER_KEYS_V2,
  decodeGenerationIntentLayerV2,
  type GenerationIntentLayerV2,
  type ProviderSemanticExtensionV2,
  type RequestedParameterKeyV2,
  type RequestedParameterSourceV2,
} from '../../domain/generationIntentV2'
import { projectGenerationIntentLayerV2 } from '../../domain/generationIntentProjectionV2'
import type { RequestAdaptationV2 } from '../../compiler/requestAdaptationV2'

export type RequestedParameterPolicyKeyV2 = RequestedParameterKeyV2 | 'web.searchPrompt'
export type RequestedParameterExtensionKindV2 = ProviderSemanticExtensionV2['kind']

export type RequestedParameterPolicyRuleV2 =
  | Readonly<{ kind: 'defer'; reason: string }>
  | Readonly<{ kind: 'generation_field'; field: Exclude<keyof NonNullable<GenerationIntentLayerV2['generation']>, 'candidateCount'> }>
  | Readonly<{ kind: 'reasoning_effort' }>
  | Readonly<{ kind: 'reasoning_summary' }>
  | Readonly<{ kind: 'thinking_enabled' }>
  | Readonly<{ kind: 'provider_verbosity'; extensionKind: 'openai_responses' | 'openrouter_chat' }>
  | Readonly<{ kind: 'anthropic_manual_budget'; extensionKind: 'anthropic_messages' }>
  | Readonly<{ kind: 'gemini_thinking_budget'; extensionKind: 'gemini_generate_content' }>
  | Readonly<{ kind: 'gemini_thinking_level'; extensionKind: 'gemini_generate_content' | 'gemini_interactions' }>
  | Readonly<{ kind: 'gemini_include_thoughts'; extensionKind: 'gemini_generate_content' }>
  | Readonly<{ kind: 'gemini_thought_summary_mode'; extensionKind: 'gemini_generate_content' }>
  | Readonly<{ kind: 'web_type_when_true'; type: 'web' | 'image' }>

export type RequestedParametersPolicyV2 = Readonly<{
  schemaVersion: 1
  extensionKind: RequestedParameterExtensionKindV2
  parameters: Readonly<Record<RequestedParameterPolicyKeyV2, RequestedParameterPolicyRuleV2>>
}>

export class RequestedParametersPolicyV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_REQUESTED_PARAMETERS_POLICY_INVALID') {
    super(code)
    this.name = 'RequestedParametersPolicyV2Error'
  }
}

const POLICY_KEYS_V2: readonly RequestedParameterPolicyKeyV2[] = Object.freeze([
  ...REQUESTED_PARAMETER_KEYS_V2, 'web.searchPrompt',
])
const EXTENSION_KINDS_V2: readonly RequestedParameterExtensionKindV2[] = Object.freeze([
  'none', 'openrouter_chat', 'openai_responses', 'anthropic_messages', 'gemini_generate_content', 'gemini_interactions',
])
const GENERATION_FIELDS_V2 = Object.freeze([
  'maxOutputTokens', 'temperature', 'topP', 'topK', 'minP', 'topA', 'seed', 'stop',
  'frequencyPenalty', 'presencePenalty', 'repetitionPenalty',
] as const)

type ClosedRecord = Record<string, unknown>

function invalidPolicy(): never {
  throw new RequestedParametersPolicyV2Error('GENERATION_V2_REQUESTED_PARAMETERS_POLICY_INVALID')
}

function closedObject(value: unknown, allowed: readonly string[]): ClosedRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) invalidPolicy()
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(value).some(key => typeof key !== 'string') ||
      Object.values(descriptors).some(descriptor => !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined) ||
      Object.keys(descriptors).some(key => !allowed.includes(key))) invalidPolicy()
  return Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value]))
}

function boundedReason(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256 || /[\u0000-\u001f\u007f]/u.test(value)) invalidPolicy()
  return value
}

function decodeRule(value: unknown): RequestedParameterPolicyRuleV2 {
  const discriminator = closedObject(value, ['kind', 'reason', 'field', 'extensionKind', 'type'])
  switch (discriminator.kind) {
    case 'defer':
      if (Object.keys(discriminator).length !== 2) invalidPolicy()
      return Object.freeze({ kind: 'defer', reason: boundedReason(discriminator.reason) })
    case 'generation_field':
      if (Object.keys(discriminator).length !== 2 || typeof discriminator.field !== 'string' ||
          !GENERATION_FIELDS_V2.includes(discriminator.field as typeof GENERATION_FIELDS_V2[number])) invalidPolicy()
      return Object.freeze({ kind: 'generation_field', field: discriminator.field as typeof GENERATION_FIELDS_V2[number] })
    case 'reasoning_effort':
    case 'reasoning_summary':
    case 'thinking_enabled':
      if (Object.keys(discriminator).length !== 1) invalidPolicy()
      return Object.freeze({ kind: discriminator.kind })
    case 'provider_verbosity':
      if (Object.keys(discriminator).length !== 2 || discriminator.extensionKind !== 'openai_responses' && discriminator.extensionKind !== 'openrouter_chat') invalidPolicy()
      return Object.freeze({ kind: 'provider_verbosity', extensionKind: discriminator.extensionKind })
    case 'anthropic_manual_budget':
      if (Object.keys(discriminator).length !== 2 || discriminator.extensionKind !== 'anthropic_messages') invalidPolicy()
      return Object.freeze({ kind: 'anthropic_manual_budget', extensionKind: 'anthropic_messages' })
    case 'gemini_thinking_budget':
      if (Object.keys(discriminator).length !== 2 || discriminator.extensionKind !== 'gemini_generate_content') invalidPolicy()
      return Object.freeze({ kind: 'gemini_thinking_budget', extensionKind: 'gemini_generate_content' })
    case 'gemini_thinking_level':
      if (Object.keys(discriminator).length !== 2 || discriminator.extensionKind !== 'gemini_generate_content' && discriminator.extensionKind !== 'gemini_interactions') invalidPolicy()
      return Object.freeze({ kind: 'gemini_thinking_level', extensionKind: discriminator.extensionKind })
    case 'gemini_include_thoughts':
      if (Object.keys(discriminator).length !== 2 || discriminator.extensionKind !== 'gemini_generate_content') invalidPolicy()
      return Object.freeze({ kind: 'gemini_include_thoughts', extensionKind: 'gemini_generate_content' })
    case 'gemini_thought_summary_mode':
      if (Object.keys(discriminator).length !== 2 || discriminator.extensionKind !== 'gemini_generate_content') invalidPolicy()
      return Object.freeze({ kind: 'gemini_thought_summary_mode', extensionKind: 'gemini_generate_content' })
    case 'web_type_when_true':
      if (Object.keys(discriminator).length !== 2 || discriminator.type !== 'web' && discriminator.type !== 'image') invalidPolicy()
      return Object.freeze({ kind: 'web_type_when_true', type: discriminator.type })
    default:
      return invalidPolicy()
  }
}

function policyTarget(rule: RequestedParameterPolicyRuleV2): string {
  if (rule.kind === 'defer') return ''
  if (rule.kind === 'generation_field') return `generation.${rule.field}`
  if (rule.kind === 'reasoning_effort') return 'reasoning.effort'
  if (rule.kind === 'reasoning_summary') return 'reasoning.summary'
  if (rule.kind === 'thinking_enabled') return 'reasoning.mode'
  if (rule.kind === 'provider_verbosity') return 'providerExtension.verbosity'
  if (rule.kind === 'anthropic_manual_budget' || rule.kind === 'gemini_thinking_budget' || rule.kind === 'gemini_thinking_level') return 'providerExtension.thinkingControl'
  if (rule.kind === 'gemini_include_thoughts' || rule.kind === 'gemini_thought_summary_mode') return 'providerExtension.includeThoughts'
  return `web.types.${rule.type}`
}

export function decodeRequestedParametersPolicyV2(value: unknown): RequestedParametersPolicyV2 {
  const input = closedObject(value, ['schemaVersion', 'extensionKind', 'parameters'])
  if (input.schemaVersion !== 1 || typeof input.extensionKind !== 'string' || !EXTENSION_KINDS_V2.includes(input.extensionKind as RequestedParameterExtensionKindV2)) invalidPolicy()
  const parameters = closedObject(input.parameters, POLICY_KEYS_V2)
  if (Object.keys(parameters).length !== POLICY_KEYS_V2.length || POLICY_KEYS_V2.some(key => !Object.hasOwn(parameters, key))) invalidPolicy()
  const decoded = Object.fromEntries(POLICY_KEYS_V2.map(key => [key, decodeRule(parameters[key])])) as Record<RequestedParameterPolicyKeyV2, RequestedParameterPolicyRuleV2>
  const targets = new Map<string, RequestedParameterPolicyKeyV2[]>()
  for (const key of POLICY_KEYS_V2) {
    const rule = decoded[key]
    if (rule.kind === 'web_type_when_true' || rule.kind === 'defer') continue
    const target = policyTarget(rule)
    targets.set(target, [...(targets.get(target) ?? []), key])
  }
  for (const [target, keys] of targets) {
    if (keys.length < 2) continue
    const keySet = new Set(keys)
    const thoughtSummaryPair = target === 'providerExtension.includeThoughts' && keySet.size === 2 &&
      keySet.has('includeThoughts') && keySet.has('thoughtSummaryMode') &&
      decoded.includeThoughts.kind === 'gemini_include_thoughts' && decoded.thoughtSummaryMode.kind === 'gemini_thought_summary_mode'
    const thinkingControlPair = target === 'providerExtension.thinkingControl' && keySet.size === 2 &&
      keySet.has('thinkingBudget') && keySet.has('thinkingLevel') &&
      (decoded.thinkingBudget.kind === 'anthropic_manual_budget' || decoded.thinkingBudget.kind === 'gemini_thinking_budget') &&
      decoded.thinkingLevel.kind === 'gemini_thinking_level'
    if (!thoughtSummaryPair && !thinkingControlPair) invalidPolicy()
  }
  for (const rule of Object.values(decoded)) {
    if (rule.kind !== 'defer' && 'extensionKind' in rule && rule.extensionKind !== input.extensionKind) invalidPolicy()
  }
  return Object.freeze({ schemaVersion: 1, extensionKind: input.extensionKind as RequestedParameterExtensionKindV2, parameters: Object.freeze(decoded) })
}

const deferred = (reason: string): RequestedParameterPolicyRuleV2 => Object.freeze({ kind: 'defer', reason })

/** Authoring helper for reviewed Rule packs. Runtime Rules must store the decoded policy explicitly. */
export function authorRequestedParametersPolicyV2(extensionKind: RequestedParameterExtensionKindV2): RequestedParametersPolicyV2 {
  const parameters: Record<RequestedParameterPolicyKeyV2, RequestedParameterPolicyRuleV2> = {
    temperature: { kind: 'generation_field', field: 'temperature' },
    topP: { kind: 'generation_field', field: 'topP' },
    topK: { kind: 'generation_field', field: 'topK' },
    minP: { kind: 'generation_field', field: 'minP' },
    topA: { kind: 'generation_field', field: 'topA' },
    frequencyPenalty: { kind: 'generation_field', field: 'frequencyPenalty' },
    presencePenalty: { kind: 'generation_field', field: 'presencePenalty' },
    repetitionPenalty: { kind: 'generation_field', field: 'repetitionPenalty' },
    seed: { kind: 'generation_field', field: 'seed' },
    maxOutputTokens: { kind: 'generation_field', field: 'maxOutputTokens' },
    stopSequences: { kind: 'generation_field', field: 'stop' },
    reasoningEffort: { kind: 'reasoning_effort' },
    reasoningSummary: { kind: 'reasoning_summary' },
    thinkingEnabled: { kind: 'thinking_enabled' },
    thinkingBudget: extensionKind === 'anthropic_messages'
      ? { kind: 'anthropic_manual_budget', extensionKind }
      : extensionKind === 'gemini_generate_content'
        ? { kind: 'gemini_thinking_budget', extensionKind }
        : deferred('target_has_no_reviewed_thinking_budget_mapping'),
    thinkingLevel: extensionKind === 'gemini_generate_content' || extensionKind === 'gemini_interactions'
      ? { kind: 'gemini_thinking_level', extensionKind }
      : deferred('target_has_no_reviewed_thinking_level_mapping'),
    includeThoughts: extensionKind === 'gemini_generate_content'
      ? { kind: 'gemini_include_thoughts', extensionKind }
      : deferred('target_has_no_reviewed_include_thoughts_mapping'),
    thoughtSummaryMode: extensionKind === 'gemini_generate_content'
      ? { kind: 'gemini_thought_summary_mode', extensionKind }
      : deferred('target_has_no_reviewed_thought_summary_mapping'),
    googleSearch: { kind: 'web_type_when_true', type: 'web' },
    imageSearch: { kind: 'web_type_when_true', type: 'image' },
    verbosity: extensionKind === 'openai_responses' || extensionKind === 'openrouter_chat'
      ? { kind: 'provider_verbosity', extensionKind }
      : deferred('target_has_no_reviewed_verbosity_mapping'),
    'web.searchPrompt': deferred('target_has_no_reviewed_search_prompt_mapping'),
  }
  return decodeRequestedParametersPolicyV2({ schemaVersion: 1, extensionKind, parameters })
}

type RawRequestedValue = Readonly<{ key: RequestedParameterPolicyKeyV2; value: unknown; source?: RequestedParameterSourceV2; mode: 'custom' | 'omit' | 'web_prompt' }>

function rawRequestedValues(requested: GenerationIntentLayerV2): readonly RawRequestedValue[] {
  const values: RawRequestedValue[] = []
  for (const key of REQUESTED_PARAMETER_KEYS_V2) {
    const entry = requested.requestedParameters?.[key]
    if (!entry) continue
    if (entry.mode === 'omit') values.push(Object.freeze({ key, mode: 'omit' as const, source: entry.source, value: undefined }))
    else values.push(Object.freeze({ key, mode: 'custom' as const, source: entry.source, value: entry.value }))
  }
  if (requested.web?.searchPrompt !== undefined) values.push(Object.freeze({ key: 'web.searchPrompt', mode: 'web_prompt', value: requested.web.searchPrompt }))
  return Object.freeze(values)
}

function defaultExtension(kind: RequestedParameterExtensionKindV2): Record<string, unknown> {
  if (kind === 'anthropic_messages') return { kind, thinkingDisplay: 'provider_default', thinkingMode: 'model_recommended' }
  if (kind === 'gemini_generate_content') return { kind, thinkingMode: 'default', includeThoughts: 'provider_default' }
  if (kind === 'gemini_interactions') return { kind }
  if (kind === 'openai_responses' || kind === 'openrouter_chat') return { kind }
  return { kind: 'none' }
}

function extensionFor(effective: GenerationIntentLayerV2, policy: RequestedParametersPolicyV2): Record<string, unknown> {
  if (effective.providerExtension && effective.providerExtension.kind !== 'none' && effective.providerExtension.kind !== policy.extensionKind) {
    return { ...effective.providerExtension }
  }
  return effective.providerExtension?.kind === policy.extensionKind ? { ...effective.providerExtension } : defaultExtension(policy.extensionKind)
}

function sourceEvidence(value: RawRequestedValue): unknown {
  return value.mode === 'omit' ? { mode: 'omit', ...(value.source === undefined ? {} : { source: value.source }) }
    : { mode: 'custom', value: value.value, ...(value.source === undefined ? {} : { source: value.source }) }
}

function deferDecision(value: RawRequestedValue, reason: string): RequestAdaptationV2 {
  return Object.freeze({ path: value.key === 'web.searchPrompt' ? 'web.searchPrompt' : `requestedParameters.${value.key}`,
    outcome: 'deferred', reason, source: sourceEvidence(value) })
}

function mappedDecision(value: RawRequestedValue, reason: string): RequestAdaptationV2 {
  return Object.freeze({ path: value.key === 'web.searchPrompt' ? 'web.searchPrompt' : `requestedParameters.${value.key}`,
    outcome: 'converted', reason, source: sourceEvidence(value) })
}

function requestedExtensionKind(rule: RequestedParameterPolicyRuleV2): RequestedParameterExtensionKindV2 | undefined {
  return 'extensionKind' in rule ? rule.extensionKind : undefined
}

function thoughtSummaryValue(key: RequestedParameterPolicyKeyV2, value: unknown): 'enabled' | 'disabled' | null {
  if (key === 'includeThoughts') return value === true ? 'enabled' : value === false ? 'disabled' : null
  if (key === 'thoughtSummaryMode') return value === 'auto' ? 'enabled' : value === 'none' ? 'disabled' : null
  return null
}

/** Applies a reviewed target policy to one request. The source layer and requested snapshot remain immutable. */
export function executeRequestedParametersRuleV2(
  requested: GenerationIntentLayerV2,
  effective: GenerationIntentLayerV2,
  policy: RequestedParametersPolicyV2,
): Readonly<{ effective: GenerationIntentLayerV2; decisions: readonly RequestAdaptationV2[] }> {
  const values = rawRequestedValues(requested)
  const projectedEffective = projectGenerationIntentLayerV2(effective) as Record<string, unknown>
  const strippedEffective: Record<string, unknown> = { ...projectedEffective }
  delete strippedEffective.requestedParameters
  if (values.length === 0) {
    return Object.freeze({ effective: decodeGenerationIntentLayerV2(strippedEffective), decisions: Object.freeze([]) })
  }
  const generation: Record<string, unknown> = { ...(effective.generation ?? {}) }
  const omittedReasoningMode = requested.requestedParameters?.thinkingEnabled?.mode === 'omit' && policy.parameters.thinkingEnabled.kind === 'thinking_enabled'
  let reasoning: Record<string, unknown> = omittedReasoningMode ? { mode: 'disabled' } : { ...(effective.reasoning ?? { mode: 'disabled' }) }
  let web: Record<string, unknown> = { ...(effective.web ?? { mode: 'disabled' }) }
  const providerExtension = extensionFor(effective, policy)
  const decisions: RequestAdaptationV2[] = []
  const explicitlyPresent = new Map(values.map(value => [value.key, value]))
  const includes = explicitlyPresent.get('includeThoughts')
  const summaryMode = explicitlyPresent.get('thoughtSummaryMode')
  const includesMapped = includes?.mode === 'custom' ? thoughtSummaryValue('includeThoughts', includes.value) : null
  const summaryMapped = summaryMode?.mode === 'custom' ? thoughtSummaryValue('thoughtSummaryMode', summaryMode.value) : null
  const contradictoryThoughts = includesMapped !== null && summaryMapped !== null && includesMapped !== summaryMapped
  const budget = explicitlyPresent.get('thinkingBudget')
  const level = explicitlyPresent.get('thinkingLevel')
  const contradictoryThinking = budget?.mode === 'custom' && level?.mode === 'custom' &&
    (policy.parameters.thinkingBudget.kind === 'anthropic_manual_budget' || policy.parameters.thinkingBudget.kind === 'gemini_thinking_budget') &&
    policy.parameters.thinkingLevel.kind === 'gemini_thinking_level'
  if (contradictoryThinking) throw new Error('GENERATION_V2_RULE_PARAMETER_CONFLICT')
  if (contradictoryThoughts) throw new Error('GENERATION_V2_RULE_PARAMETER_CONFLICT')
  const explicitThinkingDisabled = explicitlyPresent.get('thinkingEnabled')?.mode === 'custom' && explicitlyPresent.get('thinkingEnabled')?.value === false
  const summaryWhileDisabled = explicitThinkingDisabled && explicitlyPresent.get('reasoningSummary')?.mode === 'custom'

  const removeMappedTarget = (value: RawRequestedValue, rule: RequestedParameterPolicyRuleV2) => {
    if (rule.kind === 'generation_field') delete generation[rule.field]
    else if (rule.kind === 'reasoning_effort') delete reasoning.effort
    else if (rule.kind === 'reasoning_summary') delete reasoning.summary
    else if (rule.kind === 'thinking_enabled') {
      reasoning = { mode: 'disabled' }
    } else if (rule.kind === 'provider_verbosity') delete providerExtension.verbosity
    else if (rule.kind === 'anthropic_manual_budget' && providerExtension.kind === 'anthropic_messages') {
      delete providerExtension.manualThinkingBudgetTokens
      if (providerExtension.thinkingMode === 'manual') providerExtension.thinkingMode = 'model_recommended'
    } else if (rule.kind === 'gemini_thinking_budget' && providerExtension.kind === 'gemini_generate_content') {
      delete providerExtension.thinkingBudget
      if (providerExtension.thinkingMode === 'budget') providerExtension.thinkingMode = 'default'
    } else if (rule.kind === 'gemini_thinking_level' && providerExtension.kind === 'gemini_generate_content') {
      delete providerExtension.thinkingLevel
      if (providerExtension.thinkingMode === 'level') providerExtension.thinkingMode = 'default'
    } else if (rule.kind === 'gemini_thinking_level' && providerExtension.kind === 'gemini_interactions') delete providerExtension.thinkingLevel
    else if ((rule.kind === 'gemini_include_thoughts' || rule.kind === 'gemini_thought_summary_mode') && providerExtension.kind === 'gemini_generate_content') {
      providerExtension.includeThoughts = 'provider_default'
    } else if (rule.kind === 'web_type_when_true' && web.mode === 'provider_search') {
      const remaining = [...web.types as readonly string[]].filter(type => type !== rule.type)
      web = remaining.length > 0 ? { ...web, types: remaining } : { mode: 'disabled', ...(web.searchPrompt === undefined ? {} : { searchPrompt: web.searchPrompt }) }
    }
    decisions.push(Object.freeze({ path: `requestedParameters.${value.key}`, outcome: 'preserved',
      reason: 'explicit_parameter_omission_removed_effective_target', source: sourceEvidence(value) }))
  }

  const clearRawCandidate = (key: RequestedParameterPolicyKeyV2) => {
    const generationField: Partial<Record<RequestedParameterKeyV2, string>> = {
      maxOutputTokens: 'maxOutputTokens', temperature: 'temperature', topP: 'topP', topK: 'topK',
      minP: 'minP', topA: 'topA', seed: 'seed', stopSequences: 'stop',
      frequencyPenalty: 'frequencyPenalty', presencePenalty: 'presencePenalty', repetitionPenalty: 'repetitionPenalty',
    }
    if (key in generationField) {
      delete generation[generationField[key as RequestedParameterKeyV2]!]
    } else if (key === 'reasoningEffort') delete reasoning.effort
    else if (key === 'reasoningSummary') delete reasoning.summary
    else if (key === 'thinkingEnabled') reasoning = { mode: 'disabled' }
    else if (key === 'verbosity') delete providerExtension.verbosity
    else if (key === 'thinkingBudget') {
      if (providerExtension.kind === 'anthropic_messages') {
        delete providerExtension.manualThinkingBudgetTokens
        if (providerExtension.thinkingMode === 'manual') providerExtension.thinkingMode = 'model_recommended'
      } else if (providerExtension.kind === 'gemini_generate_content') {
        delete providerExtension.thinkingBudget
        if (providerExtension.thinkingMode === 'budget') providerExtension.thinkingMode = 'default'
      }
    } else if (key === 'thinkingLevel') {
      if (providerExtension.kind === 'gemini_generate_content' || providerExtension.kind === 'gemini_interactions') {
        delete providerExtension.thinkingLevel
        if (providerExtension.kind === 'gemini_generate_content' && providerExtension.thinkingMode === 'level') providerExtension.thinkingMode = 'default'
      }
    } else if (key === 'includeThoughts' || key === 'thoughtSummaryMode') {
      if (providerExtension.kind === 'gemini_generate_content') providerExtension.includeThoughts = 'provider_default'
    } else if (key === 'googleSearch' || key === 'imageSearch') {
      const type = key === 'googleSearch' ? 'web' : 'image'
      if (web.mode === 'provider_search') {
        const remaining = [...web.types as readonly string[]].filter(value => value !== type)
        web = remaining.length > 0 ? { ...web, types: remaining }
          : { mode: 'disabled', ...(web.searchPrompt === undefined ? {} : { searchPrompt: web.searchPrompt }) }
      }
    } else if (key === 'web.searchPrompt') delete web.searchPrompt
  }

  for (const value of values) {
    if (value.key === 'web.searchPrompt') continue
    const rule = policy.parameters[value.key]
    if (value.mode === 'omit') {
      if (rule.kind === 'defer') {
        clearRawCandidate(value.key)
        decisions.push(Object.freeze({ path: `requestedParameters.${value.key}`, outcome: 'preserved',
          reason: 'explicit_parameter_omission_removed_effective_target', source: sourceEvidence(value) }))
      } else removeMappedTarget(value, rule)
      continue
    }
    if (rule.kind === 'defer') {
      clearRawCandidate(value.key)
      decisions.push(deferDecision(value, rule.reason))
      continue
    }
    const targetExtension = requestedExtensionKind(rule)
    if (targetExtension !== undefined && targetExtension !== policy.extensionKind) {
      decisions.push(deferDecision(value, 'requested_parameter_policy_target_extension_mismatch'))
      continue
    }
    if (targetExtension !== undefined && providerExtension.kind !== targetExtension) {
      clearRawCandidate(value.key)
      decisions.push(deferDecision(value, 'requested_parameter_effective_extension_mismatch'))
      continue
    }
    if ((value.key === 'includeThoughts' || value.key === 'thoughtSummaryMode') && contradictoryThoughts) {
      decisions.push(deferDecision(value, 'conflicting_explicit_include_thoughts_requests'))
      continue
    }
    if ((value.key === 'thinkingBudget' || value.key === 'thinkingLevel') && contradictoryThinking) {
      decisions.push(deferDecision(value, 'conflicting_explicit_thinking_control_requests'))
      continue
    }

    switch (rule.kind) {
      case 'generation_field': {
        if (rule.field === 'stop') generation.stop = [...value.value as readonly string[]]
        else generation[rule.field] = value.value
        decisions.push(mappedDecision(value, `requested_parameter_mapped_to_generation_${rule.field}`))
        break
      }
      case 'reasoning_effort':
        if (omittedReasoningMode) {
          clearRawCandidate(value.key)
          decisions.push(deferDecision(value, 'reasoning_mode_explicitly_omitted'))
          break
        }
        reasoning.effort = value.value
        if (value.value === 'none') {
          reasoning.mode = 'disabled'
          if (reasoning.summary !== undefined && !explicitlyPresent.has('reasoningSummary')) {
            decisions.push(Object.freeze({ path: 'reasoning.summary', outcome: 'deferred', reason: 'reasoning_disabled_by_explicit_none_effort', source: reasoning.summary }))
          }
          if (reasoning.exclude !== undefined) {
            decisions.push(Object.freeze({ path: 'reasoning.exclude', outcome: 'deferred', reason: 'reasoning_disabled_by_explicit_none_effort', source: reasoning.exclude }))
          }
          delete reasoning.summary
          delete reasoning.exclude
        }
        decisions.push(mappedDecision(value, 'requested_parameter_mapped_to_reasoning_effort'))
        break
      case 'reasoning_summary':
        if (omittedReasoningMode) {
          clearRawCandidate(value.key)
          decisions.push(deferDecision(value, 'reasoning_mode_explicitly_omitted'))
          break
        }
        if (summaryWhileDisabled) {
          clearRawCandidate(value.key)
          decisions.push(deferDecision(value, 'reasoning_summary_conflicts_with_explicit_thinking_disabled'))
          break
        }
        if (reasoning.mode !== 'enabled') {
          clearRawCandidate(value.key)
          decisions.push(deferDecision(value, 'reasoning_summary_requires_enabled_reasoning'))
        }
        else {
          reasoning.summary = value.value
          decisions.push(mappedDecision(value, 'requested_parameter_mapped_to_reasoning_summary'))
        }
        break
      case 'thinking_enabled': {
        if (value.value === true) reasoning.mode = 'enabled'
        else {
          reasoning.mode = 'disabled'
          if (reasoning.summary !== undefined && !explicitlyPresent.has('reasoningSummary')) {
            decisions.push(Object.freeze({ path: 'reasoning.summary', outcome: 'deferred', reason: 'reasoning_summary_conflicts_with_explicit_thinking_disabled', source: reasoning.summary }))
          }
          if (reasoning.exclude !== undefined) decisions.push(Object.freeze({ path: 'reasoning.exclude', outcome: 'deferred', reason: 'reasoning_disabled_by_explicit_thinking_disabled', source: reasoning.exclude }))
          delete reasoning.summary
          delete reasoning.exclude
        }
        decisions.push(mappedDecision(value, 'requested_parameter_mapped_to_reasoning_mode'))
        break
      }
      case 'provider_verbosity':
        providerExtension.verbosity = value.value
        decisions.push(mappedDecision(value, 'requested_parameter_mapped_to_provider_extension_verbosity'))
        break
      case 'anthropic_manual_budget':
        if (typeof value.value !== 'number' || !Number.isSafeInteger(value.value) || value.value < 1) {
          throw new Error('GENERATION_V2_RULE_PARAMETER_UNSUPPORTED')
        } else {
          providerExtension.thinkingMode = 'manual'
          providerExtension.manualThinkingBudgetTokens = value.value
          decisions.push(mappedDecision(value, 'requested_parameter_mapped_to_anthropic_manual_thinking_budget'))
        }
        break
      case 'gemini_thinking_budget':
        providerExtension.thinkingMode = 'budget'
        providerExtension.thinkingBudget = value.value
        delete providerExtension.thinkingLevel
        decisions.push(mappedDecision(value, 'requested_parameter_mapped_to_gemini_thinking_budget'))
        break
      case 'gemini_thinking_level':
        if (policy.extensionKind === 'gemini_interactions') providerExtension.thinkingLevel = value.value
        else {
          providerExtension.thinkingMode = 'level'
          providerExtension.thinkingLevel = value.value
          delete providerExtension.thinkingBudget
        }
        decisions.push(mappedDecision(value, 'requested_parameter_mapped_to_gemini_thinking_level'))
        break
      case 'gemini_include_thoughts':
        providerExtension.includeThoughts = value.value === true ? 'enabled' : 'disabled'
        decisions.push(mappedDecision(value, 'requested_parameter_mapped_to_gemini_include_thoughts'))
        break
      case 'gemini_thought_summary_mode': {
        const mapped = thoughtSummaryValue(value.key, value.value)
        if (!mapped) decisions.push(deferDecision(value, 'thought_summary_mode_value_has_no_reviewed_mapping'))
        else {
          providerExtension.includeThoughts = mapped
          decisions.push(mappedDecision(value, 'requested_parameter_mapped_to_gemini_include_thoughts'))
        }
        break
      }
      case 'web_type_when_true':
        if (value.value !== true) {
          clearRawCandidate(value.key)
          decisions.push(deferDecision(value, 'explicit_false_web_type_requires_target_rule'))
        }
        else {
          const types = web.mode === 'provider_search' ? [...web.types as readonly string[]] : []
          if (!types.includes(rule.type)) types.push(rule.type)
          types.sort((left, right) => ['web', 'image'].indexOf(left) - ['web', 'image'].indexOf(right))
          web = { ...(web.mode === 'provider_search' ? web : {}), mode: 'provider_search', types }
          decisions.push(mappedDecision(value, `requested_parameter_mapped_to_web_type_${rule.type}`))
        }
        break
    }
  }

  const searchPrompt = explicitlyPresent.get('web.searchPrompt')
  if (searchPrompt) {
    const rule = policy.parameters['web.searchPrompt']
    decisions.push(rule.kind === 'defer'
      ? deferDecision(searchPrompt, rule.reason)
      : deferDecision(searchPrompt, 'web_search_prompt_rule_target_unavailable'))
    delete web.searchPrompt
  }

  const intent: Record<string, unknown> = { ...projectedEffective, generation, web, providerExtension }
  intent.reasoning = reasoning
  delete intent.requestedParameters
  return Object.freeze({ effective: decodeGenerationIntentLayerV2(intent), decisions: Object.freeze(decisions) })
}
