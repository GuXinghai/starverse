import type {
  GenerationIntentLayerV2,
} from '../domain/generationIntentV2'
import { projectGenerationIntentLayerV2 } from '../domain/generationIntentProjectionV2'
import {
  decodeProviderBindingRecordV2,
  projectDecodedProviderBindingRecordV2,
  projectProviderBindingForCapabilityRevisionV2,
  type DecodedProviderBindingRecordV2,
} from '../domain/providerBindingV2'
import { GenerationV2Digest } from '../domain/identityV2'
import { sha256PreparedBytesV2, stableSerializeProviderRequestV2 } from '../compiler/stableSerialize'
import {
  canonicalizeUnverifiedRuntimeCapabilitySnapshotV2,
  decodeRuntimeCapabilitySnapshotV2,
  RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2,
  type DecodedRuntimeCapabilityEvidenceV2,
  type DecodedRuntimeCapabilitySnapshotV2,
  type PersistedRuntimeCapabilityFieldV2,
  type PersistedRuntimeCapabilitySnapshotV2,
  type PersistedRuntimeContinuationCapabilityV2,
  type PersistedRuntimeToolCapabilityV2,
  type RuntimeCapabilityDomainV2,
  type RuntimeCapabilityEvidenceEffectV2,
  type RuntimeCapabilityEvidenceKindV2,
  type RuntimeCapabilityFieldStateV2,
  type RuntimeCapabilityScalarV2,
  type RuntimeCapabilitySemanticPathV2,
} from './runtimeCapabilitySnapshotV2'
import {
  applyGenerationImplementationCeilingV2,
  resolveGenerationImplementationManifestV2,
  type GenerationImplementationFieldCeilingV2,
} from './implementationManifestV2'

/**
 * The command-independent capability conclusion for one exact provider/model
 * binding. Runtime snapshots may add command facts (selected tools, for
 * example), but they must retain this same base revision.
 */
export type ResolvedCapabilityV2 = Readonly<{
  schemaVersion: 1
  binding: DecodedProviderBindingRecordV2
  catalogAuthority?: DecodedRuntimeCapabilitySnapshotV2['catalogAuthority']
  evidence: readonly DecodedRuntimeCapabilityEvidenceV2[]
  fields: readonly PersistedRuntimeCapabilityFieldV2[]
  continuation: PersistedRuntimeContinuationCapabilityV2
  evidenceDigest: string
  semanticFieldsDigest: string
  capabilityRevision: string
  implementationCeiling: Readonly<{
    providerId: string
    protocolContractId: string
    contractRevision: string
    registryRevision: string
    manifestDigest: string
    manifestRevision: string
    semanticPaths: readonly RuntimeCapabilitySemanticPathV2[]
    fieldCeilings: readonly GenerationImplementationFieldCeilingV2[]
  }>
}>

export type ResolvedCapabilityDraftV2 = Readonly<{
  binding: unknown
  catalogAuthority?: DecodedRuntimeCapabilitySnapshotV2['catalogAuthority']
  evidence: readonly Readonly<Record<string, unknown>>[]
  fields: readonly PersistedRuntimeCapabilityFieldV2[]
  continuation: PersistedRuntimeContinuationCapabilityV2
}>

export type GenerationControlsProjectionV2 = Readonly<{
  schemaVersion: 1
  binding: Readonly<Record<string, unknown>>
  capabilityRevision: string
  controls: Readonly<Record<RuntimeCapabilitySemanticPathV2, Readonly<{
    visibility: 'visible' | 'hidden'
    state: PersistedRuntimeCapabilityFieldV2['state']
    domain?: RuntimeCapabilityDomainV2
    constraints: readonly PersistedRuntimeCapabilityFieldV2['constraints'][number][]
    evidenceIds: readonly string[]
  }>>>
}>

export class ResolvedCapabilityV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_RESOLVED_CAPABILITY_INVALID'
    | 'GENERATION_V2_RESOLVED_CAPABILITY_FIELD_UNSUPPORTED'
    | 'GENERATION_V2_RESOLVED_CAPABILITY_FIELD_UNAVAILABLE'
    | 'GENERATION_V2_RESOLVED_CAPABILITY_VALUE_UNSUPPORTED'
    | 'GENERATION_V2_RESOLVED_CAPABILITY_STALE') {
    super(code)
    this.name = 'ResolvedCapabilityV2Error'
  }
}

