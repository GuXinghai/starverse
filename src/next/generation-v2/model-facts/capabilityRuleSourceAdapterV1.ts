import type {
  CapabilityRuleDefinitionV2,
  CapabilityRuleIdentityV2,
  PersistedCapabilityRuleV2,
} from '../capability-rules/capabilityRuleV2'
import {
  decodeCapabilityRuleDefinitionV2,
  matchesCapabilityRuleIdentityV2,
  projectCapabilityRulePackContentV2,
} from '../capability-rules/capabilityRuleV2'
import {
  canonicalSourceFactDigestV1,
  type CanonicalFactValueV1,
  type CanonicalModelSubjectV1,
  type CanonicalSemanticPathV1,
  type CanonicalSourceRevisionRefV1,
  type CanonicalSubjectFactCandidateV1,
  type RawSourceSnapshotRefV1,
  type RuleClaimContextV1,
  type SourceFieldRefV1,
} from './canonicalSourceFactsV1'
import { PROVIDER_AUTHORITY_REGISTRY_ENTRIES_V1 } from './providerAuthorityRegistryV1'
import {
  buildExplicitAssertionV1,
  buildObservationProvenanceV1,
  invalidOutcomeV1,
  presentOutcomeV1,
  type CanonicalModelFactSourceAdapterV1,
} from './sourceAdapterV1'
import { CAPABILITY_RULE_COVERAGE_MANIFEST_V1 } from './sourceCoverageManifestV1'
import type { RawPayloadReaderV1 } from './rawSourceSnapshotV1'

export const CAPABILITY_RULE_PRIORITY_SEMANTICS_REVISION_V1 =
  'capability-rule-priority-v1:rule-only-neutral-pack' as const

export const CAPABILITY_RULE_SOURCE_ADAPTER_REVISION_V1 =
  `capability-rule-source-adapter-v1:${canonicalSourceFactDigestV1({
    ontologyRevision: 1,
    prioritySemanticsRevision: CAPABILITY_RULE_PRIORITY_SEMANTICS_REVISION_V1,
    mappings: [
      'reasoning.mode->reasoning.support',
      'reasoning.effort->reasoning.effort.nativeValues',
      'reasoning.effort.defaultValue->reasoning.effort.providerDefault',
      'anthropic:reasoning.effort->generation.effort.nativeValues',
      'anthropic:reasoning.effort.defaultValue->generation.effort.providerDefault',
      'image.mode->image.generation.support',
      'image.aspectRatio->image.generation.aspectRatios',
      'image.resolution->image.generation.resolutionPresets.nativeValues',
      'image.resolution.defaultValue->image.generation.resolutionPreset.providerDefault',
      'web.mode->search.web.support',
      'web.types->search.web.support+search.image.support',
    ],
    boundaryPolicy: 'reject-execution-state-constraints-and-unregistered-derived',
  })}` as const

export type FrozenCapabilityRuleSourceV1 = Readonly<{
  rawSourceSnapshotRevision: string
  rulesDigest: string
  listMatchingRulesForIdentity(identity: CapabilityRuleIdentityV2): readonly MatchedCapabilityRuleSourceClaimV1[]
}>

export type CapabilityRuleSourcePackPriorityV1 = Readonly<{
  ownerKind: 'built_in' | 'user'
  ownerId: string
  packId: string
  packPriority: number
}>

export type CapabilityRuleSourceSnapshotV1 = Readonly<{
  schemaVersion: 1
  prioritySemanticsRevision: typeof CAPABILITY_RULE_PRIORITY_SEMANTICS_REVISION_V1
  packPriorities: readonly CapabilityRuleSourcePackPriorityV1[]
  rules: readonly PersistedCapabilityRuleV2[]
}>

type MatchedCapabilityRuleSourceClaimV1 = Readonly<{
  rule: PersistedCapabilityRuleV2
  packPriority: number
  effectiveRulePriority: number
}>

