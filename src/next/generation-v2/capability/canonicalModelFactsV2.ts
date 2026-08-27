import { GENERATION_INTENT_OPEN_STRING_MAX_LENGTH_V2 } from '../domain/generationIntentV2'
import { GenerationV2Digest, readGenerationV2Digest } from '../domain/identityV2'
import {
  type DecodedProviderBindingRecordV2,
} from '../domain/providerBindingV2'
import { sha256PreparedBytesV2, stableSerializeProviderRequestV2 } from '../compiler/stableSerialize'
import {
  MODEL_CAPABILITY_SEMANTIC_PATHS_V2,
  isModelCapabilityDomainCompatibleWithPathV2,
  type ModelCapabilityDomainV2,
  type ModelCapabilityEvidenceEffectV2,
  type ModelCapabilityEvidenceKindV2,
  type ModelCapabilityFieldStateV2,
  type ModelCapabilityScalarV2,
  type ModelCapabilitySemanticPathV2,
  type PersistedModelCapabilityFieldV2,
} from './modelCapabilitySchemaV2'

export type CanonicalModelIdentityV2 = Readonly<{
  providerId: string
  endpointProfileId: string
  nativeModelId: string
  route?: Readonly<{
    kind: 'pinned_provider_route'
    providerTag: string
    providerSlug: string
  }>
}>

export type CanonicalModelCapabilityEvidenceV2 = Readonly<{
  evidenceId: string
  kind: ModelCapabilityEvidenceKindV2
  effect: ModelCapabilityEvidenceEffectV2
  sourceRef: string
  verifiedAt: string
  contentDigest: GenerationV2Digest<'evidence_digest'>
  entryDigest: GenerationV2Digest<'evidence_digest'>
}>

export type CanonicalModelFactsV2 = Readonly<{
  schemaVersion: 1
  identity: CanonicalModelIdentityV2
  evidence: readonly CanonicalModelCapabilityEvidenceV2[]
  fields: readonly PersistedModelCapabilityFieldV2[]
  evidenceDigest: string
  semanticFieldsDigest: string
  capabilityRevision: string
}>

export type CanonicalModelFactsDraftV2 = Readonly<{
  identity: unknown
  evidence: readonly Readonly<Record<string, unknown>>[]
  fields: readonly PersistedModelCapabilityFieldV2[]
}>

export class CanonicalModelFactsV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_CANONICAL_MODEL_FACTS_INVALID') {
    super(code)
    this.name = 'CanonicalModelFactsV2Error'
  }
}

function invalid(): never {
  throw new CanonicalModelFactsV2Error('GENERATION_V2_CANONICAL_MODEL_FACTS_INVALID')
}

function hash(value: unknown): string {
  return sha256PreparedBytesV2(new TextEncoder().encode(stableSerializeProviderRequestV2(value)))
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

function timestamp(value: unknown): string {
  const result = requiredString(value)
  const parsed = Date.parse(result)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(result) ||
      !Number.isFinite(parsed) || new Date(parsed).toISOString() !== result) invalid()
  return result
}

function canonicalIdentity(value: unknown): CanonicalModelIdentityV2 {
  if (!plainObject(value)) invalid()
  exactKeys(value, value.route === undefined
    ? ['providerId', 'endpointProfileId', 'nativeModelId']
    : ['providerId', 'endpointProfileId', 'nativeModelId', 'route'])
  let route: CanonicalModelIdentityV2['route']
  if (value.route !== undefined) {
    if (!plainObject(value.route)) invalid()
    exactKeys(value.route, ['kind', 'providerTag', 'providerSlug'])
    if (value.route.kind !== 'pinned_provider_route') invalid()
    route = Object.freeze({
      kind: 'pinned_provider_route',
      providerTag: identifier(value.route.providerTag),
      providerSlug: identifier(value.route.providerSlug),
    })
  }
  return Object.freeze({
    providerId: identifier(value.providerId),
    endpointProfileId: identifier(value.endpointProfileId),
    nativeModelId: identifier(value.nativeModelId),
    ...(route ? { route } : {}),
  })
}

