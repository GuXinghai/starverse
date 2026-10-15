import {
  canonicalSourceFactDigestV1,
  type CanonicalFactValueV1,
  type CanonicalMediaKindV1,
  type CanonicalModelSubjectV1,
  type CanonicalSourceRevisionRefV1,
  type CanonicalSubjectFactCandidateV1,
  type RawPayloadRefV1,
  type RawSourceSnapshotRefV1,
  type SourceFieldRefV1,
  type SourceRecordIndexV1,
  type UnmappedSourceFieldV1,
} from './canonicalSourceFactsV1'
import {
  PROVIDER_AUTHORITY_REGISTRY_REVISION_V1,
  providerAuthorityForModelsDevKeyV1,
} from './providerAuthorityRegistryV1'
import type { RawPayloadReaderV1 } from './rawSourceSnapshotV1'
import {
  buildExplicitAssertionV1,
  buildObservationProvenanceV1,
  invalidOutcomeV1,
  missingOutcomeV1,
  presentOutcomeV1,
  type CanonicalModelFactSourceAdapterV1,
} from './sourceAdapterV1'
import {
  MODELS_DEV_COVERAGE_MANIFEST_V1,
  type SourceMappingCoverageEntryV1,
} from './sourceCoverageManifestV1'

export const MODELS_DEV_SOURCE_ADAPTER_REVISION_V1 =
  'models-dev-source-adapter-v1.1.0:official-api-flattened-snapshot' as const

export type CreateModelsDevSourceAdapterV1Input = Readonly<{
  rawPayloadReader: RawPayloadReaderV1
}>

export class ModelsDevSourceAdapterV1Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_MODELS_DEV_ADAPTER_INVALID'
    | 'GENERATION_V2_MODELS_DEV_ENVELOPE_INVALID') {
    super(code)
    this.name = 'ModelsDevSourceAdapterV1Error'
  }
}

type JsonRecord = Record<string, unknown>

type LocatedRecord = Readonly<{
  record: JsonRecord
  rawRef: RawPayloadRefV1
  modelsDevProviderKey: string
  providerAuthorityId: string
  endpointProfileId: string
  nativeModelId: string
  sourceRecordIdentity: string
}>

type RecordScan = Readonly<{
  records: readonly LocatedRecord[]
  duplicateModelIds: ReadonlySet<string>
  invalidRecordRefs: readonly RawPayloadRefV1[]
}>

const INVALID_FIELD = 'GENERATION_V2_MODELS_DEV_FIELD_INVALID'
const ID_LIMIT = 512

function invalid(code: ModelsDevSourceAdapterV1Error['code']): never {
  throw new ModelsDevSourceAdapterV1Error(code)
}

function plainObject(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null))
}

function boundedString(value: unknown, max = ID_LIMIT): string | null {
  if (typeof value !== 'string' || value.length < 1 || value.length > max || value.trim() !== value ||
      /[\u0000-\u001f\u007f]/u.test(value)) return null
  return value
}

function own(record: JsonRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key)
}

function nested(record: JsonRecord, path: readonly string[]): Readonly<{
  present: boolean
  invalidParent: boolean
  value?: unknown
}> {
  let cursor: unknown = record
  for (const key of path) {
    if (!plainObject(cursor)) return Object.freeze({ present: false, invalidParent: true })
    if (!own(cursor, key)) return Object.freeze({ present: false, invalidParent: false })
    cursor = cursor[key]
  }
  return Object.freeze({ present: true, invalidParent: false, value: cursor })
}

function uniqueRawRefs(refs: readonly RawPayloadRefV1[]): readonly RawPayloadRefV1[] {
  const unique = new Map<string, RawPayloadRefV1>()
  for (const ref of refs) unique.set(`${ref.storeId}\0${ref.recordKey}`, ref)
  return Object.freeze([...unique.values()].sort((left, right) =>
    `${left.storeId}\0${left.recordKey}`.localeCompare(`${right.storeId}\0${right.recordKey}`, 'en')))
}

function completeness(rawSnapshot: RawSourceSnapshotRefV1): SourceRecordIndexV1['recordSetCompleteness'] {
  if (rawSnapshot.recordSetCompleteness === 'complete') return 'complete'
  if (rawSnapshot.recordSetCompleteness === 'partial') return 'partial'
  return 'unknown'
}

function absentOutcome(rawSnapshot: RawSourceSnapshotRefV1): CanonicalSubjectFactCandidateV1['recordOutcome'] {
  return rawSnapshot.recordSetCompleteness === 'complete'
    ? 'absent_in_complete_snapshot'
    : 'indeterminate_in_incomplete_snapshot'
}