const RULE_DEFINITION_KEYS = Object.freeze([
  'ruleId', 'providerId', 'endpointProfileId', 'selector', 'semanticPath', 'state', 'constraints',
  'priority', 'enabled', 'evidenceSourceRef', 'evidenceKind', 'evidenceNote', 'identityEvidenceKind',
  'identityEvidenceSourceRef', 'provenanceUrl', 'verifiedAt',
] as const)
const RULE_PERSISTED_KEYS = Object.freeze([
  'ownerKind', 'ownerId', 'packId', 'packVersion', 'packRevision', 'packEnabled', 'ruleRevision', 'contentDigest',
] as const)

function plainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null))
}

function definitionFromPersistedRuleV1(rule: PersistedCapabilityRuleV2): CapabilityRuleDefinitionV2 {
  return decodeCapabilityRuleDefinitionV2({
    ruleId: rule.ruleId, providerId: rule.providerId, endpointProfileId: rule.endpointProfileId,
    selector: rule.selector, semanticPath: rule.semanticPath, state: rule.state,
    ...(rule.domain === undefined ? {} : { domain: rule.domain }),
    ...(rule.defaultValue === undefined ? {} : { defaultValue: rule.defaultValue }),
    constraints: rule.constraints, priority: rule.priority, enabled: rule.enabled,
    evidenceSourceRef: rule.evidenceSourceRef, evidenceKind: rule.evidenceKind,
    evidenceNote: rule.evidenceNote, identityEvidenceKind: rule.identityEvidenceKind,
    identityEvidenceSourceRef: rule.identityEvidenceSourceRef, provenanceUrl: rule.provenanceUrl,
    verifiedAt: rule.verifiedAt,
  })
}

export function decodeCapabilityRuleSourceRulesV1(value: unknown): readonly PersistedCapabilityRuleV2[] {
  if (!Array.isArray(value) || value.length > 100_000) {
    throw new Error('GENERATION_V2_CAPABILITY_RULE_SOURCE_ADAPTER_INVALID')
  }
  const decoded = value.map((candidate) => {
    if (!plainObject(candidate)) throw new Error('GENERATION_V2_CAPABILITY_RULE_SOURCE_ADAPTER_INVALID')
    const definitionKeys = [...RULE_DEFINITION_KEYS,
      ...(candidate.domain === undefined ? [] : ['domain'] as const),
      ...(candidate.defaultValue === undefined ? [] : ['defaultValue'] as const)]
    const expectedKeys = [...definitionKeys, ...RULE_PERSISTED_KEYS].sort()
    const actualKeys = Object.keys(candidate).sort()
    if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index]) ||
        (candidate.ownerKind !== 'built_in' && candidate.ownerKind !== 'user') ||
        typeof candidate.ownerId !== 'string' || typeof candidate.packId !== 'string' ||
        !Number.isSafeInteger(candidate.packVersion) || typeof candidate.packEnabled !== 'boolean' ||
        typeof candidate.packRevision !== 'string' || typeof candidate.ruleRevision !== 'string' ||
        typeof candidate.contentDigest !== 'string') {
      throw new Error('GENERATION_V2_CAPABILITY_RULE_SOURCE_ADAPTER_INVALID')
    }
    const definitionInput = Object.fromEntries(definitionKeys.map((key) => [key, candidate[key]]))
    const definition = decodeCapabilityRuleDefinitionV2(definitionInput)
    return Object.freeze({ ...definition, ownerKind: candidate.ownerKind, ownerId: candidate.ownerId,
      packId: candidate.packId, packVersion: candidate.packVersion as number,
      packRevision: candidate.packRevision, packEnabled: candidate.packEnabled,
      ruleRevision: candidate.ruleRevision, contentDigest: candidate.contentDigest }) as PersistedCapabilityRuleV2
  })
  const packs = new Map<string, PersistedCapabilityRuleV2[]>()
  for (const rule of decoded) {
    const key = `${rule.ownerKind}\0${rule.packId}`
    const rules = packs.get(key) ?? []
    rules.push(rule)
    packs.set(key, rules)
  }
  for (const rules of packs.values()) {
    const first = rules[0]!
    if (rules.some((rule) => rule.ownerId !== first.ownerId || rule.packVersion !== first.packVersion ||
      rule.packRevision !== first.packRevision || rule.packEnabled !== first.packEnabled)) {
      throw new Error('GENERATION_V2_CAPABILITY_RULE_SOURCE_ADAPTER_INVALID')
    }
    const projection = projectCapabilityRulePackContentV2({ schemaVersion: 1, ownerKind: first.ownerKind,
      ownerId: first.ownerId, packId: first.packId, packVersion: first.packVersion,
      enabled: first.packEnabled, rules: rules.map(definitionFromPersistedRuleV1) })
    if (projection.packRevision !== first.packRevision || rules.some((rule) => {
      const projected = projection.rules.find((entry) => entry.definition.ruleId === rule.ruleId)
      return !projected || projected.ruleRevision !== rule.ruleRevision || projected.contentDigest !== rule.contentDigest
    })) throw new Error('GENERATION_V2_CAPABILITY_RULE_SOURCE_ADAPTER_INVALID')
  }
  return Object.freeze(decoded.sort((left, right) => `${left.ownerKind}\0${left.packId}\0${left.ruleId}`
    .localeCompare(`${right.ownerKind}\0${right.packId}\0${right.ruleId}`, 'en')))
}