function hash(value: unknown): string {
  return sha256PreparedBytesV2(new TextEncoder().encode(stableSerializeProviderRequestV2(value)))
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
  }
  return value
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null))
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  const keys = Object.keys(value).sort()
  const expected = [...allowed].sort()
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
  }
}

function identifier(value: unknown): string {
  const result = requiredString(value)
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u.test(result)) {
    throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
  }
  return result
}

function timestamp(value: unknown): string {
  const result = requiredString(value)
  const parsed = Date.parse(result)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(result) ||
      !Number.isFinite(parsed) || new Date(parsed).toISOString() !== result) {
    throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
  }
  return result
}

function digest(value: unknown): string {
  const result = requiredString(value)
  if (!/^[0-9a-f]{64}$/u.test(result)) {
    throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
  }
  return result
}

const EVIDENCE_KINDS = Object.freeze([
  'contract_invariant', 'endpoint_descriptor', 'signed_provider_record',
  'official_documentation', 'live_probe', 'user_narrowing_override',
] as const)
const EVIDENCE_EFFECTS = Object.freeze(['supports', 'rejects', 'requires_confirmation', 'unknown'] as const)
const FIELD_STATES = Object.freeze(['supported', 'unsupported', 'requires_confirmation', 'missing', 'unknown'] as const)

function canonicalSourceRef(kind: DecodedRuntimeCapabilityEvidenceV2['kind'], value: unknown): string {
  const result = requiredString(value)
  if (result.length < 1 || result.length > 2048 || result.trim() !== result || /[\u0000-\u001f\u007f]/u.test(result)) {
    throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
  }
  if (kind === 'official_documentation') {
    let url: URL
    try { url = new URL(result) } catch {
      throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
      throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
    }
  } else {
    identifier(result)
  }
  return result
}

function canonicalScalar(value: unknown): RuntimeCapabilityScalarV2 {
  if (typeof value === 'string') {
    if (value.length > 512 || /[\u0000-\u001f\u007f]/u.test(value)) {
      throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
    }
    return value
  }
  if (typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
}

function scalarValues(value: unknown): readonly RuntimeCapabilityScalarV2[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
  }
  const values = value.map(canonicalScalar)
  values.sort((left, right) => `${typeof left}:${String(left)}` < `${typeof right}:${String(right)}` ? -1 :
    `${typeof left}:${String(left)}` > `${typeof right}:${String(right)}` ? 1 : 0)
  if (new Set(values.map((item) => `${typeof item}:${String(item)}`)).size !== values.length) {
    throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
  }
  return Object.freeze(values)
}

