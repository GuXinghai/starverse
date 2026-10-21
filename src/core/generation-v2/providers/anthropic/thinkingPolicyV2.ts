import type { ResolvedCapabilityV2 } from '../../capability/resolvedCapabilityV2'
import type { ModelCapabilityDomainV2 } from '../../capability/modelCapabilitySchemaV2'
import type { GenerationIntentLayerV2, ProviderSemanticExtensionV2, ReasoningIntentV2 } from '../../domain/generationIntentV2'
import type { RequestAdaptationV2 } from '../../compiler/requestAdaptationV2'

type AnthropicExtension = Extract<ProviderSemanticExtensionV2, { kind: 'anthropic_messages' }>
type AnthropicMode = AnthropicExtension['thinkingMode']
type RangeDomain = Extract<ModelCapabilityDomainV2, { kind: 'range' }>

function inRange(value: number, domain: RangeDomain | undefined): boolean {
  if (!Number.isSafeInteger(value) || value < 1) return false
  if (!domain) return true
  if (value < domain.min || value > domain.max) return false
  if (domain.includedValues && !domain.includedValues.includes(value)) return false
  if (domain.excludedValues?.includes(value)) return false
  return true
}

function applicationDefaultInRange(domain: RangeDomain | undefined, desired: number): number | undefined {
  if (!domain) return desired
  const minimum = Math.ceil(domain.min)
  const maximum = Math.floor(domain.max)
  if (minimum > maximum) return undefined
  const allowed = (value: number) => value >= minimum && value <= maximum && inRange(value, domain)
  if (domain.includedValues) {
    return [...domain.includedValues].filter(allowed).sort((left, right) =>
      Math.abs(left - desired) - Math.abs(right - desired) || left - right)[0]
  }
  const bounded = Math.max(minimum, Math.min(maximum, desired))
  if (allowed(bounded)) return bounded
  const exclusions = domain.excludedValues?.length ?? 0
  for (let distance = 1; distance <= exclusions + 1; distance++) {
    if (allowed(bounded - distance)) return bounded - distance
    if (allowed(bounded + distance)) return bounded + distance
  }
  if (allowed(minimum)) return minimum
  if (allowed(maximum)) return maximum
  return undefined
}

function firstLegalIntegerAtLeast(domain: RangeDomain | undefined, minimumValue: number): number | undefined {
  if (!domain) return undefined
  const minimum = Math.max(Math.ceil(domain.min), Math.ceil(minimumValue))
  const maximum = Math.floor(domain.max)
  if (minimum > maximum) return undefined
  const allowed = (value: number) => value >= minimum && value <= maximum && inRange(value, domain)
  if (domain.includedValues) return domain.includedValues.filter(allowed).sort((left, right) => left - right)[0]
  if (allowed(minimum)) return minimum
  const exclusions = domain.excludedValues?.length ?? 0
  for (let offset = 1; offset <= exclusions + 1; offset++) {
    if (allowed(minimum + offset)) return minimum + offset
  }
  return undefined
}

