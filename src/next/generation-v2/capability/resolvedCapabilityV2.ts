import type { GenerationIntentLayerV2 } from '../domain/generationIntentV2'
import { projectGenerationIntentLayerV2 } from '../domain/generationIntentProjectionV2'
import {
  decodeProviderBindingRecordV2,
  projectDecodedProviderBindingRecordV2,
  type DecodedProviderBindingRecordV2,
} from '../domain/providerBindingV2'
import {
  canonicalizeUnverifiedRuntimeCapabilitySnapshotV2,
  decodeRuntimeCapabilitySnapshotV2,
  type DecodedRuntimeCapabilitySnapshotV2,
  type PersistedRuntimeCapabilitySnapshotV2,
  type PersistedRuntimeContinuationCapabilityV2,
  type PersistedRuntimeToolCapabilityV2,
} from './runtimeCapabilitySnapshotV2'
import {
  assertEncodingCoverageForResolvedFieldsV2,
  EncodingCoverageRegistryV2Error,
  resolveEncodingCoverageRegistryV2,
  type EncodingCoverageRegistryV2,
} from './encodingCoverageRegistryV2'
import {
  canonicalizeModelFactsV2,
  projectCanonicalModelIdentityV2,
  projectCanonicalModelFactsDraftV2,
  type CanonicalModelFactsV2,
} from './canonicalModelFactsV2'
import type {
  ModelCapabilityDomainV2,
  ModelCapabilityScalarV2,
  ModelCapabilitySemanticPathV2,
  PersistedModelCapabilityFieldV2,
} from './modelCapabilitySchemaV2'

/** Generation authorization. `modelFacts` is its only model-capability authority. */
export type ResolvedCapabilityV2 = Readonly<{
  schemaVersion: 2
  modelFacts: CanonicalModelFactsV2
  executionContext: Readonly<{
    binding: DecodedProviderBindingRecordV2
    catalogAuthority?: DecodedRuntimeCapabilitySnapshotV2['catalogAuthority']
    continuation: PersistedRuntimeContinuationCapabilityV2
    encodingCoverage: EncodingCoverageRegistryV2
  }>
}>

export type ResolvedCapabilityDraftV2 = Readonly<{
  binding: unknown
  catalogAuthority?: DecodedRuntimeCapabilitySnapshotV2['catalogAuthority']
  evidence: readonly Readonly<Record<string, unknown>>[]
  fields: readonly PersistedModelCapabilityFieldV2[]
  continuation: PersistedRuntimeContinuationCapabilityV2
}>

export type GenerationControlsProjectionV2 = Readonly<{
  schemaVersion: 2
  binding: Readonly<Record<string, unknown>>
  capabilityRevision: string
  controls: Readonly<Record<ModelCapabilitySemanticPathV2, Readonly<{
    visibility: 'visible' | 'hidden'
    state: PersistedModelCapabilityFieldV2['state']
    domain?: ModelCapabilityDomainV2
    defaultValue?: PersistedModelCapabilityFieldV2['defaultValue']
    constraints: readonly PersistedModelCapabilityFieldV2['constraints'][number][]
    evidenceIds: readonly string[]
  }>>>
}>

export class ResolvedCapabilityV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_RESOLVED_CAPABILITY_INVALID'
    | 'GENERATION_V2_RESOLVED_CAPABILITY_FIELD_UNSUPPORTED'
    | 'GENERATION_V2_RESOLVED_CAPABILITY_VALUE_UNSUPPORTED'
    | 'GENERATION_V2_RESOLVED_CAPABILITY_STALE'
    | 'GENERATION_V2_ENCODING_COVERAGE_INVALID') {
    super(code)
    this.name = 'ResolvedCapabilityV2Error'
  }
}

function invalid(): never {
  throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null))
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  const keys = Object.keys(value).sort()
  const expected = [...allowed].sort()
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) invalid()
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) invalid()
  return value
}

function identifier(value: unknown): string {
  const result = requiredString(value)
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u.test(result)) invalid()
  return result
}

function digest(value: unknown): string {
  const result = requiredString(value)
  if (!/^[0-9a-f]{64}$/u.test(result)) invalid()
  return result
}

function evidenceIds(value: unknown): readonly string[] {
  if (!Array.isArray(value)) invalid()
  const ids = value.map(identifier).sort()
  if (new Set(ids).size !== ids.length) invalid()
  return Object.freeze(ids)
}