function domain(value: unknown): RuntimeCapabilityDomainV2 {
  if (!plainObject(value) || typeof value.kind !== 'string') {
    throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
  }
  switch (value.kind) {
    case 'boolean':
    case 'identity':
      exactKeys(value, ['kind'])
      return Object.freeze({ kind: value.kind })
    case 'enum':
      exactKeys(value, ['kind', 'values'])
      return Object.freeze({ kind: 'enum', values: scalarValues(value.values) })
    case 'response_format': {
      exactKeys(value, ['kind', 'types'])
      if (!Array.isArray(value.types) || value.types.length === 0 ||
          value.types.some((item) => item !== 'text' && item !== 'json_object' && item !== 'json_schema') ||
          new Set(value.types).size !== value.types.length) {
        throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
      }
      return Object.freeze({ kind: 'response_format', types: Object.freeze([...value.types] as ('text' | 'json_object' | 'json_schema')[]) })
    }
    case 'enum_list':
      exactKeys(value, ['kind', 'values', 'maxItems'])
      if (!Number.isSafeInteger(value.maxItems) || (value.maxItems as number) < 1) {
        throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
      }
      return Object.freeze({ kind: 'enum_list', values: scalarValues(value.values), maxItems: value.maxItems as number })
    case 'range':
      exactKeys(value, ['kind', 'min', 'max', 'integer'])
      if (typeof value.min !== 'number' || !Number.isFinite(value.min) ||
          typeof value.max !== 'number' || !Number.isFinite(value.max) || value.min > value.max ||
          typeof value.integer !== 'boolean' || value.integer &&
            (!Number.isSafeInteger(value.min) || !Number.isSafeInteger(value.max))) {
        throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
      }
      return Object.freeze({ kind: 'range', min: value.min, max: value.max, integer: value.integer })
    case 'string_list':
      exactKeys(value, ['kind', 'maxItems', 'maxItemLength'])
      if (!Number.isSafeInteger(value.maxItems) || (value.maxItems as number) < 1 ||
          !Number.isSafeInteger(value.maxItemLength) || (value.maxItemLength as number) < 1) {
        throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
      }
      return Object.freeze({ kind: 'string_list', maxItems: value.maxItems as number, maxItemLength: value.maxItemLength as number })
    case 'identity_list':
      exactKeys(value, ['kind', 'maxItems'])
      if (!Number.isSafeInteger(value.maxItems) || (value.maxItems as number) < 1) {
        throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
      }
      return Object.freeze({ kind: 'identity_list', maxItems: value.maxItems as number })
    case 'approximate_location':
      exactKeys(value, ['kind', 'maxFieldLength'])
      if (!Number.isSafeInteger(value.maxFieldLength) || (value.maxFieldLength as number) < 1) {
        throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
      }
      return Object.freeze({ kind: 'approximate_location', maxFieldLength: value.maxFieldLength as number })
    case 'dimensions':
      exactKeys(value, ['kind', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight'])
      if (![value.minWidth, value.maxWidth, value.minHeight, value.maxHeight].every((item) => Number.isSafeInteger(item)) ||
          (value.minWidth as number) < 1 || (value.minHeight as number) < 1 ||
          (value.minWidth as number) > (value.maxWidth as number) || (value.minHeight as number) > (value.maxHeight as number)) {
        throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
      }
      return Object.freeze({ kind: 'dimensions', minWidth: value.minWidth as number, maxWidth: value.maxWidth as number,
        minHeight: value.minHeight as number, maxHeight: value.maxHeight as number })
    case 'dimensions_enum': {
      exactKeys(value, ['kind', 'values'])
      if (!Array.isArray(value.values) || value.values.length === 0) {
        throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
      }
      const values = value.values.map((item) => {
        if (!plainObject(item) || Object.keys(item).sort().join('\0') !== 'height\0width' ||
            !Number.isSafeInteger(item.width) || !Number.isSafeInteger(item.height) ||
            (item.width as number) < 1 || (item.height as number) < 1) {
          throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
        }
        return Object.freeze({ width: item.width as number, height: item.height as number })
      })
      values.sort((left, right) => `${left.width}x${left.height}` < `${right.width}x${right.height}` ? -1 :
        `${left.width}x${left.height}` > `${right.width}x${right.height}` ? 1 : 0)
      if (new Set(values.map((item) => `${item.width}x${item.height}`)).size !== values.length) {
        throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
      }
      return Object.freeze({ kind: 'dimensions_enum', values: Object.freeze(values) })
    }
    default:
      throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
  }
}

function evidenceIds(value: unknown): readonly string[] {
  if (!Array.isArray(value)) throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
  const ids = value.map(identifier)
  ids.sort()
  if (new Set(ids).size !== ids.length) throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
  return Object.freeze(ids)
}

function canonicalEvidence(input: readonly Readonly<Record<string, unknown>>[]): readonly DecodedRuntimeCapabilityEvidenceV2[] {
  const evidence = input.map((item) => {
    if (!plainObject(item)) throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
    exactKeys(item, ['evidenceId', 'kind', 'effect', 'sourceRef', 'verifiedAt', 'contentDigest'])
    const evidenceId = identifier(item.evidenceId)
    const kind = item.kind as RuntimeCapabilityEvidenceKindV2
    const effect = item.effect as RuntimeCapabilityEvidenceEffectV2
    if (!EVIDENCE_KINDS.includes(kind) ||
        !EVIDENCE_EFFECTS.includes(effect) ||
        kind === 'user_narrowing_override' && effect === 'supports') {
      throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
    }
    const sourceRef = canonicalSourceRef(kind, item.sourceRef)
    const verifiedAt = timestamp(item.verifiedAt)
    const contentDigest = digest(item.contentDigest)
    const base = Object.freeze({ evidenceId, kind, effect, sourceRef, verifiedAt, contentDigest })
    const entryDigest = hash(base)
    return Object.freeze({
      ...base,
      contentDigest: GenerationV2Digest.create('evidence_digest', contentDigest),
      entryDigest: GenerationV2Digest.create('evidence_digest', entryDigest),
    })
  })
  evidence.sort((left, right) => left.evidenceId < right.evidenceId ? -1 : left.evidenceId > right.evidenceId ? 1 : 0)
  if (evidence.length === 0 || new Set(evidence.map((item) => item.evidenceId)).size !== evidence.length) {
    throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
  }
  return Object.freeze(evidence)
}

function canonicalFields(input: readonly PersistedRuntimeCapabilityFieldV2[]): readonly PersistedRuntimeCapabilityFieldV2[] {
  const fields = input.map((value) => {
    if (!plainObject(value)) throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
    exactKeys(value, value.domain === undefined
      ? ['path', 'state', 'constraints', 'evidenceIds']
      : ['path', 'state', 'domain', 'constraints', 'evidenceIds'])
    if (!RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2.includes(value.path as RuntimeCapabilitySemanticPathV2) ||
        !FIELD_STATES.includes(value.state as typeof FIELD_STATES[number])) {
      throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
    }
    const state = value.state as RuntimeCapabilityFieldStateV2
    const fieldDomain = value.domain === undefined ? undefined : domain(value.domain)
    if ((state === 'unsupported' || state === 'missing' || state === 'unknown') !== (fieldDomain === undefined) ||
        !Array.isArray(value.constraints) || !Array.isArray(value.evidenceIds) ||
        (state === 'unsupported' || state === 'missing' || state === 'unknown') && value.constraints.length > 0) {
      throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
    }
    const constraints = value.constraints.map((candidate) => {
      if (!plainObject(candidate)) throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
      exactKeys(candidate, ['kind', 'path', 'values'])
      if ((candidate.kind !== 'requires_value' && candidate.kind !== 'forbids_value') ||
          !RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2.includes(candidate.path as RuntimeCapabilitySemanticPathV2) ||
          candidate.path === value.path) {
        throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
      }
      return Object.freeze({ kind: candidate.kind, path: candidate.path as RuntimeCapabilitySemanticPathV2,
        values: scalarValues(candidate.values) })
    })
    constraints.sort((left, right) => hash(left) < hash(right) ? -1 : hash(left) > hash(right) ? 1 : 0)
    return Object.freeze({ path: value.path as RuntimeCapabilitySemanticPathV2, state,
      ...(fieldDomain === undefined ? {} : { domain: fieldDomain }),
      constraints: Object.freeze(constraints), evidenceIds: evidenceIds(value.evidenceIds) })
  })
  fields.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
  if (fields.length !== RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2.length ||
      fields.some((field, index) => field.path !== RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2[index])) {
    throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
  }
  return Object.freeze(fields)
}

function canonicalContinuation(value: unknown): PersistedRuntimeContinuationCapabilityV2 {
  if (!plainObject(value) || typeof value.kind !== 'string') {
    throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
  }
  if (value.kind === 'unavailable') {
    exactKeys(value, ['kind', 'evidenceIds'])
    const ids = evidenceIds(value.evidenceIds)
    if (ids.length !== 0) throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
    return Object.freeze({ kind: 'unavailable', evidenceIds: Object.freeze([]) as readonly [] })
  }
  if (value.kind === 'none') {
    exactKeys(value, ['kind', 'evidenceIds'])
    const ids = evidenceIds(value.evidenceIds)
    if (ids.length === 0) throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
    return Object.freeze({ kind: 'none', evidenceIds: ids })
  }
  if (value.kind === 'client_managed_native_replay') {
    exactKeys(value, ['kind', 'artifactKind', 'supportsBranchReplay', 'supportsRestartReplay', 'evidenceIds'])
    const ids = evidenceIds(value.evidenceIds)
    if (ids.length === 0 || typeof value.supportsBranchReplay !== 'boolean' || typeof value.supportsRestartReplay !== 'boolean') {
      throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
    }
    return Object.freeze({ kind: 'client_managed_native_replay', artifactKind: identifier(value.artifactKind),
      supportsBranchReplay: value.supportsBranchReplay, supportsRestartReplay: value.supportsRestartReplay, evidenceIds: ids })
  }
  if (value.kind === 'provider_managed_reference') {
    exactKeys(value, ['kind', 'referenceKind', 'supportsBranchReplay', 'supportsRestartReplay', 'evidenceIds'])
    const ids = evidenceIds(value.evidenceIds)
    if (ids.length === 0 || typeof value.supportsBranchReplay !== 'boolean' || typeof value.supportsRestartReplay !== 'boolean') {
      throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
    }
    return Object.freeze({ kind: 'provider_managed_reference', referenceKind: identifier(value.referenceKind),
      supportsBranchReplay: value.supportsBranchReplay, supportsRestartReplay: value.supportsRestartReplay, evidenceIds: ids })
  }
  throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
}

function canonicalCatalogAuthority(value: unknown): DecodedRuntimeCapabilitySnapshotV2['catalogAuthority'] | undefined {
  if (value === undefined) return undefined
  if (!plainObject(value)) throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
  exactKeys(value, ['scopeId', 'catalogDigest', 'authorityRevision', 'observationDigest', 'contractRevision', 'resolutionDigest'])
  if (!Number.isSafeInteger(value.authorityRevision) || (value.authorityRevision as number) < 0) {
    throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
  }
  return Object.freeze({
    scopeId: identifier(value.scopeId),
    catalogDigest: digest(value.catalogDigest),
    authorityRevision: value.authorityRevision as number,
    observationDigest: digest(value.observationDigest),
    contractRevision: identifier(value.contractRevision),
    resolutionDigest: digest(value.resolutionDigest),
  })
}

/**
 * Canonicalizes the command-independent capability record itself. This does
 * not read or create a Runtime Snapshot; the snapshot is a later command
 * envelope derived from this record.
 */
export function canonicalizeResolvedCapabilityV2(value: unknown): ResolvedCapabilityV2 {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
    }
    const input = value as Record<string, unknown>
    exactKeys(input, input.catalogAuthority === undefined
      ? ['binding', 'evidence', 'fields', 'continuation']
      : ['binding', 'catalogAuthority', 'evidence', 'fields', 'continuation'])
    if (!Array.isArray(input.evidence) || !Array.isArray(input.fields)) {
      throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
    }
    const binding = decodeProviderBindingRecordV2(input.binding)
    const revisionBinding = projectProviderBindingForCapabilityRevisionV2(binding)
    const implementationManifest = resolveGenerationImplementationManifestV2({
      providerId: binding.providerId.value,
      protocolContractId: binding.protocolContractId.value,
      operation: binding.operation,
    })
    const initialFields = canonicalFields(input.fields as readonly PersistedRuntimeCapabilityFieldV2[])
    const implementationVerifiedAt = input.evidence.find((item) =>
      item && typeof item === 'object' && !Array.isArray(item) &&
      typeof (item as Record<string, unknown>).verifiedAt === 'string') as Record<string, unknown> | undefined
    const implementation = applyGenerationImplementationCeilingV2(initialFields, implementationManifest,
      typeof implementationVerifiedAt?.verifiedAt === 'string'
        ? implementationVerifiedAt.verifiedAt
        : '1970-01-01T00:00:00.000Z')
    const evidenceInput = implementation.rejectEvidence === undefined
      ? input.evidence as readonly Readonly<Record<string, unknown>>[]
      : Object.freeze([
          ...(input.evidence as readonly Readonly<Record<string, unknown>>[]),
          implementation.rejectEvidence,
        ])
    const evidence = canonicalEvidence(evidenceInput)
    const fields = canonicalFields(implementation.fields)
    const continuation = canonicalContinuation(input.continuation)
    const catalogAuthority = canonicalCatalogAuthority(input.catalogAuthority)
    const evidenceById = new Map(evidence.map((item) => [item.evidenceId, item]))
    const effectForState: Partial<Record<RuntimeCapabilityFieldStateV2, DecodedRuntimeCapabilityEvidenceV2['effect']>> = {
      supported: 'supports', unsupported: 'rejects', requires_confirmation: 'requires_confirmation', unknown: 'unknown',
    }
    for (const field of fields) {
      if (field.state === 'missing') {
        if (field.evidenceIds.length !== 0) throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
        continue
      }
      const expectedEffect = effectForState[field.state]
      if (field.evidenceIds.length === 0 || field.evidenceIds.some((id) => evidenceById.get(id)?.effect !== expectedEffect)) {
        throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
      }
    }
    if (continuation.kind !== 'unavailable' &&
        continuation.evidenceIds.some((id) => evidenceById.get(id)?.effect !== 'supports')) {
      throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
    }
    const evidenceForDigest = evidence.map((item) => ({
      evidenceId: item.evidenceId, kind: item.kind, effect: item.effect,
      sourceRef: item.sourceRef, contentDigest: item.contentDigest.value,
    }))
    const evidenceDigest = hash(evidence.map((item) => ({
      evidenceId: item.evidenceId, kind: item.kind, effect: item.effect,
      sourceRef: item.sourceRef, verifiedAt: item.verifiedAt,
      contentDigest: item.contentDigest.value, entryDigest: item.entryDigest.value,
    })))
    const semanticFieldsDigest = hash({ fields, continuation })
    const implementationCeiling = Object.freeze({
      providerId: implementationManifest.providerId,
      protocolContractId: implementationManifest.protocolContractId,
      contractRevision: implementationManifest.contractRevision,
      registryRevision: implementationManifest.registryRevision,
      manifestDigest: implementationManifest.manifestDigest,
      manifestRevision: implementationManifest.manifestRevision,
      semanticPaths: implementationManifest.semanticPaths,
      fieldCeilings: implementationManifest.fieldCeilings,
    })
    const capabilityRevision = `capability-v2:${hash({
      binding: revisionBinding,
      evidence: evidenceForDigest,
      semanticFieldsDigest,
      implementationCeiling,
    })}`
    return Object.freeze({
      schemaVersion: 1,
      binding,
      ...(catalogAuthority ? { catalogAuthority } : {}),
      evidence,
      fields,
      continuation,
      evidenceDigest,
      semanticFieldsDigest,
      capabilityRevision,
      implementationCeiling,
    })
  } catch (error) {
    if (error instanceof ResolvedCapabilityV2Error) throw error
    throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
  }
}

