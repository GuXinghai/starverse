import {
  sha256PreparedBytesV2,
  stableSerializeProviderRequestV2,
} from '../compiler/stableSerialize'

export const CANONICAL_MODEL_FACT_ONTOLOGY_VERSION_V1 = 1 as const

export const CANONICAL_MODEL_FACT_PATHS_V1 = Object.freeze([
  'limits.contextWindow.maxTokens',
  'limits.input.maxTokens',
  'limits.output.maxTokens',
  'modalities.input',
  'modalities.output',
  'input.attachments.support',
  'operations.supported',
  'reasoning.support',
  'reasoning.required',
  'reasoning.toggle.support',
  'reasoning.modes.nativeValues',
  'reasoning.effort.nativeValues',
  'reasoning.effort.providerDefault',
  'reasoning.budgetTokens.support',
  'reasoning.budgetTokens.domain',
  'generation.effort.nativeValues',
  'generation.effort.providerDefault',
  'sampling.temperature.support',
  'sampling.temperature.providerDefault',
  'sampling.temperature.modelMaximum',
  'sampling.topP.providerDefault',
  'sampling.topK.support',
  'sampling.topK.providerDefault',
  'tools.calling.support',
  'tools.trainingForToolUse',
  'tools.codeExecution.support',
  'structuredOutput.support',
  'image.generation.support',
  'image.generation.aspectRatios',
  'image.generation.resolutionPresets.nativeValues',
  'image.generation.resolutionPreset.providerDefault',
  'search.web.support',
  'search.image.support',
  'documents.citations.support',
  'contextManagement.support',
  'contextManagement.actions.nativeValues',
] as const)

export type CanonicalSemanticPathV1 = typeof CANONICAL_MODEL_FACT_PATHS_V1[number]

export const CANONICAL_OPERATION_KINDS_V1 = Object.freeze([
  'content_generate',
  'content_generate_bidirectional',
  'content_generate_batch',
  'answer_generate',
  'embedding_generate',
  'embedding_batch_async',
  'token_count',
  'context_cache_create',
  'predict',
  'predict_long_running',
  'request_batch',
] as const)

export type CanonicalOperationKindV1 = typeof CANONICAL_OPERATION_KINDS_V1[number]

export const CANONICAL_MEDIA_KINDS_V1 = Object.freeze([
  'text', 'image', 'audio', 'video', 'pdf', 'generic_file',
] as const)

export type CanonicalMediaKindV1 = typeof CANONICAL_MEDIA_KINDS_V1[number]
export type CanonicalSourceKindV1 = 'provider_native' | 'models_dev' | 'capability_rule'
export type CanonicalCollectionCompletenessV1 = 'complete' | 'partial'

export type CanonicalIntegerDomainV1 = Readonly<{
  kind: 'integer_domain'
  unit?: 'token' | 'pixel'
  interval?: Readonly<{
    min?: number
    max?: number
    minInclusive: boolean
    maxInclusive: boolean
  }>
  includedValues?: readonly number[]
  excludedValues?: readonly number[]
  symbolicNativeValues?: readonly string[]
  completeness: 'complete' | 'partial_bounds'
}>

export type CanonicalFactValueV1 =
  | Readonly<{ kind: 'support'; value: 'supported' | 'unsupported' }>
  | Readonly<{ kind: 'boolean'; value: boolean }>
  | Readonly<{ kind: 'integer'; value: number; unit?: 'token' | 'pixel' }>
  | Readonly<{ kind: 'decimal'; value: number }>
  | Readonly<{ kind: 'native_string'; value: string }>
  | Readonly<{ kind: 'native_string_set'; values: readonly string[]; completeness: CanonicalCollectionCompletenessV1 }>
  | Readonly<{ kind: 'media_kind_set'; values: readonly CanonicalMediaKindV1[]; completeness: CanonicalCollectionCompletenessV1 }>
  | Readonly<{ kind: 'operation_kind_set'; values: readonly CanonicalOperationKindV1[]; completeness: CanonicalCollectionCompletenessV1 }>
  | CanonicalIntegerDomainV1
  | Readonly<{ kind: 'aspect_ratio_set'; values: readonly Readonly<{ width: number; height: number }>[]; completeness: CanonicalCollectionCompletenessV1 }>
  | Readonly<{ kind: 'dimensions_set'; values: readonly Readonly<{ width: number; height: number }>[]; completeness: CanonicalCollectionCompletenessV1 }>

export type CanonicalModelSubjectV1 = Readonly<{
  providerAuthorityId: string
  endpointProfileId: string
  nativeModelId: string
}>

export type RawPayloadRefV1 = Readonly<{
  storeId: string
  persistedPayloadSha256: string
  recordKey: string
  sanitizerRevision: string
  networkPayloadSha256?: string
}>

export type SourceFieldRefV1 = Readonly<{
  rawPayloadRef: RawPayloadRefV1
  sourceRecordIdentity: string
  sourceFieldPath: string
  observedPresence: 'present' | 'expected_missing'
}>