function sourceFieldRef(
  located: LocatedRecord,
  sourceFieldPath: string,
  observedPresence: SourceFieldRefV1['observedPresence'] = 'present',
): SourceFieldRefV1 {
  return Object.freeze({ rawPayloadRef: located.rawRef, sourceRecordIdentity: located.sourceRecordIdentity,
    sourceFieldPath, observedPresence })
}

function mappingById(mappingId: string): SourceMappingCoverageEntryV1 {
  const mapping = MODELS_DEV_COVERAGE_MANIFEST_V1.mappings.find((candidate) => candidate.mappingId === mappingId)
  return mapping ?? invalid('GENERATION_V2_MODELS_DEV_ADAPTER_INVALID')
}

function supportValue(value: boolean): CanonicalFactValueV1 {
  return Object.freeze({ kind: 'support', value: value ? 'supported' : 'unsupported' })
}

function safePositiveInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) > 0 ? value as number : null
}

function safeNonNegativeInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : null
}

function optionalBound(record: JsonRecord, key: 'min' | 'max'): Readonly<{
  present: boolean
  valid: boolean
  value?: number
}> {
  if (!own(record, key)) return Object.freeze({ present: false, valid: true })
  const value = safeNonNegativeInteger(record[key])
  return value === null
    ? Object.freeze({ present: true, valid: false })
    : Object.freeze({ present: true, valid: true, value })
}

function mapMediaCollection(value: unknown): Readonly<{
  valid: boolean
  values: readonly CanonicalMediaKindV1[]
  unknownIndexes: readonly number[]
}> {
  if (!Array.isArray(value) || value.length > 256) {
    return Object.freeze({ valid: false, values: Object.freeze([]), unknownIndexes: Object.freeze([]) })
  }
  const aliases: Readonly<Record<string, CanonicalMediaKindV1>> = Object.freeze({
    text: 'text', image: 'image', audio: 'audio', video: 'video', pdf: 'pdf', file: 'generic_file',
  })
  const values: CanonicalMediaKindV1[] = []
  const unknownIndexes: number[] = []
  const rawMembers = new Set<string>()
  for (let index = 0; index < value.length; index += 1) {
    const member = value[index]
    if (typeof member !== 'string' || !boundedString(member, 256) || rawMembers.has(member)) {
      return Object.freeze({ valid: false, values: Object.freeze([]), unknownIndexes: Object.freeze([]) })
    }
    rawMembers.add(member)
    const mapped = aliases[member]
    if (mapped === undefined) unknownIndexes.push(index)
    else values.push(mapped)
  }
  if (new Set(values).size !== values.length) {
    return Object.freeze({ valid: false, values: Object.freeze([]), unknownIndexes: Object.freeze([]) })
  }
  return Object.freeze({ valid: true, values: Object.freeze(values), unknownIndexes: Object.freeze(unknownIndexes) })
}

function validateInvocation(
  rawSnapshot: RawSourceSnapshotRefV1,
  sourceRevision: CanonicalSourceRevisionRefV1,
): void {
  if (rawSnapshot.sourceKind !== 'models_dev' || sourceRevision.sourceKind !== 'models_dev' ||
      sourceRevision.sourceScopeId !== rawSnapshot.sourceScopeId ||
      sourceRevision.rawSourceSnapshotRevision !== rawSnapshot.rawSourceSnapshotRevision ||
      sourceRevision.adapterRevision !== MODELS_DEV_SOURCE_ADAPTER_REVISION_V1 ||
      sourceRevision.coverageManifestRevision !== MODELS_DEV_COVERAGE_MANIFEST_V1.manifestRevision ||
      sourceRevision.providerAuthorityRegistryRevision !== PROVIDER_AUTHORITY_REGISTRY_REVISION_V1) {
    invalid('GENERATION_V2_MODELS_DEV_ADAPTER_INVALID')
  }
}

