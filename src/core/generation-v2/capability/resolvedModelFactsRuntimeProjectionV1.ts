import {
  canonicalSourceFactDigestV1,
  type CanonicalFactValueV1,
} from '../model-facts/canonicalSourceFactsV1'
import type { ResolvedModelFactFieldV1, ResolvedModelFactsV1 } from '../model-facts/resolvedModelFactsV1'
import {
  canonicalizeModelFactsV2,
  projectCanonicalModelIdentityV2,
  type CanonicalModelFactsV2,
} from './canonicalModelFactsV2'
import {
  MODEL_CAPABILITY_SEMANTIC_PATHS_V2,
  type ModelCapabilityDomainV2,
  type ModelCapabilityEvidenceEffectV2,
  type ModelCapabilityEvidenceKindV2,
  type ModelCapabilitySemanticPathV2,
  type PersistedModelCapabilityFieldV2,
} from './modelCapabilitySchemaV2'
import type { DecodedProviderBindingRecordV2 } from '../domain/providerBindingV2'
import { runtimeProjectionRulesV1, type RuntimeProjectionRuleV1 } from './runtimeProjectionSourcePathsV1'

export class ResolvedModelFactsRuntimeProjectionV1Error extends Error {
  constructor(readonly code = 'GENERATION_V2_RESOLVED_MODEL_FACTS_RUNTIME_PROJECTION_INVALID') {
    super(code)
    this.name = 'ResolvedModelFactsRuntimeProjectionV1Error'
  }
}

type EvidenceDraft = Readonly<{
  evidenceId: string
  kind: ModelCapabilityEvidenceKindV2
  effect: ModelCapabilityEvidenceEffectV2
  sourceRef: string
  verifiedAt: string | null
  contentDigest: string
}>

type EvidenceRole = 'supporting' | 'opposing' | 'overridden'

type RuntimeProjectionRule = RuntimeProjectionRuleV1

const EPOCH = '1970-01-01T00:00:00.000Z'

function digest(value: unknown): string {
  return canonicalSourceFactDigestV1(value)
}

function provenanceFor(field: ResolvedModelFactFieldV1, role: EvidenceRole) {
  if (role === 'supporting') return field.supportingProvenance
  if (role === 'opposing') return field.opposingProvenance
  return field.overriddenProvenance
}

function evidenceFor(
  field: ResolvedModelFactFieldV1,
  role: EvidenceRole,
  effect: ModelCapabilityEvidenceEffectV2,
  evidence: Map<string, EvidenceDraft>,
): readonly string[] {
  const provenance = provenanceFor(field, role)
  if (provenance.length === 0) return Object.freeze([])
  const ids = provenance.map((item) => {
    const evidenceId = `goal3.${role}.${digest({ path: field.path, sourceKind: item.sourceKind,
      subjectFact: item.sourceFactRef.canonicalSubjectFactRevision, claim: item.sourceAssertion.provenance.claimId })}`
    if (!evidence.has(evidenceId)) evidence.set(evidenceId, Object.freeze({
      evidenceId,
      kind: item.sourceKind === 'capability_rule' ? 'capability_rule' : 'signed_provider_record',
      effect,
      sourceRef: `${item.sourceFactRef.canonicalSubjectFactRevision}:${role}`,
      verifiedAt: EPOCH,
      contentDigest: item.sourceFactRef.subjectFactPayloadDigest,
    }))
    return evidenceId
  })
  return Object.freeze([...new Set(ids)].sort())
}

function stringValues(value: CanonicalFactValueV1): readonly string[] | undefined {
  if (value.kind === 'native_string_set') return value.values
  if (value.kind === 'media_kind_set' || value.kind === 'operation_kind_set') return value.values
  if (value.kind === 'aspect_ratio_set') return value.values.map((item) => {
    // Canonical facts reduce ratios, while the image control/request preset is spelled 21:9.
    return item.width === 7 && item.height === 3 ? '21:9' : `${item.width}:${item.height}`
  })
  if (value.kind === 'native_string') return [value.value]
  return undefined
}

