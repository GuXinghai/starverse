import type { GenerationIntentLayerV2 } from '../domain/generationIntentV2'
import { projectGenerationIntentLayerV2 } from '../domain/generationIntentProjectionV2'
import { decodeResolvedGenerationIntentV2 } from '../domain/resolvedGenerationIntentV2'
import { canonicalSourceFactDigestV1 } from '../model-facts/canonicalSourceFactsV1'
import type { ResolvedCapabilityV2 } from '../capability/resolvedCapabilityV2'
import { contains } from '../capability/resolvedCapabilityV2'
import type { PersistedModelCapabilityFieldV2, ModelCapabilitySemanticPathV2 } from '../capability/modelCapabilitySchemaV2'
import type { CapabilityRulePredicateV2, CapabilityRuleRequestContextPathV2 } from './capabilityRuleCoreV2'
import type { BoundRequestRuleV2, BoundRequestRulesV2 } from './boundRequestRulesV2'
import { executeOpenAIReasoningRuleV2 } from './operations/openaiReasoningV2'
import { executeAnthropicReasoningRuleV2 } from './operations/anthropicReasoningV2'
import { executeGeminiReasoningRuleV2 } from './operations/geminiReasoningV2'
import type { RequestAdaptationV2 } from '../compiler/requestAdaptationV2'
import type { RequestFactOverlayV2 } from './requestFactOverlayV2'
import { executeRequestedParametersRuleV2 } from './operations/requestedParametersV2'
import { resolveToolDefinitionsV2, type ToolDefinitionsContextV2, type ToolDefinitionDefaultsV2,
  type ResolvedToolDefinitionsV2 } from './operations/toolDefinitionsV2'

type JsonObject = Record<string, unknown>
export type RequestRuleDecisionV2 = Readonly<{
  decisionKey: string
  ruleId: string
  ruleRevision: string
  ownership: 'cloud' | 'user'
  ownerId: string
  packId: string
  snapshotRevision: string
  outcome: 'applied' | 'validated' | 'validation_failed' | 'condition_false' | 'overridden'
}>
export class RequestRuleResolutionV2Error extends Error {
  constructor(readonly code: string, readonly ruleIds: readonly string[], readonly decisionKey: string) {
    super(code); this.name = 'RequestRuleResolutionV2Error'
  }
}
export type RequestRuleResolutionResultV2 = Readonly<{
  intent: ReturnType<typeof decodeResolvedGenerationIntentV2>
  capabilityFields: readonly PersistedModelCapabilityFieldV2[]
  capabilityEvidence: ResolvedCapabilityV2['modelFacts']['evidence']
  decisions: readonly RequestRuleDecisionV2[]
  adaptations: readonly RequestAdaptationV2[]
  toolDefinitions?: ResolvedToolDefinitionsV2
}>
type MutableContext = { requested: JsonObject; effective: JsonObject; target?: JsonObject }
function parameterDomainValue(path: string, value: unknown): unknown {
  return path === 'tools.toolChoice' && value && typeof value === 'object' ? (value as JsonObject).mode : value
}

function read(context: MutableContext, path: CapabilityRuleRequestContextPathV2): unknown {
  if (path.startsWith('target.')) return context.target?.[path.slice('target.'.length)]
  const [root, group, key] = path.split('.') as ['requested' | 'effective', string, string]
  return (context[root][group] as JsonObject | undefined)?.[key]
}
export function evaluateRequestRulePredicateV2(predicate: CapabilityRulePredicateV2, context: MutableContext): boolean {
  switch (predicate.kind) {
    case 'exists': return read(context, predicate.path) !== undefined
    case 'eq': return read(context, predicate.path) === predicate.value
    case 'in': return predicate.values.includes(read(context, predicate.path) as never)
    case 'lt': case 'lte': {
      const left = read(context, predicate.path)
      const right = typeof predicate.right === 'number' ? predicate.right : read(context, predicate.right.path)
      return typeof left === 'number' && typeof right === 'number' && Number.isFinite(left) && Number.isFinite(right) &&
        (predicate.kind === 'lt' ? left < right : left <= right)
    }
    case 'all': return predicate.predicates.every(value => evaluateRequestRulePredicateV2(value, context))
    case 'any': return predicate.predicates.some(value => evaluateRequestRulePredicateV2(value, context))
    case 'not': return !evaluateRequestRulePredicateV2(predicate.predicate, context)
  }
}

