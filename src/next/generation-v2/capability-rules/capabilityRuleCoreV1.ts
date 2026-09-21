import {
  canonicalSourceFactDigestV1,
  canonicalizeCanonicalFactValueV1,
  isCanonicalSemanticPathV1,
  type CanonicalFactValueV1,
  type CanonicalSemanticPathV1,
} from '../model-facts/canonicalSourceFactsV1'

export const CAPABILITY_RULE_PRIORITY_MIN_V1 = -1_000_000 as const
export const CAPABILITY_RULE_PRIORITY_MAX_V1 = 1_000_000 as const

export const CAPABILITY_RULE_CORE_SCHEMA_DIGEST_V1 = canonicalSourceFactDigestV1({
  schemaVersion: 1,
  ownership: ['cloud', 'user'],
  configured: ['default', 'on', 'off'],
  packMode: ['override', 'default_only', 'no_control'],
  packTarget: ['enabled', 'disabled'],
  priority: { min: CAPABILITY_RULE_PRIORITY_MIN_V1, max: CAPABILITY_RULE_PRIORITY_MAX_V1 },
  selector: ['exact', 'regex'],
  assertion: 'canonical-model-fact-path-and-value-v1',
  evidence: 'reviewed-evidence-with-optional-registered-derivation-v1',
})

export type CapabilityRuleOwnershipV1 = 'cloud' | 'user'
export type CapabilityRuleConfiguredStateV1 = 'default' | 'on' | 'off'
export type CapabilityRulePackModeV1 = 'override' | 'default_only' | 'no_control'
export type CapabilityRulePackTargetV1 = 'enabled' | 'disabled'
export type CapabilityRuleDefaultActivationPolicyV1 = 'enabled' | 'disabled'

export type CapabilityRuleSelectorV1 = Readonly<{
  kind: 'exact'
  nativeModelIds: readonly string[]
}> | Readonly<{
  kind: 'regex'
  pattern: string
  positiveExamples: readonly string[]
  negativeExamples: readonly string[]
}>

export type CapabilityRuleDerivationV1 = Readonly<{
  derivationId: string
  derivationRevision: string
  inputClaimRefs: readonly string[]
  inputEvidenceRefs: readonly string[]
}>

export type CapabilityRuleEvidenceV1 = Readonly<{
  evidenceSourceRef: string
  evidenceKind: 'explicit_provider' | 'explicit_provider_series' | 'derived_empirical'
  evidenceNote: string
  identityEvidenceKind: 'provider_archive' | 'official_exact_model_doc' | 'derived_selector'
  identityEvidenceSourceRef: string
  provenanceUrl: string | null
  verifiedAt: string
  derivation: CapabilityRuleDerivationV1 | null
}>

export type CapabilityRuleAssertionV1 = Readonly<{
  path: CanonicalSemanticPathV1
  value: CanonicalFactValueV1
}>

export type CapabilityRuleCoreRuleV1 = Readonly<{
  ruleId: string
  label: string | null
  description: string | null
  priority: number
  configured: CapabilityRuleConfiguredStateV1
  providerAuthorityId: string
  endpointProfileId: string
  selector: CapabilityRuleSelectorV1
  assertion: CapabilityRuleAssertionV1
  evidence: CapabilityRuleEvidenceV1 | null
}>

export type CapabilityRuleCorePackV1 = Readonly<{
  schemaVersion: 1
  packId: string
  displayName: string
  description: string | null
  priority: number
  mode: CapabilityRulePackModeV1
  target: CapabilityRulePackTargetV1
  rules: readonly CapabilityRuleCoreRuleV1[]
}>

export type CapabilityRuleOwnershipSnapshotV1 = Readonly<{
  schemaVersion: 1
  ownership: CapabilityRuleOwnershipV1
  ownerId: string
  packs: readonly CapabilityRuleCorePackV1[]
}>

export type ProjectedCapabilityRuleCoreRuleV1 = Readonly<{
  definition: CapabilityRuleCoreRuleV1
  contentDigest: string
  ruleRevision: string
}>

export type ProjectedCapabilityRuleCorePackV1 = Readonly<{
  definition: CapabilityRuleCorePackV1
  contentDigest: string
  packRevision: string
  rules: readonly ProjectedCapabilityRuleCoreRuleV1[]
}>

export type ProjectedCapabilityRuleOwnershipSnapshotV1 = Readonly<{
  definition: CapabilityRuleOwnershipSnapshotV1
  contentDigest: string
  snapshotRevision: string
  packs: readonly ProjectedCapabilityRuleCorePackV1[]
}>

export type CapabilityRuleEffectiveActivationV1 = Readonly<{
  enabled: boolean
  source: 'rule_explicit' | 'pack_override' | 'pack_default_only' | 'ownership_default_policy'
}>

