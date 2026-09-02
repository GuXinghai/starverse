import { sha256PreparedBytesV2, stableSerializeProviderRequestV2 } from '../compiler/stableSerialize'
import {
  MODEL_CAPABILITY_SEMANTIC_PATHS_V2,
  type ModelCapabilityConstraintV2,
  type ModelCapabilityDomainV2,
  type ModelCapabilityEvidenceEffectV2,
  type ModelCapabilityFieldStateV2,
  type ModelCapabilityScalarV2,
  type ModelCapabilitySemanticPathV2,
  type PersistedModelCapabilityFieldV2,
} from '../capability/modelCapabilitySchemaV2'
import { canonicalizeModelCapabilityFieldV2 } from '../capability/canonicalModelFactsV2'

export type CapabilityRuleOwnerKindV2 = 'built_in' | 'user'
export type CapabilityRuleEvidenceKindV2 =
  | 'explicit_provider'
  | 'explicit_provider_series'
  | 'derived_empirical'
export type CapabilityRuleIdentityEvidenceKindV2 = 'provider_archive' | 'official_exact_model_doc' | 'derived_selector'
export type CapabilityRuleSelectorV2 = Readonly<{
  kind: 'exact'
  values: readonly string[]
}> | Readonly<{
  kind: 'regex'
  value: string
  positiveExamples: readonly string[]
  negativeExamples: readonly string[]
}>

export type CapabilityRuleDefinitionV2 = Readonly<{
  ruleId: string
  providerId: string
  endpointProfileId: string
  selector: CapabilityRuleSelectorV2
  semanticPath: ModelCapabilitySemanticPathV2
  state: Exclude<ModelCapabilityFieldStateV2, 'missing'>
  domain?: ModelCapabilityDomainV2
  defaultValue?: ModelCapabilityScalarV2
  constraints: readonly ModelCapabilityConstraintV2[]
  priority: number
  enabled: boolean
  evidenceSourceRef: string
  evidenceKind: CapabilityRuleEvidenceKindV2
  evidenceNote: string
  identityEvidenceKind: CapabilityRuleIdentityEvidenceKindV2
  identityEvidenceSourceRef: string
  provenanceUrl: string | null
  verifiedAt: string
}>

export type CapabilityRulePackDefinitionV2 = Readonly<{
  schemaVersion: 1
  ownerKind: CapabilityRuleOwnerKindV2
  ownerId: string
  packId: string
  packVersion: number
  enabled: boolean
  rules: readonly CapabilityRuleDefinitionV2[]
}>

export type PersistedCapabilityRuleV2 = CapabilityRuleDefinitionV2 & Readonly<{
  ownerKind: CapabilityRuleOwnerKindV2
  ownerId: string
  packId: string
  packVersion: number
  packRevision: string
  packEnabled: boolean
  ruleRevision: string
  contentDigest: string
}>

export type CapabilityRuleIdentityV2 = Readonly<{
  providerId: string
  endpointProfileId: string
  nativeModelId: string
}>

export type CapabilityRuleProjectionV2 = Readonly<{
  schemaVersion: 1
  identity: Readonly<{ providerId: string; endpointProfileId: string; nativeModelId: string }>
  ruleSetRevision: string
  rules: readonly PersistedCapabilityRuleV2[]
  evidence: readonly Readonly<{
    evidenceId: string
    kind: 'capability_rule'
    effect: ModelCapabilityEvidenceEffectV2
    sourceRef: string
    verifiedAt: string
    contentDigest: string
  }>[]
  fields: readonly PersistedModelCapabilityFieldV2[]
}>

export class CapabilityRuleV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_CAPABILITY_RULE_INVALID'
    | 'GENERATION_V2_CAPABILITY_RULE_CONFLICT') {
    super(code)
    this.name = 'CapabilityRuleV2Error'
  }
}

const projections = new WeakSet<object>()
const NON_MODEL_FACT_RULE_PATHS_V2 = new Set<ModelCapabilitySemanticPathV2>([
  'attachments[].assetId', 'attachments[].assetRevisionId', 'attachments[].assetSha256',
  'attachments[].capturedAtMs', 'attachments[].originalUrl', 'attachments[].provenance',
  'attachments[].referenceId', 'attachments[].referenceRevision', 'attachments[].urlDigest',
  'tools.allowedToolIds', 'tools.sideEffectConfirmation', 'tools.toolChoice',
  'providerExtension.kind',
])