export function canonicalizeCapabilityRuleSourceRulesV1(
  rules: readonly PersistedCapabilityRuleV2[],
): readonly PersistedCapabilityRuleV2[] {
  return decodeCapabilityRuleSourceRulesV1(rules)
}

function rulePackKey(rule: Pick<PersistedCapabilityRuleV2, 'ownerKind' | 'ownerId' | 'packId'>): string {
  return `${rule.ownerKind}\0${rule.ownerId}\0${rule.packId}`
}

function packPriority(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < -1_000_000 || (value as number) > 1_000_000) {
    throw new Error('GENERATION_V2_CAPABILITY_RULE_SOURCE_ADAPTER_INVALID')
  }
  return value as number
}

export function buildCapabilityRuleSourceSnapshotV1(
  rulesInput: readonly PersistedCapabilityRuleV2[],
): CapabilityRuleSourceSnapshotV1 {
  const rules = canonicalizeCapabilityRuleSourceRulesV1(rulesInput)
  const packs = new Map<string, CapabilityRuleSourcePackPriorityV1>()
  for (const rule of rules) packs.set(rulePackKey(rule), Object.freeze({ ownerKind: rule.ownerKind,
    ownerId: rule.ownerId, packId: rule.packId, packPriority: 0 }))
  return Object.freeze({ schemaVersion: 1 as const,
    prioritySemanticsRevision: CAPABILITY_RULE_PRIORITY_SEMANTICS_REVISION_V1,
    packPriorities: Object.freeze([...packs.values()].sort((left, right) =>
      rulePackKey(left).localeCompare(rulePackKey(right), 'en'))), rules })
}