function domainFor(runtimePath: ModelCapabilitySemanticPathV2,
  value: CanonicalFactValueV1 | undefined): ModelCapabilityDomainV2 | undefined {
  if (!value) return undefined
  if (value.kind === 'native_string_set' || value.kind === 'media_kind_set' || value.kind === 'operation_kind_set' ||
      value.kind === 'aspect_ratio_set') {
    const values = stringValues(value)
    if (value.completeness === 'complete' && values && values.length > 0 &&
        ['reasoning.mode', 'reasoning.effort', 'image.aspectRatio', 'image.resolution', 'providerExtension.thinkingLevel',
          'providerExtension.thinkingMode'].includes(runtimePath)) {
      return { kind: 'enum', values: [...new Set(values)] }
    }
  }
  if (value.kind === 'dimensions_set' && value.completeness === 'complete') {
    return { kind: 'dimensions_enum', values: value.values }
  }
  if (value.kind === 'integer_domain' && value.completeness === 'complete' && value.interval &&
      value.interval.min !== undefined && value.interval.max !== undefined &&
      value.interval.minInclusive && value.interval.maxInclusive) {
    return { kind: 'range', min: value.interval.min, max: value.interval.max, integer: true,
      ...(value.includedValues === undefined ? {} : { includedValues: value.includedValues }), ...(value.excludedValues === undefined ? {} : {
      excludedValues: value.excludedValues,
    }) }
  }
  // Scalar defaults and one-sided maxima remain factual values. The runtime
  // schema cannot represent an open or one-sided domain without inventing a
  // boundary, so leave the field domain-less and let the downstream contract
  // enforce its own request bounds.
  return undefined
}

function defaultValue(value: CanonicalFactValueV1 | undefined): string | number | boolean | undefined {
  if (!value) return undefined
  if (value.kind === 'native_string' || value.kind === 'integer' || value.kind === 'decimal' || value.kind === 'boolean') return value.value
  return undefined
}

function stateFor(fields: readonly ResolvedModelFactFieldV1[]): PersistedModelCapabilityFieldV2['state'] {
  const selected = fields.map((field) => field.selectedValue).filter((value): value is CanonicalFactValueV1 => value !== undefined)
  if (selected.some((value) => value.kind === 'support' && value.value === 'unsupported')) return 'unsupported'
  if (fields.some((field) => field.state === 'conflict')) return 'conflict'
  if (selected.some((value) => value.kind === 'support' && value.value === 'supported') ||
      selected.some((value) => value.kind !== 'support')) return 'supported'
  return 'unknown'
}

function evidenceEffectFor(field: ResolvedModelFactFieldV1, role: EvidenceRole): ModelCapabilityEvidenceEffectV2 {
  if (field.state === 'conflict' && role === 'opposing') return 'conflict'
  if (field.state === 'conflict' && role === 'overridden') return 'unknown'
  if (role === 'supporting' && field.selectedValue?.kind === 'support' && field.selectedValue.value === 'unsupported') {
    return 'rejects'
  }
  if (role === 'supporting') return 'supports'
  if (role === 'opposing') return 'rejects'
  return 'unknown'
}