function rankedWinners(candidates: readonly BoundRequestRuleV2[]): readonly BoundRequestRuleV2[] {
  const exact = candidates.filter(entry => entry.definition.selector.kind === 'exact')
  const eligible = exact.length ? exact : candidates
  const priority = Math.max(...eligible.map(entry => entry.packPriority + entry.definition.priority))
  return eligible.filter(entry => entry.packPriority + entry.definition.priority === priority)
}

/** Request-only interpreter. Selection was materialized; no regex or model-ID branch is evaluated here. */
export function resolveRequestRulesV2(input: Readonly<{
  requested: GenerationIntentLayerV2
  capability: ResolvedCapabilityV2
  bundle: BoundRequestRulesV2
  resolveFacts?: (claims: readonly BoundRequestRuleV2[]) => RequestFactOverlayV2
  attachmentTransport?: (intent: GenerationIntentLayerV2, capability: ResolvedCapabilityV2) => GenerationIntentLayerV2
  validationMode?: 'enforce' | 'preview'
  toolDefinitions?: ToolDefinitionsContextV2
}>): RequestRuleResolutionResultV2 {
  const context: MutableContext = { requested: projectGenerationIntentLayerV2(input.requested) as JsonObject,
    effective: structuredClone(projectGenerationIntentLayerV2(input.requested)) as JsonObject,
    target: { protocolContractId: input.capability.executionContext.binding.protocolContractId.value,
      operation: input.capability.executionContext.binding.operation, providerId: input.capability.executionContext.binding.providerId.value } }
  const decisions: RequestRuleDecisionV2[] = []
  const adaptations: RequestAdaptationV2[] = []
  let toolDefinitionDefaults: ToolDefinitionDefaultsV2 | undefined
  const parameterValidators: BoundRequestRuleV2[] = []
  let capabilityFields = input.capability.modelFacts.fields
  let capabilityEvidence = input.capability.modelFacts.evidence
  const record = (entry: BoundRequestRuleV2, outcome: RequestRuleDecisionV2['outcome']) => decisions.push({
    decisionKey: entry.definition.decisionKey, ruleId: entry.definition.ruleId, ruleRevision: entry.ruleRevision,
    ownership: entry.ownership, ownerId: entry.ownerId, packId: entry.packId,
    snapshotRevision: entry.snapshotRevision, outcome })
  const capability = (): ResolvedCapabilityV2 => ({ ...input.capability,
    modelFacts: { ...input.capability.modelFacts, fields: capabilityFields, evidence: capabilityEvidence } })
  const intent = () => decodeResolvedGenerationIntentV2(context.effective).value
  const append = (value: Readonly<{ reasoning: unknown; providerExtension: unknown; generation?: unknown; decisions: readonly RequestAdaptationV2[] }>) => {
    context.effective.reasoning = structuredClone(value.reasoning)
    context.effective.providerExtension = structuredClone(value.providerExtension)
    if (value.generation !== undefined) context.effective.generation = structuredClone(value.generation)
    adaptations.push(...value.decisions)
  }
  const groups = new Map<string, BoundRequestRuleV2[]>()
  for (const entry of input.bundle.rules) {
    const list = groups.get(entry.definition.decisionKey) ?? []
    list.push(entry); groups.set(entry.definition.decisionKey, list)
  }
  const completed = new Set<string>()
  const appliedFacts: BoundRequestRuleV2[] = []
  const keys = [...groups.keys()].sort((a, b) => {
    const stage = (key: string) => {
      const effects = groups.get(key)!.map(entry => entry.definition.effect)
      if (effects.every(effect => effect.kind === 'fact_assertion' || effect.kind === 'fact_default') &&
          groups.get(key)!.every(entry => entry.definition.when === null)) return 0
      if (effects.some(effect => effect.kind === 'registered_operation' && effect.operationId === 'requested_parameters')) return 1
      if (effects.every(effect => effect.kind === 'fact_assertion' || effect.kind === 'fact_default')) return 4
      if (effects.some(effect => effect.kind === 'validation')) return 6
      if (effects.some(effect => effect.kind === 'registered_operation' && effect.operationId === 'parameter_support')) {
        return effects.some(effect => effect.kind === 'registered_operation' && effect.operationId === 'parameter_support' &&
          effect.parameters.phase === 'controls') ? 2 : 7
      }
      if (effects.some(effect => effect.kind === 'registered_operation' && effect.operationId.startsWith('reasoning_'))) return 3
      return 5
    }
    return stage(a) - stage(b) || a.localeCompare(b, 'en')
  })
  while (completed.size < keys.length) {
    let progressed = false
    for (const key of keys) {
      if (completed.has(key)) continue
      const candidates = groups.get(key)!
      if (candidates.some(entry => entry.definition.dependencies.some(dependency => !completed.has(dependency) && groups.has(dependency)))) continue
      const matching = candidates.filter(entry => entry.definition.when === null || evaluateRequestRulePredicateV2(entry.definition.when, context))
      for (const entry of candidates) if (!matching.includes(entry)) record(entry, 'condition_false')
      if (!matching.length) { completed.add(key); progressed = true; continue }
      const winners = rankedWinners(matching)
      if (new Set(winners.map(entry => canonicalSourceFactDigestV1(entry.definition.effect))).size > 1) {
        throw new RequestRuleResolutionV2Error('GENERATION_V2_RULE_CONFLICT', winners.map(entry => entry.definition.ruleId), key)
      }
      for (const entry of matching) if (!winners.includes(entry)) record(entry, 'overridden')
      const entry = winners[0]!
      const effect = entry.definition.effect
      let outcome: RequestRuleDecisionV2['outcome'] = effect.kind === 'validation' ? 'validated' : 'applied'
      if (effect.kind === 'fact_assertion' || effect.kind === 'fact_default') {
        appliedFacts.push(...winners)
        const projection = input.resolveFacts?.(appliedFacts)
        if (projection) { capabilityFields = projection.fields; capabilityEvidence = projection.evidence }
      } else if (effect.kind === 'validation') {
        if (!evaluateRequestRulePredicateV2(effect.predicate, context)) {
          if (input.validationMode !== 'preview') throw new RequestRuleResolutionV2Error(effect.code, winners.map(value => value.definition.ruleId), key)
          outcome = 'validation_failed'
        }
      } else if (effect.kind === 'enum_mapping') {
        const value = read(context, effect.path)
        const mapping = effect.mappings.find(item => item.from === value)
        if (mapping) {
          const [, group, field] = effect.path.split('.')
          ;(context.effective[group!] as JsonObject)[field!] = mapping.to
          adaptations.push({ path: effect.path.slice('effective.'.length), outcome: 'converted', reason: 'rule_enum_mapping', source: value })
        }
      } else {
        try {
        switch (effect.operationId) {
          case 'requested_parameters': {
            const result = executeRequestedParametersRuleV2(input.requested, intent(), effect.parameters)
            context.effective = projectGenerationIntentLayerV2(result.effective) as JsonObject
            adaptations.push(...result.decisions)
            break
          }
          case 'parameter_default': {
            const parameters = effect.parameters
            const [group, name] = parameters.path.split('.')
            const original = context.requested[group!] as JsonObject
            const effective = context.effective[group!] as JsonObject
            if (original[name!] !== undefined || effective[name!] !== undefined || effective.mode === 'disabled') break
            const field = capabilityFields.find(value => value.path === parameters.path)
            if (!input.capability.executionContext.encodingCoverage.semanticPaths.includes(parameters.path) ||
                !field || ['unsupported', 'conflict', 'missing'].includes(field.state)) break
            const value = field.defaultValue ?? parameters.value
            if (field.domain && !contains(field.domain, value)) {
              throw new Error('GENERATION_V2_RULE_DEFAULT_INVALID')
            }
            effective[name!] = value
            adaptations.push({ path: parameters.path, outcome: 'converted', reason: 'rule_parameter_default',
              source: { value, origin: field.defaultValue === undefined ? parameters.origin : 'provider_default' } })
            break
          }
          case 'image_aspect_ratio_to_size': {
            const image = context.effective.image as JsonObject
            if (image.mode !== 'generate') break
            const mappings = effect.parameters.mappings
            if (typeof image.aspectRatio === 'string') {
              const ratio = image.aspectRatio
              if (image.size !== undefined) {
                adaptations.push({ path: 'image.aspectRatio', outcome: 'deferred',
                  reason: 'rule_image_ratio_preserves_explicit_size', source: ratio })
              } else {
                const mapping = mappings.find(value => value.from === ratio)
                if (mapping) {
                  const size = { width: mapping.width, height: mapping.height }
                  image.size = size
                  adaptations.push({ path: 'image.aspectRatio', outcome: 'converted',
                    reason: 'rule_image_aspect_ratio_to_size', source: { aspectRatio: ratio, size } })
                } else adaptations.push({ path: 'image.aspectRatio', outcome: 'deferred',
                  reason: 'rule_image_aspect_ratio_unmapped', source: ratio })
              }
              delete image.aspectRatio
            }
            if (image.resolution !== undefined) {
              const resolution = image.resolution
              delete image.resolution
              adaptations.push({ path: 'image.resolution', outcome: 'deferred',
                reason: 'rule_image_ratio_mapping_does_not_encode_resolution', source: resolution })
            }
            break
          }
          case 'reasoning_openai': append(executeOpenAIReasoningRuleV2(intent(), capability())); break
          case 'reasoning_anthropic': append(executeAnthropicReasoningRuleV2(intent(), capability(), effect.parameters as { maxOutputFallback?: number; manualBudgetFallback?: number })); break
          case 'reasoning_gemini': append(executeGeminiReasoningRuleV2(intent(), capability(), (effect.parameters as { protocol: 'generate_content' | 'interactions' }).protocol)); break
          case 'parameter_support': {
            const parameters = effect.parameters as { unsupported: 'preserve' | 'defer'; providerExtensionKind?: string;
              phase?: 'controls' | 'values'; disabledControls?: readonly string[]; defaultEffort?: string; webTypes?: readonly string[] }
            const mode = parameters.unsupported
            const defer = (path: string, source: unknown, reason = 'rule_target_parameter_unavailable') =>
              adaptations.push({ path, source, reason, outcome: 'deferred' })
            if (parameters.providerExtensionKind && (context.effective.providerExtension as JsonObject).kind !== parameters.providerExtensionKind) {
              defer('providerExtension', context.effective.providerExtension, 'rule_target_protocol_extension')
              context.effective.providerExtension = parameters.providerExtensionKind === 'gemini_generate_content'
                ? { kind: parameters.providerExtensionKind, thinkingMode: 'default', includeThoughts: 'provider_default' }
                : parameters.providerExtensionKind === 'anthropic_messages'
                  ? { kind: parameters.providerExtensionKind, thinkingMode: 'provider_default', thinkingDisplay: 'provider_default' }
                  : { kind: parameters.providerExtensionKind }
            }
            for (const group of parameters.disabledControls ?? []) {
              if ((context.effective[group] as JsonObject).mode !== 'disabled') defer(group, context.effective[group], 'rule_target_control_not_encodable')
              context.effective[group] = { mode: 'disabled' }
            }
            if (parameters.phase !== 'controls' && parameters.defaultEffort && (context.effective.reasoning as JsonObject).mode === 'enabled' &&
                (context.effective.reasoning as JsonObject).effort === undefined) {
              ;(context.effective.reasoning as JsonObject).effort = parameters.defaultEffort
              adaptations.push({ path: 'reasoning.effort', outcome: 'converted', reason: 'rule_application_effort_default', source: parameters.defaultEffort })
            }
            if (parameters.phase !== 'controls' && parameters.webTypes && (context.effective.web as JsonObject).mode !== 'disabled') {
              const web = context.effective.web as JsonObject
              const types = (web.types as string[]).filter(value => parameters.webTypes!.includes(value))
              if (!types.length) { defer('web', web, 'rule_target_search_type_unavailable'); context.effective.web = { mode: 'disabled' } }
              else if (types.length !== (web.types as string[]).length) { defer('web.types', web.types); web.types = types }
            }
            const fields = new Map(capabilityFields.map(field => [field.path, field]))
            const covered = new Set(input.capability.executionContext.encodingCoverage.semanticPaths)
            const activeMode = { reasoning: 'enabled', web: 'provider_search', image: 'generate', tools: 'enabled' } as const
            for (const group of ['reasoning', 'web', 'image', 'tools'] as const) {
              if (parameters.phase === 'values') break
              const value = context.effective[group] as JsonObject
              const field = fields.get(`${group}.mode`)
              const isActive = value.mode === activeMode[group]
              if (isActive && (!field || field.state === 'missing')) {
                throw new RequestRuleResolutionV2Error('GENERATION_V2_RULE_REQUIRED_PARAMETER_UNRESOLVED', [entry.definition.ruleId], key)
              }
              if (field?.state === 'conflict' && isActive) {
                throw new RequestRuleResolutionV2Error('GENERATION_V2_RULE_PARAMETER_CONFLICT', [entry.definition.ruleId], key)
              }
              const allowed = field?.state === 'supported' && field.domain?.kind === 'enum' ? field.domain.values : undefined
              if (isActive && (field?.state === 'unsupported' || allowed && !allowed.includes(activeMode[group]))) {
                defer(group, value, 'rule_target_control_unsupported')
                context.effective[group] = { mode: 'disabled' }
              } else if (value.mode === 'disabled' && allowed?.includes(activeMode[group]) && !allowed.includes('disabled')) {
                defer(group, value, 'rule_target_control_required')
                if (group === 'web' && (!Array.isArray(value.types) || value.types.length === 0) ||
                    group === 'tools' && (!Array.isArray(value.allowedToolIds) || value.allowedToolIds.length === 0)) {
                  throw new RequestRuleResolutionV2Error('GENERATION_V2_RULE_REQUIRED_PARAMETER_UNRESOLVED', [entry.definition.ruleId], key)
                }
                context.effective[group] = { ...value, mode: activeMode[group] }
              }
            }
            if (parameters.phase === 'controls') break
            parameterValidators.push(entry)
            for (const group of ['generation', 'reasoning', 'web', 'image', 'tools', 'providerExtension']) {
              const values = context.effective[group] as JsonObject
              for (const [name, value] of Object.entries(values)) {
                if (name === 'kind' || name === 'mode') continue
                const path = `${group}.${name}` as ModelCapabilitySemanticPathV2
                const field = fields.get(path)
                const encodable = covered.has(path)
                const supported = field && !['unsupported', 'conflict', 'missing'].includes(field.state) &&
                  (field.state === 'unknown' || field.domain === undefined || contains(field.domain, parameterDomainValue(path, value)))
                if (encodable && supported || mode === 'preserve' && encodable) continue
                if (group === 'generation' && name === 'temperature') {
                  throw new RequestRuleResolutionV2Error('GENERATION_V2_RULE_PARAMETER_UNSUPPORTED', [entry.definition.ruleId], key)
                }
                if (mode === 'defer') {
                  delete values[name]
                  adaptations.push({ path, outcome: 'deferred', reason: 'rule_target_parameter_unavailable', source: value })
                } else throw new RequestRuleResolutionV2Error('GENERATION_V2_RULE_PARAMETER_UNSUPPORTED', [entry.definition.ruleId], key)
              }
            }
            break
          }
          case 'attachment_transport': {
            if (input.attachmentTransport) context.effective = projectGenerationIntentLayerV2(input.attachmentTransport(intent(), capability())) as JsonObject
            break
          }
          case 'tool_choice': {
            const tools = context.effective.tools as JsonObject
            if ((effect.parameters as { thinkingRequiredAuto: boolean }).thinkingRequiredAuto &&
                (context.effective.reasoning as JsonObject).mode === 'enabled' && tools.mode === 'enabled' &&
                ['required', 'named'].includes((tools.toolChoice as JsonObject)?.mode as string)) {
              adaptations.push({ path: 'tools.toolChoice', outcome: 'converted', reason: 'rule_thinking_requires_auto_tools', source: tools.toolChoice })
              tools.toolChoice = { mode: 'auto' }
            }
            break
          }
          case 'tool_definition_defaults': toolDefinitionDefaults = effect.parameters; break
        }
        } catch (error) {
          if (error instanceof RequestRuleResolutionV2Error) throw error
          const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code
            : error instanceof Error && error.message.startsWith('GENERATION_V2_') ? error.message : 'GENERATION_V2_RULE_EXECUTION_FAILED'
          throw new RequestRuleResolutionV2Error(code, winners.map(value => value.definition.ruleId), key)
        }
      }
      for (const winner of winners) record(winner, outcome)
      completed.add(key); progressed = true
    }
    if (!progressed) throw new RequestRuleResolutionV2Error('GENERATION_V2_RULE_DEPENDENCY_CYCLE', [], '')
  }
  const protocol = input.capability.executionContext.binding.protocolContractId.value
  // Conditional facts may arrive after the control operation. Validate the
  // final control state under the same selected Rule rather than guessing a
  // new mode or allowing a late conflict to escape into the codec.
  for (const entry of parameterValidators.length ? parameterValidators : [undefined]) {
    for (const [group, active] of Object.entries({ reasoning: 'enabled', web: 'provider_search', image: 'generate', tools: 'enabled' })) {
      const mode = (context.effective[group] as JsonObject).mode
      const field = capabilityFields.find(value => value.path === `${group}.mode`)
      const allowed = field?.state === 'supported' && field.domain?.kind === 'enum' ? field.domain.values : undefined
      const code = mode === active && (!field || field.state === 'missing') ? 'GENERATION_V2_RULE_REQUIRED_PARAMETER_UNRESOLVED'
        : field?.state === 'conflict' && mode === active ? 'GENERATION_V2_RULE_PARAMETER_CONFLICT'
        : mode === active && (field?.state === 'unsupported' || allowed && !allowed.includes(active))
          ? 'GENERATION_V2_RULE_PARAMETER_UNSUPPORTED'
          : mode === 'disabled' && allowed?.includes(active) && !allowed.includes('disabled')
            ? 'GENERATION_V2_RULE_REQUIRED_PARAMETER_UNRESOLVED' : null
      if (code) throw new RequestRuleResolutionV2Error(code, entry ? [entry.definition.ruleId] : [],
        entry?.definition.decisionKey ?? 'facts:controlValidity')
    }
  }
  // An empty bundle authorizes no adaptation. It still cannot turn known
  // unsupported or missing facts into permission to send a parameter.
  if (!parameterValidators.length) for (const group of ['generation', 'reasoning', 'web', 'image', 'tools', 'providerExtension']) {
    for (const [name, value] of Object.entries(context.effective[group] as JsonObject)) {
      if (name === 'kind' || name === 'mode') continue
      const field = capabilityFields.find(field => field.path === `${group}.${name}`)
      const covered = input.capability.executionContext.encodingCoverage.semanticPaths.includes(`${group}.${name}` as ModelCapabilitySemanticPathV2)
      const code = field?.state === 'conflict' ? 'GENERATION_V2_RULE_PARAMETER_CONFLICT'
        : !field || field.state === 'missing' ? 'GENERATION_V2_RULE_REQUIRED_PARAMETER_UNRESOLVED'
          : !covered || field.state === 'unsupported' || field.domain && !contains(field.domain, parameterDomainValue(`${group}.${name}`, value))
            ? 'GENERATION_V2_RULE_PARAMETER_UNSUPPORTED' : null
      if (code) throw new RequestRuleResolutionV2Error(code, [], 'facts:parameterValidity')
    }
  }
  if (context.effective.requestedParameters !== undefined ||
      (context.effective.web as JsonObject).searchPrompt !== undefined) {
    throw new RequestRuleResolutionV2Error('GENERATION_V2_RULE_REQUESTED_PARAMETERS_UNRESOLVED', [], 'request.requestedParameters')
  }
  const toolDefinitions = (context.effective.tools as JsonObject).mode === 'enabled' &&
    (protocol === 'openai-responses-v1' || protocol === 'lmstudio-openresponses') && input.toolDefinitions !== undefined
    ? resolveToolDefinitionsV2(input.toolDefinitions, toolDefinitionDefaults, protocol) : undefined
  return Object.freeze({ intent: decodeResolvedGenerationIntentV2(context.effective), capabilityFields, capabilityEvidence,
    decisions: Object.freeze(decisions.map(value => Object.freeze(value))), adaptations: Object.freeze(adaptations),
    ...(toolDefinitions === undefined ? {} : { toolDefinitions }) })
}