export type RuleClaimContextV1 = Readonly<{
  ownerKind: 'built_in' | 'user'
  ownerId: string
  packId: string
  ruleId: string
  packRevision: string
  ruleRevision: string
  selectorKind: 'exact' | 'regex'
  selectorRef: string
  packPriority: number
  rulePriority: number
  effectiveRulePriority: number
  prioritySemanticsRevision: string
}>

export type CanonicalObservationProvenanceV1 = Readonly<{
  sourceKind: CanonicalSourceKindV1
  canonicalSourceRevision: string
  sourceFieldRefs: readonly SourceFieldRefV1[]
  adapterId: string
  adapterRevision: string
  mappingId: string
}>

export type CanonicalFactProvenanceV1 = CanonicalObservationProvenanceV1 & Readonly<{
  claimId: string
  sourceClaimIdentity: string
  assertionKind: 'explicit' | 'derived'
  evidenceRefs: readonly string[]
  ruleClaim?: RuleClaimContextV1
  derivation?: Readonly<{
    derivationId: string
    derivationRevision: string
    inputClaimRefs: readonly string[]
    inputEvidenceRefs: readonly string[]
  }>
}>

export type CanonicalFactAssertionV1 = Readonly<{
  path: CanonicalSemanticPathV1
  value: CanonicalFactValueV1
  provenance: CanonicalFactProvenanceV1
}>

export type CanonicalFieldOutcomeV1 = Readonly<{
  observationId: string
  path: CanonicalSemanticPathV1
  currentObservation:
    | Readonly<{ kind: 'present_valid'; assertion: CanonicalFactAssertionV1 }>
    | Readonly<{ kind: 'missing'; provenance: CanonicalObservationProvenanceV1 }>
    | Readonly<{ kind: 'invalid'; errorCode: string; provenance: CanonicalObservationProvenanceV1 }>
  effectiveAssertion?: CanonicalFactAssertionV1
  disposition: 'current' | 'none' | 'lkg_retained_after_invalid'
}>

export type UnmappedSourceFieldV1 = Readonly<{
  sourceFieldRefs: readonly SourceFieldRefV1[]
  reasonCode: 'unknown_field' | 'unknown_member' | 'ambiguous_semantics' | 'redacted_by_sanitizer'
  candidateCanonicalPath?: CanonicalSemanticPathV1
}>

export type RawSourceSnapshotRefV1 = Readonly<{
  sourceKind: CanonicalSourceKindV1
  sourceScopeId: string
  rawSourceSnapshotRevision: string
  recordSetCompleteness: 'complete' | 'partial' | 'unknown' | 'not_applicable'
  rawEnvelopeRefs: readonly RawPayloadRefV1[]
}>

export type CanonicalSourceRevisionRefV1 = Readonly<{
  sourceKind: CanonicalSourceKindV1
  sourceScopeId: string
  rawSourceSnapshotRevision: string
  adapterRevision: string
  coverageManifestRevision: string
  providerAuthorityRegistryRevision: string
  previousLkgSourceRevision?: string
  canonicalSourceRevision: string
}>

export type CanonicalSubjectRecordOutcomeV1 =
  | 'present'
  | 'no_matching_claims'
  | 'absent_in_complete_snapshot'
  | 'indeterminate_in_incomplete_snapshot'
  | 'invalid_identity'

export type CanonicalSubjectFactPayloadV1 = Readonly<{
  schemaVersion: 1
  subject: CanonicalModelSubjectV1
  sourceRevision: CanonicalSourceRevisionRefV1
  recordOutcome: CanonicalSubjectRecordOutcomeV1
  outcomes: readonly CanonicalFieldOutcomeV1[]
  unmappedSourceFields: readonly UnmappedSourceFieldV1[]
  subjectFactPayloadDigest: string
}>

export type CanonicalSubjectFactCandidateV1 = Omit<CanonicalSubjectFactPayloadV1, 'subjectFactPayloadDigest'>

export type CanonicalSubjectFactRefV1 = Readonly<{
  sourceRevision: CanonicalSourceRevisionRefV1
  subject: CanonicalModelSubjectV1
  subjectFactPayloadDigest: string
  canonicalSubjectFactRevision: string
}>

export type SourceRecordIndexV1 = Readonly<{
  sourceScopeId: string
  recordSetCompleteness: 'complete' | 'partial' | 'unknown'
  exactSubjects: readonly CanonicalModelSubjectV1[]
  invalidRecordRefs: readonly RawPayloadRefV1[]
}>

export class CanonicalSourceFactsV1Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_CANONICAL_SOURCE_FACTS_INVALID'
    | 'GENERATION_V2_CANONICAL_SOURCE_FACTS_PROVENANCE_INVALID'
    | 'GENERATION_V2_CANONICAL_SOURCE_FACTS_LKG_INVALID') {
    super(code)
    this.name = 'CanonicalSourceFactsV1Error'
  }
}