/**
 * Rebinds a persisted runtime snapshot to the independent command-agnostic
 * capability record. This is a persistence boundary, not the authority
 * direction: snapshots are command envelopes derived from this record.
 */
export function resolvedCapabilityFromRuntimeSnapshotV2(
  snapshot: DecodedRuntimeCapabilitySnapshotV2,
): ResolvedCapabilityV2 {
  if (!snapshot || snapshot.executionAuthority !== 'none' || snapshot.trust !== 'decoded_unverified') {
    throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
  }
  const capability = canonicalizeResolvedCapabilityV2({
    binding: projectDecodedProviderBindingRecordV2(snapshot.binding),
    ...(snapshot.catalogAuthority ? { catalogAuthority: snapshot.catalogAuthority } : {}),
    evidence: snapshot.evidence.map((item) => ({
      evidenceId: item.evidenceId, kind: item.kind, effect: item.effect,
      sourceRef: item.sourceRef, verifiedAt: item.verifiedAt, contentDigest: item.contentDigest.value,
    })),
    fields: snapshot.fields,
    continuation: snapshot.continuation,
  })
  if (capability.capabilityRevision !== snapshot.revision.value) {
    throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_STALE')
  }
  return capability
}

export function resolvedCapabilityFromRecordV2(
  record: PersistedRuntimeCapabilitySnapshotV2,
): ResolvedCapabilityV2 {
  return resolvedCapabilityFromRuntimeSnapshotV2(decodeRuntimeCapabilitySnapshotV2(record))
}

