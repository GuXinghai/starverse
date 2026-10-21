import { canonicalSourceFactDigestV1, type CanonicalFactValueV1, type CanonicalSemanticPathV1 } from '../model-facts/canonicalSourceFactsV1'
import type { ResolvedModelFactsV1, ResolvedModelFactProvenanceV1 } from '../model-facts/resolvedModelFactsV1'
import type { SourcePriorityConfigV1 } from '../model-facts/sourcePriorityConfigV1'
import { highestPriorityFactClaimsV2 } from '../model-facts/resolveModelFactsV1'
import { projectResolvedModelFactsToRuntimeV2 } from '../capability/resolvedModelFactsRuntimeProjectionV1'
import type { ResolvedCapabilityV2 } from '../capability/resolvedCapabilityV2'
import type { BoundRequestRuleV2 } from './boundRequestRulesV2'
import { runtimeProjectionSourcePathsV1 } from '../capability/runtimeProjectionSourcePathsV1'
import { canonicalizeModelFactsV2, projectCanonicalModelFactsDraftV2 } from '../capability/canonicalModelFactsV2'
import type { PersistedModelCapabilityEvidenceV2 } from '../capability/modelCapabilitySchemaV2'

export type RequestFactOverlayV2 = Readonly<{
  fields: ResolvedCapabilityV2['modelFacts']['fields']
  evidence: ResolvedCapabilityV2['modelFacts']['evidence']
}>

/** No source publication or current Model Facts pointer is changed by this projection. */
export function projectRequestFactOverlayV2(input: Readonly<{
  base: ResolvedModelFactsV1
  capability: ResolvedCapabilityV2
  sourcePriority: SourcePriorityConfigV1
  claims: readonly BoundRequestRuleV2[]
}>): RequestFactOverlayV2 {
  const winningRules = new Map<CanonicalSemanticPathV1, readonly BoundRequestRuleV2[]>()
  const paths = new Set(input.claims.flatMap(entry => entry.definition.effect.kind === 'fact_assertion' ||
    entry.definition.effect.kind === 'fact_default' ? [entry.definition.effect.path] : []))
  const fields = input.base.fields.map(field => {
    if (!paths.has(field.path)) return field
    const candidates: { value: CanonicalFactValueV1; sourceKind: 'provider_native' | 'models_dev' | 'capability_rule';
      sourcePriority: number; selectorKind?: 'exact' | 'regex'; rulePriority?: number;
      provenance?: ResolvedModelFactProvenanceV1; rule?: BoundRequestRuleV2 }[] = []
    for (const provenance of [...field.supportingProvenance, ...field.opposingProvenance, ...field.overriddenProvenance]) {
      candidates.push({ value: provenance.sourceAssertion.value, sourceKind: provenance.sourceKind,
        sourcePriority: input.sourcePriority.priorities[provenance.sourceKind],
        selectorKind: provenance.sourceAssertion.provenance.ruleClaim?.selectorKind,
        rulePriority: provenance.sourceAssertion.provenance.ruleClaim?.effectiveRulePriority, provenance })
    }
    for (const entry of input.claims) {
      const effect = entry.definition.effect
      if ((effect.kind !== 'fact_assertion' && effect.kind !== 'fact_default') || effect.path !== field.path) continue
      if (effect.kind === 'fact_default' && field.selectedValue !== undefined) continue
      candidates.push({ value: effect.value, sourceKind: 'capability_rule',
        sourcePriority: input.sourcePriority.priorities.capability_rule, selectorKind: entry.definition.selector.kind,
        rulePriority: entry.packPriority + entry.definition.priority, rule: entry })
    }
    const winners = highestPriorityFactClaimsV2(candidates, value => value)
    const conflict = new Set(winners.map(value => canonicalSourceFactDigestV1(value.value))).size > 1
    winningRules.set(field.path, winners.flatMap(value => value.rule ? [value.rule] : []))
    return { ...field, state: conflict ? 'conflict' as const : winners.length ? 'resolved' as const : 'unknown' as const,
      selectedValue: conflict ? undefined : winners[0]?.value,
      supportingProvenance: conflict ? [] : winners.flatMap(value => value.provenance ? [value.provenance] : []),
      opposingProvenance: conflict ? winners.flatMap(value => value.provenance ? [value.provenance] : []) : [],
      overriddenProvenance: candidates.filter(value => !winners.includes(value)).flatMap(value => value.provenance ? [value.provenance] : []) }
  })
  const projected = projectResolvedModelFactsToRuntimeV2({ resolvedFacts: { ...input.base, fields }, binding: input.capability.executionContext.binding })
  const draft = projectCanonicalModelFactsDraftV2(projected)
  const evidence = new Map<string, Omit<PersistedModelCapabilityEvidenceV2, 'entryDigest'>>(draft.evidence.map(value => [value.evidenceId, value]))
  const fieldsWithEvidence = projected.fields.map(field => {
    const rules = runtimeProjectionSourcePathsV1(field.path, input.capability.executionContext.binding.operation,
      input.capability.executionContext.binding.protocolContractId.value).flatMap(path => winningRules.get(path) ?? [])
    if (!rules.length) return field
    const ruleIds = rules.map(rule => {
      const evidenceId = `request-rule.${canonicalSourceFactDigestV1({ path: field.path, rule: rule.ruleRevision })}`
      evidence.set(evidenceId, Object.freeze({ evidenceId, kind: 'capability_rule',
        effect: field.state === 'unsupported' ? 'rejects' : field.state === 'conflict' ? 'conflict'
          : field.state === 'supported' ? 'supports' : 'unknown',
        sourceRef: `${rule.ownership}:${rule.ownerId}:${rule.packId}:${rule.definition.ruleId}:${rule.ruleRevision}`,
        verifiedAt: rule.definition.evidence?.verifiedAt ?? '1970-01-01T00:00:00.000Z',
        contentDigest: canonicalSourceFactDigestV1(rule.definition) }))
      return evidenceId
    })
    const baseIds = field.evidenceIds.filter(id => !id.startsWith('goal3.unknown.'))
    return Object.freeze({ ...field, evidenceIds: Object.freeze([...new Set([...baseIds, ...ruleIds])].sort()) })
  })
  const contextual = canonicalizeModelFactsV2({ ...draft, fields: fieldsWithEvidence, evidence: [...evidence.values()] })
  return Object.freeze({ fields: contextual.fields, evidence: contextual.evidence })
}