const VALUE_KIND_BY_PATH: Readonly<Record<CanonicalSemanticPathV1, CanonicalFactValueV1['kind']>> = Object.freeze({
  'limits.contextWindow.maxTokens': 'integer',
  'limits.input.maxTokens': 'integer',
  'limits.output.maxTokens': 'integer',
  'modalities.input': 'media_kind_set',
  'modalities.output': 'media_kind_set',
  'input.attachments.support': 'support',
  'operations.supported': 'operation_kind_set',
  'reasoning.support': 'support',
  'reasoning.required': 'boolean',
  'reasoning.toggle.support': 'support',
  'reasoning.modes.nativeValues': 'native_string_set',
  'reasoning.effort.nativeValues': 'native_string_set',
  'reasoning.effort.providerDefault': 'native_string',
  'reasoning.budgetTokens.support': 'support',
  'reasoning.budgetTokens.domain': 'integer_domain',
  'generation.effort.nativeValues': 'native_string_set',
  'generation.effort.providerDefault': 'native_string',
  'sampling.temperature.support': 'support',
  'sampling.temperature.providerDefault': 'decimal',
  'sampling.temperature.modelMaximum': 'decimal',
  'sampling.topP.providerDefault': 'decimal',
  'sampling.topK.support': 'support',
  'sampling.topK.providerDefault': 'integer',
  'tools.calling.support': 'support',
  'tools.trainingForToolUse': 'support',
  'tools.codeExecution.support': 'support',
  'structuredOutput.support': 'support',
  'image.generation.support': 'support',
  'image.generation.aspectRatios': 'aspect_ratio_set',
  'image.generation.resolutionPresets.nativeValues': 'native_string_set',
  'image.generation.resolutionPreset.providerDefault': 'native_string',
  'search.web.support': 'support',
  'search.image.support': 'support',
  'documents.citations.support': 'support',
  'contextManagement.support': 'support',
  'contextManagement.actions.nativeValues': 'native_string_set',
})

const PATH_SET = new Set<string>(CANONICAL_MODEL_FACT_PATHS_V1)
const MEDIA_SET = new Set<string>(CANONICAL_MEDIA_KINDS_V1)
const OPERATION_SET = new Set<string>(CANONICAL_OPERATION_KINDS_V1)
const SOURCE_KIND_SET = new Set<string>(['provider_native', 'models_dev', 'capability_rule'])

function invalid(code: CanonicalSourceFactsV1Error['code'] = 'GENERATION_V2_CANONICAL_SOURCE_FACTS_INVALID'): never {
  throw new CanonicalSourceFactsV1Error(code)
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

function boundedString(value: unknown, max = 512): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > max || value.trim() !== value ||
      /[\u0000-\u001f\u007f]/u.test(value)) invalid()
  return value
}

function canonicalSourceKind(value: unknown): CanonicalSourceKindV1 {
  if (typeof value !== 'string' || !SOURCE_KIND_SET.has(value)) invalid()
  return value as CanonicalSourceKindV1
}

function digest(value: unknown): string {
  return sha256PreparedBytesV2(new TextEncoder().encode(stableSerializeProviderRequestV2(value)))
}

function sortedUniqueStrings(value: unknown, allowed?: ReadonlySet<string>, maxItems = 256): readonly string[] {
  if (!Array.isArray(value) || value.length > maxItems) invalid()
  const items = value.map((entry) => boundedString(entry, 256))
  if (allowed && items.some((entry) => !allowed.has(entry))) invalid()
  const sorted = [...items].sort((left, right) => left.localeCompare(right, 'en'))
  if (new Set(sorted).size !== sorted.length) invalid()
  return Object.freeze(sorted)
}

function sortedUniqueIntegers(value: unknown): readonly number[] {
  if (!Array.isArray(value) || value.length > 64 ||
      value.some((entry) => !Number.isSafeInteger(entry))) invalid()
  const sorted = [...value as number[]].sort((left, right) => left - right)
  if (new Set(sorted).size !== sorted.length) invalid()
  return Object.freeze(sorted)
}

function completeness(value: unknown): CanonicalCollectionCompletenessV1 {
  if (value !== 'complete' && value !== 'partial') invalid()
  return value
}