export function projectCanonicalModelIdentityV2(
  binding: DecodedProviderBindingRecordV2,
): CanonicalModelIdentityV2 {
  const route = binding.endpointBinding.kind === 'pinned'
    ? Object.freeze({
        kind: 'pinned_provider_route' as const,
        providerTag: binding.endpointBinding.selector.providerTag.value,
        providerSlug: binding.endpointBinding.selector.providerSlug.value,
      })
    : undefined
  return canonicalIdentity({
    providerId: binding.providerId.value,
    endpointProfileId: binding.endpointProfileId.value,
    nativeModelId: binding.modelId.value,
    ...(route ? { route } : {}),
  })
}

function canonicalSourceRef(kind: ModelCapabilityEvidenceKindV2, value: unknown): string {
  const result = requiredString(value)
  if (result.length > 2048 || result.trim() !== result || /[\u0000-\u001f\u007f]/u.test(result)) invalid()
  if (kind === 'official_documentation') {
    let url: URL
    try { url = new URL(result) } catch { return invalid() }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) invalid()
  } else {
    identifier(result)
  }
  return result
}

function scalar(value: unknown): ModelCapabilityScalarV2 {
  if (typeof value === 'string') {
    if (value.length > 512 || /[\u0000-\u001f\u007f]/u.test(value)) invalid()
    return value
  }
  if (typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return invalid()
}

function scalarValues(value: unknown): readonly ModelCapabilityScalarV2[] {
  if (!Array.isArray(value) || value.length === 0) invalid()
  const values = value.map(scalar)
  values.sort((left, right) => `${typeof left}:${String(left)}`.localeCompare(`${typeof right}:${String(right)}`, 'en'))
  if (new Set(values.map((item) => `${typeof item}:${String(item)}`)).size !== values.length) invalid()
  return Object.freeze(values)
}

function domain(value: unknown): ModelCapabilityDomainV2 {
  if (!plainObject(value) || typeof value.kind !== 'string') return invalid()
  switch (value.kind) {
    case 'boolean':
    case 'identity':
      exactKeys(value, ['kind'])
      return Object.freeze({ kind: value.kind })
    case 'string':
      exactKeys(value, ['kind', 'maxLength'])
      if (!Number.isSafeInteger(value.maxLength) || (value.maxLength as number) < 1 ||
          (value.maxLength as number) > GENERATION_INTENT_OPEN_STRING_MAX_LENGTH_V2) invalid()
      return Object.freeze({ kind: 'string', maxLength: value.maxLength as number })
    case 'enum':
      exactKeys(value, ['kind', 'values'])
      return Object.freeze({ kind: 'enum', values: scalarValues(value.values) })
    case 'response_format':
      exactKeys(value, ['kind', 'types'])
      if (!Array.isArray(value.types) || value.types.length === 0 ||
          value.types.some((item) => item !== 'text' && item !== 'json_object' && item !== 'json_schema') ||
          new Set(value.types).size !== value.types.length) invalid()
      return Object.freeze({ kind: 'response_format', types: Object.freeze([...value.types] as ('text' | 'json_object' | 'json_schema')[]) })
    case 'enum_list':
      exactKeys(value, ['kind', 'values', 'maxItems'])
      if (!Number.isSafeInteger(value.maxItems) || (value.maxItems as number) < 1) invalid()
      return Object.freeze({ kind: 'enum_list', values: scalarValues(value.values), maxItems: value.maxItems as number })
    case 'range':
      exactKeys(value, ['kind', 'min', 'max', 'integer'])
      if (typeof value.min !== 'number' || !Number.isFinite(value.min) || typeof value.max !== 'number' ||
          !Number.isFinite(value.max) || value.min > value.max || typeof value.integer !== 'boolean' ||
          value.integer && (!Number.isSafeInteger(value.min) || !Number.isSafeInteger(value.max))) invalid()
      return Object.freeze({ kind: 'range', min: value.min, max: value.max, integer: value.integer })
    case 'string_list':
      exactKeys(value, ['kind', 'maxItems', 'maxItemLength'])
      if (!Number.isSafeInteger(value.maxItems) || (value.maxItems as number) < 1 ||
          !Number.isSafeInteger(value.maxItemLength) || (value.maxItemLength as number) < 1) invalid()
      return Object.freeze({ kind: 'string_list', maxItems: value.maxItems as number, maxItemLength: value.maxItemLength as number })
    case 'identity_list':
      exactKeys(value, ['kind', 'maxItems'])
      if (!Number.isSafeInteger(value.maxItems) || (value.maxItems as number) < 1) invalid()
      return Object.freeze({ kind: 'identity_list', maxItems: value.maxItems as number })
    case 'approximate_location':
      exactKeys(value, ['kind', 'maxFieldLength'])
      if (!Number.isSafeInteger(value.maxFieldLength) || (value.maxFieldLength as number) < 1) invalid()
      return Object.freeze({ kind: 'approximate_location', maxFieldLength: value.maxFieldLength as number })
    case 'dimensions':
      exactKeys(value, ['kind', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight'])
      if (![value.minWidth, value.maxWidth, value.minHeight, value.maxHeight].every(Number.isSafeInteger) ||
          (value.minWidth as number) < 1 || (value.minHeight as number) < 1 ||
          (value.minWidth as number) > (value.maxWidth as number) ||
          (value.minHeight as number) > (value.maxHeight as number)) invalid()
      return Object.freeze({ kind: 'dimensions', minWidth: value.minWidth as number, maxWidth: value.maxWidth as number,
        minHeight: value.minHeight as number, maxHeight: value.maxHeight as number })
    case 'dimensions_enum': {
      exactKeys(value, ['kind', 'values'])
      if (!Array.isArray(value.values) || value.values.length === 0) invalid()
      const values = value.values.map((item) => {
        if (!plainObject(item)) return invalid()
        exactKeys(item, ['width', 'height'])
        if (!Number.isSafeInteger(item.width) || !Number.isSafeInteger(item.height) ||
            (item.width as number) < 1 || (item.height as number) < 1) invalid()
        return Object.freeze({ width: item.width as number, height: item.height as number })
      })
      values.sort((left, right) => left.width - right.width || left.height - right.height)
      if (new Set(values.map((item) => `${item.width}x${item.height}`)).size !== values.length) invalid()
      return Object.freeze({ kind: 'dimensions_enum', values: Object.freeze(values) })
    }
    default:
      return invalid()
  }
}

function evidenceIds(value: unknown): readonly string[] {
  if (!Array.isArray(value)) invalid()
  const ids = value.map(identifier).sort()
  if (new Set(ids).size !== ids.length) invalid()
  return Object.freeze(ids)
}

const EVIDENCE_KINDS = Object.freeze([
  'contract_invariant', 'endpoint_descriptor', 'signed_provider_record',
  'official_documentation', 'live_probe', 'capability_rule',
] as const)
const EVIDENCE_EFFECTS = Object.freeze(['supports', 'rejects', 'requires_confirmation', 'unknown'] as const)
const FIELD_STATES = Object.freeze(['supported', 'unsupported', 'requires_confirmation', 'missing', 'unknown'] as const)

function canonicalEvidence(input: readonly Readonly<Record<string, unknown>>[]): readonly CanonicalModelCapabilityEvidenceV2[] {
  const evidence = input.map((item) => {
    if (!plainObject(item)) return invalid()
    exactKeys(item, ['evidenceId', 'kind', 'effect', 'sourceRef', 'verifiedAt', 'contentDigest'])
    const kind = item.kind as ModelCapabilityEvidenceKindV2
    const effect = item.effect as ModelCapabilityEvidenceEffectV2
    if (!EVIDENCE_KINDS.includes(kind) || !EVIDENCE_EFFECTS.includes(effect)) invalid()
    const base = Object.freeze({ evidenceId: identifier(item.evidenceId), kind, effect,
      sourceRef: canonicalSourceRef(kind, item.sourceRef), verifiedAt: timestamp(item.verifiedAt),
      contentDigest: digest(item.contentDigest) })
    return Object.freeze({ ...base,
      contentDigest: GenerationV2Digest.create('evidence_digest', base.contentDigest),
      entryDigest: GenerationV2Digest.create('evidence_digest', hash(base)) })
  })
  evidence.sort((left, right) => left.evidenceId.localeCompare(right.evidenceId, 'en'))
  if (evidence.length === 0 || new Set(evidence.map((item) => item.evidenceId)).size !== evidence.length) invalid()
  return Object.freeze(evidence)
}

function canonicalFields(input: readonly PersistedModelCapabilityFieldV2[]): readonly PersistedModelCapabilityFieldV2[] {
  const fields = input.map((value) => {
    if (!plainObject(value)) return invalid()
    exactKeys(value, value.domain === undefined
      ? ['path', 'state', 'constraints', 'evidenceIds']
      : ['path', 'state', 'domain', 'constraints', 'evidenceIds'])
    if (!MODEL_CAPABILITY_SEMANTIC_PATHS_V2.includes(value.path as ModelCapabilitySemanticPathV2) ||
        !FIELD_STATES.includes(value.state as typeof FIELD_STATES[number])) invalid()
    const state = value.state as ModelCapabilityFieldStateV2
    const fieldDomain = value.domain === undefined ? undefined : domain(value.domain)
    if ((state === 'unsupported' || state === 'missing' || state === 'unknown') !== (fieldDomain === undefined) ||
        !Array.isArray(value.constraints) || !Array.isArray(value.evidenceIds) ||
        (state === 'unsupported' || state === 'missing' || state === 'unknown') && value.constraints.length > 0) invalid()
    if (fieldDomain && !isModelCapabilityDomainCompatibleWithPathV2(
      value.path as ModelCapabilitySemanticPathV2,
      fieldDomain,
    )) invalid()
    const constraints = value.constraints.map((candidate) => {
      if (!plainObject(candidate)) return invalid()
      exactKeys(candidate, ['kind', 'path', 'values'])
      if ((candidate.kind !== 'requires_value' && candidate.kind !== 'forbids_value') ||
          !MODEL_CAPABILITY_SEMANTIC_PATHS_V2.includes(candidate.path as ModelCapabilitySemanticPathV2) ||
          candidate.path === value.path) invalid()
      return Object.freeze({ kind: candidate.kind, path: candidate.path as ModelCapabilitySemanticPathV2,
        values: scalarValues(candidate.values) })
    })
    constraints.sort((left, right) => hash(left).localeCompare(hash(right), 'en'))
    return Object.freeze({ path: value.path as ModelCapabilitySemanticPathV2, state,
      ...(fieldDomain === undefined ? {} : { domain: fieldDomain }),
      constraints: Object.freeze(constraints), evidenceIds: evidenceIds(value.evidenceIds) })
  })
  fields.sort((left, right) => left.path.localeCompare(right.path, 'en'))
  if (fields.length !== MODEL_CAPABILITY_SEMANTIC_PATHS_V2.length ||
      fields.some((field, index) => field.path !== MODEL_CAPABILITY_SEMANTIC_PATHS_V2[index])) invalid()
  return Object.freeze(fields)
}

export function canonicalizeModelFactsV2(value: unknown): CanonicalModelFactsV2 {
  try {
    if (!plainObject(value)) return invalid()
    exactKeys(value, ['identity', 'evidence', 'fields'])
    if (!Array.isArray(value.evidence) || !Array.isArray(value.fields)) return invalid()
    const identity = canonicalIdentity(value.identity)
    const evidence = canonicalEvidence(value.evidence as readonly Readonly<Record<string, unknown>>[])
    const fields = canonicalFields(value.fields as readonly PersistedModelCapabilityFieldV2[])
    const evidenceById = new Map(evidence.map((item) => [item.evidenceId, item]))
    const effectForState: Partial<Record<ModelCapabilityFieldStateV2, ModelCapabilityEvidenceEffectV2>> = {
      supported: 'supports', unsupported: 'rejects', requires_confirmation: 'requires_confirmation', unknown: 'unknown',
    }
    for (const field of fields) {
      if (field.state === 'missing') {
        if (field.evidenceIds.length !== 0) invalid()
        continue
      }
      const expectedEffect = effectForState[field.state]
      if (field.evidenceIds.length === 0 || field.evidenceIds.some((id) => evidenceById.get(id)?.effect !== expectedEffect)) invalid()
    }
    const evidenceForRevision = evidence.map((item) => ({ evidenceId: item.evidenceId, kind: item.kind,
      effect: item.effect, sourceRef: item.sourceRef, contentDigest: item.contentDigest.value }))
    const evidenceDigest = hash(evidence.map((item) => ({ evidenceId: item.evidenceId, kind: item.kind,
      effect: item.effect, sourceRef: item.sourceRef, verifiedAt: item.verifiedAt,
      contentDigest: item.contentDigest.value, entryDigest: item.entryDigest.value })))
    const semanticFieldsDigest = hash(fields)
    return Object.freeze({
      schemaVersion: 1,
      identity,
      evidence,
      fields,
      evidenceDigest,
      semanticFieldsDigest,
      capabilityRevision: `capability-v2:${hash({ identity, evidence: evidenceForRevision, semanticFieldsDigest })}`,
    })
  } catch (error) {
    if (error instanceof CanonicalModelFactsV2Error) throw error
    return invalid()
  }
}

export function projectCanonicalModelFactsDraftV2(facts: CanonicalModelFactsV2): Readonly<Record<string, unknown>> {
  return Object.freeze({
    identity: facts.identity,
    evidence: Object.freeze(facts.evidence.map((item) => Object.freeze({
      evidenceId: item.evidenceId,
      kind: item.kind,
      effect: item.effect,
      sourceRef: item.sourceRef,
      verifiedAt: item.verifiedAt,
      contentDigest: readGenerationV2Digest(item.contentDigest, 'evidence_digest'),
    }))),
    fields: facts.fields,
  })
}

/** Mechanical catalog/UI projection; it cannot revise or reinterpret facts. */
export function projectCanonicalModelFactsV2(facts: CanonicalModelFactsV2): Readonly<{
  schemaVersion: 1
  identity: CanonicalModelIdentityV2
  evidence: readonly Readonly<Record<string, unknown>>[]
  fields: readonly PersistedModelCapabilityFieldV2[]
  evidenceDigest: string
  semanticFieldsDigest: string
  capabilityRevision: string
}> {
  return Object.freeze({
    schemaVersion: 1,
    identity: facts.identity,
    evidence: Object.freeze(facts.evidence.map((item) => Object.freeze({
      evidenceId: item.evidenceId,
      kind: item.kind,
      effect: item.effect,
      sourceRef: item.sourceRef,
      verifiedAt: item.verifiedAt,
      contentDigest: readGenerationV2Digest(item.contentDigest, 'evidence_digest'),
      entryDigest: readGenerationV2Digest(item.entryDigest, 'evidence_digest'),
    }))),
    fields: facts.fields,
    evidenceDigest: facts.evidenceDigest,
    semanticFieldsDigest: facts.semanticFieldsDigest,
    capabilityRevision: facts.capabilityRevision,
  })
}
