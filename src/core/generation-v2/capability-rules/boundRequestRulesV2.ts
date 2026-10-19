import { canonicalSourceFactDigestV1, canonicalizeCanonicalModelSubjectV1, type CanonicalModelSubjectV1 } from '../model-facts/canonicalSourceFactsV1'
import { evaluateCapabilityRuleActivationV1 } from './capabilityRuleCoreV1'
import { decodeCapabilityRuleCoreRuleV2, projectCapabilityRuleOwnershipSnapshotV2, type CapabilityRuleCoreRuleV2, type CapabilityRuleOwnershipSnapshotV2 } from './capabilityRuleCoreV2'

export type BoundRequestRuleV2 = Readonly<{
  definition: CapabilityRuleCoreRuleV2
  ruleRevision: string
  packId: string
  packPriority: number
  ownership: 'cloud' | 'user'
  ownerId: string
  snapshotRevision: string
}>
export type BoundRequestRulesV2 = Readonly<{
  schemaVersion: 2
  subject: CanonicalModelSubjectV1
  rules: readonly BoundRequestRuleV2[]
  ownerSnapshotRevisions: readonly string[]
  bundleRevision: string
}>

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) }
  return value
}
function seal(subject: CanonicalModelSubjectV1, rules: readonly BoundRequestRuleV2[], owners: readonly string[]): BoundRequestRulesV2 {
  const payload = { schemaVersion: 2 as const, subject: canonicalizeCanonicalModelSubjectV1(subject),
    rules: [...rules].sort((a, b) => `${a.ownership}/${a.ownerId}/${a.packId}/${a.definition.ruleId}`.localeCompare(
      `${b.ownership}/${b.ownerId}/${b.packId}/${b.definition.ruleId}`, 'en')),
    ownerSnapshotRevisions: [...new Set(owners)].sort() }
  return freeze({ ...payload, bundleRevision: `bound-request-rules-v2:${canonicalSourceFactDigestV1(payload)}` })
}

/** Called only during publication/materialization, never while submitting a request. */
export function bindRequestRulesToSubjectsV2(input: Readonly<{
  snapshots: readonly CapabilityRuleOwnershipSnapshotV2[]
  subjects: readonly CanonicalModelSubjectV1[]
  defaultActivationPolicies: Readonly<{ cloud: 'enabled' | 'disabled'; user: 'enabled' | 'disabled' }>
}>): readonly BoundRequestRulesV2[] {
  const owners = input.snapshots.map(projectCapabilityRuleOwnershipSnapshotV2)
  return Object.freeze(input.subjects.map(subject => {
    const rules: BoundRequestRuleV2[] = []
    for (const owner of owners) for (const pack of owner.packs) for (const entry of pack.rules) {
      const rule = entry.definition
      if (rule.providerAuthorityId !== subject.providerAuthorityId || rule.endpointProfileId !== subject.endpointProfileId) continue
      if (!evaluateCapabilityRuleActivationV1({ configured: rule.configured, mode: pack.definition.mode,
        target: pack.definition.target, defaultPolicy: input.defaultActivationPolicies[owner.definition.ownership] }).enabled) continue
      const matches = rule.selector.kind === 'exact' ? rule.selector.nativeModelIds.includes(subject.nativeModelId)
        : new RegExp(rule.selector.pattern, 'u').test(subject.nativeModelId)
      if (!matches) continue
      rules.push({ definition: rule, ruleRevision: entry.ruleRevision, packId: pack.definition.packId,
        packPriority: pack.definition.priority, ownership: owner.definition.ownership,
        ownerId: owner.definition.ownerId, snapshotRevision: owner.snapshotRevision })
    }
    assertBoundRequestRuleDecisionsV2(rules)
    return seal(subject, rules, owners.map(owner => owner.snapshotRevision))
  }))
}

/** Checks facts known at publication; conditions depending on a request remain submit-time checks. */
export function assertBoundRequestRuleDecisionsV2(rules: readonly BoundRequestRuleV2[]): void {
  const dependencies = new Map<string, Set<string>>()
  const sameConditions = new Map<string, BoundRequestRuleV2[]>()
  for (const entry of rules) {
    const rule = entry.definition
    const edges = dependencies.get(rule.decisionKey) ?? new Set<string>()
    rule.dependencies.forEach(key => edges.add(key))
    dependencies.set(rule.decisionKey, edges)
    const key = `${rule.decisionKey}\0${canonicalSourceFactDigestV1(rule.when)}`
    const group = sameConditions.get(key) ?? []
    group.push(entry); sameConditions.set(key, group)
  }
  const state = new Map<string, 'visiting' | 'visited'>()
  const visit = (key: string): void => {
    if (state.get(key) === 'visiting') throw new Error('GENERATION_V2_RULE_DEPENDENCY_CYCLE')
    if (state.has(key)) return
    state.set(key, 'visiting')
    for (const dependency of dependencies.get(key) ?? []) if (dependencies.has(dependency)) visit(dependency)
    state.set(key, 'visited')
  }
  dependencies.forEach((_, key) => visit(key))
  for (const group of sameConditions.values()) {
    const exact = group.filter(entry => entry.definition.selector.kind === 'exact')
    const tier = exact.length ? exact : group
    const priority = Math.max(...tier.map(entry => entry.packPriority + entry.definition.priority))
    const winners = tier.filter(entry => entry.packPriority + entry.definition.priority === priority)
    if (new Set(winners.map(entry => canonicalSourceFactDigestV1(entry.definition.effect))).size > 1) {
      throw new Error('GENERATION_V2_RULE_STATIC_CONFLICT')
    }
  }
}

export function emptyBoundRequestRulesV2(subject: CanonicalModelSubjectV1): BoundRequestRulesV2 { return seal(subject, [], []) }

export function decodeBoundRequestRulesV2(value: unknown): BoundRequestRulesV2 {
  const input = value as BoundRequestRulesV2
  if (!input || input.schemaVersion !== 2 || !Array.isArray(input.rules) || !Array.isArray(input.ownerSnapshotRevisions) ||
      input.rules.length > 10_000 || Object.keys(input).sort().join() !==
      ['schemaVersion', 'subject', 'rules', 'ownerSnapshotRevisions', 'bundleRevision'].sort().join()) {
    throw new Error('GENERATION_V2_BOUND_REQUEST_RULES_INVALID')
  }
  const rules = input.rules.map(entry => {
    if (!entry || !['cloud', 'user'].includes(entry.ownership) || !Number.isSafeInteger(entry.packPriority) ||
        !entry.ownerId || !entry.packId || !entry.ruleRevision || !entry.snapshotRevision) throw new Error('GENERATION_V2_BOUND_REQUEST_RULES_INVALID')
    const definition = decodeCapabilityRuleCoreRuleV2(entry.definition)
    return { ...entry, definition }
  })
  const rebuilt = seal(input.subject, rules, input.ownerSnapshotRevisions)
  if (rebuilt.bundleRevision !== input.bundleRevision) throw new Error('GENERATION_V2_BOUND_REQUEST_RULES_INVALID')
  return rebuilt
}