function canonicalIntegerDomain(value: Record<string, unknown>): CanonicalIntegerDomainV1 {
  const keys = ['kind', 'completeness']
  for (const key of ['unit', 'interval', 'includedValues', 'excludedValues', 'symbolicNativeValues']) {
    if (value[key] !== undefined) keys.push(key)
  }
  exactKeys(value, keys)
  if (value.kind !== 'integer_domain' ||
      (value.completeness !== 'complete' && value.completeness !== 'partial_bounds') ||
      (value.unit !== undefined && value.unit !== 'token' && value.unit !== 'pixel')) invalid()
  let interval: CanonicalIntegerDomainV1['interval']
  if (value.interval !== undefined) {
    if (!plainObject(value.interval)) invalid()
    const intervalKeys = ['minInclusive', 'maxInclusive']
    if (value.interval.min !== undefined) intervalKeys.push('min')
    if (value.interval.max !== undefined) intervalKeys.push('max')
    exactKeys(value.interval, intervalKeys)
    if (typeof value.interval.minInclusive !== 'boolean' || typeof value.interval.maxInclusive !== 'boolean' ||
        (value.interval.min !== undefined && !Number.isSafeInteger(value.interval.min)) ||
        (value.interval.max !== undefined && !Number.isSafeInteger(value.interval.max)) ||
        (typeof value.interval.min === 'number' && typeof value.interval.max === 'number' &&
          value.interval.min > value.interval.max)) invalid()
    interval = Object.freeze({
      ...(value.interval.min === undefined ? {} : { min: value.interval.min as number }),
      ...(value.interval.max === undefined ? {} : { max: value.interval.max as number }),
      minInclusive: value.interval.minInclusive,
      maxInclusive: value.interval.maxInclusive,
    })
  }
  const includedValues = value.includedValues === undefined ? undefined : sortedUniqueIntegers(value.includedValues)
  const excludedValues = value.excludedValues === undefined ? undefined : sortedUniqueIntegers(value.excludedValues)
  if (includedValues && excludedValues && includedValues.some((entry) => excludedValues.includes(entry))) invalid()
  const symbolicNativeValues = value.symbolicNativeValues === undefined
    ? undefined : sortedUniqueStrings(value.symbolicNativeValues, undefined, 32)
  if (!interval && !includedValues?.length && !excludedValues?.length && !symbolicNativeValues?.length) invalid()
  return Object.freeze({ kind: 'integer_domain',
    ...(value.unit === undefined ? {} : { unit: value.unit as 'token' | 'pixel' }),
    ...(interval ? { interval } : {}),
    ...(includedValues ? { includedValues } : {}),
    ...(excludedValues ? { excludedValues } : {}),
    ...(symbolicNativeValues ? { symbolicNativeValues } : {}),
    completeness: value.completeness })
}

function gcd(left: number, right: number): number {
  let a = left
  let b = right
  while (b !== 0) [a, b] = [b, a % b]
  return a
}

function canonicalPairs(value: unknown, reduce: boolean): readonly Readonly<{ width: number; height: number }>[] {
  if (!Array.isArray(value) || value.length > 256) invalid()
  const pairs = value.map((entry) => {
    if (!plainObject(entry)) return invalid()
    exactKeys(entry, ['width', 'height'])
    if (!Number.isSafeInteger(entry.width) || !Number.isSafeInteger(entry.height) ||
        (entry.width as number) < 1 || (entry.height as number) < 1) return invalid()
    const divisor = reduce ? gcd(entry.width as number, entry.height as number) : 1
    return Object.freeze({ width: (entry.width as number) / divisor, height: (entry.height as number) / divisor })
  }).sort((left, right) => left.width - right.width || left.height - right.height)
  if (new Set(pairs.map((entry) => `${entry.width}:${entry.height}`)).size !== pairs.length) invalid()
  return Object.freeze(pairs)
}

export function isCanonicalSemanticPathV1(value: unknown): value is CanonicalSemanticPathV1 {
  return typeof value === 'string' && PATH_SET.has(value)
}

export function canonicalizeCanonicalFactValueV1(
  path: CanonicalSemanticPathV1,
  value: unknown,
): CanonicalFactValueV1 {
  if (!plainObject(value) || typeof value.kind !== 'string' || VALUE_KIND_BY_PATH[path] !== value.kind) invalid()
  switch (value.kind) {
    case 'support':
      exactKeys(value, ['kind', 'value'])
      if (value.value !== 'supported' && value.value !== 'unsupported') invalid()
      return Object.freeze({ kind: 'support', value: value.value })
    case 'boolean':
      exactKeys(value, ['kind', 'value'])
      if (typeof value.value !== 'boolean') invalid()
      return Object.freeze({ kind: 'boolean', value: value.value })
    case 'integer': {
      const keys = ['kind', 'value']
      if (value.unit !== undefined) keys.push('unit')
      exactKeys(value, keys)
      if (!Number.isSafeInteger(value.value) || (value.unit !== undefined && value.unit !== 'token' && value.unit !== 'pixel')) invalid()
      return Object.freeze({ kind: 'integer', value: value.value as number,
        ...(value.unit === undefined ? {} : { unit: value.unit as 'token' | 'pixel' }) })
    }
    case 'decimal':
      exactKeys(value, ['kind', 'value'])
      if (typeof value.value !== 'number' || !Number.isFinite(value.value)) invalid()
      return Object.freeze({ kind: 'decimal', value: value.value })
    case 'native_string':
      exactKeys(value, ['kind', 'value'])
      return Object.freeze({ kind: 'native_string', value: boundedString(value.value, 256) })
    case 'native_string_set':
      exactKeys(value, ['kind', 'values', 'completeness'])
      return Object.freeze({ kind: 'native_string_set', values: sortedUniqueStrings(value.values),
        completeness: completeness(value.completeness) })
    case 'media_kind_set':
      exactKeys(value, ['kind', 'values', 'completeness'])
      return Object.freeze({ kind: 'media_kind_set', values: sortedUniqueStrings(value.values, MEDIA_SET) as readonly CanonicalMediaKindV1[],
        completeness: completeness(value.completeness) })
    case 'operation_kind_set':
      exactKeys(value, ['kind', 'values', 'completeness'])
      return Object.freeze({ kind: 'operation_kind_set', values: sortedUniqueStrings(value.values, OPERATION_SET) as readonly CanonicalOperationKindV1[],
        completeness: completeness(value.completeness) })
    case 'integer_domain': return canonicalIntegerDomain(value)
    case 'aspect_ratio_set':
      exactKeys(value, ['kind', 'values', 'completeness'])
      return Object.freeze({ kind: 'aspect_ratio_set', values: canonicalPairs(value.values, true),
        completeness: completeness(value.completeness) })
    case 'dimensions_set':
      exactKeys(value, ['kind', 'values', 'completeness'])
      return Object.freeze({ kind: 'dimensions_set', values: canonicalPairs(value.values, false),
        completeness: completeness(value.completeness) })
    default: return invalid()
  }
}