function createCollector(input: Readonly<{
  adapterId: string
  sourceRevision: CanonicalSourceRevisionRefV1
  subject: CanonicalModelSubjectV1
  located: LocatedRecord
}>) {
  const outcomes: CanonicalSubjectFactCandidateV1['outcomes'][number][] = []
  const unmappedSourceFields: UnmappedSourceFieldV1[] = []

  const provenance = (mapping: SourceMappingCoverageEntryV1, refs: readonly SourceFieldRefV1[]) =>
    buildObservationProvenanceV1({ sourceRevision: input.sourceRevision, sourceFieldRefs: refs,
      adapterId: input.adapterId, adapterRevision: MODELS_DEV_SOURCE_ADAPTER_REVISION_V1, mappingId: mapping.mappingId })

  const present = (mappingId: string, value: CanonicalFactValueV1, refs: readonly SourceFieldRefV1[]) => {
    const mapping = mappingById(mappingId)
    const assertion = buildExplicitAssertionV1({ subject: input.subject, sourceRevision: input.sourceRevision,
      path: mapping.canonicalPath, value,
      sourceClaimIdentity: `models-dev-claim-v1:${canonicalSourceFactDigestV1({
        sourceRecordIdentity: input.located.sourceRecordIdentity, mappingId,
      })}`,
      evidenceRefs: refs.map((ref) => `${ref.rawPayloadRef.storeId}#${ref.sourceFieldPath}`),
      observationProvenance: provenance(mapping, refs) })
    outcomes.push(presentOutcomeV1({ assertion }))
  }

  const missing = (mappingId: string) => {
    const mapping = mappingById(mappingId)
    if (mapping.absenceSemantics === 'no_outcome') return
    const refs = mapping.sourceFieldPaths.map((path) => sourceFieldRef(input.located, path, 'expected_missing'))
    if (mapping.absenceSemantics === 'explicit_unsupported') {
      present(mappingId, Object.freeze({ kind: 'support', value: 'unsupported' }), refs)
      return
    }
    outcomes.push(missingOutcomeV1({ path: mapping.canonicalPath, provenance: provenance(mapping, refs) }))
  }

  const invalidField = (mappingId: string, sourcePaths?: readonly string[]) => {
    const mapping = mappingById(mappingId)
    const refs = (sourcePaths ?? mapping.sourceFieldPaths).map((path) => sourceFieldRef(input.located, path))
    outcomes.push(invalidOutcomeV1({ path: mapping.canonicalPath, provenance: provenance(mapping, refs),
      errorCode: INVALID_FIELD }))
  }

  const unmapped = (
    sourceFieldPath: string,
    reasonCode: UnmappedSourceFieldV1['reasonCode'],
    candidateCanonicalPath?: UnmappedSourceFieldV1['candidateCanonicalPath'],
  ) => {
    unmappedSourceFields.push(Object.freeze({ sourceFieldRefs: Object.freeze([
      sourceFieldRef(input.located, sourceFieldPath),
    ]), reasonCode, ...(candidateCanonicalPath ? { candidateCanonicalPath } : {}) }))
  }

  return { outcomes, unmappedSourceFields, present, missing, invalidField, unmapped }
}

function addBooleanSupport(
  collector: ReturnType<typeof createCollector>,
  located: LocatedRecord,
  field: string,
  mappingId: string,
): void {
  if (!own(located.record, field)) return collector.missing(mappingId)
  const value = located.record[field]
  if (typeof value !== 'boolean') return collector.invalidField(mappingId, [field])
  collector.present(mappingId, supportValue(value), [sourceFieldRef(located, field)])
}

function addLimits(collector: ReturnType<typeof createCollector>, located: LocatedRecord): void {
  for (const descriptor of [
    { field: 'context', mappingId: 'models-dev.context-limit.v1' },
    { field: 'input', mappingId: 'models-dev.input-limit.v1' },
    { field: 'output', mappingId: 'models-dev.output-limit.v1' },
  ] as const) {
    const read = nested(located.record, ['limit', descriptor.field])
    if (read.invalidParent) {
      collector.invalidField(descriptor.mappingId, [`limit.${descriptor.field}`])
      continue
    }
    if (!read.present) {
      collector.missing(descriptor.mappingId)
      continue
    }
    const value = safePositiveInteger(read.value)
    if (value === null) collector.invalidField(descriptor.mappingId, [`limit.${descriptor.field}`])
    else collector.present(descriptor.mappingId, Object.freeze({ kind: 'integer', value, unit: 'token' }),
      [sourceFieldRef(located, `limit.${descriptor.field}`)])
  }
}