function invalid(): never {
  throw new CapabilityRuleV2Error('GENERATION_V2_CAPABILITY_RULE_INVALID')
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

function boundedText(value: unknown, maxLength = 2048): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > maxLength || value.trim() !== value ||
      /[\u0000-\u001f\u007f]/u.test(value)) invalid()
  return value
}

function stringExamples(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32) invalid()
  const decoded = value.map((entry) => identityValue(entry))
  if (new Set(decoded).size !== decoded.length) invalid()
  return Object.freeze(decoded)
}

function exactIdentityValues(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 256) invalid()
  const decoded = value.map((entry) => identityValue(entry)).sort((left, right) => left.localeCompare(right, 'en'))
  if (new Set(decoded).size !== decoded.length) invalid()
  return Object.freeze(decoded)
}

function safeAnchoredRegex(value: unknown): RegExp {
  if (typeof value !== 'string' || value.length < 3 || value.length > 256 ||
      !value.startsWith('^') || !value.endsWith('$') || /\.\*|\.\+|\\[1-9]|\(\?[=!<]/u.test(value) ||
      /(?:^|[^\\])[+*]/u.test(value) || /(?:^|[^\\(])\?/u.test(value) || /\{\d+,/u.test(value) ||
      /\)[{+*?]/u.test(value)) invalid()
  const groupStarts = [...value.matchAll(/\(/gu)]
  const groupEnds = [...value.matchAll(/\)/gu)]
  const pipes = [...value.matchAll(/\|/gu)]
  if (groupStarts.length > 1 || groupEnds.length > 1 || groupStarts.length !== groupEnds.length) invalid()
  if (groupStarts.length === 0) {
    if (pipes.length !== 0) invalid()
  } else {
    const start = groupStarts[0]!.index
    const end = groupEnds[0]!.index
    if (start === undefined || end === undefined) invalid()
    if (value.slice(start, start + 3) !== '(?:' || end <= start + 3 || pipes.length < 1 || pipes.length > 15 ||
        pipes.some((entry) => entry.index <= start + 2 || entry.index >= end)) invalid()
    const alternatives = value.slice(start + 3, end).split('|')
    if (alternatives.some((entry) => entry.length < 1 || entry.length > 64)) invalid()
  }
  for (const match of value.matchAll(/\{(\d+)\}/gu)) {
    const count = Number(match[1])
    if (count < 1 || count > 32) invalid()
  }
  try { return new RegExp(value, 'u') } catch { return invalid() }
}

export function matchesCapabilityRuleIdentityV2(
  rule: Pick<CapabilityRuleDefinitionV2, 'providerId' | 'endpointProfileId' | 'selector'>,
  identity: CapabilityRuleIdentityV2,
): boolean {
  const providerId = identityValue(identity.providerId)
  const endpointProfileId = identityValue(identity.endpointProfileId)
  const nativeModelId = identityValue(identity.nativeModelId)
  if (rule.providerId !== providerId || rule.endpointProfileId !== endpointProfileId) return false
  return rule.selector.kind === 'exact'
    ? rule.selector.values.includes(nativeModelId)
    : safeAnchoredRegex(rule.selector.value).test(nativeModelId)
}

function selector(value: unknown): CapabilityRuleSelectorV2 {
  if (!plainObject(value) || (value.kind !== 'exact' && value.kind !== 'regex')) invalid()
  if (value.kind === 'exact') {
    exactKeys(value, ['kind', 'values'])
    return Object.freeze({ kind: 'exact', values: exactIdentityValues(value.values) })
  }
  exactKeys(value, ['kind', 'value', 'positiveExamples', 'negativeExamples'])
  const pattern = safeAnchoredRegex(value.value)
  const positiveExamples = stringExamples(value.positiveExamples)
  const negativeExamples = stringExamples(value.negativeExamples)
  if (positiveExamples.some((example) => !pattern.test(example)) ||
      negativeExamples.some((example) => pattern.test(example))) invalid()
  return Object.freeze({ kind: 'regex', value: value.value as string, positiveExamples, negativeExamples })
}

function timestamp(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) ||
      new Date(value).toISOString() !== value) invalid()
  return value
}

function provenanceUrl(value: unknown): string | null {
  if (value === null) return null
  if (typeof value !== 'string' || value.length > 2048) invalid()
  let parsed: URL
  try { parsed = new URL(value) } catch { return invalid() }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) invalid()
  return value
}