export function canonicalizeCanonicalModelSubjectV1(value: unknown): CanonicalModelSubjectV1 {
  if (!plainObject(value)) return invalid()
  exactKeys(value, ['providerAuthorityId', 'endpointProfileId', 'nativeModelId'])
  return Object.freeze({ providerAuthorityId: boundedString(value.providerAuthorityId),
    endpointProfileId: boundedString(value.endpointProfileId), nativeModelId: boundedString(value.nativeModelId) })
}

export function buildCanonicalSourceRevisionRefV1(input: Omit<CanonicalSourceRevisionRefV1, 'canonicalSourceRevision'>): CanonicalSourceRevisionRefV1 {
  const projected = Object.freeze({ sourceKind: canonicalSourceKind(input.sourceKind), sourceScopeId: boundedString(input.sourceScopeId, 1024),
    rawSourceSnapshotRevision: boundedString(input.rawSourceSnapshotRevision, 256),
    adapterRevision: boundedString(input.adapterRevision, 256),
    coverageManifestRevision: boundedString(input.coverageManifestRevision, 256),
    providerAuthorityRegistryRevision: boundedString(input.providerAuthorityRegistryRevision, 256),
    ...(input.previousLkgSourceRevision === undefined ? {} : {
      previousLkgSourceRevision: boundedString(input.previousLkgSourceRevision, 256),
    }) })
  return Object.freeze({ ...projected,
    canonicalSourceRevision: `canonical-source-v1:${digest(projected)}` })
}

export function decodeCanonicalSourceRevisionRefV1(value: unknown): CanonicalSourceRevisionRefV1 {
  if (!plainObject(value)) return invalid()
  const keys = ['sourceKind', 'sourceScopeId', 'rawSourceSnapshotRevision', 'adapterRevision',
    'coverageManifestRevision', 'providerAuthorityRegistryRevision', 'canonicalSourceRevision']
  if (value.previousLkgSourceRevision !== undefined) keys.push('previousLkgSourceRevision')
  exactKeys(value, keys)
  const rebuilt = buildCanonicalSourceRevisionRefV1({
    sourceKind: canonicalSourceKind(value.sourceKind),
    sourceScopeId: boundedString(value.sourceScopeId, 1024),
    rawSourceSnapshotRevision: boundedString(value.rawSourceSnapshotRevision, 256),
    adapterRevision: boundedString(value.adapterRevision, 256),
    coverageManifestRevision: boundedString(value.coverageManifestRevision, 256),
    providerAuthorityRegistryRevision: boundedString(value.providerAuthorityRegistryRevision, 256),
    ...(value.previousLkgSourceRevision === undefined ? {} : {
      previousLkgSourceRevision: boundedString(value.previousLkgSourceRevision, 256),
    }),
  })
  if (value.canonicalSourceRevision !== rebuilt.canonicalSourceRevision) invalid()
  return rebuilt
}

function canonicalizeRawPayloadRefV1(value: unknown): RawPayloadRefV1 {
  if (!plainObject(value)) return invalid('GENERATION_V2_CANONICAL_SOURCE_FACTS_PROVENANCE_INVALID')
  const keys = ['storeId', 'persistedPayloadSha256', 'recordKey', 'sanitizerRevision']
  if (value.networkPayloadSha256 !== undefined) keys.push('networkPayloadSha256')
  exactKeys(value, keys)
  const digestPattern = /^[a-f0-9]{64}$/u
  if (typeof value.persistedPayloadSha256 !== 'string' || !digestPattern.test(value.persistedPayloadSha256) ||
      value.networkPayloadSha256 !== undefined &&
      (typeof value.networkPayloadSha256 !== 'string' || !digestPattern.test(value.networkPayloadSha256))) {
    invalid('GENERATION_V2_CANONICAL_SOURCE_FACTS_PROVENANCE_INVALID')
  }
  return Object.freeze({
    storeId: boundedString(value.storeId, 256),
    persistedPayloadSha256: value.persistedPayloadSha256,
    recordKey: boundedString(value.recordKey, 1024),
    sanitizerRevision: boundedString(value.sanitizerRevision, 256),
    ...(value.networkPayloadSha256 === undefined ? {} : { networkPayloadSha256: value.networkPayloadSha256 }),
  })
}