function canonicalContinuation(value: unknown): PersistedRuntimeContinuationCapabilityV2 {
  if (!plainObject(value) || typeof value.kind !== 'string') invalid()
  if (value.kind === 'unavailable') {
    exactKeys(value, ['kind', 'evidenceIds'])
    const ids = evidenceIds(value.evidenceIds)
    if (ids.length !== 0) invalid()
    return Object.freeze({ kind: 'unavailable', evidenceIds: Object.freeze([]) as readonly [] })
  }
  if (value.kind === 'none') {
    exactKeys(value, ['kind', 'evidenceIds'])
    const ids = evidenceIds(value.evidenceIds)
    if (ids.length === 0) invalid()
    return Object.freeze({ kind: 'none', evidenceIds: ids })
  }
  if (value.kind === 'client_managed_native_replay') {
    exactKeys(value, ['kind', 'artifactKind', 'supportsBranchReplay', 'supportsRestartReplay', 'evidenceIds'])
    const ids = evidenceIds(value.evidenceIds)
    if (ids.length === 0 || typeof value.supportsBranchReplay !== 'boolean' ||
        typeof value.supportsRestartReplay !== 'boolean') invalid()
    return Object.freeze({ kind: 'client_managed_native_replay', artifactKind: identifier(value.artifactKind),
      supportsBranchReplay: value.supportsBranchReplay, supportsRestartReplay: value.supportsRestartReplay, evidenceIds: ids })
  }
  if (value.kind === 'provider_managed_reference') {
    exactKeys(value, ['kind', 'referenceKind', 'supportsBranchReplay', 'supportsRestartReplay', 'evidenceIds'])
    const ids = evidenceIds(value.evidenceIds)
    if (ids.length === 0 || typeof value.supportsBranchReplay !== 'boolean' ||
        typeof value.supportsRestartReplay !== 'boolean') invalid()
    return Object.freeze({ kind: 'provider_managed_reference', referenceKind: identifier(value.referenceKind),
      supportsBranchReplay: value.supportsBranchReplay, supportsRestartReplay: value.supportsRestartReplay, evidenceIds: ids })
  }
  return invalid()
}

function canonicalCatalogAuthority(value: unknown): DecodedRuntimeCapabilitySnapshotV2['catalogAuthority'] | undefined {
  if (value === undefined) return undefined
  if (!plainObject(value)) invalid()
  exactKeys(value, ['scopeId', 'catalogDigest', 'authorityRevision', 'observationDigest'])
  if (!Number.isSafeInteger(value.authorityRevision) || (value.authorityRevision as number) < 0) invalid()
  return Object.freeze({ scopeId: identifier(value.scopeId), catalogDigest: digest(value.catalogDigest),
    authorityRevision: value.authorityRevision as number, observationDigest: digest(value.observationDigest) })
}

/**
 * Adds execution context to already-canonical model facts. Protocol,
 * operation and encoder coverage may reject this authorization, but cannot
 * rewrite the facts or their revision.
 */
export function authorizeResolvedCapabilityV2(input: Readonly<{
  modelFacts: CanonicalModelFactsV2
  binding: DecodedProviderBindingRecordV2
  catalogAuthority?: unknown
  continuation: PersistedRuntimeContinuationCapabilityV2
}>): ResolvedCapabilityV2 {
  try {
    const modelFacts = canonicalizeModelFactsV2(projectCanonicalModelFactsDraftV2(input.modelFacts))
    const bindingIdentity = projectCanonicalModelIdentityV2(input.binding)
    if (JSON.stringify(modelFacts.identity) !== JSON.stringify(bindingIdentity)) invalid()
    let encodingCoverage: EncodingCoverageRegistryV2
    try {
      encodingCoverage = assertEncodingCoverageForResolvedFieldsV2({ providerId: input.binding.providerId.value,
        protocolContractId: input.binding.protocolContractId.value, operation: input.binding.operation,
        fields: modelFacts.fields })
    } catch (error) {
      if (error instanceof EncodingCoverageRegistryV2Error) {
        throw new ResolvedCapabilityV2Error('GENERATION_V2_ENCODING_COVERAGE_INVALID')
      }
      throw error
    }
    const continuation = canonicalContinuation(input.continuation)
    const evidenceById = new Map(modelFacts.evidence.map((item) => [item.evidenceId, item]))
    if (continuation.kind !== 'unavailable' &&
        continuation.evidenceIds.some((id) => evidenceById.get(id)?.effect !== 'supports')) invalid()
    const catalogAuthority = canonicalCatalogAuthority(input.catalogAuthority)
    return Object.freeze({ schemaVersion: 2, modelFacts, executionContext: Object.freeze({ binding: input.binding,
      ...(catalogAuthority ? { catalogAuthority } : {}), continuation, encodingCoverage }) })
  } catch (error) {
    if (error instanceof ResolvedCapabilityV2Error) throw error
    throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
  }
}