export function decodeCapabilityRuleSourceSnapshotV1(value: unknown): CapabilityRuleSourceSnapshotV1 {
  if (!plainObject(value)) throw new Error('GENERATION_V2_CAPABILITY_RULE_SOURCE_ADAPTER_INVALID')
  const keys = Object.keys(value).sort()
  if (keys.join('\0') !== ['packPriorities', 'prioritySemanticsRevision', 'rules', 'schemaVersion'].sort().join('\0') ||
      value.schemaVersion !== 1 ||
      value.prioritySemanticsRevision !== CAPABILITY_RULE_PRIORITY_SEMANTICS_REVISION_V1 ||
      !Array.isArray(value.packPriorities)) {
    throw new Error('GENERATION_V2_CAPABILITY_RULE_SOURCE_ADAPTER_INVALID')
  }
  const rules = canonicalizeCapabilityRuleSourceRulesV1(value.rules as readonly PersistedCapabilityRuleV2[])
  const packPriorities = value.packPriorities.map((candidate) => {
    if (!plainObject(candidate) || Object.keys(candidate).sort().join('\0') !==
        ['ownerKind', 'ownerId', 'packId', 'packPriority'].sort().join('\0') ||
        (candidate.ownerKind !== 'built_in' && candidate.ownerKind !== 'user') ||
        typeof candidate.ownerId !== 'string' || typeof candidate.packId !== 'string') {
      throw new Error('GENERATION_V2_CAPABILITY_RULE_SOURCE_ADAPTER_INVALID')
    }
    return Object.freeze({ ownerKind: candidate.ownerKind, ownerId: candidate.ownerId,
      packId: candidate.packId, packPriority: packPriority(candidate.packPriority) })
  }).sort((left, right) => rulePackKey(left).localeCompare(rulePackKey(right), 'en'))
  const priorityByPack = new Map(packPriorities.map((entry) => [rulePackKey(entry), entry]))
  const expectedPackKeys = new Set(rules.map(rulePackKey))
  if (priorityByPack.size !== packPriorities.length || priorityByPack.size !== expectedPackKeys.size ||
      [...expectedPackKeys].some((key) => !priorityByPack.has(key))) {
    throw new Error('GENERATION_V2_CAPABILITY_RULE_SOURCE_ADAPTER_INVALID')
  }
  return Object.freeze({ schemaVersion: 1 as const,
    prioritySemanticsRevision: CAPABILITY_RULE_PRIORITY_SEMANTICS_REVISION_V1,
    packPriorities: Object.freeze(packPriorities), rules })
}

export function freezeCapabilityRuleSourceV1(input: Readonly<{
  rawSnapshot: RawSourceSnapshotRefV1
  sourceSnapshot: CapabilityRuleSourceSnapshotV1
}>): FrozenCapabilityRuleSourceV1 {
  if (input.rawSnapshot.sourceKind !== 'capability_rule' ||
      input.rawSnapshot.recordSetCompleteness !== 'not_applicable') {
    throw new Error('GENERATION_V2_CAPABILITY_RULE_SOURCE_ADAPTER_INVALID')
  }
  const sourceSnapshot = decodeCapabilityRuleSourceSnapshotV1(input.sourceSnapshot)
  const rulesDigest = canonicalSourceFactDigestV1(sourceSnapshot)
  if (input.rawSnapshot.rawEnvelopeRefs.length !== 1 ||
      input.rawSnapshot.rawEnvelopeRefs[0]!.persistedPayloadSha256 !== rulesDigest) {
    throw new Error('GENERATION_V2_CAPABILITY_RULE_SOURCE_ADAPTER_INVALID')
  }
  const priorityByPack = new Map(sourceSnapshot.packPriorities.map((entry) => [rulePackKey(entry),
    entry.packPriority]))
  return Object.freeze({ rawSourceSnapshotRevision: input.rawSnapshot.rawSourceSnapshotRevision, rulesDigest,
    listMatchingRulesForIdentity: (identity: CapabilityRuleIdentityV2) => Object.freeze(sourceSnapshot.rules
      .filter((rule) => rule.enabled && rule.packEnabled && matchesCapabilityRuleIdentityV2(rule, identity))
      .map((rule) => {
        const sourcePackPriority = priorityByPack.get(rulePackKey(rule))
        if (sourcePackPriority === undefined || !Number.isSafeInteger(sourcePackPriority + rule.priority)) {
          throw new Error('GENERATION_V2_CAPABILITY_RULE_SOURCE_ADAPTER_INVALID')
        }
        return Object.freeze({ rule, packPriority: sourcePackPriority,
          effectiveRulePriority: sourcePackPriority + rule.priority })
      })),
  })
}

function frozenSourceFromRawSnapshot(
  rawSnapshot: RawSourceSnapshotRefV1,
  rawPayloadReader: RawPayloadReaderV1,
): FrozenCapabilityRuleSourceV1 {
  if (rawSnapshot.rawEnvelopeRefs.length !== 1) {
    throw new Error('GENERATION_V2_CAPABILITY_RULE_SOURCE_ADAPTER_INVALID')
  }
  const payload = rawPayloadReader.readRawPayload(rawSnapshot.rawEnvelopeRefs[0]!)
  return freezeCapabilityRuleSourceV1({ rawSnapshot,
    sourceSnapshot: decodeCapabilityRuleSourceSnapshotV1(payload) })
}