function canonicalizeSourceFieldRefV1(value: unknown): SourceFieldRefV1 {
  if (!plainObject(value)) return invalid('GENERATION_V2_CANONICAL_SOURCE_FACTS_PROVENANCE_INVALID')
  exactKeys(value, ['rawPayloadRef', 'sourceRecordIdentity', 'sourceFieldPath', 'observedPresence'])
  if (value.observedPresence !== 'present' && value.observedPresence !== 'expected_missing') {
    invalid('GENERATION_V2_CANONICAL_SOURCE_FACTS_PROVENANCE_INVALID')
  }
  return Object.freeze({
    rawPayloadRef: canonicalizeRawPayloadRefV1(value.rawPayloadRef),
    sourceRecordIdentity: boundedString(value.sourceRecordIdentity, 1024),
    sourceFieldPath: boundedString(value.sourceFieldPath, 1024),
    observedPresence: value.observedPresence,
  })
}

function canonicalizeObservationProvenanceV1(
  value: unknown,
  sourceRevision: CanonicalSourceRevisionRefV1,
): CanonicalObservationProvenanceV1 {
  if (!plainObject(value)) return invalid('GENERATION_V2_CANONICAL_SOURCE_FACTS_PROVENANCE_INVALID')
  exactKeys(value, ['sourceKind', 'canonicalSourceRevision', 'sourceFieldRefs', 'adapterId', 'adapterRevision', 'mappingId'])
  if (!Array.isArray(value.sourceFieldRefs) || value.sourceFieldRefs.length > 64) {
    invalid('GENERATION_V2_CANONICAL_SOURCE_FACTS_PROVENANCE_INVALID')
  }
  const sourceKind = canonicalSourceKind(value.sourceKind)
  if (sourceKind !== sourceRevision.sourceKind || value.canonicalSourceRevision !== sourceRevision.canonicalSourceRevision ||
      value.adapterRevision !== sourceRevision.adapterRevision) {
    invalid('GENERATION_V2_CANONICAL_SOURCE_FACTS_PROVENANCE_INVALID')
  }
  return Object.freeze({
    sourceKind,
    canonicalSourceRevision: sourceRevision.canonicalSourceRevision,
    sourceFieldRefs: Object.freeze(value.sourceFieldRefs.map(canonicalizeSourceFieldRefV1)),
    adapterId: boundedString(value.adapterId, 256),
    adapterRevision: sourceRevision.adapterRevision,
    mappingId: boundedString(value.mappingId, 512),
  })
}

function canonicalizeRuleClaimContextV1(value: unknown): RuleClaimContextV1 {
  if (!plainObject(value)) return invalid('GENERATION_V2_CANONICAL_SOURCE_FACTS_PROVENANCE_INVALID')
  exactKeys(value, ['ownerKind', 'ownerId', 'packId', 'ruleId', 'packRevision', 'ruleRevision', 'selectorKind',
    'selectorRef', 'packPriority', 'rulePriority', 'effectiveRulePriority', 'prioritySemanticsRevision'])
  if ((value.ownerKind !== 'built_in' && value.ownerKind !== 'user') ||
      (value.selectorKind !== 'exact' && value.selectorKind !== 'regex') ||
      !Number.isSafeInteger(value.packPriority) || !Number.isSafeInteger(value.rulePriority) ||
      !Number.isSafeInteger(value.effectiveRulePriority)) {
    invalid('GENERATION_V2_CANONICAL_SOURCE_FACTS_PROVENANCE_INVALID')
  }
  return Object.freeze({
    ownerKind: value.ownerKind,
    ownerId: boundedString(value.ownerId, 256),
    packId: boundedString(value.packId, 256),
    ruleId: boundedString(value.ruleId, 256),
    packRevision: boundedString(value.packRevision, 256),
    ruleRevision: boundedString(value.ruleRevision, 256),
    selectorKind: value.selectorKind,
    selectorRef: boundedString(value.selectorRef, 1024),
    packPriority: value.packPriority as number,
    rulePriority: value.rulePriority as number,
    effectiveRulePriority: value.effectiveRulePriority as number,
    prioritySemanticsRevision: boundedString(value.prioritySemanticsRevision, 256),
  })
}