/** Builds the persisted command snapshot record only after the base capability is canonical. */
export function runtimeSnapshotRecordFromResolvedCapabilityV2(input: Readonly<{
  capability: ResolvedCapabilityV2
  resolvedAt: string
  tools: readonly PersistedRuntimeToolCapabilityV2[]
}>): PersistedRuntimeCapabilitySnapshotV2 {
  const record = canonicalizeUnverifiedRuntimeCapabilitySnapshotV2({
    schemaVersion: 2,
    resolvedAt: input.resolvedAt,
    binding: projectDecodedProviderBindingRecordV2(input.capability.binding),
    ...(input.capability.catalogAuthority ? { catalogAuthority: input.capability.catalogAuthority } : {}),
    evidence: input.capability.evidence.map((item) => ({
      evidenceId: item.evidenceId, kind: item.kind, effect: item.effect,
      sourceRef: item.sourceRef, verifiedAt: item.verifiedAt, contentDigest: item.contentDigest.value,
    })),
    fields: input.capability.fields,
    tools: input.tools,
    continuation: input.capability.continuation,
  })
  if (record.revision !== input.capability.capabilityRevision) {
    throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_STALE')
  }
  return record
}

/** Derives the decoded command snapshot only after the base capability is canonical. */
export function composeRuntimeSnapshotFromResolvedCapabilityV2(input: Readonly<{
  capability: ResolvedCapabilityV2
  resolvedAt: string
  tools: readonly PersistedRuntimeToolCapabilityV2[]
}>): DecodedRuntimeCapabilitySnapshotV2 {
  return decodeRuntimeCapabilitySnapshotV2(runtimeSnapshotRecordFromResolvedCapabilityV2(input))
}