function addModalities(collector: ReturnType<typeof createCollector>, located: LocatedRecord): void {
  for (const descriptor of [
    { field: 'input', mappingId: 'models-dev.input-modalities.v1' },
    { field: 'output', mappingId: 'models-dev.output-modalities.v1' },
  ] as const) {
    const read = nested(located.record, ['modalities', descriptor.field])
    if (read.invalidParent) {
      collector.invalidField(descriptor.mappingId, [`modalities.${descriptor.field}`])
      continue
    }
    if (!read.present) {
      collector.missing(descriptor.mappingId)
      continue
    }
    const mapped = mapMediaCollection(read.value)
    if (!mapped.valid) {
      collector.invalidField(descriptor.mappingId, [`modalities.${descriptor.field}`])
      continue
    }
    mapped.unknownIndexes.forEach((index) => collector.unmapped(`modalities.${descriptor.field}[${index}]`,
      'unknown_member', mappingById(descriptor.mappingId).canonicalPath))
    collector.present(descriptor.mappingId, Object.freeze({ kind: 'media_kind_set', values: mapped.values,
      completeness: mapped.unknownIndexes.length > 0 ? 'partial' : 'complete' }),
    [sourceFieldRef(located, `modalities.${descriptor.field}`)])
  }
}

function optionIndexes(options: readonly JsonRecord[], type: string): readonly number[] {
  const indexes: number[] = []
  options.forEach((option, index) => {
    if (option.type === type) indexes.push(index)
  })
  return Object.freeze(indexes)
}

function addToggleOption(
  collector: ReturnType<typeof createCollector>,
  located: LocatedRecord,
  options: readonly JsonRecord[],
): void {
  const indexes = optionIndexes(options, 'toggle')
  if (indexes.length === 0) return collector.missing('models-dev.reasoning-toggle.v1')
  if (indexes.length > 1) return collector.invalidField('models-dev.reasoning-toggle.v1', ['reasoning_options'])
  collector.present('models-dev.reasoning-toggle.v1', supportValue(true),
    [sourceFieldRef(located, `reasoning_options[${indexes[0]}]`)])
}

function addEffortOption(
  collector: ReturnType<typeof createCollector>,
  located: LocatedRecord,
  options: readonly JsonRecord[],
  openRouter: boolean,
): void {
  const indexes = optionIndexes(options, 'effort')
  if (openRouter) {
    indexes.forEach((index) => collector.unmapped(`reasoning_options[${index}]`, 'ambiguous_semantics',
      'reasoning.effort.nativeValues'))
    return
  }
  if (indexes.length === 0) return collector.missing('models-dev.reasoning-effort.v1')
  if (indexes.length > 1) return collector.invalidField('models-dev.reasoning-effort.v1', ['reasoning_options'])
  const index = indexes[0]!
  const values = options[index]!.values
  if (!Array.isArray(values) || values.length > 256 ||
      values.some((value) => typeof value !== 'string' || !boundedString(value, 256)) ||
      new Set(values).size !== values.length) {
    collector.invalidField('models-dev.reasoning-effort.v1', [`reasoning_options[${index}].values`])
    return
  }
  collector.present('models-dev.reasoning-effort.v1', Object.freeze({ kind: 'native_string_set',
    values: values as string[], completeness: 'complete' }),
  [sourceFieldRef(located, `reasoning_options[${index}].values`)])
}

function addBudgetOption(
  collector: ReturnType<typeof createCollector>,
  located: LocatedRecord,
  options: readonly JsonRecord[],
): void {
  const indexes = optionIndexes(options, 'budget_tokens')
  if (indexes.length === 0) {
    collector.missing('models-dev.reasoning-budget-support.v1')
    collector.missing('models-dev.reasoning-budget-domain.v1')
    return
  }
  if (indexes.length > 1) {
    collector.invalidField('models-dev.reasoning-budget-support.v1', ['reasoning_options'])
    collector.invalidField('models-dev.reasoning-budget-domain.v1', ['reasoning_options'])
    return
  }
  const index = indexes[0]!
  const option = options[index]!
  collector.present('models-dev.reasoning-budget-support.v1', supportValue(true),
    [sourceFieldRef(located, `reasoning_options[${index}]`)])
  const min = optionalBound(option, 'min')
  const max = optionalBound(option, 'max')
  if (!min.present && !max.present) return collector.missing('models-dev.reasoning-budget-domain.v1')
  if (!min.valid || !max.valid || min.value !== undefined && max.value !== undefined && min.value > max.value) {
    collector.invalidField('models-dev.reasoning-budget-domain.v1', [
      ...(min.present ? [`reasoning_options[${index}].min`] : []),
      ...(max.present ? [`reasoning_options[${index}].max`] : []),
    ])
    return
  }
  collector.present('models-dev.reasoning-budget-domain.v1', Object.freeze({ kind: 'integer_domain', unit: 'token',
    interval: Object.freeze({ ...(min.value === undefined ? {} : { min: min.value }),
      ...(max.value === undefined ? {} : { max: max.value }),
      minInclusive: true, maxInclusive: true }),
    completeness: min.present && max.present ? 'complete' : 'partial_bounds' }), [
    ...(min.present ? [sourceFieldRef(located, `reasoning_options[${index}].min`)] : []),
    ...(max.present ? [sourceFieldRef(located, `reasoning_options[${index}].max`)] : []),
  ])
}