function canonicalizeFactProvenanceV1(
  value: unknown,
  sourceRevision: CanonicalSourceRevisionRefV1,
): CanonicalFactProvenanceV1 {
  if (!plainObject(value)) return invalid('GENERATION_V2_CANONICAL_SOURCE_FACTS_PROVENANCE_INVALID')
  const allowed = ['sourceKind', 'canonicalSourceRevision', 'sourceFieldRefs', 'adapterId', 'adapterRevision', 'mappingId',
    'claimId', 'sourceClaimIdentity', 'assertionKind', 'evidenceRefs']
  if (value.ruleClaim !== undefined) allowed.push('ruleClaim')
  if (value.derivation !== undefined) allowed.push('derivation')
  exactKeys(value, allowed)
  const observation = canonicalizeObservationProvenanceV1({
    sourceKind: value.sourceKind,
    canonicalSourceRevision: value.canonicalSourceRevision,
    sourceFieldRefs: value.sourceFieldRefs,
    adapterId: value.adapterId,
    adapterRevision: value.adapterRevision,
    mappingId: value.mappingId,
  }, sourceRevision)
  if (value.assertionKind !== 'explicit' && value.assertionKind !== 'derived') {
    invalid('GENERATION_V2_CANONICAL_SOURCE_FACTS_PROVENANCE_INVALID')
  }
  if (!Array.isArray(value.evidenceRefs) || value.evidenceRefs.length > 64) {
    invalid('GENERATION_V2_CANONICAL_SOURCE_FACTS_PROVENANCE_INVALID')
  }
  let derivation: CanonicalFactProvenanceV1['derivation']
  if (value.derivation !== undefined) {
    if (!plainObject(value.derivation)) invalid('GENERATION_V2_CANONICAL_SOURCE_FACTS_PROVENANCE_INVALID')
    exactKeys(value.derivation, ['derivationId', 'derivationRevision', 'inputClaimRefs', 'inputEvidenceRefs'])
    if (!Array.isArray(value.derivation.inputClaimRefs) || !Array.isArray(value.derivation.inputEvidenceRefs)) {
      invalid('GENERATION_V2_CANONICAL_SOURCE_FACTS_PROVENANCE_INVALID')
    }
    derivation = Object.freeze({
      derivationId: boundedString(value.derivation.derivationId, 256),
      derivationRevision: boundedString(value.derivation.derivationRevision, 256),
      inputClaimRefs: sortedUniqueStrings(value.derivation.inputClaimRefs, undefined, 64),
      inputEvidenceRefs: sortedUniqueStrings(value.derivation.inputEvidenceRefs, undefined, 64),
    })
  }
  if ((value.assertionKind === 'derived' && !derivation) || (value.assertionKind === 'explicit' && derivation)) {
    invalid('GENERATION_V2_CANONICAL_SOURCE_FACTS_PROVENANCE_INVALID')
  }
  if ((sourceRevision.sourceKind === 'capability_rule' && value.ruleClaim === undefined) ||
      (sourceRevision.sourceKind !== 'capability_rule' && value.ruleClaim !== undefined)) {
    invalid('GENERATION_V2_CANONICAL_SOURCE_FACTS_PROVENANCE_INVALID')
  }
  return Object.freeze({
    ...observation,
    claimId: boundedString(value.claimId, 512),
    sourceClaimIdentity: boundedString(value.sourceClaimIdentity, 1024),
    assertionKind: value.assertionKind,
    evidenceRefs: sortedUniqueStrings(value.evidenceRefs, undefined, 64),
    ...(value.ruleClaim === undefined ? {} : { ruleClaim: canonicalizeRuleClaimContextV1(value.ruleClaim) }),
    ...(derivation ? { derivation } : {}),
  })
}

function canonicalizeAssertionV1(
  value: unknown,
  expectedPath: CanonicalSemanticPathV1,
  sourceRevision: CanonicalSourceRevisionRefV1,
): CanonicalFactAssertionV1 {
  if (!plainObject(value)) return invalid()
  exactKeys(value, ['path', 'value', 'provenance'])
  if (value.path !== expectedPath) invalid()
  return Object.freeze({
    path: expectedPath,
    value: canonicalizeCanonicalFactValueV1(expectedPath, value.value),
    provenance: canonicalizeFactProvenanceV1(value.provenance, sourceRevision),
  })
}

function canonicalizeUnmappedSourceFieldV1(value: unknown): UnmappedSourceFieldV1 {
  if (!plainObject(value)) return invalid()
  const allowed = ['sourceFieldRefs', 'reasonCode']
  if (value.candidateCanonicalPath !== undefined) allowed.push('candidateCanonicalPath')
  exactKeys(value, allowed)
  if (!Array.isArray(value.sourceFieldRefs) || value.sourceFieldRefs.length < 1 ||
      value.sourceFieldRefs.length > 64 ||
      (value.reasonCode !== 'unknown_field' && value.reasonCode !== 'unknown_member' &&
        value.reasonCode !== 'ambiguous_semantics' && value.reasonCode !== 'redacted_by_sanitizer') ||
      (value.candidateCanonicalPath !== undefined && !isCanonicalSemanticPathV1(value.candidateCanonicalPath))) invalid()
  return Object.freeze({ sourceFieldRefs: Object.freeze(value.sourceFieldRefs.map(canonicalizeSourceFieldRefV1)),
    reasonCode: value.reasonCode,
    ...(value.candidateCanonicalPath === undefined ? {} : { candidateCanonicalPath: value.candidateCanonicalPath }) })
}

function assertionKey(assertion: CanonicalFactAssertionV1): string {
  return `${assertion.path}\0${assertion.provenance.mappingId}`
}

function outcomeKey(outcome: CanonicalFieldOutcomeV1): string {
  const provenance = outcome.currentObservation.kind === 'present_valid'
    ? outcome.currentObservation.assertion.provenance : outcome.currentObservation.provenance
  return `${outcome.path}\0${provenance.mappingId}`
}