export function projectGenerationControlsProjectionV2(
  capability: ResolvedCapabilityV2,
): GenerationControlsProjectionV2 {
  const controls = Object.fromEntries(capability.fields.map((field) => [field.path, Object.freeze({
    visibility: field.state === 'missing' || field.state === 'unsupported' ? 'hidden' : 'visible',
    state: field.state,
    ...(field.domain ? { domain: field.domain } : {}),
    constraints: field.constraints,
    evidenceIds: field.evidenceIds,
  })])) as GenerationControlsProjectionV2['controls']
  return Object.freeze({
    schemaVersion: 1,
    binding: Object.freeze({
      providerId: capability.binding.providerId.value,
      endpointProfileId: capability.binding.endpointProfileId.value,
      protocolContractId: capability.binding.protocolContractId.value,
      modelId: capability.binding.modelId.value,
      operation: capability.binding.operation,
    }),
    capabilityRevision: capability.capabilityRevision,
    controls: Object.freeze(controls),
  })
}

function scalar(value: unknown): RuntimeCapabilityScalarV2 | undefined {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? value
    : undefined
}

function contains(domain: RuntimeCapabilityDomainV2 | undefined, value: unknown): boolean {
  if (!domain) return false
  if (domain.kind === 'boolean') return typeof value === 'boolean'
  if (domain.kind === 'identity') return typeof value === 'string' || Boolean(value && typeof value === 'object' &&
    typeof (value as { value?: unknown }).value === 'string')
  if (domain.kind === 'enum') return scalar(value) !== undefined && domain.values.includes(value as RuntimeCapabilityScalarV2)
  if (domain.kind === 'response_format') return Boolean(value && typeof value === 'object' &&
    domain.types.includes((value as { type?: unknown }).type as never))
  if (domain.kind === 'enum_list') return Array.isArray(value) && value.length <= domain.maxItems &&
    value.every((item) => scalar(item) !== undefined && domain.values.includes(item as RuntimeCapabilityScalarV2))
  if (domain.kind === 'range') return typeof value === 'number' && Number.isFinite(value) &&
    value >= domain.min && value <= domain.max && (!domain.integer || Number.isSafeInteger(value))
  if (domain.kind === 'string_list') return Array.isArray(value) && value.length <= domain.maxItems &&
    value.every((item) => typeof item === 'string' && item.length <= domain.maxItemLength)
  if (domain.kind === 'identity_list') return Array.isArray(value) && value.length <= domain.maxItems &&
    value.every((item) => typeof item === 'string' || Boolean(item && typeof item === 'object' &&
      typeof (item as { value?: unknown }).value === 'string'))
  if (domain.kind === 'approximate_location') return Boolean(value && typeof value === 'object' &&
    Object.values(value).every((item) => item === undefined || typeof item === 'string') &&
    JSON.stringify(value).length <= domain.maxFieldLength)
  if (domain.kind === 'dimensions' || domain.kind === 'dimensions_enum') {
    if (!value || typeof value !== 'object') return false
    const width = (value as { width?: unknown }).width
    const height = (value as { height?: unknown }).height
    if (typeof width !== 'number' || typeof height !== 'number') return false
    if (domain.kind === 'dimensions') return width >= domain.minWidth && width <= domain.maxWidth &&
      height >= domain.minHeight && height <= domain.maxHeight
    return domain.values.some((pair) => pair.width === width && pair.height === height)
  }
  return false
}