export type CapabilityRuleRewritePlanV1 = Readonly<{
  available: boolean
  configured: Exclude<CapabilityRuleConfiguredStateV1, 'default'> | null
  selectedRuleIds: readonly string[]
  changedRules: readonly Readonly<{
    ruleId: string
    configured: Exclude<CapabilityRuleConfiguredStateV1, 'default'>
  }>[]
}>

export class CapabilityRuleCoreV1Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_CAPABILITY_RULE_CORE_INVALID'
    | 'GENERATION_V2_CAPABILITY_RULE_REWRITE_UNAVAILABLE') {
    super(code)
    this.name = 'CapabilityRuleCoreV1Error'
  }
}

function invalid(): never {
  throw new CapabilityRuleCoreV1Error('GENERATION_V2_CAPABILITY_RULE_CORE_INVALID')
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

function codePointCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function sortedUnique(values: unknown, maximum: number): readonly string[] {
  if (!Array.isArray(values) || values.length < 1 || values.length > maximum) invalid()
  const decoded = values.map(identityValue).sort(codePointCompare)
  if (new Set(decoded).size !== decoded.length) invalid()
  return Object.freeze(decoded)
}

function decodeSelector(value: unknown): CapabilityRuleSelectorV1 {
  if (!plainObject(value) || (value.kind !== 'exact' && value.kind !== 'regex')) invalid()
  if (value.kind === 'exact') {
    exactKeys(value, ['kind', 'nativeModelIds'])
    return Object.freeze({ kind: 'exact' as const, nativeModelIds: sortedUnique(value.nativeModelIds, 256) })
  }
  exactKeys(value, ['kind', 'pattern', 'positiveExamples', 'negativeExamples'])
  const pattern = boundedText(value.pattern, 256)!
  if (!pattern.startsWith('^') || !pattern.endsWith('$') ||
      /\.\*|\.\+|\\[1-9]|\(\?[=!<]/u.test(pattern) ||
      /(?:^|[^\\])[+*]/u.test(pattern) || /(?:^|[^\\(])\?/u.test(pattern) ||
      /\{\d+,/u.test(pattern) || /\)[{+*?]/u.test(pattern)) invalid()
  const groupStarts = [...pattern.matchAll(/\(/gu)]
  const groupEnds = [...pattern.matchAll(/\)/gu)]
  const pipes = [...pattern.matchAll(/\|/gu)]
  if (groupStarts.length > 1 || groupEnds.length > 1 || groupStarts.length !== groupEnds.length) invalid()
  if (groupStarts.length === 0) {
    if (pipes.length !== 0) invalid()
  } else {
    const start = groupStarts[0]!.index
    const end = groupEnds[0]!.index
    if (start === undefined || end === undefined || pattern.slice(start, start + 3) !== '(?:' ||
        end <= start + 3 || pipes.length < 1 || pipes.length > 15 ||
        pipes.some((entry) => entry.index <= start + 2 || entry.index >= end)) invalid()
    const alternatives = pattern.slice(start + 3, end).split('|')
    if (alternatives.some((entry) => entry.length < 1 || entry.length > 64)) invalid()
  }
  for (const match of pattern.matchAll(/\{(\d+)\}/gu)) {
    const count = Number(match[1])
    if (count < 1 || count > 32) invalid()
  }
  let compiled: RegExp
  try {
    compiled = new RegExp(pattern, 'u')
  } catch {
    return invalid()
  }
  const positiveExamples = sortedUnique(value.positiveExamples, 64)
  const negativeExamples = sortedUnique(value.negativeExamples, 64)
  if (positiveExamples.some((example) => !compiled.test(example)) ||
      negativeExamples.some((example) => compiled.test(example))) invalid()
  return Object.freeze({ kind: 'regex' as const, pattern,
    positiveExamples, negativeExamples })
}

function optionalStringList(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length > 256) invalid()
  const decoded = value.map(identifier).sort(codePointCompare)
  if (new Set(decoded).size !== decoded.length) invalid()
  return Object.freeze(decoded)
}

function decodeDerivation(value: unknown): CapabilityRuleDerivationV1 | null {
  if (value === null) return null
  if (!plainObject(value)) invalid()
  exactKeys(value, ['derivationId', 'derivationRevision', 'inputClaimRefs', 'inputEvidenceRefs'])
  return Object.freeze({ derivationId: identifier(value.derivationId),
    derivationRevision: identifier(value.derivationRevision),
    inputClaimRefs: optionalStringList(value.inputClaimRefs),
    inputEvidenceRefs: optionalStringList(value.inputEvidenceRefs) })
}

function decodeEvidence(value: unknown): CapabilityRuleEvidenceV1 | null {
  if (value === null) return null
  if (!plainObject(value)) invalid()
  exactKeys(value, ['evidenceSourceRef', 'evidenceKind', 'evidenceNote', 'identityEvidenceKind',
    'identityEvidenceSourceRef', 'provenanceUrl', 'verifiedAt', 'derivation'])
  if (value.evidenceKind !== 'explicit_provider' && value.evidenceKind !== 'explicit_provider_series' &&
      value.evidenceKind !== 'derived_empirical') invalid()
  if (value.identityEvidenceKind !== 'provider_archive' &&
      value.identityEvidenceKind !== 'official_exact_model_doc' &&
      value.identityEvidenceKind !== 'derived_selector') invalid()
  const provenanceUrl = value.provenanceUrl === null ? null : boundedText(value.provenanceUrl, 2048)
  if (provenanceUrl !== null && !provenanceUrl.startsWith('https://')) invalid()
  const verifiedAt = boundedText(value.verifiedAt, 64)!
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(verifiedAt) ||
      !Number.isFinite(Date.parse(verifiedAt))) invalid()
  const derivation = decodeDerivation(value.derivation)
  if ((value.evidenceKind === 'derived_empirical') !== (derivation !== null)) invalid()
  if (derivation !== null && derivation.inputClaimRefs.length === 0 &&
      derivation.inputEvidenceRefs.length === 0) invalid()
  return Object.freeze({
    evidenceSourceRef: identifier(value.evidenceSourceRef),
    evidenceKind: value.evidenceKind,
    evidenceNote: boundedText(value.evidenceNote, 2048)!,
    identityEvidenceKind: value.identityEvidenceKind,
    identityEvidenceSourceRef: identifier(value.identityEvidenceSourceRef),
    provenanceUrl,
    verifiedAt,
    derivation,
  })
}

function decodeAssertion(value: unknown): CapabilityRuleAssertionV1 {
  if (!plainObject(value)) invalid()
  exactKeys(value, ['path', 'value'])
  if (!isCanonicalSemanticPathV1(value.path)) invalid()
  return Object.freeze({ path: value.path,
    value: canonicalizeCanonicalFactValueV1(value.path, value.value) })
}

export function decodeCapabilityRuleCoreRuleV1(value: unknown): CapabilityRuleCoreRuleV1 {
  if (!plainObject(value)) invalid()
  exactKeys(value, ['ruleId', 'label', 'description', 'priority', 'configured', 'providerAuthorityId',
    'endpointProfileId', 'selector', 'assertion', 'evidence'])
  if (value.configured !== 'default' && value.configured !== 'on' && value.configured !== 'off') invalid()
  return Object.freeze({
    ruleId: identifier(value.ruleId),
    label: boundedText(value.label, 256, true),
    description: boundedText(value.description, 4096, true),
    priority: priority(value.priority),
    configured: value.configured,
    providerAuthorityId: identifier(value.providerAuthorityId),
    endpointProfileId: identityValue(value.endpointProfileId),
    selector: decodeSelector(value.selector),
    assertion: decodeAssertion(value.assertion),
    evidence: decodeEvidence(value.evidence),
  })
}

export function decodeCapabilityRuleCorePackV1(value: unknown): CapabilityRuleCorePackV1 {
  if (!plainObject(value)) invalid()
  exactKeys(value, ['schemaVersion', 'packId', 'displayName', 'description',
    'priority', 'mode', 'target', 'rules'])
  if (value.schemaVersion !== 1 ||
      (value.mode !== 'override' && value.mode !== 'default_only' && value.mode !== 'no_control') ||
      (value.target !== 'enabled' && value.target !== 'disabled') || !Array.isArray(value.rules) ||
      value.rules.length > 100_000) invalid()
  const rules = value.rules.map(decodeCapabilityRuleCoreRuleV1)
    .sort((left, right) => codePointCompare(left.ruleId, right.ruleId))
  if (new Set(rules.map((rule) => rule.ruleId)).size !== rules.length) invalid()
  return Object.freeze({ schemaVersion: 1 as const, packId: identifier(value.packId),
    displayName: boundedText(value.displayName, 256)!, description: boundedText(value.description, 4096, true),
    priority: priority(value.priority), mode: value.mode, target: value.target,
    rules: Object.freeze(rules) })
}

function ruleRevisionPayload(
  pack: Pick<CapabilityRuleCorePackV1, 'packId'>,
  rule: CapabilityRuleCoreRuleV1,
): Readonly<Record<string, unknown>> {
  return Object.freeze({ packId: pack.packId, ...rule })
}

export function projectCapabilityRuleCorePackV1(value: unknown): ProjectedCapabilityRuleCorePackV1 {
  const definition = decodeCapabilityRuleCorePackV1(value)
  const rules = Object.freeze(definition.rules.map((rule) => {
    const contentDigest = canonicalSourceFactDigestV1(ruleRevisionPayload(definition, rule))
    return Object.freeze({ definition: rule, contentDigest,
      ruleRevision: `capability-rule-core-v1:${contentDigest}` })
  }))
  const packPayload = Object.freeze({ ...definition,
    rules: rules.map((rule) => Object.freeze({ ruleId: rule.definition.ruleId,
      ruleRevision: rule.ruleRevision })) })
  const contentDigest = canonicalSourceFactDigestV1(packPayload)
  return Object.freeze({ definition, contentDigest,
    packRevision: `capability-rule-pack-core-v1:${contentDigest}`, rules })
}

export function decodeCapabilityRuleOwnershipSnapshotV1(value: unknown): CapabilityRuleOwnershipSnapshotV1 {
  if (!plainObject(value)) invalid()
  exactKeys(value, ['schemaVersion', 'ownership', 'ownerId', 'packs'])
  if (value.schemaVersion !== 1 || (value.ownership !== 'cloud' && value.ownership !== 'user') ||
      !Array.isArray(value.packs) || value.packs.length > 10_000) invalid()
  const packs = value.packs.map(decodeCapabilityRuleCorePackV1)
    .sort((left, right) => codePointCompare(left.packId, right.packId))
  if (new Set(packs.map((pack) => pack.packId)).size !== packs.length) invalid()
  const ruleIds = packs.flatMap((pack) => pack.rules.map((rule) => rule.ruleId))
  if (new Set(ruleIds).size !== ruleIds.length) invalid()
  return Object.freeze({ schemaVersion: 1 as const, ownership: value.ownership,
    ownerId: identifier(value.ownerId), packs: Object.freeze(packs) })
}

export function projectCapabilityRuleOwnershipSnapshotV1(
  value: unknown,
): ProjectedCapabilityRuleOwnershipSnapshotV1 {
  const definition = decodeCapabilityRuleOwnershipSnapshotV1(value)
  const packs = Object.freeze(definition.packs.map(projectCapabilityRuleCorePackV1))
  const payload = Object.freeze({ schemaVersion: 1 as const, ownership: definition.ownership,
    ownerId: definition.ownerId,
    packs: packs.map((pack) => Object.freeze({ packId: pack.definition.packId,
      packRevision: pack.packRevision })) })
  const contentDigest = canonicalSourceFactDigestV1(payload)
  return Object.freeze({ definition, contentDigest,
    snapshotRevision: `capability-rule-owner-snapshot-v1:${contentDigest}`, packs })
}

export function evaluateCapabilityRuleActivationV1(input: Readonly<{
  mode: CapabilityRulePackModeV1
  target: CapabilityRulePackTargetV1
  configured: CapabilityRuleConfiguredStateV1
  defaultPolicy: CapabilityRuleDefaultActivationPolicyV1
}>): CapabilityRuleEffectiveActivationV1 {
  if (input.mode === 'override') {
    return Object.freeze({ enabled: input.target === 'enabled', source: 'pack_override' as const })
  }
  if (input.configured !== 'default') {
    return Object.freeze({ enabled: input.configured === 'on', source: 'rule_explicit' as const })
  }
  if (input.mode === 'default_only') {
    return Object.freeze({ enabled: input.target === 'enabled', source: 'pack_default_only' as const })
  }
  return Object.freeze({ enabled: input.defaultPolicy === 'enabled', source: 'ownership_default_policy' as const })
}

export function planCapabilityRuleRewriteV1(input: Readonly<{
  mode: CapabilityRulePackModeV1
  target: CapabilityRulePackTargetV1
  rules: readonly Pick<CapabilityRuleCoreRuleV1, 'ruleId' | 'configured'>[]
}>): CapabilityRuleRewritePlanV1 {
  if (input.mode === 'no_control') {
    return Object.freeze({ available: false, configured: null,
      selectedRuleIds: Object.freeze([]), changedRules: Object.freeze([]) })
  }
  const configured = input.target === 'enabled' ? 'on' as const : 'off' as const
  const selected = input.rules.filter((rule) => input.mode === 'override' || rule.configured === 'default')
    .sort((left, right) => codePointCompare(left.ruleId, right.ruleId))
  if (new Set(selected.map((rule) => rule.ruleId)).size !== selected.length) invalid()
  return Object.freeze({ available: true, configured,
    selectedRuleIds: Object.freeze(selected.map((rule) => rule.ruleId)),
    changedRules: Object.freeze(selected.filter((rule) => rule.configured !== configured)
      .map((rule) => Object.freeze({ ruleId: rule.ruleId, configured }))) })
}

export function assertCapabilityRuleRewriteAvailableV1(plan: CapabilityRuleRewritePlanV1): void {
  if (!plan.available) {
    throw new CapabilityRuleCoreV1Error('GENERATION_V2_CAPABILITY_RULE_REWRITE_UNAVAILABLE')
  }
}