/** Resolves target thinking and required Messages fields from exact capability facts. */
export function resolveAnthropicRequestIntentV2(
  requested: GenerationIntentLayerV2,
  capability: ResolvedCapabilityV2,
): Readonly<{
  reasoning: ReasoningIntentV2
  providerExtension: AnthropicExtension
  generation: GenerationIntentLayerV2['generation']
  decisions: readonly RequestAdaptationV2[]
}> {
  const fields = new Map(capability.modelFacts.fields.map(field => [field.path, field]))
  const modeField = fields.get('reasoning.mode')
  const extensionModeField = fields.get('providerExtension.thinkingMode')
  const displayField = fields.get('providerExtension.thinkingDisplay')
  const budgetField = fields.get('providerExtension.manualThinkingBudgetTokens')
  const effortField = fields.get('reasoning.effort')
  const maxOutputField = fields.get('generation.maxOutputTokens')
  const sourceExtension = requested.providerExtension?.kind === 'anthropic_messages'
    ? requested.providerExtension : undefined
  const requestedMode = sourceExtension?.thinkingMode ?? 'model_recommended'
  const requestedDisplay = sourceExtension?.thinkingDisplay ?? 'provider_default'
  const modeValues = modeField?.state === 'supported' && modeField.domain?.kind === 'enum'
    ? modeField.domain.values : []
  const extensionModeValues = extensionModeField?.state === 'supported' && extensionModeField.domain?.kind === 'enum'
    ? extensionModeField.domain.values : []
  const displayValues = displayField?.state === 'supported' && displayField.domain?.kind === 'enum'
    ? displayField.domain.values : []
  const budgetDomain = budgetField?.state === 'supported' && budgetField.domain?.kind === 'range'
    ? budgetField.domain : undefined
  const outputDomain = maxOutputField?.state === 'supported' && maxOutputField.domain?.kind === 'range'
    ? maxOutputField.domain : undefined
  const requestedEffort = requested.reasoning?.effort
  const effectiveEffort = requestedEffort ?? effortField?.defaultValue
  const disabledEffortConstraint = modeField?.constraints.find(constraint => constraint.path === 'reasoning.effort' &&
    (constraint.whenValues === undefined || constraint.whenValues.includes('disabled')))
  const disabledEffortValues = disabledEffortConstraint?.values ?? []
  const disabledAllowed = modeValues.includes('disabled') &&
    (effectiveEffort === undefined || !disabledEffortValues.includes(effectiveEffort))
  const decisions: RequestAdaptationV2[] = []
  const decision = (path: string, outcome: RequestAdaptationV2['outcome'], reason: string, source?: unknown) => {
    decisions.push(Object.freeze({ path, outcome, reason, ...(source === undefined ? {} : { source }) }))
  }

  const generation = { ...(requested.generation ?? {}) }
  const requestedMaxOutput = generation.maxOutputTokens
  const providerDefaultMaxOutput = maxOutputField?.state === 'supported' && typeof maxOutputField.defaultValue === 'number' &&
    inRange(maxOutputField.defaultValue, outputDomain) ? maxOutputField.defaultValue : undefined
  if (requestedMaxOutput === undefined || !inRange(requestedMaxOutput, outputDomain)) {
    const appFallback = applicationDefaultInRange(outputDomain, 4_096)
    const effectiveMaxOutput = providerDefaultMaxOutput ?? appFallback
    if (effectiveMaxOutput !== undefined) {
      generation.maxOutputTokens = effectiveMaxOutput
      const source = providerDefaultMaxOutput !== undefined
        ? { value: effectiveMaxOutput, source: 'provider_default' }
        : { value: effectiveMaxOutput, source: 'application_default' }
      decision('generation.maxOutputTokens', 'converted', requestedMaxOutput === undefined
        ? 'anthropic_required_max_tokens_default' : 'anthropic_max_tokens_outside_capability_domain', source)
    }
  }

  const extensionModeSupported = (mode: string) => extensionModeValues.includes(mode)
  const hasDocumentedProviderDefault = extensionModeSupported('provider_default') &&
    modeField?.state === 'supported' && (modeField.defaultValue === 'enabled' || modeField.defaultValue === 'disabled')
  const documentedRecommendation = extensionModeField?.state === 'supported' && extensionModeField.defaultValue
  const chooseEnabledMode = (): AnthropicMode => {
    if (requestedMode === 'manual' && extensionModeSupported('manual')) return 'manual'
    if (requestedMode === 'adaptive' && extensionModeSupported('adaptive')) return 'adaptive'
    if (requestedMode === 'provider_default' && hasDocumentedProviderDefault) return 'provider_default'
    if (requestedMode === 'model_recommended') {
      if (documentedRecommendation === 'manual' && extensionModeSupported('manual')) return 'manual'
      if (documentedRecommendation === 'adaptive' && extensionModeSupported('adaptive')) return 'adaptive'
      if (documentedRecommendation === 'provider_default' && hasDocumentedProviderDefault) return 'provider_default'
    }
    if (extensionModeField?.defaultValue === 'manual' && extensionModeSupported('manual')) return 'manual'
    if (extensionModeField?.defaultValue === 'adaptive' && extensionModeSupported('adaptive')) return 'adaptive'
    if (hasDocumentedProviderDefault) return 'provider_default'
    if (extensionModeSupported('adaptive')) return 'adaptive'
    if (extensionModeSupported('manual')) return 'manual'
    // Unknown models must use an omitted provider default with an explicit deferred decision.
    return 'provider_default'
  }

  const userRequestedOff = requested.reasoning?.mode === 'disabled' || requestedMode === 'disabled'
  const mustRemainEnabled = modeValues.includes('enabled') && !disabledAllowed
  if (userRequestedOff && disabledAllowed) {
    if (requestedMode !== 'disabled' || requested.reasoning?.mode !== 'disabled') {
      decision('reasoning.mode', 'preserved', 'anthropic_user_preference_disabled')
    }
    if (requestedDisplay !== 'provider_default') {
      decision('providerExtension.thinkingDisplay', 'deferred', 'anthropic_display_unavailable_when_disabled', requestedDisplay)
    }
    if (requestedEffort !== undefined) {
      decision('reasoning.effort', 'deferred', 'anthropic_effort_preference_omitted_when_disabled', requestedEffort)
    }
    return Object.freeze({
      reasoning: Object.freeze({ mode: 'disabled' }),
      providerExtension: Object.freeze({ kind: 'anthropic_messages', thinkingMode: 'disabled', thinkingDisplay: 'provider_default' }),
      generation: Object.freeze(generation),
      decisions: Object.freeze(decisions),
    })
  }

  const enabledMode = chooseEnabledMode()
  if (userRequestedOff) {
    decision('reasoning.mode', 'deferred', mustRemainEnabled
      ? disabledEffortValues.includes(effectiveEffort ?? '')
        ? 'anthropic_disabled_unavailable_for_effort' : 'anthropic_thinking_required_by_model'
      : 'anthropic_off_preference_not_proven_for_model', effectiveEffort)
  }
  if (requestedMode !== enabledMode) {
    decision('providerExtension.thinkingMode', userRequestedOff ? 'deferred' : 'converted',
      extensionModeField?.state === 'supported'
        ? userRequestedOff ? 'anthropic_required_thinking_mode' : 'anthropic_supported_thinking_mode'
        : 'anthropic_thinking_mode_unresolved', requestedMode)
  }
  if (extensionModeField?.state !== 'supported' || modeField?.state !== 'supported') {
    decision('providerExtension.thinkingMode', 'deferred', 'anthropic_thinking_mode_unresolved', requestedMode)
  }

  let effectiveMode = enabledMode
  let manualThinkingBudgetTokens: number | undefined
  if (effectiveMode === 'manual') {
    const requestedBudget = sourceExtension?.thinkingMode === 'manual' ? sourceExtension.manualThinkingBudgetTokens : undefined
    const legalBudgetCandidate = requestedBudget !== undefined && inRange(requestedBudget, budgetDomain) &&
      requestedBudget >= (budgetDomain?.min ?? 1_024)
      ? requestedBudget : applicationDefaultInRange(budgetDomain, 1_024)
    const outputLimit = generation.maxOutputTokens
    if (legalBudgetCandidate !== undefined && outputLimit !== undefined && legalBudgetCandidate >= outputLimit) {
      const raisedOutputLimit = firstLegalIntegerAtLeast(outputDomain, legalBudgetCandidate + 1)
      if (raisedOutputLimit !== undefined && raisedOutputLimit > outputLimit) {
        generation.maxOutputTokens = raisedOutputLimit
        decision('generation.maxOutputTokens', 'converted', 'anthropic_max_tokens_raised_for_manual_thinking', {
          from: outputLimit, value: raisedOutputLimit, source: 'capability_adjustment',
        })
      }
    }
    const effectiveOutputLimit = generation.maxOutputTokens
    const budget = legalBudgetCandidate !== undefined &&
      (effectiveOutputLimit === undefined || legalBudgetCandidate < effectiveOutputLimit) ? legalBudgetCandidate : undefined
    if (budget === undefined) {
      effectiveMode = extensionModeSupported('adaptive') ? 'adaptive' : 'provider_default'
      decision('providerExtension.thinkingMode', 'deferred', 'anthropic_manual_budget_not_representable', requestedMode)
    } else {
      manualThinkingBudgetTokens = budget
      if (requestedBudget !== budget) {
        decision('providerExtension.manualThinkingBudgetTokens', 'converted', 'anthropic_application_manual_budget_default',
          { value: budget, source: requestedBudget === undefined ? 'application_default' : 'capability_bounded_application_default' })
      }
    }
  }

  let thinkingDisplay: AnthropicExtension['thinkingDisplay'] = 'provider_default'
  if (requestedDisplay !== 'provider_default') {
    if (displayValues.includes(requestedDisplay) && (effectiveMode === 'adaptive' || effectiveMode === 'manual')) {
      thinkingDisplay = requestedDisplay
    } else {
      decision('providerExtension.thinkingDisplay', 'deferred', 'anthropic_display_not_representable', requestedDisplay)
    }
  }
  if (requestedDisplay === 'provider_default' && displayField?.state !== 'supported') {
    decision('providerExtension.thinkingDisplay', 'deferred', 'anthropic_display_default_unresolved')
  }
  if (requested.reasoning?.mode === 'enabled' && requested.reasoning.summary !== undefined) {
    decision('reasoning.summary', 'deferred', 'anthropic_reasoning_summary_not_encodable', requested.reasoning.summary)
  }
  if (requested.reasoning?.mode === 'enabled' && requested.reasoning.exclude !== undefined) {
    decision('reasoning.exclude', 'deferred', 'anthropic_reasoning_exclude_not_encodable', requested.reasoning.exclude)
  }
  if (effectiveMode === 'manual' && manualThinkingBudgetTokens === undefined) {
    effectiveMode = extensionModeSupported('adaptive') ? 'adaptive' : 'provider_default'
    decision('providerExtension.thinkingMode', 'deferred', 'anthropic_manual_budget_not_representable', requestedMode)
  }

  const reasoning: ReasoningIntentV2 = effectiveMode === 'provider_default' && hasDocumentedProviderDefault &&
    modeField?.defaultValue === 'disabled'
    ? Object.freeze({ mode: 'disabled' })
    : Object.freeze({ mode: 'enabled', ...(requestedEffort === undefined ? {} : { effort: requestedEffort }) })
  if (requested.reasoning?.mode === 'enabled' && reasoning.mode === 'disabled') {
    decision('reasoning.mode', 'deferred', 'anthropic_requested_on_not_representable_provider_default_off', requestedMode)
  }
  let providerExtension: AnthropicExtension
  if (effectiveMode === 'manual') {
    providerExtension = Object.freeze({ kind: 'anthropic_messages', thinkingMode: 'manual', thinkingDisplay,
      manualThinkingBudgetTokens: manualThinkingBudgetTokens! })
  } else {
    providerExtension = Object.freeze({ kind: 'anthropic_messages', thinkingMode: effectiveMode as Exclude<AnthropicMode, 'manual'>,
      thinkingDisplay })
  }
  return Object.freeze({ reasoning, providerExtension, generation: Object.freeze(generation), decisions: Object.freeze(decisions) })
}
