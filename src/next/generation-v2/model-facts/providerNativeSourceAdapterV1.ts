import {
  canonicalSourceFactDigestV1,
  type CanonicalFactValueV1,
  type CanonicalMediaKindV1,
  type CanonicalModelSubjectV1,
  type CanonicalOperationKindV1,
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
  providerAuthorityForNativeSurfaceV1,
  type ProviderAuthorityRegistryEntryV1,
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
  PROVIDER_NATIVE_COVERAGE_MANIFESTS_V1,
  type SourceMappingCoverageEntryV1,
  type SourceMappingCoverageManifestV1,
} from './sourceCoverageManifestV1'

export const PROVIDER_NATIVE_SOURCE_ADAPTER_REVISION_V1 = 'provider-native-source-adapter-v1.0.0' as const

export type ProviderNativeSurfaceIdV1 = keyof typeof PROVIDER_NATIVE_COVERAGE_MANIFESTS_V1

export type CreateProviderNativeSourceAdapterV1Input = Readonly<{
  sourceSurfaceId: ProviderNativeSurfaceIdV1
  endpointProfileId?: string
  rawPayloadReader: RawPayloadReaderV1
}>

export class ProviderNativeSourceAdapterV1Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_PROVIDER_NATIVE_ADAPTER_INVALID'
    | 'GENERATION_V2_PROVIDER_NATIVE_ENVELOPE_INVALID') {
    super(code)
    this.name = 'ProviderNativeSourceAdapterV1Error'
  }
}

type JsonRecord = Record<string, unknown>

type LocatedRecord = Readonly<{
  record: JsonRecord
  rawRef: RawPayloadRefV1
  recordIndex: number
  nativeModelId: string
  sourceRecordIdentity: string
}>

type RecordScan = Readonly<{
  records: readonly LocatedRecord[]
  duplicateModelIds: ReadonlySet<string>
  invalidRecordRefs: readonly RawPayloadRefV1[]
}>

const INVALID_FIELD = 'GENERATION_V2_PROVIDER_NATIVE_FIELD_INVALID'
const NATIVE_ID_LIMIT = 512

function invalid(code: ProviderNativeSourceAdapterV1Error['code']): never {
  throw new ProviderNativeSourceAdapterV1Error(code)
}

function plainObject(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null))
}

function boundedIdentity(value: unknown): string | null {
  if (typeof value !== 'string' || value.length < 1 || value.length > NATIVE_ID_LIMIT ||
      value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) return null
  return value
}

function recordIdentity(surfaceId: ProviderNativeSurfaceIdV1, record: JsonRecord): string | null {
  if (surfaceId === 'gemini-models-v1beta') {
    const name = boundedIdentity(record.name)
    if (!name) return null
    const nativeModelId = name.startsWith('models/') ? name.slice('models/'.length) : name
    return boundedIdentity(nativeModelId)
  }
  if (surfaceId === 'lmstudio-models-v1') return boundedIdentity(record.key)
  if (surfaceId === 'ollama-tags-v1') {
    const name = record.name === undefined ? null : boundedIdentity(record.name)
    const model = record.model === undefined ? null : boundedIdentity(record.model)
    if (record.name !== undefined && !name || record.model !== undefined && !model) return null
    if (name && model && name !== model) return null
    return name ?? model
  }
  return boundedIdentity(record.id)
}

function envelopeRecords(surfaceId: ProviderNativeSurfaceIdV1, payload: unknown): readonly unknown[] {
  if (!plainObject(payload)) return invalid('GENERATION_V2_PROVIDER_NATIVE_ENVELOPE_INVALID')
  const key = surfaceId === 'gemini-models-v1beta' || surfaceId === 'lmstudio-models-v1' ||
    surfaceId === 'ollama-tags-v1' ? 'models' : 'data'
  const records = payload[key]
  if (!Array.isArray(records)) return invalid('GENERATION_V2_PROVIDER_NATIVE_ENVELOPE_INVALID')
  return records
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

function safePositiveInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) > 0 ? value as number : null
}

