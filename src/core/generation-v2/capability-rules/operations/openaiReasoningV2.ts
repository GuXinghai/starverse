import type { ResolvedCapabilityV2 } from '../../capability/resolvedCapabilityV2'
import type { GenerationIntentLayerV2, ProviderSemanticExtensionV2, ReasoningIntentV2 } from '../../domain/generationIntentV2'
import type { RequestAdaptationV2 } from '../../compiler/requestAdaptationV2'

type OpenAIResponsesExtension = Extract<ProviderSemanticExtensionV2, { kind: 'openai_responses' }>

/** Closed interpreter operation. Executed only by an applied Rule; no model identity inference. */
export function executeOpenAIReasoningRuleV2(
  requested: GenerationIntentLayerV2,
  capability: ResolvedCapabilityV2,
): Readonly<{
  reasoning: ReasoningIntentV2
  providerExtension: OpenAIResponsesExtension
  generation: GenerationIntentLayerV2['generation']
  decisions: readonly RequestAdaptationV2[]
}> {
  const fields = new Map(capability.modelFacts.fields.map(field => [field.path, field]))
  const modeField = fields.get('reasoning.mode')
  const effortField = fields.get('reasoning.effort')
  const modeValues = modeField?.state === 'supported' && modeField.domain?.kind === 'enum'
    ? modeField.domain.values : []
  const effortValues = effortField?.state === 'supported' && effortField.domain?.kind === 'enum'
    ? effortField.domain.values.filter((value): value is string => typeof value === 'string') : []
  const effortKnown = effortField?.state === 'supported' && effortField.domain?.kind === 'enum' && effortValues.length > 0
  const noneAllowed = effortKnown && effortValues.includes('none')
  const modeRequiresReasoning = modeValues.includes('enabled') && !modeValues.includes('disabled')
  const providerDefault = effortField?.state === 'supported' && typeof effortField.defaultValue === 'string' &&
    effortValues.includes(effortField.defaultValue) ? effortField.defaultValue : undefined
  const sourceReasoning: ReasoningIntentV2 = requested.reasoning ?? Object.freeze({ mode: 'disabled' as const })
  const sourceEnabledReasoning = sourceReasoning.mode === 'enabled' ? sourceReasoning : undefined
  const sourceEffort = sourceReasoning.effort
  const sourceExtension = requested.providerExtension?.kind === 'openai_responses'
    ? requested.providerExtension : Object.freeze({ kind: 'openai_responses' as const })
  const extension: { kind: 'openai_responses'; verbosity?: string; maxToolCalls?: number; parallelToolCalls?: boolean;
    serviceTier?: 'auto' | 'default' | 'flex' | 'priority'; reasoningMode?: 'standard' | 'pro';
    reasoningContext?: 'auto' | 'current_turn' | 'all_turns' } = { ...sourceExtension }
  const generation = { ...(requested.generation ?? {}) }
  const decisions: RequestAdaptationV2[] = []
  const decision = (path: string, outcome: RequestAdaptationV2['outcome'], reason: string, source?: unknown) => {
    decisions.push(Object.freeze({ path, outcome, reason, ...(source === undefined ? {} : { source }) }))
  }

  const requestedOff = sourceReasoning.mode === 'disabled'
  let reasoning: ReasoningIntentV2
  if (!requestedOff && modeField?.state === 'unsupported') {
    reasoning = Object.freeze({ mode: 'disabled' })
    decision('reasoning.mode', 'deferred', 'openai_reasoning_unsupported_for_model', sourceReasoning)
    if (sourceEffort !== undefined) decision('reasoning.effort', 'deferred', 'openai_reasoning_unsupported_for_model', sourceEffort)
    if (sourceEnabledReasoning?.summary !== undefined) decision('reasoning.summary', 'deferred', 'openai_reasoning_unsupported_for_model', sourceEnabledReasoning.summary)
  } else if (requestedOff && modeRequiresReasoning) {
    const legalEffort = sourceEffort !== undefined && sourceEffort !== 'none' && effortValues.includes(sourceEffort)
      ? sourceEffort : undefined
    const selectedEffort = legalEffort ?? (providerDefault !== 'none' ? providerDefault : undefined)
    reasoning = Object.freeze({ mode: 'enabled', ...(selectedEffort === undefined ? {} : { effort: selectedEffort }) })
    decision('reasoning.mode', 'converted', 'openai_reasoning_off_unavailable_for_model', sourceReasoning)
    if (sourceEffort !== selectedEffort && selectedEffort !== undefined) {
      decision('reasoning.effort', 'converted', 'openai_required_reasoning_uses_legal_effort', {
        from: sourceEffort, value: selectedEffort, source: legalEffort === undefined ? 'provider_default' : 'user_preference',
      })
    } else if (selectedEffort === undefined && sourceEffort !== undefined) {
      decision('reasoning.effort', 'deferred', 'openai_required_reasoning_effort_uses_provider_default', sourceEffort)
    }
  } else if (requestedOff && noneAllowed) {
    reasoning = Object.freeze({ mode: 'disabled', effort: 'none' })
    if (sourceEffort !== undefined && sourceEffort !== 'none') {
      decision('reasoning.effort', 'deferred', 'openai_disabled_effort_preference_encoded_as_none', sourceEffort)
    }
    decision('reasoning.mode', 'preserved', 'openai_disabled_preference_encoded_as_none')
  } else if (requestedOff && effortKnown) {
    const required = modeValues.includes('enabled') && !modeValues.includes('disabled') || !noneAllowed && modeValues.includes('enabled')
    const legalEffort = sourceEffort !== undefined && sourceEffort !== 'none' && effortValues.includes(sourceEffort)
      ? sourceEffort : undefined
    const selectedEffort = legalEffort ?? (providerDefault !== 'none' ? providerDefault : undefined)
    reasoning = Object.freeze({ mode: required ? 'enabled' : 'disabled',
      ...(required && selectedEffort !== undefined ? { effort: selectedEffort } : {}) })
    if (required) {
      decision('reasoning.mode', 'converted', 'openai_reasoning_off_unavailable_for_model', sourceReasoning)
      if (sourceEffort !== selectedEffort && selectedEffort !== undefined) {
        decision('reasoning.effort', 'converted', 'openai_required_reasoning_uses_legal_effort', {
          from: sourceEffort, value: selectedEffort, source: legalEffort === undefined ? 'provider_default' : 'user_preference',
        })
      } else if (selectedEffort === undefined && sourceEffort !== undefined) {
        decision('reasoning.effort', 'deferred', 'openai_required_reasoning_effort_uses_provider_default', sourceEffort)
      }
    } else {
      // A mode fact can allow disabled without an effort domain; the wire codec
      // still only emits `none` when the effort domain explicitly accepts it.
      decision('reasoning.mode', 'deferred', 'openai_off_preference_uses_provider_default', sourceReasoning)
      if (sourceEffort !== undefined) decision('reasoning.effort', 'deferred', 'openai_effort_domain_does_not_confirm_none', sourceEffort)
    }
  } else if (requestedOff) {
    reasoning = Object.freeze({ mode: 'disabled' })
    if (modeField?.state !== 'unsupported') {
      decision('reasoning.mode', 'deferred', 'openai_off_preference_domain_unresolved_provider_default', sourceReasoning)
    }
    if (sourceEffort !== undefined) decision('reasoning.effort', 'deferred', 'openai_effort_domain_unresolved_provider_default', sourceEffort)
  } else {
    const sourceEffortIsLegal = sourceEffort !== undefined && effortValues.includes(sourceEffort)
    if (sourceEffort === 'none' || (effortKnown && sourceEffort !== undefined && !sourceEffortIsLegal)) {
      const selectedEffort = providerDefault !== undefined && providerDefault !== 'none' ? providerDefault : undefined
      reasoning = Object.freeze({ mode: 'enabled', ...(selectedEffort === undefined ? {} : { effort: selectedEffort }),
        ...(sourceEnabledReasoning?.summary === undefined ? {} : { summary: sourceEnabledReasoning.summary }),
        ...(sourceEnabledReasoning?.exclude === undefined ? {} : { exclude: sourceEnabledReasoning.exclude }) })
      decision('reasoning.effort', 'deferred', 'openai_enabled_reasoning_uses_non_none_provider_default', sourceEffort)
    } else if (sourceEffort !== undefined && !effortKnown) {
      reasoning = Object.freeze({ mode: 'enabled',
        ...(sourceEnabledReasoning?.summary === undefined ? {} : { summary: sourceEnabledReasoning.summary }),
        ...(sourceEnabledReasoning?.exclude === undefined ? {} : { exclude: sourceEnabledReasoning.exclude }) })
      decision('reasoning.effort', 'deferred', 'openai_effort_domain_unresolved_provider_default', sourceEffort)
    } else {
      reasoning = Object.freeze({ ...sourceReasoning, ...(sourceEffort === undefined && providerDefault !== undefined ? { effort: providerDefault } : {}) })
    }
  }

  if (reasoning.mode === 'disabled') {
    if (extension.reasoningMode !== undefined) {
      decision('providerExtension.reasoningMode', 'deferred', 'openai_reasoning_mode_unavailable_when_disabled', extension.reasoningMode)
      delete extension.reasoningMode
    }
    if (extension.reasoningContext !== undefined) {
      decision('providerExtension.reasoningContext', 'deferred', 'openai_reasoning_context_unavailable_when_disabled', extension.reasoningContext)
      delete extension.reasoningContext
    }
  }

  return Object.freeze({ reasoning, providerExtension: Object.freeze(extension), generation: Object.freeze(generation),
    decisions: Object.freeze(decisions) })
}