function projectedField(rule: RuntimeProjectionRule, fields: readonly ResolvedModelFactFieldV1[],
  evidence: Map<string, EvidenceDraft>): PersistedModelCapabilityFieldV2 {
  const state = stateFor(fields)
  const selectedField = fields.find((field) => field.selectedValue !== undefined)
  const selected = selectedField?.selectedValue
  const effect: ModelCapabilityEvidenceEffectV2 = state === 'supported' ? 'supports'
    : state === 'unsupported' ? 'rejects' : state === 'conflict' ? 'conflict'
      : state === 'requires_confirmation' ? 'requires_confirmation' : 'unknown'
  for (const field of fields) {
    for (const role of ['supporting', 'opposing', 'overridden'] as const) {
      evidenceFor(field, role, evidenceEffectFor(field, role), evidence)
    }
  }
  const evidenceIds = [...new Set(fields.flatMap((field) => {
    if (state === 'supported') return evidenceFor(field, 'supporting', 'supports', evidence)
    if (state === 'unsupported') {
      return field.selectedValue?.kind === 'support' && field.selectedValue.value === 'unsupported'
        ? evidenceFor(field, 'supporting', 'rejects', evidence) : []
    }
    if (state === 'conflict') {
      return field.state === 'conflict' ? evidenceFor(field, 'opposing', 'conflict', evidence) : []
    }
    if (state === 'requires_confirmation') return evidenceFor(field, 'opposing', 'requires_confirmation', evidence)
    return []
  }))].sort()
  if (evidenceIds.length === 0) {
    const evidenceId = `goal3.unknown.${digest({ path: rule.runtimePath, state })}`
    if (!evidence.has(evidenceId)) evidence.set(evidenceId, Object.freeze({
      evidenceId, kind: 'contract_invariant', effect, sourceRef: 'goal3.resolved-model-facts', verifiedAt: EPOCH,
      contentDigest: digest({ path: rule.runtimePath, state }),
    }))
    evidenceIds.push(evidenceId)
  }
  const domainField = fields.find((field) => field.selectedValue !== undefined &&
    domainFor(rule.runtimePath, field.selectedValue) !== undefined)
  let domain = state === 'unknown' || state === 'unsupported' || state === 'conflict' ? undefined
    : domainFor(rule.runtimePath, domainField?.selectedValue ?? selected) ??
      undefined
  let defaultCandidate = state === 'supported'
    ? defaultValue(fields.find((field) => field.path.endsWith('.providerDefault') ||
      field.path === 'limits.output.providerDefaultTokens')?.selectedValue)
    : undefined
  if (rule.runtimePath === 'reasoning.mode' && state === 'supported') {
    const required = fields.find(field => field.path.endsWith('thinking.required') || field.path === 'reasoning.required')?.selectedValue
    const enabled = fields.find(field => field.path.endsWith('thinking.defaultEnabled'))?.selectedValue
    const omittedBehavior = fields.find(field => field.path.endsWith('thinking.omittedBehavior'))?.selectedValue
    const acceptedTypes = fields.find(field => field.path.endsWith('thinking.acceptedTypes'))?.selectedValue
    const accepted = acceptedTypes?.kind === 'native_string_set' ? acceptedTypes.values : []
    const supportsDisabled = accepted.includes('disabled')
    if (required?.kind === 'boolean') domain = { kind: 'enum', values: required.value ? ['enabled'] : ['enabled', 'disabled'] }
    else if (acceptedTypes?.kind === 'native_string_set') domain = { kind: 'enum', values: supportsDisabled ? ['enabled', 'disabled'] : ['enabled'] }
    if (enabled?.kind === 'boolean') defaultCandidate = enabled.value ? 'enabled' : 'disabled'
    else if (required?.kind === 'boolean' && required.value) defaultCandidate = 'enabled'
    else if (omittedBehavior?.kind === 'native_string') defaultCandidate = omittedBehavior.value === 'off' ? 'disabled' : 'enabled'
    // OpenAI Responses documents its provider default as an effort value. That
    // fact establishes the default reasoning mode without treating the effort
    // string itself as a mode value.
    if (fields.some(field => field.path === 'reasoning.effort.providerDefault' && field.selectedValue !== undefined)) {
      defaultCandidate = 'enabled'
    }
  }
  const anthropicField = (suffix: string) => fields.find(field => field.path === `anthropic.messages.thinking.${suffix}`)?.selectedValue
  if (rule.runtimePath === 'providerExtension.thinkingMode' && state === 'supported') {
    const acceptedTypes = anthropicField('acceptedTypes')
    const recommendedMode = anthropicField('recommendedMode')
    if (acceptedTypes?.kind === 'native_string_set') {
      const values = ['model_recommended', 'provider_default']
      if (acceptedTypes.values.includes('adaptive')) values.push('adaptive')
      if (acceptedTypes.values.includes('enabled')) values.push('manual')
      if (acceptedTypes.values.includes('disabled')) values.push('disabled')
      domain = { kind: 'enum', values }
    }
    defaultCandidate = recommendedMode?.kind === 'native_string' ? recommendedMode.value : undefined
  }
  if (rule.runtimePath === 'providerExtension.thinkingDisplay' && state === 'supported') {
    const display = anthropicField('defaultDisplay')
    domain = { kind: 'enum', values: ['provider_default', 'summarized', 'omitted'] }
    defaultCandidate = display?.kind === 'native_string' ? display.value : undefined
  }
  if (rule.runtimePath === 'providerExtension.manualThinkingBudgetTokens' && state === 'supported') {
    const manualDomain = anthropicField('manualBudgetDomain')
    const outputMax = fields.find(field => field.path === 'limits.output.maxTokens')?.selectedValue
    if (manualDomain?.kind === 'integer_domain' && outputMax?.kind === 'integer' &&
        manualDomain.interval?.min !== undefined && manualDomain.interval.minInclusive && outputMax.value > manualDomain.interval.min) {
      const max = manualDomain.interval.max === undefined ? outputMax.value - 1
        : Math.min(manualDomain.interval.max - (manualDomain.interval.maxInclusive ? 0 : 1), outputMax.value - 1)
      if (max >= manualDomain.interval.min) domain = { kind: 'range', min: manualDomain.interval.min, max, integer: true }
    }
  }
  if (rule.runtimePath === 'providerExtension.includeThoughts' && state === 'supported') {
    domain = { kind: 'enum', values: ['provider_default', 'enabled', 'disabled'] }
    defaultCandidate = 'provider_default'
  }
  if (rule.runtimePath === 'reasoning.summary' && state === 'supported' && fields.some(field => field.path.endsWith('thinking.summaries.support'))) {
    domain = { kind: 'enum', values: ['auto'] }
    defaultCandidate = undefined
  }
  const constraints: PersistedModelCapabilityFieldV2['constraints'][number][] = []
  if (rule.runtimePath === 'reasoning.mode' && domain?.kind === 'enum' && domain.values.includes('disabled')) {
    const disabledAllowed = anthropicField('disabledAllowedEfforts')
    const effortDomain = domainFor('reasoning.effort', fields.find(field => field.path === 'reasoning.effort.nativeValues')?.selectedValue)
    if (disabledAllowed?.kind === 'native_string_set' && effortDomain?.kind === 'enum') {
      const disallowed = effortDomain.values.filter((value): value is string => typeof value === 'string' && !disabledAllowed.values.includes(value))
      if (disallowed.length > 0) constraints.push(Object.freeze({ kind: 'forbids_value', path: 'reasoning.effort',
        values: Object.freeze(disallowed), whenValues: Object.freeze(['disabled']) }))
    }
  }
  return Object.freeze({ path: rule.runtimePath, state, ...(domain ? { domain } : {}),
    ...(defaultCandidate !== undefined ? { defaultValue: defaultCandidate } : {}), constraints: Object.freeze(constraints),
    evidenceIds: Object.freeze([...new Set(evidenceIds)].sort()) })
}