export function buildCanonicalSubjectFactV1(
  candidate: CanonicalSubjectFactCandidateV1,
  previous?: CanonicalSubjectFactPayloadV1 | null,
): Readonly<{ payload: CanonicalSubjectFactPayloadV1; ref: CanonicalSubjectFactRefV1 }> {
  const subject = canonicalizeCanonicalModelSubjectV1(candidate.subject)
  const sourceRevision = decodeCanonicalSourceRevisionRefV1(candidate.sourceRevision)
  if (candidate.schemaVersion !== 1 || !Array.isArray(candidate.outcomes) || !Array.isArray(candidate.unmappedSourceFields) ||
      candidate.outcomes.length > 2048 || candidate.unmappedSourceFields.length > 2048 ||
      !['present', 'no_matching_claims', 'absent_in_complete_snapshot',
        'indeterminate_in_incomplete_snapshot', 'invalid_identity'].includes(candidate.recordOutcome)) invalid()
  if (previous && stableSerializeProviderRequestV2(previous.subject) !== stableSerializeProviderRequestV2(subject)) {
    return invalid('GENERATION_V2_CANONICAL_SOURCE_FACTS_LKG_INVALID')
  }
  if (previous && (previous.sourceRevision.sourceKind !== sourceRevision.sourceKind ||
      previous.sourceRevision.sourceScopeId !== sourceRevision.sourceScopeId ||
      previous.sourceRevision.canonicalSourceRevision !== sourceRevision.previousLkgSourceRevision)) {
    return invalid('GENERATION_V2_CANONICAL_SOURCE_FACTS_LKG_INVALID')
  }
  const priorAssertions = new Map<string, CanonicalFactAssertionV1>()
  for (const outcome of previous?.outcomes ?? []) {
    if (outcome.effectiveAssertion) priorAssertions.set(assertionKey(outcome.effectiveAssertion), outcome.effectiveAssertion)
  }
  const outcomes = candidate.outcomes.map((outcome) => {
    if (!isCanonicalSemanticPathV1(outcome.path) || outcome.currentObservation.kind === 'present_valid' &&
        outcome.currentObservation.assertion.path !== outcome.path) invalid()
    if (outcome.currentObservation.kind === 'present_valid') {
      const canonicalAssertion = canonicalizeAssertionV1(outcome.currentObservation.assertion, outcome.path, sourceRevision)
      return Object.freeze({ observationId: boundedString(outcome.observationId, 512), path: outcome.path,
        currentObservation: Object.freeze({ kind: 'present_valid' as const, assertion: canonicalAssertion }),
        effectiveAssertion: canonicalAssertion, disposition: 'current' as const })
    }
    if (outcome.currentObservation.kind === 'missing') {
      const provenance = canonicalizeObservationProvenanceV1(outcome.currentObservation.provenance, sourceRevision)
      return Object.freeze({ observationId: boundedString(outcome.observationId, 512), path: outcome.path,
        currentObservation: Object.freeze({ kind: 'missing' as const, provenance }), disposition: 'none' as const })
    }
    if (outcome.currentObservation.kind !== 'invalid') invalid()
    const provenance = canonicalizeObservationProvenanceV1(outcome.currentObservation.provenance, sourceRevision)
    const retained = priorAssertions.get(outcomeKey(outcome))
    return Object.freeze({ observationId: boundedString(outcome.observationId, 512), path: outcome.path,
      currentObservation: Object.freeze({ kind: 'invalid' as const,
        errorCode: boundedString(outcome.currentObservation.errorCode, 256), provenance }),
      ...(retained ? { effectiveAssertion: retained } : {}),
      disposition: retained ? 'lkg_retained_after_invalid' as const : 'none' as const })
  }).sort((left, right) => `${left.path}\0${left.observationId}`.localeCompare(`${right.path}\0${right.observationId}`, 'en'))
  if (new Set(outcomes.map((outcome) => outcome.observationId)).size !== outcomes.length) invalid()
  const unmappedSourceFields = candidate.unmappedSourceFields.map(canonicalizeUnmappedSourceFieldV1).sort((left, right) =>
    stableSerializeProviderRequestV2(left).localeCompare(stableSerializeProviderRequestV2(right), 'en'))
  const semanticPayload = Object.freeze({ schemaVersion: 1 as const, subject, sourceRevision,
    recordOutcome: candidate.recordOutcome, outcomes: Object.freeze(outcomes),
    unmappedSourceFields: Object.freeze(unmappedSourceFields) })
  const subjectFactPayloadDigest = digest(semanticPayload)
  const payload = Object.freeze({ ...semanticPayload, subjectFactPayloadDigest })
  const ref = Object.freeze({ sourceRevision, subject,
    subjectFactPayloadDigest,
    canonicalSubjectFactRevision: `canonical-subject-fact-v1:${digest({
      canonicalSourceRevision: sourceRevision.canonicalSourceRevision,
      subject,
      subjectFactPayloadDigest,
    })}` })
  return Object.freeze({ payload, ref })
}

export function canonicalSourceFactDigestV1(value: unknown): string {
  return digest(value)
}

export const CANONICAL_MODEL_FACT_ONTOLOGY_SCHEMA_DIGEST_V1 = canonicalSourceFactDigestV1({
  ontologyVersion: CANONICAL_MODEL_FACT_ONTOLOGY_VERSION_V1,
  paths: CANONICAL_MODEL_FACT_PATHS_V1,
  valueKinds: VALUE_KIND_BY_PATH,
  mediaKinds: CANONICAL_MEDIA_KINDS_V1,
  operationKinds: CANONICAL_OPERATION_KINDS_V1,
})