function addReasoningOptions(
  collector: ReturnType<typeof createCollector>,
  located: LocatedRecord,
  providerAuthorityId: string,
): void {
  const openRouter = providerAuthorityId === 'openrouter'
  if (!own(located.record, 'reasoning_options')) {
    collector.missing('models-dev.reasoning-toggle.v1')
    if (!openRouter) collector.missing('models-dev.reasoning-effort.v1')
    collector.missing('models-dev.reasoning-budget-support.v1')
    collector.missing('models-dev.reasoning-budget-domain.v1')
    return
  }
  const rawOptions = located.record.reasoning_options
  if (!Array.isArray(rawOptions) || rawOptions.length > 64 || rawOptions.some((option) => !plainObject(option) ||
      !boundedString(option.type, 64))) {
    collector.invalidField('models-dev.reasoning-toggle.v1', ['reasoning_options'])
    if (!openRouter) collector.invalidField('models-dev.reasoning-effort.v1', ['reasoning_options'])
    collector.invalidField('models-dev.reasoning-budget-support.v1', ['reasoning_options'])
    collector.invalidField('models-dev.reasoning-budget-domain.v1', ['reasoning_options'])
    return
  }
  const options = rawOptions as JsonRecord[]
  options.forEach((option, index) => {
    const type = option.type as string
    if (type !== 'toggle' && type !== 'effort' && type !== 'budget_tokens') {
      collector.unmapped(`reasoning_options[${index}]`, 'unknown_member')
    }
  })
  addToggleOption(collector, located, options)
  addEffortOption(collector, located, options, openRouter)
  addBudgetOption(collector, located, options)
}

function addModelsDevFacts(
  collector: ReturnType<typeof createCollector>,
  located: LocatedRecord,
  providerAuthorityId: string,
): void {
  addBooleanSupport(collector, located, 'attachment', 'models-dev.attachment.v1')
  addBooleanSupport(collector, located, 'reasoning', 'models-dev.reasoning.v1')
  addBooleanSupport(collector, located, 'tool_call', 'models-dev.tool-call.v1')
  addBooleanSupport(collector, located, 'structured_output', 'models-dev.structured-output.v1')
  addBooleanSupport(collector, located, 'temperature', 'models-dev.temperature.v1')
  addModalities(collector, located)
  addLimits(collector, located)
  addReasoningOptions(collector, located, providerAuthorityId)
}