/** Projects frozen Goal3 facts into the legacy controls implemented by this protocol. */
export function projectResolvedModelFactsToRuntimeV2(input: Readonly<{
  resolvedFacts: ResolvedModelFactsV1
  binding: DecodedProviderBindingRecordV2
}>): CanonicalModelFactsV2 {
  const fields = new Map(input.resolvedFacts.fields.map((field) => [field.path, field]))
  const evidence = new Map<string, EvidenceDraft>()
  // responseFormat is an OpenRouter-specific intent, not a generic structured-output switch.
  // Other protocols retain the canonical fact without claiming this encoder path.
  const rules = runtimeProjectionRulesV1(input.binding.operation, input.binding.protocolContractId.value).filter(rule =>
    rule.runtimePath !== 'providerExtension.responseFormat' || input.binding.protocolContractId.value === 'openrouter-chat-completions-v1')
  const projected = rules.map((rule) => projectedField(rule,
    rule.sourcePaths.map((path) => fields.get(path)).filter((field): field is ResolvedModelFactFieldV1 => field !== undefined), evidence))
  const projectedPaths = new Set(projected.map((field) => field.path))
  const unknownFields = MODEL_CAPABILITY_SEMANTIC_PATHS_V2
    .filter((path) => !projectedPaths.has(path))
    .map((path) => projectedField({ runtimePath: path, sourcePaths: ['reasoning.support'] }, [], evidence))
  return canonicalizeModelFactsV2({
    identity: projectCanonicalModelIdentityV2(input.binding),
    evidence: [...evidence.values()],
    fields: [...projected, ...unknownFields],
    capabilityRevision: input.resolvedFacts.capabilityRevision,
  })
}