type PlannedClaimV1 = Readonly<{
  mappingId: string
  path: CanonicalSemanticPathV1
  value?: CanonicalFactValueV1
  sourceFieldPaths: readonly string[]
  errorCode?: string
}>

const RULE_EVIDENCE_FIELD_PATHS = Object.freeze([
  'evidenceSourceRef', 'evidenceKind', 'evidenceNote', 'identityEvidenceKind',
  'identityEvidenceSourceRef', 'provenanceUrl', 'verifiedAt',
] as const)

function supportClaim(
  rule: PersistedCapabilityRuleV2,
  mappingId: string,
  path: CanonicalSemanticPathV1,
): readonly PlannedClaimV1[] {
  if (rule.state !== 'supported' && rule.state !== 'unsupported') return []
  return [Object.freeze({ mappingId, path,
    value: Object.freeze({ kind: 'support' as const, value: rule.state }),
    sourceFieldPaths: Object.freeze(['semanticPath', 'state']) })]
}

function stringValues(rule: PersistedCapabilityRuleV2, kind: 'enum' | 'enum_list'): readonly string[] | null {
  if (rule.domain?.kind !== kind || rule.domain.values.some((value) => typeof value !== 'string')) return null
  return Object.freeze([...rule.domain.values as readonly string[]])
}

function stringSetClaim(
  rule: PersistedCapabilityRuleV2,
  mappingId: string,
  path: CanonicalSemanticPathV1,
  defaultMapping?: Readonly<{ mappingId: string; path: CanonicalSemanticPathV1 }>,
): readonly PlannedClaimV1[] {
  if (rule.state !== 'supported') return []
  const values = stringValues(rule, 'enum')
  if (!values) return [Object.freeze({ mappingId, path, sourceFieldPaths: Object.freeze(['semanticPath', 'domain']),
    errorCode: 'GENERATION_V2_CAPABILITY_RULE_SOURCE_MAPPING_INVALID' })]
  return [Object.freeze({ mappingId, path,
    value: Object.freeze({ kind: 'native_string_set' as const, values, completeness: 'complete' as const }),
    sourceFieldPaths: Object.freeze(['semanticPath', 'state', 'domain.values']) }),
  ...(rule.defaultValue === undefined || !defaultMapping ? [] : [Object.freeze({
    mappingId: defaultMapping.mappingId, path: defaultMapping.path,
    value: Object.freeze({ kind: 'native_string' as const, value: String(rule.defaultValue) }),
    sourceFieldPaths: Object.freeze(['semanticPath', 'state', 'domain.values', 'defaultValue']),
  })])]
}

function aspectRatioClaims(rule: PersistedCapabilityRuleV2): readonly PlannedClaimV1[] {
  if (rule.state !== 'supported') return []
  const values = stringValues(rule, 'enum')
  const ratios = values?.map((value) => {
    const match = /^(\d+):(\d+)$/u.exec(value)
    if (!match) return null
    const width = Number(match[1])
    const height = Number(match[2])
    return Number.isSafeInteger(width) && Number.isSafeInteger(height) && width > 0 && height > 0
      ? Object.freeze({ width, height }) : null
  })
  if (!ratios || ratios.some((ratio) => ratio === null)) {
    return [Object.freeze({ mappingId: 'rules.image-aspect-ratio.v1', path: 'image.generation.aspectRatios',
      sourceFieldPaths: Object.freeze(['semanticPath', 'domain']),
      errorCode: 'GENERATION_V2_CAPABILITY_RULE_SOURCE_MAPPING_INVALID' })]
  }
  return [Object.freeze({ mappingId: 'rules.image-aspect-ratio.v1', path: 'image.generation.aspectRatios',
    value: Object.freeze({ kind: 'aspect_ratio_set' as const,
      values: Object.freeze(ratios as readonly Readonly<{ width: number; height: number }>[]),
      completeness: 'complete' as const }),
    sourceFieldPaths: Object.freeze(['semanticPath', 'state', 'domain.values']) })]
}