function explicitValues(intent: GenerationIntentLayerV2): ReadonlyMap<RuntimeCapabilitySemanticPathV2, unknown> {
  const projected = projectGenerationIntentLayerV2({
    schemaVersion: 2,
    generation: intent.generation,
    reasoning: intent.reasoning,
    web: intent.web,
    image: intent.image,
    tools: intent.tools,
    attachments: intent.attachments,
    providerExtension: intent.providerExtension,
  }) as Record<string, unknown>
  const values = new Map<RuntimeCapabilitySemanticPathV2, unknown>()
  const addObject = (prefix: string, value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) values.set(`${prefix}.${key}` as RuntimeCapabilitySemanticPathV2, item)
    }
  }
  addObject('generation', projected.generation)
  addObject('reasoning', projected.reasoning)
  addObject('web', projected.web)
  addObject('image', projected.image)
  addObject('tools', projected.tools)
  addObject('providerExtension', projected.providerExtension)
  if (intent.reasoning) values.set('reasoning.mode', intent.reasoning.mode)
  if (intent.web) values.set('web.mode', intent.web.mode)
  if (intent.image) values.set('image.mode', intent.image.mode)
  if (intent.tools) values.set('tools.mode', intent.tools.mode)
  if (intent.providerExtension) values.set('providerExtension.kind', intent.providerExtension.kind)
  for (const projectedAttachment of (projected.attachments as readonly unknown[] | undefined) ?? []) {
    if (!projectedAttachment || typeof projectedAttachment !== 'object' || Array.isArray(projectedAttachment)) continue
    for (const [key, value] of Object.entries(projectedAttachment)) {
      if (value !== undefined) values.set(`attachments[].${key}` as RuntimeCapabilitySemanticPathV2, value)
    }
  }
  return values
}

/** Shared semantic legality check used by authority and compiler boundaries. */
export function validateSemanticIntentAgainstResolvedCapabilityV2(
  capability: ResolvedCapabilityV2,
  intent: GenerationIntentLayerV2,
): void {
  const fields = new Map(capability.fields.map((field) => [field.path, field]))
  const values = explicitValues(intent)
  for (const [path, value] of values) {
    const field = fields.get(path)
    if (!field || field.state === 'unsupported' || field.state === 'missing') {
      throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_FIELD_UNSUPPORTED')
    }
    if (field.state === 'unknown') {
      throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_FIELD_UNAVAILABLE')
    }
    if (!contains(field.domain, value)) {
      throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_VALUE_UNSUPPORTED')
    }
    for (const constraint of field.constraints) {
      const target = values.get(constraint.path)
      const matched = constraint.values.includes(target as never)
      if ((constraint.kind === 'requires_value' && !matched) ||
          (constraint.kind === 'forbids_value' && matched)) {
        throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_VALUE_UNSUPPORTED')
      }
    }
  }
}

export function assertCapabilityRevisionV2(
  expected: string,
  actual: string,
): void {
  if (typeof expected !== 'string' || expected.length === 0 || expected !== actual) {
    throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_STALE')
  }
}