function effectForState(state: CapabilityRuleDefinitionV2['state']): ModelCapabilityEvidenceEffectV2 {
  if (state === 'supported') return 'supports'
  if (state === 'unsupported') return 'rejects'
  if (state === 'requires_confirmation') return 'requires_confirmation'
  return 'unknown'
}

function hash(value: unknown): string {
  return sha256PreparedBytesV2(new TextEncoder().encode(stableSerializeProviderRequestV2(value)))
}

function validateCanonicalField(input: Readonly<{
  path: ModelCapabilitySemanticPathV2
  state: CapabilityRuleDefinitionV2['state']
  domain?: unknown
  defaultValue?: unknown
  constraints: unknown
}>): PersistedModelCapabilityFieldV2 {
  const evidenceId = 'capability.rule.validation'
  try {
    return canonicalizeModelCapabilityFieldV2({
      path: input.path,
      state: input.state,
      ...(input.domain === undefined ? {} : { domain: input.domain }),
      ...(input.defaultValue === undefined ? {} : { defaultValue: input.defaultValue }),
      constraints: input.constraints,
      evidenceIds: [evidenceId],
    })
  } catch {
    return invalid()
  }
}

export function decodeCapabilityRuleDefinitionV2(value: unknown): CapabilityRuleDefinitionV2 {
  if (!plainObject(value)) return invalid()
  const keys = ['ruleId', 'providerId', 'endpointProfileId', 'selector', 'semanticPath', 'state',
    'constraints', 'priority', 'enabled', 'evidenceSourceRef', 'evidenceKind', 'evidenceNote',
    'identityEvidenceKind', 'identityEvidenceSourceRef', 'provenanceUrl', 'verifiedAt']
  if (value.domain !== undefined) keys.push('domain')
  if (value.defaultValue !== undefined) keys.push('defaultValue')
  exactKeys(value, keys)
  const semanticPath = value.semanticPath as ModelCapabilitySemanticPathV2
  const state = value.state as CapabilityRuleDefinitionV2['state']
  if (!MODEL_CAPABILITY_SEMANTIC_PATHS_V2.includes(semanticPath) ||
      NON_MODEL_FACT_RULE_PATHS_V2.has(semanticPath) || semanticPath.startsWith('providerExtension.') ||
      !['supported', 'unsupported', 'requires_confirmation', 'unknown'].includes(state) ||
      !['explicit_provider', 'explicit_provider_series', 'derived_empirical'].includes(value.evidenceKind as string) ||
      !['provider_archive', 'official_exact_model_doc', 'derived_selector'].includes(value.identityEvidenceKind as string) ||
      !Number.isSafeInteger(value.priority) || (value.priority as number) < -1_000_000 ||
      (value.priority as number) > 1_000_000 || typeof value.enabled !== 'boolean' ||
      !Array.isArray(value.constraints)) invalid()
  const decodedSelector = selector(value.selector)
  const decodedProvenanceUrl = provenanceUrl(value.provenanceUrl)
  if ((decodedSelector.kind === 'regex' || value.evidenceKind === 'derived_empirical') &&
      decodedProvenanceUrl === null) invalid()
  if (decodedSelector.kind === 'regex' && value.identityEvidenceKind !== 'derived_selector') invalid()
  if (decodedSelector.kind === 'exact' && value.identityEvidenceKind === 'derived_selector') invalid()
  const field = validateCanonicalField({ path: semanticPath, state, domain: value.domain,
    defaultValue: value.defaultValue, constraints: value.constraints })
  return Object.freeze({
    ruleId: identifier(value.ruleId),
    providerId: identityValue(value.providerId),
    endpointProfileId: identityValue(value.endpointProfileId),
    selector: decodedSelector,
    semanticPath,
    state,
    ...(field.domain === undefined ? {} : { domain: field.domain }),
    ...(field.defaultValue === undefined ? {} : { defaultValue: field.defaultValue }),
    constraints: field.constraints,
    priority: value.priority as number,
    enabled: value.enabled,
    evidenceSourceRef: identifier(value.evidenceSourceRef),
    evidenceKind: value.evidenceKind as CapabilityRuleEvidenceKindV2,
    evidenceNote: boundedText(value.evidenceNote),
    identityEvidenceKind: value.identityEvidenceKind as CapabilityRuleIdentityEvidenceKindV2,
    identityEvidenceSourceRef: identifier(value.identityEvidenceSourceRef),
    provenanceUrl: decodedProvenanceUrl,
    verifiedAt: timestamp(value.verifiedAt),
  })
}