function searchTypeClaims(rule: PersistedCapabilityRuleV2): readonly PlannedClaimV1[] {
  if (rule.state !== 'supported') return []
  const values = stringValues(rule, 'enum_list')
  if (!values || values.some((value) => value !== 'web' && value !== 'image')) {
    return [Object.freeze({ mappingId: 'rules.web-types.v1', path: 'search.web.support',
      sourceFieldPaths: Object.freeze(['semanticPath', 'domain']),
      errorCode: 'GENERATION_V2_CAPABILITY_RULE_SOURCE_MAPPING_INVALID' })]
  }
  return Object.freeze((['web', 'image'] as const).map((searchType) => Object.freeze({
    mappingId: 'rules.web-types.v1',
    path: searchType === 'web' ? 'search.web.support' as const : 'search.image.support' as const,
    value: Object.freeze({ kind: 'support' as const,
      value: values.includes(searchType) ? 'supported' as const : 'unsupported' as const }),
    sourceFieldPaths: Object.freeze(['semanticPath', 'state', 'domain.values']),
  })))
}

function invalidRuleBoundaryClaim(rule: PersistedCapabilityRuleV2): PlannedClaimV1 | null {
  const target = (() => {
    switch (rule.semanticPath) {
      case 'reasoning.mode':
        return { mappingId: 'rules.reasoning-mode.v1', path: 'reasoning.support' as const }
      case 'reasoning.effort':
        return rule.providerId === 'anthropic'
          ? { mappingId: 'rules.reasoning-effort.v1', path: 'generation.effort.nativeValues' as const }
          : { mappingId: 'rules.reasoning-effort.v1', path: 'reasoning.effort.nativeValues' as const }
      case 'image.mode':
        return { mappingId: 'rules.image-mode.v1', path: 'image.generation.support' as const }
      case 'image.aspectRatio':
        return { mappingId: 'rules.image-aspect-ratio.v1', path: 'image.generation.aspectRatios' as const }
      case 'image.resolution':
        return { mappingId: 'rules.image-resolution.v1',
          path: 'image.generation.resolutionPresets.nativeValues' as const }
      case 'web.mode':
        return { mappingId: 'rules.web-mode.v1', path: 'search.web.support' as const }
      case 'web.types':
        return { mappingId: 'rules.web-types.v1', path: 'search.web.support' as const }
      default:
        return null
    }
  })()
  return target === null ? null : Object.freeze({ ...target,
    sourceFieldPaths: Object.freeze(['semanticPath', 'state', 'constraints', 'evidenceKind']),
    errorCode: 'GENERATION_V2_CAPABILITY_RULE_SOURCE_BOUNDARY_INVALID' })
}

function planRuleClaims(rule: PersistedCapabilityRuleV2): readonly PlannedClaimV1[] {
  if (rule.state === 'requires_confirmation' || rule.state === 'unknown' || rule.constraints.length > 0 ||
      rule.evidenceKind === 'derived_empirical') {
    const invalidClaim = invalidRuleBoundaryClaim(rule)
    return invalidClaim === null ? [] : Object.freeze([invalidClaim])
  }
  switch (rule.semanticPath) {
    case 'reasoning.mode':
      return supportClaim(rule, 'rules.reasoning-mode.v1', 'reasoning.support')
    case 'reasoning.effort':
      return rule.providerId === 'anthropic'
        ? stringSetClaim(rule, 'rules.reasoning-effort.v1', 'generation.effort.nativeValues', {
          mappingId: 'rules.generation-effort-default.v1', path: 'generation.effort.providerDefault' })
        : stringSetClaim(rule, 'rules.reasoning-effort.v1', 'reasoning.effort.nativeValues', {
          mappingId: 'rules.reasoning-effort-default.v1', path: 'reasoning.effort.providerDefault' })
    case 'image.mode':
      return supportClaim(rule, 'rules.image-mode.v1', 'image.generation.support')
    case 'image.aspectRatio':
      return aspectRatioClaims(rule)
    case 'image.resolution':
      return stringSetClaim(rule, 'rules.image-resolution.v1',
        'image.generation.resolutionPresets.nativeValues', {
          mappingId: 'rules.image-resolution-default.v1',
          path: 'image.generation.resolutionPreset.providerDefault',
        })
    case 'web.mode':
      return supportClaim(rule, 'rules.web-mode.v1', 'search.web.support')
    case 'web.types':
      return searchTypeClaims(rule)
    default:
      return []
  }
}