export function createModelsDevSourceAdapterV1(
  input: CreateModelsDevSourceAdapterV1Input,
): CanonicalModelFactSourceAdapterV1 {
  const adapterId = 'models-dev-source-adapter-v1:official-api'
  const scanCache = new Map<string, RecordScan>()
  const scan = (rawSnapshot: RawSourceSnapshotRefV1): RecordScan => {
    const cached = scanCache.get(rawSnapshot.rawSourceSnapshotRevision)
    if (cached) return cached
    const records: LocatedRecord[] = []
    const invalidRefs: RawPayloadRefV1[] = []
    for (const rawRef of rawSnapshot.rawEnvelopeRefs) {
      const payload = input.rawPayloadReader.readRawPayload(rawRef)
      if (!plainObject(payload)) invalid('GENERATION_V2_MODELS_DEV_ENVELOPE_INVALID')
      for (const [providerKey, providerRecord] of Object.entries(payload)) {
        if (!boundedString(providerKey, 256)) {
          invalidRefs.push(rawRef)
          continue
        }
        let authority
        try { authority = providerAuthorityForModelsDevKeyV1(providerKey) } catch { continue }
        if (authority.executionBindings.length !== 1) continue
        const endpointProfileId = authority.executionBindings[0]!.endpointProfileKind
        if (!plainObject(providerRecord) || providerRecord.id !== providerKey || !plainObject(providerRecord.models)) {
          invalidRefs.push(rawRef)
          continue
        }
        const models = providerRecord.models as JsonRecord
        for (const [modelKey, candidate] of Object.entries(models)) {
          const nativeModelId = boundedString(modelKey)
          if (!nativeModelId || !plainObject(candidate) || boundedString(candidate.id) !== nativeModelId) {
            invalidRefs.push(rawRef)
            continue
          }
          records.push(Object.freeze({ record: candidate, rawRef, modelsDevProviderKey: providerKey,
            providerAuthorityId: authority.providerAuthorityId, endpointProfileId, nativeModelId,
            sourceRecordIdentity: `models-dev:${providerKey}:${nativeModelId}` }))
        }
      }
    }
    const counts = new Map<string, number>()
    const recordKey = (located: LocatedRecord) =>
      `${located.providerAuthorityId}\0${located.endpointProfileId}\0${located.nativeModelId}`
    for (const located of records) counts.set(recordKey(located), (counts.get(recordKey(located)) ?? 0) + 1)
    const duplicateModelIds = new Set([...counts].filter(([, count]) => count > 1).map(([key]) => key))
    for (const located of records) if (duplicateModelIds.has(recordKey(located))) invalidRefs.push(located.rawRef)
    const result = Object.freeze({ records: Object.freeze(records.filter((record) =>
      !duplicateModelIds.has(recordKey(record)))), duplicateModelIds, invalidRecordRefs: uniqueRawRefs(invalidRefs) })
    scanCache.set(rawSnapshot.rawSourceSnapshotRevision, result)
    return result
  }
  return Object.freeze({
    sourceKind: 'models_dev' as const,
    adapterId,
    adapterRevision: MODELS_DEV_SOURCE_ADAPTER_REVISION_V1,
    coverageManifest: MODELS_DEV_COVERAGE_MANIFEST_V1,
    subjectDiscovery: 'enumerable' as const,
    indexRawRecords(rawSnapshot: RawSourceSnapshotRefV1): SourceRecordIndexV1 {
      if (rawSnapshot.sourceKind !== 'models_dev') invalid('GENERATION_V2_MODELS_DEV_ADAPTER_INVALID')
      const result = scan(rawSnapshot)
      const exactSubjects = result.records.map((record) => Object.freeze({
        providerAuthorityId: record.providerAuthorityId, endpointProfileId: record.endpointProfileId,
        nativeModelId: record.nativeModelId,
      })).sort((left, right) => `${left.providerAuthorityId}\0${left.endpointProfileId}\0${left.nativeModelId}`
        .localeCompare(`${right.providerAuthorityId}\0${right.endpointProfileId}\0${right.nativeModelId}`, 'en'))
      return Object.freeze({ sourceScopeId: rawSnapshot.sourceScopeId, recordSetCompleteness: completeness(rawSnapshot),
        exactSubjects: Object.freeze(exactSubjects), invalidRecordRefs: result.invalidRecordRefs })
    },
    adaptExactSubject({ rawSnapshot, sourceRevision, subject }:
      Parameters<CanonicalModelFactSourceAdapterV1['adaptExactSubject']>[0]): CanonicalSubjectFactCandidateV1 {
      validateInvocation(rawSnapshot, sourceRevision)
      const result = scan(rawSnapshot)
      const subjectKey = `${subject.providerAuthorityId}\0${subject.endpointProfileId}\0${subject.nativeModelId}`
      if (result.duplicateModelIds.has(subjectKey)) {
        return Object.freeze({ schemaVersion: 1 as const, subject, sourceRevision,
          recordOutcome: 'invalid_identity' as const, outcomes: Object.freeze([]),
          unmappedSourceFields: Object.freeze([]) })
      }
      const located = result.records.find((record) => record.providerAuthorityId === subject.providerAuthorityId &&
        record.endpointProfileId === subject.endpointProfileId && record.nativeModelId === subject.nativeModelId)
      if (!located) {
        return Object.freeze({ schemaVersion: 1 as const, subject, sourceRevision,
          recordOutcome: absentOutcome(rawSnapshot), outcomes: Object.freeze([]),
          unmappedSourceFields: Object.freeze([]) })
      }
      const collector = createCollector({ adapterId, sourceRevision, subject, located })
      addModelsDevFacts(collector, located, located.providerAuthorityId)
      return Object.freeze({ schemaVersion: 1 as const, subject, sourceRevision, recordOutcome: 'present' as const,
        outcomes: Object.freeze(collector.outcomes), unmappedSourceFields: Object.freeze(collector.unmappedSourceFields) })
    },
  })
}