export function decodeCapabilityRulePackDefinitionV2(value: unknown): CapabilityRulePackDefinitionV2 {
  if (!plainObject(value)) return invalid()
  exactKeys(value, ['schemaVersion', 'ownerKind', 'ownerId', 'packId', 'packVersion', 'enabled', 'rules'])
  if (value.schemaVersion !== 1 || (value.ownerKind !== 'built_in' && value.ownerKind !== 'user') ||
      !Number.isSafeInteger(value.packVersion) || (value.packVersion as number) < 1 ||
      typeof value.enabled !== 'boolean' || !Array.isArray(value.rules) || value.rules.length === 0) invalid()
  const rules = value.rules.map(decodeCapabilityRuleDefinitionV2)
    .sort((left, right) => left.ruleId.localeCompare(right.ruleId, 'en'))
  if (new Set(rules.map((rule) => rule.ruleId)).size !== rules.length) invalid()
  const naturalKeys = rules.flatMap((rule) => rule.selector.kind === 'exact'
    ? rule.selector.values.map((nativeModelId) => [rule.providerId, rule.endpointProfileId,
      'exact', nativeModelId, rule.semanticPath].join('\0'))
    : [[rule.providerId, rule.endpointProfileId, 'regex', rule.selector.value,
      rule.semanticPath].join('\0')])
  if (new Set(naturalKeys).size !== naturalKeys.length) invalid()
  return Object.freeze({ schemaVersion: 1, ownerKind: value.ownerKind, ownerId: identifier(value.ownerId),
    packId: identifier(value.packId), packVersion: value.packVersion as number, enabled: value.enabled,
    rules: Object.freeze(rules) })
}

export function projectCapabilityRulePackContentV2(pack: CapabilityRulePackDefinitionV2): Readonly<{
  contentDigest: string
  packRevision: string
  rules: readonly Readonly<{ definition: CapabilityRuleDefinitionV2; contentDigest: string; ruleRevision: string }>[]
}> {
  const decoded = decodeCapabilityRulePackDefinitionV2(pack)
  const rules = decoded.rules.map((definition) => {
    const contentDigest = hash(definition)
    return Object.freeze({ definition, contentDigest, ruleRevision: `capability-rule-v2:${contentDigest}` })
  })
  const contentDigest = hash({ schemaVersion: 1, ownerKind: decoded.ownerKind, ownerId: decoded.ownerId,
    packId: decoded.packId, packVersion: decoded.packVersion, enabled: decoded.enabled,
    rules: rules.map((rule) => ({ definition: rule.definition, contentDigest: rule.contentDigest })) })
  return Object.freeze({ contentDigest, packRevision: `capability-rule-pack-v2:${contentDigest}`,
    rules: Object.freeze(rules) })
}

function evidenceId(rule: PersistedCapabilityRuleV2): string {
  const sourceDigest = hash({ ownerKind: rule.ownerKind, ownerId: rule.ownerId,
    packId: rule.packId, ruleId: rule.ruleId, contentDigest: rule.contentDigest })
  return `cr.${sourceDigest}.${effectForState(rule.state)}`
}

function semanticRuleDigest(rule: PersistedCapabilityRuleV2): string {
  return hash({ state: rule.state, domain: rule.domain ?? null, defaultValue: rule.defaultValue ?? null,
    constraints: rule.constraints })
}