export function capabilityRuleSourceHasPotentialInvalidOutcomeV1(
  rules: readonly PersistedCapabilityRuleV2[],
): boolean {
  return rules.some((rule) => rule.enabled && rule.packEnabled &&
    planRuleClaims(rule).some((claim) => claim.errorCode !== undefined))
}

function executionIdentity(subject: CanonicalModelSubjectV1): CapabilityRuleIdentityV2 | null {
  const authority = PROVIDER_AUTHORITY_REGISTRY_ENTRIES_V1.find((entry) =>
    entry.providerAuthorityId === subject.providerAuthorityId)
  const bindings = authority?.executionBindings.filter((binding) =>
    binding.endpointProfileKind === subject.endpointProfileId) ?? []
  if (bindings.length !== 1) return null
  return Object.freeze({ providerId: bindings[0]!.implementationProviderId,
    endpointProfileId: subject.endpointProfileId, nativeModelId: subject.nativeModelId })
}

function sourceRecordIdentity(rule: PersistedCapabilityRuleV2): string {
  return `${rule.ownerKind}/${rule.ownerId}/${rule.packId}/${rule.ruleId}/${rule.ruleRevision}`
}

function sourceFieldRefs(
  rawSnapshot: RawSourceSnapshotRefV1,
  rule: PersistedCapabilityRuleV2,
  fieldPaths: readonly string[],
): readonly SourceFieldRefV1[] {
  const paths = [...new Set([...fieldPaths, ...RULE_EVIDENCE_FIELD_PATHS,
    `packPriorities[${rule.ownerKind}/${rule.ownerId}/${rule.packId}].packPriority`])]
  return Object.freeze(rawSnapshot.rawEnvelopeRefs.map((rawPayloadRef) => Object.freeze({ rawPayloadRef,
    sourceRecordIdentity: sourceRecordIdentity(rule), sourceFieldPath: `rule-fields:${paths.join(',')}`,
    observedPresence: 'present' as const })))
}

function ruleClaimContext(
  matched: MatchedCapabilityRuleSourceClaimV1,
  identity: CapabilityRuleIdentityV2,
): RuleClaimContextV1 {
  const rule = matched.rule
  return Object.freeze({ ownerKind: rule.ownerKind, ownerId: rule.ownerId, packId: rule.packId,
    ruleId: rule.ruleId, packRevision: rule.packRevision, ruleRevision: rule.ruleRevision,
    selectorKind: rule.selector.kind,
    selectorRef: rule.selector.kind === 'exact' ? `exact:${identity.nativeModelId}` : `regex:${rule.selector.value}`,
    packPriority: matched.packPriority, rulePriority: rule.priority,
    effectiveRulePriority: matched.effectiveRulePriority,
    prioritySemanticsRevision: CAPABILITY_RULE_PRIORITY_SEMANTICS_REVISION_V1 })
}

function evidenceRefs(rule: PersistedCapabilityRuleV2): readonly string[] {
  return Object.freeze([rule.evidenceSourceRef, rule.identityEvidenceSourceRef,
    ...(rule.provenanceUrl === null ? [] : [rule.provenanceUrl])])
}