/** Transitional producer entry point: canonicalize facts first, then authorize them. */
export function canonicalizeResolvedCapabilityV2(value: unknown): ResolvedCapabilityV2 {
  try {
    if (!plainObject(value)) invalid()
    exactKeys(value, value.catalogAuthority === undefined
      ? ['binding', 'evidence', 'fields', 'continuation']
      : ['binding', 'catalogAuthority', 'evidence', 'fields', 'continuation'])
    if (!Array.isArray(value.evidence) || !Array.isArray(value.fields)) invalid()
    const binding = decodeProviderBindingRecordV2(value.binding)
    const modelFacts = canonicalizeModelFactsV2({ identity: projectCanonicalModelIdentityV2(binding),
      evidence: value.evidence, fields: value.fields })
    return authorizeResolvedCapabilityV2({ modelFacts, binding,
      ...(value.catalogAuthority === undefined ? {} : { catalogAuthority: value.catalogAuthority }),
      continuation: value.continuation as PersistedRuntimeContinuationCapabilityV2 })
  } catch (error) {
    if (error instanceof ResolvedCapabilityV2Error) throw error
    throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_INVALID')
  }
}

export function resolvedCapabilityFromRuntimeSnapshotV2(snapshot: DecodedRuntimeCapabilitySnapshotV2): ResolvedCapabilityV2 {
  if (!snapshot || snapshot.executionAuthority !== 'none' || snapshot.trust !== 'decoded_unverified') invalid()
  const capability = canonicalizeResolvedCapabilityV2({ binding: projectDecodedProviderBindingRecordV2(snapshot.binding),
    ...(snapshot.catalogAuthority ? { catalogAuthority: snapshot.catalogAuthority } : {}),
    evidence: snapshot.evidence.map((item) => ({ evidenceId: item.evidenceId, kind: item.kind, effect: item.effect,
      sourceRef: item.sourceRef, verifiedAt: item.verifiedAt, contentDigest: item.contentDigest.value })),
    fields: snapshot.fields, continuation: snapshot.continuation })
  if (capability.modelFacts.capabilityRevision !== snapshot.revision.value ||
      capability.executionContext.encodingCoverage.encoderRevision !== snapshot.encoderRevision) {
    throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_STALE')
  }
  return capability
}

export function resolvedCapabilityFromRecordV2(record: PersistedRuntimeCapabilitySnapshotV2): ResolvedCapabilityV2 {
  return resolvedCapabilityFromRuntimeSnapshotV2(decodeRuntimeCapabilitySnapshotV2(record))
}

export function runtimeSnapshotRecordFromResolvedCapabilityV2(input: Readonly<{
  capability: ResolvedCapabilityV2
  resolvedAt: string
  tools: readonly PersistedRuntimeToolCapabilityV2[]
}>): PersistedRuntimeCapabilitySnapshotV2 {
  const facts = input.capability.modelFacts
  const execution = input.capability.executionContext
  const record = canonicalizeUnverifiedRuntimeCapabilitySnapshotV2({ schemaVersion: 2, resolvedAt: input.resolvedAt,
    binding: projectDecodedProviderBindingRecordV2(execution.binding),
    ...(execution.catalogAuthority ? { catalogAuthority: execution.catalogAuthority } : {}),
    evidence: facts.evidence.map((item) => ({ evidenceId: item.evidenceId, kind: item.kind, effect: item.effect,
      sourceRef: item.sourceRef, verifiedAt: item.verifiedAt, contentDigest: item.contentDigest.value })),
    fields: facts.fields, tools: input.tools, continuation: execution.continuation })
  if (record.revision !== facts.capabilityRevision || record.encoderRevision !== execution.encodingCoverage.encoderRevision) {
    throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_STALE')
  }
  return record
}

export function composeRuntimeSnapshotFromResolvedCapabilityV2(input: Readonly<{
  capability: ResolvedCapabilityV2
  resolvedAt: string
  tools: readonly PersistedRuntimeToolCapabilityV2[]
}>): DecodedRuntimeCapabilitySnapshotV2 {
  return decodeRuntimeCapabilitySnapshotV2(runtimeSnapshotRecordFromResolvedCapabilityV2(input))
}

export function projectGenerationControlsProjectionV2(capability: ResolvedCapabilityV2): GenerationControlsProjectionV2 {
  const facts = capability.modelFacts
  const binding = capability.executionContext.binding
  const controls = Object.fromEntries(facts.fields.map((field) => [field.path, Object.freeze({
    visibility: field.state === 'missing' || field.state === 'unsupported' ? 'hidden' : 'visible', state: field.state,
    ...(field.domain ? { domain: field.domain } : {}),
    ...(field.defaultValue === undefined ? {} : { defaultValue: field.defaultValue }),
    constraints: field.constraints, evidenceIds: field.evidenceIds,
  })])) as GenerationControlsProjectionV2['controls']
  return Object.freeze({ schemaVersion: 2, binding: Object.freeze({ providerId: binding.providerId.value,
    endpointProfileId: binding.endpointProfileId.value, protocolContractId: binding.protocolContractId.value,
    modelId: binding.modelId.value, operation: binding.operation }), capabilityRevision: facts.capabilityRevision,
    controls: Object.freeze(controls) })
}