export function projectCapabilityRulesV2(input: Readonly<{
  identity: CapabilityRuleIdentityV2
  matchingRules: readonly PersistedCapabilityRuleV2[]
}>): CapabilityRuleProjectionV2 {
  const identity = Object.freeze({ providerId: identityValue(input.identity.providerId),
    endpointProfileId: identityValue(input.identity.endpointProfileId), nativeModelId: identityValue(input.identity.nativeModelId) })
  const candidates = input.matchingRules.filter((rule) => rule.enabled && rule.packEnabled &&
    matchesCapabilityRuleIdentityV2(rule, identity))
  const winners: PersistedCapabilityRuleV2[] = []
  for (const path of MODEL_CAPABILITY_SEMANTIC_PATHS_V2) {
    const matches = candidates.filter((rule) => rule.semanticPath === path)
    if (matches.length === 0) continue
    const specificity = matches.some((rule) => rule.selector.kind === 'exact') ? 'exact' : 'regex'
    const specific = matches.filter((rule) => rule.selector.kind === specificity)
    const priority = Math.max(...specific.map((rule) => rule.priority))
    const top = specific.filter((rule) => rule.priority === priority)
    const digests = new Set(top.map(semanticRuleDigest))
    if (digests.size !== 1) throw new CapabilityRuleV2Error('GENERATION_V2_CAPABILITY_RULE_CONFLICT')
    winners.push(...top.sort((left, right) => `${left.ownerKind}\0${left.packId}\0${left.ruleId}`
      .localeCompare(`${right.ownerKind}\0${right.packId}\0${right.ruleId}`, 'en')))
  }
  const evidence = winners.map((rule) => Object.freeze({ evidenceId: evidenceId(rule),
    kind: 'capability_rule' as const, effect: effectForState(rule.state),
    sourceRef: rule.provenanceUrl ?? rule.evidenceSourceRef,
    verifiedAt: rule.verifiedAt, contentDigest: rule.contentDigest }))
  const fields = MODEL_CAPABILITY_SEMANTIC_PATHS_V2.flatMap((path) => {
    const selected = winners.filter((rule) => rule.semanticPath === path)
    const winner = selected[0]
    if (!winner) return []
    return [Object.freeze({ path, state: winner.state,
      ...(winner.domain === undefined ? {} : { domain: winner.domain }),
      ...(winner.defaultValue === undefined ? {} : { defaultValue: winner.defaultValue }),
      constraints: winner.constraints,
      evidenceIds: Object.freeze(selected.map(evidenceId).sort()) })]
  })
  const projection = Object.freeze({ schemaVersion: 1 as const, identity,
    ruleSetRevision: `capability-rule-set-v2:${hash({ identity, rules: winners.map((rule) => rule.ruleRevision) })}`,
    rules: Object.freeze(winners), evidence: Object.freeze(evidence), fields: Object.freeze(fields) })
  projections.add(projection)
  return projection
}

export function assertCapabilityRuleProjectionIdentityV2(
  projection: CapabilityRuleProjectionV2,
  identity: Readonly<{ providerId: string; endpointProfileId: string; nativeModelId: string }>,
): void {
  if (!projection || typeof projection !== 'object' || !projections.has(projection) ||
      projection.identity.providerId !== identity.providerId ||
      projection.identity.endpointProfileId !== identity.endpointProfileId ||
      projection.identity.nativeModelId !== identity.nativeModelId) invalid()
}

export function applyCapabilityRuleProjectionV2(input: Readonly<{
  baseEvidence: readonly Readonly<Record<string, unknown>>[]
  baseFields: readonly PersistedModelCapabilityFieldV2[]
  projection: CapabilityRuleProjectionV2
}>): Readonly<{
  evidence: readonly Readonly<Record<string, unknown>>[]
  fields: readonly PersistedModelCapabilityFieldV2[]
}> {
  const overrides = new Map(input.projection.fields.map((field) => [field.path, field]))
  return Object.freeze({ evidence: Object.freeze([...input.baseEvidence, ...input.projection.evidence]),
    fields: Object.freeze(input.baseFields.map((field) => overrides.get(field.path) ?? field)) })
}