function assertCompatibleSnapshot(
  rawSnapshot: RawSourceSnapshotRefV1,
  sourceRevision: CanonicalSourceRevisionRefV1,
): void {
  if (rawSnapshot.sourceKind !== 'capability_rule' || sourceRevision.sourceKind !== 'capability_rule' ||
      rawSnapshot.rawSourceSnapshotRevision !== sourceRevision.rawSourceSnapshotRevision ||
      rawSnapshot.sourceScopeId !== sourceRevision.sourceScopeId ||
      sourceRevision.adapterRevision !== CAPABILITY_RULE_SOURCE_ADAPTER_REVISION_V1 ||
      sourceRevision.coverageManifestRevision !== CAPABILITY_RULE_COVERAGE_MANIFEST_V1.manifestRevision) {
    throw new Error('GENERATION_V2_CAPABILITY_RULE_SOURCE_ADAPTER_INVALID')
  }
}

export function createCapabilityRuleSourceAdapterV1(
  context: Readonly<{ rawPayloadReader: RawPayloadReaderV1 }>,
): CanonicalModelFactSourceAdapterV1 {
  const cache = new Map<string, FrozenCapabilityRuleSourceV1>()
  return Object.freeze({
    sourceKind: 'capability_rule' as const,
    adapterId: 'capability-rule-source-adapter-v1',
    adapterRevision: CAPABILITY_RULE_SOURCE_ADAPTER_REVISION_V1,
    coverageManifest: CAPABILITY_RULE_COVERAGE_MANIFEST_V1,
    subjectDiscovery: 'query_bound' as const,
    adaptExactSubject(request: Readonly<{
      rawSnapshot: RawSourceSnapshotRefV1
      sourceRevision: CanonicalSourceRevisionRefV1
      subject: CanonicalModelSubjectV1
    }>): CanonicalSubjectFactCandidateV1 {
      assertCompatibleSnapshot(request.rawSnapshot, request.sourceRevision)
      let source = cache.get(request.rawSnapshot.rawSourceSnapshotRevision)
      if (!source) {
        source = frozenSourceFromRawSnapshot(request.rawSnapshot, context.rawPayloadReader)
        cache.set(request.rawSnapshot.rawSourceSnapshotRevision, source)
      }
      const identity = executionIdentity(request.subject)
      if (!identity) return Object.freeze({ schemaVersion: 1 as const, subject: request.subject,
        sourceRevision: request.sourceRevision, recordOutcome: 'invalid_identity' as const,
        outcomes: Object.freeze([]), unmappedSourceFields: Object.freeze([]) })
      const rules = source.listMatchingRulesForIdentity(identity)
      const outcomes = rules.flatMap((matched) => planRuleClaims(matched.rule).map((planned) => {
        const rule = matched.rule
        const provenance = buildObservationProvenanceV1({ sourceRevision: request.sourceRevision,
          sourceFieldRefs: sourceFieldRefs(request.rawSnapshot, rule, planned.sourceFieldPaths),
          adapterId: 'capability-rule-source-adapter-v1',
          adapterRevision: CAPABILITY_RULE_SOURCE_ADAPTER_REVISION_V1, mappingId: planned.mappingId })
        if (planned.errorCode) {
          return invalidOutcomeV1({ path: planned.path, provenance,
            errorCode: planned.errorCode })
        }
        const assertionInput = { subject: request.subject, sourceRevision: request.sourceRevision,
          path: planned.path, value: planned.value!,
          sourceClaimIdentity: `${sourceRecordIdentity(rule)}/${planned.mappingId}/${planned.path}`,
          evidenceRefs: evidenceRefs(rule), observationProvenance: provenance,
          ruleClaim: ruleClaimContext(matched, identity) }
        const assertion = buildExplicitAssertionV1(assertionInput)
        return presentOutcomeV1({ assertion })
      }))
      return Object.freeze({ schemaVersion: 1 as const, subject: request.subject,
        sourceRevision: request.sourceRevision,
        recordOutcome: rules.length === 0 ? 'no_matching_claims' as const : 'present' as const,
        outcomes: Object.freeze(outcomes), unmappedSourceFields: Object.freeze([]) })
    },
  })
}