function scalar(value: unknown): ModelCapabilityScalarV2 | undefined {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : undefined
}

function contains(domain: ModelCapabilityDomainV2 | undefined, value: unknown): boolean {
  if (!domain) return false
  if (domain.kind === 'boolean') return typeof value === 'boolean'
  if (domain.kind === 'identity') return typeof value === 'string' || Boolean(value && typeof value === 'object' &&
    typeof (value as { value?: unknown }).value === 'string')
  if (domain.kind === 'string') return typeof value === 'string' && value.length <= domain.maxLength
  if (domain.kind === 'enum') return scalar(value) !== undefined && domain.values.includes(value as ModelCapabilityScalarV2)
  if (domain.kind === 'response_format') return Boolean(value && typeof value === 'object' &&
    domain.types.includes((value as { type?: unknown }).type as never))
  if (domain.kind === 'enum_list') return Array.isArray(value) && value.length <= domain.maxItems &&
    value.every((item) => scalar(item) !== undefined && domain.values.includes(item as ModelCapabilityScalarV2))
  if (domain.kind === 'range') return typeof value === 'number' && Number.isFinite(value) && value >= domain.min &&
    value <= domain.max && (!domain.integer || Number.isSafeInteger(value)) &&
    !domain.excludedValues?.includes(value)
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

function explicitValues(intent: GenerationIntentLayerV2): ReadonlyMap<ModelCapabilitySemanticPathV2, unknown> {
  const projected = projectGenerationIntentLayerV2({ schemaVersion: 2, generation: intent.generation,
    reasoning: intent.reasoning, web: intent.web, image: intent.image, tools: intent.tools,
    attachments: intent.attachments, providerExtension: intent.providerExtension }) as Record<string, unknown>
  const values = new Map<ModelCapabilitySemanticPathV2, unknown>()
  const addObject = (prefix: string, value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) values.set(`${prefix}.${key}` as ModelCapabilitySemanticPathV2, item)
    }
  }
  addObject('generation', projected.generation); addObject('reasoning', projected.reasoning)
  addObject('web', projected.web); addObject('image', projected.image); addObject('tools', projected.tools)
  addObject('providerExtension', projected.providerExtension)
  if (intent.reasoning) values.set('reasoning.mode', intent.reasoning.mode)
  if (intent.web) values.set('web.mode', intent.web.mode)
  if (intent.image) values.set('image.mode', intent.image.mode)
  if (intent.tools) values.set('tools.mode', intent.tools.mode)
  if (intent.providerExtension) values.set('providerExtension.kind', intent.providerExtension.kind)
  for (const attachment of (projected.attachments as readonly unknown[] | undefined) ?? []) {
    if (!attachment || typeof attachment !== 'object' || Array.isArray(attachment)) continue
    for (const [key, value] of Object.entries(attachment)) {
      if (value !== undefined) values.set(`attachments[].${key}` as ModelCapabilitySemanticPathV2, value)
    }
  }
  return values
}

/** Unknown remains unknown and is allowed to attempt when the encoder covers the path. */
export function validateSemanticIntentAgainstResolvedCapabilityV2(
  capability: ResolvedCapabilityV2,
  intent: GenerationIntentLayerV2,
): void {
  const fields = new Map(capability.modelFacts.fields.map((field) => [field.path, field]))
  const covered = new Set(capability.executionContext.encodingCoverage.semanticPaths)
  const values = explicitValues(intent)
  for (const [path, value] of values) {
    const field = fields.get(path)
    if (!field || field.state === 'unsupported' || field.state === 'missing') {
      throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_FIELD_UNSUPPORTED')
    }
    if (!covered.has(path)) throw new ResolvedCapabilityV2Error('GENERATION_V2_ENCODING_COVERAGE_INVALID')
    if (field.state === 'unknown') continue
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

export function assertCapabilityRevisionV2(expected: string, actual: string): void {
  if (typeof expected !== 'string' || expected.length === 0 || expected !== actual) {
    throw new ResolvedCapabilityV2Error('GENERATION_V2_RESOLVED_CAPABILITY_STALE')
  }
}

export function assertResolvedCapabilityScopeV2(capability: ResolvedCapabilityV2): void {
  const binding = capability.executionContext.binding
  resolveEncodingCoverageRegistryV2({ providerId: binding.providerId.value,
    protocolContractId: binding.protocolContractId.value, operation: binding.operation })
}