function safeDecimal(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function supportValue(value: boolean): CanonicalFactValueV1 {
  return Object.freeze({ kind: 'support', value: value ? 'supported' : 'unsupported' })
}

function mappingById(
  manifest: SourceMappingCoverageManifestV1,
  mappingId: string,
): SourceMappingCoverageEntryV1 {
  const mapping = manifest.mappings.find((candidate) => candidate.mappingId === mappingId)
  return mapping ?? invalid('GENERATION_V2_PROVIDER_NATIVE_ADAPTER_INVALID')
}

function validateInvocation(
  rawSnapshot: RawSourceSnapshotRefV1,
  sourceRevision: CanonicalSourceRevisionRefV1,
  manifest: SourceMappingCoverageManifestV1,
  authority: ProviderAuthorityRegistryEntryV1,
): void {
  if (rawSnapshot.sourceKind !== 'provider_native' || sourceRevision.sourceKind !== 'provider_native' ||
      sourceRevision.sourceScopeId !== rawSnapshot.sourceScopeId ||
      sourceRevision.rawSourceSnapshotRevision !== rawSnapshot.rawSourceSnapshotRevision ||
      sourceRevision.adapterRevision !== PROVIDER_NATIVE_SOURCE_ADAPTER_REVISION_V1 ||
      sourceRevision.coverageManifestRevision !== manifest.manifestRevision ||
      sourceRevision.providerAuthorityRegistryRevision !== PROVIDER_AUTHORITY_REGISTRY_REVISION_V1 ||
      !authority.providerNativeSurfaceIds.includes(manifest.sourceSurfaceId)) {
    invalid('GENERATION_V2_PROVIDER_NATIVE_ADAPTER_INVALID')
  }
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
  const mapped: CanonicalMediaKindV1[] = []
  const unknownIndexes: number[] = []
  const rawMembers = new Set<string>()
  for (let index = 0; index < value.length; index += 1) {
    const member = value[index]
    if (typeof member !== 'string' || !boundedIdentity(member) || rawMembers.has(member)) {
      return Object.freeze({ valid: false, values: Object.freeze([]), unknownIndexes: Object.freeze([]) })
    }
    rawMembers.add(member)
    const canonical = aliases[member]
    if (canonical === undefined) unknownIndexes.push(index)
    else mapped.push(canonical)
  }
  if (new Set(mapped).size !== mapped.length) {
    return Object.freeze({ valid: false, values: Object.freeze([]), unknownIndexes: Object.freeze([]) })
  }
  return Object.freeze({ valid: true, values: Object.freeze(mapped),
    unknownIndexes: Object.freeze(unknownIndexes) })
}

function createCollector(input: Readonly<{
  adapterId: string
  manifest: SourceMappingCoverageManifestV1
  sourceRevision: CanonicalSourceRevisionRefV1
  subject: CanonicalModelSubjectV1
  located: LocatedRecord
}>) {
  const outcomes: CanonicalSubjectFactCandidateV1['outcomes'][number][] = []
  const unmappedSourceFields: UnmappedSourceFieldV1[] = []

  const provenance = (mapping: SourceMappingCoverageEntryV1, refs: readonly SourceFieldRefV1[]) =>
    buildObservationProvenanceV1({ sourceRevision: input.sourceRevision, sourceFieldRefs: refs,
      adapterId: input.adapterId, adapterRevision: PROVIDER_NATIVE_SOURCE_ADAPTER_REVISION_V1,
      mappingId: mapping.mappingId })

  const present = (mappingId: string, value: CanonicalFactValueV1, refs: readonly SourceFieldRefV1[]) => {
    const mapping = mappingById(input.manifest, mappingId)
    const assertion = buildExplicitAssertionV1({ subject: input.subject, sourceRevision: input.sourceRevision,
      path: mapping.canonicalPath, value,
      sourceClaimIdentity: `provider-native-claim-v1:${canonicalSourceFactDigestV1({
        sourceRecordIdentity: input.located.sourceRecordIdentity, mappingId,
      })}`,
      evidenceRefs: refs.map((ref) => `${ref.rawPayloadRef.storeId}#${ref.sourceFieldPath}`),
      observationProvenance: provenance(mapping, refs) })
    outcomes.push(presentOutcomeV1({ assertion }))
  }

  const missing = (mappingId: string) => {
    const mapping = mappingById(input.manifest, mappingId)
    if (mapping.absenceSemantics === 'no_outcome') return
    const refs = mapping.sourceFieldPaths.map((path) => sourceFieldRef(input.located, path, 'expected_missing'))
    if (mapping.absenceSemantics === 'explicit_unsupported') {
      present(mappingId, Object.freeze({ kind: 'support', value: 'unsupported' }), refs)
      return
    }
    outcomes.push(missingOutcomeV1({ path: mapping.canonicalPath, provenance: provenance(mapping, refs) }))
  }

  const invalidField = (mappingId: string, sourcePaths?: readonly string[]) => {
    const mapping = mappingById(input.manifest, mappingId)
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

function addGeminiFacts(collector: ReturnType<typeof createCollector>, located: LocatedRecord): void {
  const record = located.record
  const integer = (field: string, mappingId: string) => {
    if (!own(record, field)) return collector.missing(mappingId)
    const value = safePositiveInteger(record[field])
    if (value === null) return collector.invalidField(mappingId, [field])
    collector.present(mappingId, Object.freeze({ kind: 'integer', value, unit: 'token' }),
      [sourceFieldRef(located, field)])
  }
  const decimal = (field: string, mappingId: string) => {
    if (!own(record, field)) return collector.missing(mappingId)
    const value = safeDecimal(record[field])
    if (value === null) return collector.invalidField(mappingId, [field])
    collector.present(mappingId, Object.freeze({ kind: 'decimal', value }), [sourceFieldRef(located, field)])
  }
  integer('inputTokenLimit', 'google.input-limit.v1')
  integer('outputTokenLimit', 'google.output-limit.v1')
  if (!own(record, 'thinking')) collector.missing('google.thinking.v1')
  else if (typeof record.thinking !== 'boolean') collector.invalidField('google.thinking.v1', ['thinking'])
  else collector.present('google.thinking.v1', supportValue(record.thinking), [sourceFieldRef(located, 'thinking')])
  decimal('temperature', 'google.temperature-default.v1')
  decimal('maxTemperature', 'google.temperature-maximum.v1')
  decimal('topP', 'google.top-p-default.v1')
  if (!own(record, 'topK')) {
    collector.missing('google.top-k-support.v1')
    collector.missing('google.top-k-default.v1')
  } else {
    const topK = safePositiveInteger(record.topK)
    if (topK === null) {
      collector.invalidField('google.top-k-support.v1', ['topK'])
      collector.invalidField('google.top-k-default.v1', ['topK'])
    } else {
      collector.present('google.top-k-support.v1', supportValue(true), [sourceFieldRef(located, 'topK')])
      collector.present('google.top-k-default.v1', Object.freeze({ kind: 'integer', value: topK }),
        [sourceFieldRef(located, 'topK')])
    }
  }
  if (!own(record, 'supportedGenerationMethods')) {
    collector.missing('google.supported-operations.v1')
  } else if (!Array.isArray(record.supportedGenerationMethods) || record.supportedGenerationMethods.length > 256 ||
      record.supportedGenerationMethods.some((member) => typeof member !== 'string' || !boundedIdentity(member)) ||
      new Set(record.supportedGenerationMethods).size !== record.supportedGenerationMethods.length) {
    collector.invalidField('google.supported-operations.v1', ['supportedGenerationMethods'])
  } else {
    const manifest = PROVIDER_NATIVE_COVERAGE_MANIFESTS_V1['gemini-models-v1beta']
    const operationMap = new Map(manifest.nativeOperationMappings.map((mapping) =>
      [mapping.sourceValue, mapping.canonicalValue] as const))
    const values = new Set<CanonicalOperationKindV1>()
    let hasUnknown = false
    record.supportedGenerationMethods.forEach((member, index) => {
      const canonical = operationMap.get(member as string)
      if (canonical) values.add(canonical)
      else {
        hasUnknown = true
        collector.unmapped(`supportedGenerationMethods[${index}]`, 'unknown_member', 'operations.supported')
      }
    })
    collector.present('google.supported-operations.v1', Object.freeze({ kind: 'operation_kind_set', values: [...values],
      completeness: hasUnknown ? 'partial' : 'complete' }), [sourceFieldRef(located, 'supportedGenerationMethods')])
  }
}

function addAnthropicFacts(collector: ReturnType<typeof createCollector>, located: LocatedRecord): void {
  const record = located.record
  const integer = (field: string, mappingId: string) => {
    if (!own(record, field)) return collector.missing(mappingId)
    const value = safePositiveInteger(record[field])
    if (value === null) return collector.invalidField(mappingId, [field])
    collector.present(mappingId, Object.freeze({ kind: 'integer', value, unit: 'token' }),
      [sourceFieldRef(located, field)])
  }
  const support = (path: readonly string[], mappingId: string) => {
    const value = nested(record, path)
    if (value.invalidParent) return collector.invalidField(mappingId, [path.join('.')])
    if (!value.present) return collector.missing(mappingId)
    if (typeof value.value !== 'boolean') return collector.invalidField(mappingId, [path.join('.')])
    collector.present(mappingId, supportValue(value.value), [sourceFieldRef(located, path.join('.'))])
  }
  const positiveSet = (input: Readonly<{
    mappingId: string
    members: readonly Readonly<{ path: readonly string[]; value: string }>[]
    kind: 'native_string_set' | 'media_kind_set' | 'operation_kind_set'
    baseCompleteness: 'complete' | 'partial'
    overallPath?: readonly string[]
    closedParentPath?: readonly string[]
    knownParentKeys?: readonly string[]
  }>) => {
    const observed = input.members.map((member) => ({ member, read: nested(record, member.path) }))
    const overall = input.overallPath ? nested(record, input.overallPath) : null
    if (overall?.invalidParent || overall?.present && typeof overall.value !== 'boolean' ||
        observed.some((entry) => entry.read.invalidParent || entry.read.present && typeof entry.read.value !== 'boolean')) {
      return collector.invalidField(input.mappingId,
        [...(input.overallPath ? [input.overallPath.join('.')] : []), ...input.members.map((member) => member.path.join('.'))])
    }
    if (!overall?.present && observed.every((entry) => !entry.read.present)) return collector.missing(input.mappingId)
    let hasUnknownMember = false
    if (input.closedParentPath) {
      const parent = nested(record, input.closedParentPath)
      if (parent.invalidParent || parent.present && !plainObject(parent.value)) {
        return collector.invalidField(input.mappingId, [input.closedParentPath.join('.')])
      }
      if (parent.present) {
        const known = new Set(input.knownParentKeys ?? [])
        for (const key of Object.keys(parent.value as JsonRecord)) {
          if (!known.has(key)) {
            hasUnknownMember = true
            collector.unmapped(`${input.closedParentPath.join('.')}.${key}`, 'unknown_member',
              mappingById(PROVIDER_NATIVE_COVERAGE_MANIFESTS_V1['anthropic-models-2023-06-01'],
                input.mappingId).canonicalPath)
          }
        }
      }
    }
    const values = observed.filter((entry) => entry.read.value === true).map((entry) => entry.member.value)
    const allMembersObserved = observed.every((entry) => entry.read.present)
    const completenessValue = input.baseCompleteness === 'partial' || !allMembersObserved || hasUnknownMember
      ? 'partial' : 'complete'
    const refs = [
      ...(input.overallPath && overall?.present ? [sourceFieldRef(located, input.overallPath.join('.'))] : []),
      ...observed.filter((entry) => entry.read.present).map((entry) => sourceFieldRef(located, entry.member.path.join('.'))),
    ]
    collector.present(input.mappingId, Object.freeze({ kind: input.kind, values, completeness: completenessValue }) as CanonicalFactValueV1, refs)
  }

  integer('max_input_tokens', 'anthropic.input-limit.v1')
  integer('max_tokens', 'anthropic.output-limit.v1')
  support(['capabilities', 'thinking', 'supported'], 'anthropic.thinking-support.v1')
  positiveSet({ mappingId: 'anthropic.thinking-modes.v1', kind: 'native_string_set', baseCompleteness: 'partial',
    members: [
      { path: ['capabilities', 'thinking', 'types', 'enabled', 'supported'], value: 'enabled' },
      { path: ['capabilities', 'thinking', 'types', 'adaptive', 'supported'], value: 'adaptive' },
    ] })
  positiveSet({ mappingId: 'anthropic.generation-effort.v1', kind: 'native_string_set', baseCompleteness: 'complete',
    closedParentPath: ['capabilities', 'effort'],
    knownParentKeys: ['supported', 'low', 'medium', 'high', 'xhigh', 'max'],
    overallPath: ['capabilities', 'effort', 'supported'], members: ['low', 'medium', 'high', 'xhigh', 'max'].map((value) =>
      ({ path: ['capabilities', 'effort', value, 'supported'], value })) })
  support(['capabilities', 'structured_outputs', 'supported'], 'anthropic.structured-output.v1')
  positiveSet({ mappingId: 'anthropic.input-modalities.v1', kind: 'media_kind_set', baseCompleteness: 'partial',
    members: [
      { path: ['capabilities', 'image_input', 'supported'], value: 'image' },
      { path: ['capabilities', 'pdf_input', 'supported'], value: 'pdf' },
    ] })
  support(['capabilities', 'citations', 'supported'], 'anthropic.citations.v1')
  support(['capabilities', 'code_execution', 'supported'], 'anthropic.code-execution.v1')
  support(['capabilities', 'context_management', 'supported'], 'anthropic.context-management.v1')
  positiveSet({ mappingId: 'anthropic.context-actions.v1', kind: 'native_string_set', baseCompleteness: 'partial',
    members: ['clear_tool_uses_20250919', 'clear_thinking_20251015', 'compact_20260112'].map((value) =>
      ({ path: ['capabilities', 'context_management', value, 'supported'], value })) })
  positiveSet({ mappingId: 'anthropic.batch-operation.v1', kind: 'operation_kind_set', baseCompleteness: 'partial',
    members: [{ path: ['capabilities', 'batch', 'supported'], value: 'request_batch' }] })
}

function addOpenRouterFacts(collector: ReturnType<typeof createCollector>, located: LocatedRecord): void {
  const record = located.record
  if (!own(record, 'context_length')) collector.missing('openrouter.context-window.v1')
  else {
    const value = safePositiveInteger(record.context_length)
    if (value === null) collector.invalidField('openrouter.context-window.v1', ['context_length'])
    else collector.present('openrouter.context-window.v1', Object.freeze({ kind: 'integer', value, unit: 'token' }),
      [sourceFieldRef(located, 'context_length')])
  }
  for (const descriptor of [
    { path: ['architecture', 'input_modalities'], mappingId: 'openrouter.input-modalities.v1' },
    { path: ['architecture', 'output_modalities'], mappingId: 'openrouter.output-modalities.v1' },
  ] as const) {
    const read = nested(record, descriptor.path)
    if (read.invalidParent) {
      collector.invalidField(descriptor.mappingId, [descriptor.path.join('.')])
      continue
    }
    if (!read.present) {
      collector.missing(descriptor.mappingId)
      continue
    }
    const mapped = mapMediaCollection(read.value)
    if (!mapped.valid) {
      collector.invalidField(descriptor.mappingId, [descriptor.path.join('.')])
      continue
    }
    mapped.unknownIndexes.forEach((index) => collector.unmapped(`${descriptor.path.join('.')}[${index}]`,
      'unknown_member', mappingById(PROVIDER_NATIVE_COVERAGE_MANIFESTS_V1['openrouter-chat-models-v1'],
        descriptor.mappingId).canonicalPath))
    collector.present(descriptor.mappingId, Object.freeze({ kind: 'media_kind_set', values: mapped.values,
      completeness: mapped.unknownIndexes.length > 0 ? 'partial' : 'complete' }),
    [sourceFieldRef(located, descriptor.path.join('.'))])
  }
  const reasoning = nested(record, ['reasoning'])
  if (!reasoning.present) {
    collector.missing('openrouter.reasoning-support.v1')
    collector.missing('openrouter.reasoning-required.v1')
    collector.missing('openrouter.reasoning-default.v1')
  } else if (!plainObject(reasoning.value)) {
    collector.invalidField('openrouter.reasoning-support.v1', ['reasoning'])
    collector.invalidField('openrouter.reasoning-required.v1', ['reasoning'])
    collector.invalidField('openrouter.reasoning-default.v1', ['reasoning'])
  } else {
    collector.present('openrouter.reasoning-support.v1', supportValue(true), [sourceFieldRef(located, 'reasoning')])
    if (!own(reasoning.value, 'mandatory')) collector.missing('openrouter.reasoning-required.v1')
    else if (typeof reasoning.value.mandatory !== 'boolean') {
      collector.invalidField('openrouter.reasoning-required.v1', ['reasoning.mandatory'])
    } else {
      collector.present('openrouter.reasoning-required.v1', Object.freeze({ kind: 'boolean',
        value: reasoning.value.mandatory }), [sourceFieldRef(located, 'reasoning.mandatory')])
    }
    if (own(reasoning.value, 'supported_efforts')) {
      collector.unmapped('reasoning.supported_efforts', 'ambiguous_semantics', 'reasoning.effort.nativeValues')
    }
    if (!own(reasoning.value, 'default_effort')) collector.missing('openrouter.reasoning-default.v1')
    else if (typeof reasoning.value.default_effort !== 'string' || !boundedIdentity(reasoning.value.default_effort)) {
      collector.invalidField('openrouter.reasoning-default.v1', ['reasoning.default_effort'])
    } else collector.present('openrouter.reasoning-default.v1', Object.freeze({ kind: 'native_string',
      value: reasoning.value.default_effort }), [sourceFieldRef(located, 'reasoning.default_effort')])
    if (own(reasoning.value, 'default_enabled')) {
      collector.unmapped('reasoning.default_enabled', 'ambiguous_semantics', 'reasoning.toggle.support')
    }
    if (own(reasoning.value, 'supports_max_tokens')) {
      collector.unmapped('reasoning.supports_max_tokens', 'ambiguous_semantics', 'reasoning.budgetTokens.support')
    }
  }
}

function addLmStudioFacts(collector: ReturnType<typeof createCollector>, located: LocatedRecord): void {
  const record = located.record
  if (!own(record, 'max_context_length')) collector.missing('lmstudio.context-window.v1')
  else {
    const value = safePositiveInteger(record.max_context_length)
    if (value === null) collector.invalidField('lmstudio.context-window.v1', ['max_context_length'])
    else collector.present('lmstudio.context-window.v1', Object.freeze({ kind: 'integer', value, unit: 'token' }),
      [sourceFieldRef(located, 'max_context_length')])
  }
  const vision = nested(record, ['capabilities', 'vision'])
  if (vision.invalidParent) collector.invalidField('lmstudio.vision.v1', ['capabilities.vision'])
  else if (!vision.present) collector.missing('lmstudio.vision.v1')
  else if (typeof vision.value !== 'boolean') collector.invalidField('lmstudio.vision.v1', ['capabilities.vision'])
  else collector.present('lmstudio.vision.v1', Object.freeze({ kind: 'media_kind_set',
    values: vision.value ? ['image' as const] : [], completeness: 'partial' }),
  [sourceFieldRef(located, 'capabilities.vision')])
  const training = nested(record, ['capabilities', 'trained_for_tool_use'])
  if (training.invalidParent) {
    collector.invalidField('lmstudio.tool-training.v1', ['capabilities.trained_for_tool_use'])
  } else if (!training.present) collector.missing('lmstudio.tool-training.v1')
  else if (typeof training.value !== 'boolean') {
    collector.invalidField('lmstudio.tool-training.v1', ['capabilities.trained_for_tool_use'])
  } else {
    collector.present('lmstudio.tool-training.v1', supportValue(training.value),
      [sourceFieldRef(located, 'capabilities.trained_for_tool_use')])
  }
  if (nested(record, ['capabilities', 'reasoning']).present) {
    collector.unmapped('capabilities.reasoning', 'ambiguous_semantics')
  }
}

function addOllamaFacts(collector: ReturnType<typeof createCollector>, located: LocatedRecord): void {
  const record = located.record
  if (!own(record, 'capabilities')) {
    collector.missing('ollama.capabilities.operations.v1')
    collector.missing('ollama.capabilities.input-modalities.v1')
    return
  }
  const capabilities = record.capabilities
  if (!Array.isArray(capabilities) || capabilities.length > 256 ||
      capabilities.some((member) => typeof member !== 'string' || !boundedIdentity(member)) ||
      new Set(capabilities).size !== capabilities.length) {
    collector.invalidField('ollama.capabilities.operations.v1', ['capabilities'])
    collector.invalidField('ollama.capabilities.input-modalities.v1', ['capabilities'])
    return
  }
  const operations: CanonicalOperationKindV1[] = []
  const modalities: CanonicalMediaKindV1[] = []
  capabilities.forEach((member, index) => {
    if (member === 'completion') operations.push('content_generate')
    else if (member === 'vision') modalities.push('image')
    else collector.unmapped(`capabilities[${index}]`, 'unknown_member')
  })
  collector.present('ollama.capabilities.operations.v1', Object.freeze({ kind: 'operation_kind_set',
    values: operations, completeness: 'partial' }), [sourceFieldRef(located, 'capabilities')])
  collector.present('ollama.capabilities.input-modalities.v1', Object.freeze({ kind: 'media_kind_set',
    values: modalities, completeness: 'partial' }), [sourceFieldRef(located, 'capabilities')])
}

function factsForSurface(
  surfaceId: ProviderNativeSurfaceIdV1,
  collector: ReturnType<typeof createCollector>,
  located: LocatedRecord,
): void {
  if (surfaceId === 'gemini-models-v1beta') return addGeminiFacts(collector, located)
  if (surfaceId === 'anthropic-models-2023-06-01') return addAnthropicFacts(collector, located)
  if (surfaceId === 'openrouter-chat-models-v1') return addOpenRouterFacts(collector, located)
  if (surfaceId === 'lmstudio-models-v1') return addLmStudioFacts(collector, located)
  if (surfaceId === 'ollama-tags-v1') return addOllamaFacts(collector, located)
  // OpenAI and DeepSeek list surfaces publish identity coverage only.
}

export function createProviderNativeSourceAdapterV1(
  input: CreateProviderNativeSourceAdapterV1Input,
): CanonicalModelFactSourceAdapterV1 {
  const manifest = PROVIDER_NATIVE_COVERAGE_MANIFESTS_V1[input.sourceSurfaceId]
  const authority = providerAuthorityForNativeSurfaceV1(input.sourceSurfaceId)
  const endpointProfileId = input.endpointProfileId ?? authority.executionBindings[0]?.endpointProfileKind
  if (!endpointProfileId || !boundedIdentity(endpointProfileId)) {
    return invalid('GENERATION_V2_PROVIDER_NATIVE_ADAPTER_INVALID')
  }
  const adapterId = `provider-native-source-adapter-v1:${input.sourceSurfaceId}`

  const scan = (rawSnapshot: RawSourceSnapshotRefV1): RecordScan => {
    const records: LocatedRecord[] = []
    const invalidRefs: RawPayloadRefV1[] = []
    for (const rawRef of rawSnapshot.rawEnvelopeRefs) {
      const rawRecords = envelopeRecords(input.sourceSurfaceId, input.rawPayloadReader.readRawPayload(rawRef))
      rawRecords.forEach((candidate, recordIndex) => {
        if (!plainObject(candidate)) {
          invalidRefs.push(rawRef)
          return
        }
        const nativeModelId = recordIdentity(input.sourceSurfaceId, candidate)
        if (!nativeModelId) {
          invalidRefs.push(rawRef)
          return
        }
        records.push(Object.freeze({ record: candidate, rawRef, recordIndex, nativeModelId,
          sourceRecordIdentity: `${input.sourceSurfaceId}:${nativeModelId}` }))
      })
    }
    const counts = new Map<string, number>()
    for (const located of records) counts.set(located.nativeModelId, (counts.get(located.nativeModelId) ?? 0) + 1)
    const duplicateModelIds = new Set([...counts].filter(([, count]) => count > 1).map(([modelId]) => modelId))
    for (const located of records) if (duplicateModelIds.has(located.nativeModelId)) invalidRefs.push(located.rawRef)
    return Object.freeze({ records: Object.freeze(records.filter((record) => !duplicateModelIds.has(record.nativeModelId))),
      duplicateModelIds, invalidRecordRefs: uniqueRawRefs(invalidRefs) })
  }

  return Object.freeze({
    sourceKind: 'provider_native' as const,
    adapterId,
    adapterRevision: PROVIDER_NATIVE_SOURCE_ADAPTER_REVISION_V1,
    coverageManifest: manifest,
    subjectDiscovery: 'enumerable' as const,
    indexRawRecords(rawSnapshot: RawSourceSnapshotRefV1): SourceRecordIndexV1 {
      if (rawSnapshot.sourceKind !== 'provider_native') invalid('GENERATION_V2_PROVIDER_NATIVE_ADAPTER_INVALID')
      const result = scan(rawSnapshot)
      const exactSubjects = result.records.map((record) => Object.freeze({
        providerAuthorityId: authority.providerAuthorityId, endpointProfileId, nativeModelId: record.nativeModelId,
      })).sort((left, right) => left.nativeModelId.localeCompare(right.nativeModelId, 'en'))
      return Object.freeze({ sourceScopeId: rawSnapshot.sourceScopeId, recordSetCompleteness: completeness(rawSnapshot),
        exactSubjects: Object.freeze(exactSubjects), invalidRecordRefs: result.invalidRecordRefs })
    },
    adaptExactSubject({ rawSnapshot, sourceRevision, subject }:
      Parameters<CanonicalModelFactSourceAdapterV1['adaptExactSubject']>[0]): CanonicalSubjectFactCandidateV1 {
      validateInvocation(rawSnapshot, sourceRevision, manifest, authority)
      const result = scan(rawSnapshot)
      if (subject.providerAuthorityId !== authority.providerAuthorityId || subject.endpointProfileId !== endpointProfileId) {
        return Object.freeze({ schemaVersion: 1 as const, subject, sourceRevision,
          recordOutcome: absentOutcome(rawSnapshot), outcomes: Object.freeze([]),
          unmappedSourceFields: Object.freeze([]) })
      }
      if (result.duplicateModelIds.has(subject.nativeModelId)) {
        return Object.freeze({ schemaVersion: 1 as const, subject, sourceRevision,
          recordOutcome: 'invalid_identity' as const, outcomes: Object.freeze([]),
          unmappedSourceFields: Object.freeze([]) })
      }
      const located = result.records.find((record) => record.nativeModelId === subject.nativeModelId)
      if (!located) {
        return Object.freeze({ schemaVersion: 1 as const, subject, sourceRevision,
          recordOutcome: absentOutcome(rawSnapshot), outcomes: Object.freeze([]),
          unmappedSourceFields: Object.freeze([]) })
      }
      const collector = createCollector({ adapterId, manifest, sourceRevision, subject, located })
      factsForSurface(input.sourceSurfaceId, collector, located)
      return Object.freeze({ schemaVersion: 1 as const, subject, sourceRevision, recordOutcome: 'present' as const,
        outcomes: Object.freeze(collector.outcomes), unmappedSourceFields: Object.freeze(collector.unmappedSourceFields) })
    },
  })
}

export const providerNativeSourceAdapterV1 = createProviderNativeSourceAdapterV1
