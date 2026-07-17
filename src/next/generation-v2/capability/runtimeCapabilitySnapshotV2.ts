import {
  sha256PreparedBytesV2,
  stableSerializeProviderRequestBoundedV2,
} from '../compiler/stableSerialize'
import {
  GenerationV2Digest,
  GenerationV2Identity,
  readGenerationV2Digest,
  readGenerationV2Identity,
} from '../domain/identityV2'
import {
  decodeProviderBindingRecordV2,
  projectDecodedProviderBindingRecordV2,
  type DecodedProviderBindingRecordV2,
} from '../domain/providerBindingV2'
import type {
  AttachmentIntentV2,
  ImageGenerationIntentV2,
  ProviderSemanticExtensionV2,
  ReasoningIntentV2,
  SamplingIntentV2,
  ToolPolicyIntentV2,
  WebSearchIntentV2,
} from '../domain/generationIntentV2'

export const RUNTIME_CAPABILITY_SNAPSHOT_V2_SCHEMA_VERSION = 2 as const
export const RUNTIME_CAPABILITY_SNAPSHOT_V2_MAX_UTF8_BYTES = 1024 * 1024

type RuntimeCapabilityRequiredSemanticPathV2 =
  | `generation.${Extract<keyof SamplingIntentV2, string>}`
  | `reasoning.${Extract<keyof Extract<ReasoningIntentV2, { mode: 'enabled' }>, string>}`
  | `web.${Extract<keyof Extract<WebSearchIntentV2, { mode: 'provider_search' }>, string>}`
  | `image.${Extract<keyof Extract<ImageGenerationIntentV2, { mode: 'generate' }>, string>}`
  | `tools.${Extract<keyof Extract<ToolPolicyIntentV2, { mode: 'enabled' }>, string>}`
  | `attachments[].${Extract<keyof AttachmentIntentV2, string>}`
  | `providerExtension.${Extract<keyof ProviderSemanticExtensionV2, string>}`

export const RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2 = Object.freeze([
  'attachments[].assetId',
  'attachments[].assetRevisionId',
  'attachments[].assetSha256',
  'attachments[].conversion',
  'attachments[].include',
  'attachments[].sendAs',
  'generation.candidateCount',
  'generation.frequencyPenalty',
  'generation.maxOutputTokens',
  'generation.presencePenalty',
  'generation.repetitionPenalty',
  'generation.seed',
  'generation.stop',
  'generation.temperature',
  'generation.topK',
  'generation.topP',
  'image.aspectRatio',
  'image.background',
  'image.format',
  'image.mode',
  'image.outputCompression',
  'image.quality',
  'image.resolution',
  'image.size',
  'image.stream',
  'providerExtension.kind',
  'reasoning.effort',
  'reasoning.mode',
  'reasoning.summary',
  'tools.allowedToolIds',
  'tools.mode',
  'tools.sideEffectConfirmation',
  'tools.toolChoice',
  'web.mode',
  'web.types',
] as const satisfies readonly RuntimeCapabilityRequiredSemanticPathV2[])

export const RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2_COMPLETE:
  Exclude<RuntimeCapabilityRequiredSemanticPathV2, typeof RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2[number]> extends never
    ? true
    : false = true

export type RuntimeCapabilitySemanticPathV2 = typeof RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2[number]
export type RuntimeCapabilityFieldStateV2 =
  | 'supported'
  | 'unsupported'
  | 'requires_confirmation'
  | 'unavailable'
export type RuntimeCapabilityEvidenceEffectV2 = 'supports' | 'rejects' | 'requires_confirmation'
export type RuntimeCapabilityScalarV2 = string | number | boolean

export type RuntimeCapabilityDomainV2 =
  | Readonly<{ kind: 'boolean' }>
  | Readonly<{ kind: 'identity' }>
  | Readonly<{ kind: 'enum'; values: readonly RuntimeCapabilityScalarV2[] }>
  | Readonly<{ kind: 'enum_list'; values: readonly RuntimeCapabilityScalarV2[]; maxItems: number }>
  | Readonly<{ kind: 'range'; min: number; max: number; integer: boolean }>
  | Readonly<{ kind: 'string_list'; maxItems: number; maxItemLength: number }>
  | Readonly<{ kind: 'identity_list'; maxItems: number }>
  | Readonly<{
      kind: 'dimensions'
      minWidth: number
      maxWidth: number
      minHeight: number
      maxHeight: number
    }>

export type RuntimeCapabilityConstraintV2 = Readonly<{
  kind: 'requires_value' | 'forbids_value'
  path: RuntimeCapabilitySemanticPathV2
  values: readonly RuntimeCapabilityScalarV2[]
}>

export type RuntimeCapabilityEvidenceKindV2 =
  | 'contract_invariant'
  | 'endpoint_descriptor'
  | 'signed_provider_record'
  | 'official_documentation'
  | 'live_probe'
  | 'user_narrowing_override'

export type PersistedRuntimeCapabilityEvidenceV2 = Readonly<{
  evidenceId: string
  kind: RuntimeCapabilityEvidenceKindV2
  effect: RuntimeCapabilityEvidenceEffectV2
  sourceRef: string
  verifiedAt: string
  contentDigest: string
  entryDigest: string
}>

export type PersistedRuntimeCapabilityFieldV2 = Readonly<{
  path: RuntimeCapabilitySemanticPathV2
  state: RuntimeCapabilityFieldStateV2
  domain?: RuntimeCapabilityDomainV2
  constraints: readonly RuntimeCapabilityConstraintV2[]
  evidenceIds: readonly string[]
}>

export type PersistedRuntimeToolCapabilityV2 = Readonly<{
  toolId: string
  kind: 'function' | 'provider_server'
  state: RuntimeCapabilityFieldStateV2
  sideEffectPolicy: 'none' | 'confirmation_required_each_execution'
  evidenceIds: readonly string[]
}>

export type PersistedRuntimeContinuationCapabilityV2 =
  | Readonly<{ kind: 'unavailable'; evidenceIds: readonly [] }>
  | Readonly<{ kind: 'none'; evidenceIds: readonly string[] }>
  | Readonly<{
      kind: 'client_managed_native_replay'
      artifactKind: string
      supportsBranchReplay: boolean
      supportsRestartReplay: boolean
      evidenceIds: readonly string[]
    }>
  | Readonly<{
      kind: 'provider_managed_reference'
      referenceKind: string
      supportsBranchReplay: boolean
      supportsRestartReplay: boolean
      evidenceIds: readonly string[]
    }>

export type PersistedRuntimeCapabilitySnapshotV2 = Readonly<{
  schemaVersion: 2
  resolvedAt: string
  binding: unknown
  evidence: readonly PersistedRuntimeCapabilityEvidenceV2[]
  fields: readonly PersistedRuntimeCapabilityFieldV2[]
  tools: readonly PersistedRuntimeToolCapabilityV2[]
  continuation: PersistedRuntimeContinuationCapabilityV2
  evidenceDigest: string
  semanticFieldsDigest: string
  revision: string
  snapshotHash: string
}>

export type DecodedRuntimeCapabilityEvidenceV2 = Omit<PersistedRuntimeCapabilityEvidenceV2, 'contentDigest' | 'entryDigest'> & Readonly<{
  contentDigest: GenerationV2Digest<'evidence_digest'>
  entryDigest: GenerationV2Digest<'evidence_digest'>
}>

export type DecodedRuntimeCapabilitySnapshotV2 = Readonly<{
  trust: 'decoded_unverified'
  executionAuthority: 'none'
  schemaVersion: 2
  resolvedAt: string
  binding: DecodedProviderBindingRecordV2
  evidence: readonly DecodedRuntimeCapabilityEvidenceV2[]
  fields: readonly PersistedRuntimeCapabilityFieldV2[]
  tools: readonly PersistedRuntimeToolCapabilityV2[]
  continuation: PersistedRuntimeContinuationCapabilityV2
  evidenceDigest: GenerationV2Digest<'evidence_digest'>
  semanticFieldsDigest: GenerationV2Digest<'capability_fields_digest'>
  revision: GenerationV2Identity<'capability_revision'>
  snapshotHash: GenerationV2Digest<'snapshot_hash'>
  canonicalJson: string
}>

export class RuntimeCapabilitySnapshotV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_CAPABILITY_INVALID_SHAPE'
    | 'GENERATION_V2_CAPABILITY_UNKNOWN_FIELD'
    | 'GENERATION_V2_CAPABILITY_INVALID_VALUE'
    | 'GENERATION_V2_CAPABILITY_DUPLICATE_VALUE'
    | 'GENERATION_V2_CAPABILITY_INCOMPLETE_FIELDS'
    | 'GENERATION_V2_CAPABILITY_EVIDENCE_MISMATCH'
    | 'GENERATION_V2_CAPABILITY_DIGEST_MISMATCH'
    | 'GENERATION_V2_CAPABILITY_HASH_MISMATCH'
    | 'GENERATION_V2_CAPABILITY_NON_CANONICAL_JSON'
    | 'GENERATION_V2_CAPABILITY_BYTE_LIMIT_EXCEEDED') {
    super(code)
    this.name = 'RuntimeCapabilitySnapshotV2Error'
  }
}

type ClosedInput = { readonly [key: string]: unknown }
type DraftEvidence = Omit<PersistedRuntimeCapabilityEvidenceV2, 'entryDigest'>
type DraftSnapshot = Readonly<{
  schemaVersion: 2
  resolvedAt: string
  binding: unknown
  evidence: readonly DraftEvidence[]
  fields: readonly PersistedRuntimeCapabilityFieldV2[]
  tools: readonly PersistedRuntimeToolCapabilityV2[]
  continuation: PersistedRuntimeContinuationCapabilityV2
}>

const EVIDENCE_KINDS: readonly RuntimeCapabilityEvidenceKindV2[] = [
  'contract_invariant', 'endpoint_descriptor', 'signed_provider_record',
  'official_documentation', 'live_probe', 'user_narrowing_override',
]
const EVIDENCE_EFFECTS: readonly RuntimeCapabilityEvidenceEffectV2[] = [
  'supports', 'rejects', 'requires_confirmation',
]
const FIELD_STATES: readonly RuntimeCapabilityFieldStateV2[] = [
  'supported', 'unsupported', 'requires_confirmation', 'unavailable',
]
const MAX_EVIDENCE = 256
const MAX_CONSTRAINTS_PER_FIELD = 32
const MAX_ENUM_VALUES = 256
const MAX_TOOL_CAPABILITIES = 512

function closedObject(value: unknown, allowed: readonly string[]): ClosedInput {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_SHAPE')
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.values(descriptors).some((descriptor) =>
        !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined)) {
    throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_SHAPE')
  }
  if (Object.keys(descriptors).some((key) => !allowed.includes(key))) {
    throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_UNKNOWN_FIELD')
  }
  return Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value]))
}

function closedDenseArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_SHAPE')
  }
  const keys = Reflect.ownKeys(value)
  const expected = [...Array.from({ length: value.length }, (_, index) => String(index)), 'length']
  if (keys.length !== expected.length || expected.some((key) => !keys.includes(key))) {
    throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_SHAPE')
  }
  return Object.freeze(expected.slice(0, -1).map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined) {
      throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_SHAPE')
    }
    return descriptor.value
  }))
}

function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left)
  const rightPoints = Array.from(right)
  for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index += 1) {
    const difference = (leftPoints[index].codePointAt(0) ?? 0) - (rightPoints[index].codePointAt(0) ?? 0)
    if (difference !== 0) return difference
  }
  return leftPoints.length - rightPoints.length
}

function requiredString(input: ClosedInput, key: string): string {
  const value = input[key]
  if (typeof value !== 'string') throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_VALUE')
  return value
}

function validateIdentifier(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u.test(value)) {
    throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_VALUE')
  }
  return value
}

function validateTimestamp(value: string): string {
  const parsed = Date.parse(value)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) ||
      !Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_VALUE')
  }
  return value
}

function validateSourceRef(kind: RuntimeCapabilityEvidenceKindV2, value: string): string {
  if (value.length < 1 || value.length > 2048 || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_VALUE')
  }
  if (kind === 'official_documentation') {
    let url: URL
    try { url = new URL(value) } catch { throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_VALUE') }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
      throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_VALUE')
    }
  } else {
    validateIdentifier(value)
  }
  return value
}

function scalarKey(value: RuntimeCapabilityScalarV2): string {
  return `${typeof value}:${String(value)}`
}

function decodeScalar(value: unknown): RuntimeCapabilityScalarV2 {
  if (typeof value === 'string') {
    if (value.length > 512 || /[\u0000-\u001f\u007f]/u.test(value)) {
      throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_VALUE')
    }
    return value
  }
  if (typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_VALUE')
}

function decodeScalarSet(value: unknown): readonly RuntimeCapabilityScalarV2[] {
  const values = closedDenseArray(value).map(decodeScalar)
  if (values.length < 1 || values.length > MAX_ENUM_VALUES ||
      new Set(values.map(scalarKey)).size !== values.length) {
    throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_DUPLICATE_VALUE')
  }
  values.sort((left, right) => compareCodePoints(scalarKey(left), scalarKey(right)))
  return Object.freeze(values)
}

function decodeDomain(value: unknown): RuntimeCapabilityDomainV2 {
  const discriminator = closedObject(value, [
    'kind', 'values', 'min', 'max', 'integer', 'maxItems', 'maxItemLength',
    'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
  ])
  if (discriminator.kind === 'boolean' || discriminator.kind === 'identity') {
    if (Object.keys(discriminator).length !== 1) {
      throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_VALUE')
    }
    return Object.freeze({ kind: discriminator.kind })
  }
  if (discriminator.kind === 'enum') {
    const input = closedObject(value, ['kind', 'values'])
    return Object.freeze({ kind: 'enum', values: decodeScalarSet(input.values) })
  }
  if (discriminator.kind === 'enum_list') {
    const input = closedObject(value, ['kind', 'values', 'maxItems'])
    if (!Number.isSafeInteger(input.maxItems) || (input.maxItems as number) < 1) {
      throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_VALUE')
    }
    return Object.freeze({
      kind: 'enum_list', values: decodeScalarSet(input.values), maxItems: input.maxItems as number,
    })
  }
  if (discriminator.kind === 'range') {
    const input = closedObject(value, ['kind', 'min', 'max', 'integer'])
    if (typeof input.min !== 'number' || !Number.isFinite(input.min) ||
        typeof input.max !== 'number' || !Number.isFinite(input.max) || input.min > input.max ||
        typeof input.integer !== 'boolean' || (input.integer &&
          (!Number.isSafeInteger(input.min) || !Number.isSafeInteger(input.max)))) {
      throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_VALUE')
    }
    return Object.freeze({ kind: 'range', min: input.min, max: input.max, integer: input.integer })
  }
  if (discriminator.kind === 'string_list') {
    const input = closedObject(value, ['kind', 'maxItems', 'maxItemLength'])
    if (!Number.isSafeInteger(input.maxItems) || (input.maxItems as number) < 1 ||
        !Number.isSafeInteger(input.maxItemLength) || (input.maxItemLength as number) < 1) {
      throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_VALUE')
    }
    return Object.freeze({
      kind: 'string_list', maxItems: input.maxItems as number, maxItemLength: input.maxItemLength as number,
    })
  }
  if (discriminator.kind === 'identity_list') {
    const input = closedObject(value, ['kind', 'maxItems'])
    if (!Number.isSafeInteger(input.maxItems) || (input.maxItems as number) < 1) {
      throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_VALUE')
    }
    return Object.freeze({ kind: 'identity_list', maxItems: input.maxItems as number })
  }
  if (discriminator.kind === 'dimensions') {
    const input = closedObject(value, ['kind', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight'])
    const values = [input.minWidth, input.maxWidth, input.minHeight, input.maxHeight]
    if (values.some((item) => !Number.isSafeInteger(item) || (item as number) < 1) ||
        (input.minWidth as number) > (input.maxWidth as number) ||
        (input.minHeight as number) > (input.maxHeight as number)) {
      throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_VALUE')
    }
    return Object.freeze({
      kind: 'dimensions',
      minWidth: input.minWidth as number,
      maxWidth: input.maxWidth as number,
      minHeight: input.minHeight as number,
      maxHeight: input.maxHeight as number,
    })
  }
  throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_VALUE')
}

const ENUM_VALUES_BY_PATH: Readonly<Partial<Record<RuntimeCapabilitySemanticPathV2, readonly RuntimeCapabilityScalarV2[]>>> = {
  'attachments[].conversion': ['none', 'pdf', 'plain_text', 'images'],
  'attachments[].sendAs': ['provider_file', 'inline_text', 'image_reference', 'converted_document'],
  'image.background': ['auto', 'transparent', 'opaque'],
  'image.format': ['png', 'jpeg', 'webp', 'svg'],
  'image.mode': ['disabled', 'generate'],
  'image.quality': ['auto', 'low', 'medium', 'high'],
  'image.resolution': ['512', '1K', '2K', '4K'],
  'providerExtension.kind': ['none'],
  'reasoning.effort': ['minimal', 'low', 'medium', 'high', 'xhigh'],
  'reasoning.mode': ['disabled', 'enabled'],
  'reasoning.summary': ['auto', 'concise', 'detailed'],
  'tools.mode': ['disabled', 'enabled'],
  'tools.sideEffectConfirmation': ['required_each_retry'],
  'tools.toolChoice': ['omitted', 'auto', 'none', 'required', 'named'],
  'web.mode': ['disabled', 'provider_search'],
}
const INTEGER_RANGE_PATHS = new Set<RuntimeCapabilitySemanticPathV2>([
  'generation.candidateCount', 'generation.maxOutputTokens', 'generation.seed', 'generation.topK',
  'image.outputCompression',
])
const NUMBER_RANGE_PATHS = new Set<RuntimeCapabilitySemanticPathV2>([
  ...INTEGER_RANGE_PATHS,
  'generation.frequencyPenalty', 'generation.presencePenalty', 'generation.repetitionPenalty',
  'generation.temperature', 'generation.topP',
])
const IDENTITY_PATHS = new Set<RuntimeCapabilitySemanticPathV2>([
  'attachments[].assetId', 'attachments[].assetRevisionId', 'attachments[].assetSha256',
])

function assertDomainMatchesPath(path: RuntimeCapabilitySemanticPathV2, domain: RuntimeCapabilityDomainV2): void {
  const enumValues = ENUM_VALUES_BY_PATH[path]
  if (enumValues) {
    if (domain.kind !== 'enum' || domain.values.some((value) => !enumValues.includes(value))) {
      throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_VALUE')
    }
    return
  }
  if (NUMBER_RANGE_PATHS.has(path)) {
    if (domain.kind !== 'range' || domain.integer !== INTEGER_RANGE_PATHS.has(path)) {
      throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_VALUE')
    }
    const invalidRange =
      (path === 'generation.maxOutputTokens' || path === 'generation.candidateCount' || path === 'generation.topK') && domain.min < 1 ||
      path === 'generation.temperature' && domain.min < 0 ||
      path === 'generation.topP' && (domain.min < 0 || domain.max > 1) ||
      path === 'generation.repetitionPenalty' && domain.min <= 0 ||
      path === 'image.outputCompression' && (domain.min < 0 || domain.max > 100)
    if (invalidRange) throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_VALUE')
    return
  }
  const expectedKind: RuntimeCapabilityDomainV2['kind'] =
    IDENTITY_PATHS.has(path) ? 'identity'
      : path === 'attachments[].include' || path === 'image.stream' ? 'boolean'
        : path === 'generation.stop' ? 'string_list'
          : path === 'tools.allowedToolIds' ? 'identity_list'
            : path === 'web.types' ? 'enum_list'
              : path === 'image.size' ? 'dimensions'
                : path === 'image.aspectRatio' ? 'enum'
                  : (() => { throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_VALUE') })()
  if (domain.kind !== expectedKind ||
      path === 'web.types' && domain.kind === 'enum_list' &&
        domain.values.some((value) => value !== 'web' && value !== 'image') ||
      path === 'image.aspectRatio' && domain.kind === 'enum' &&
        domain.values.some((value) => typeof value !== 'string' ||
          (value !== 'auto' && !/^[1-9]\d{0,4}:[1-9]\d{0,4}$/u.test(value)))) {
    throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_VALUE')
  }
}

function decodeSemanticPath(value: unknown): RuntimeCapabilitySemanticPathV2 {
  if (typeof value !== 'string' ||
      !RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2.includes(value as RuntimeCapabilitySemanticPathV2)) {
    throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_VALUE')
  }
  return value as RuntimeCapabilitySemanticPathV2
}

function decodeConstraint(value: unknown, ownerPath: RuntimeCapabilitySemanticPathV2): RuntimeCapabilityConstraintV2 {
  const input = closedObject(value, ['kind', 'path', 'values'])
  if (input.kind !== 'requires_value' && input.kind !== 'forbids_value') {
    throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_VALUE')
  }
  const path = decodeSemanticPath(input.path)
  if (path === ownerPath) throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_VALUE')
  return Object.freeze({ kind: input.kind, path, values: decodeScalarSet(input.values) })
}

function serializeBounded(value: unknown): string {
  try {
    return stableSerializeProviderRequestBoundedV2(value, RUNTIME_CAPABILITY_SNAPSHOT_V2_MAX_UTF8_BYTES)
  } catch (error) {
    if (error instanceof Error && error.message === 'GENERATION_V2_JSON_BYTE_LIMIT_EXCEEDED') {
      throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_BYTE_LIMIT_EXCEEDED')
    }
    throw error
  }
}

function hash(value: unknown): string {
  return sha256PreparedBytesV2(new TextEncoder().encode(serializeBounded(value)))
}

function decodeEvidence(value: unknown, includesEntryDigest: boolean): DraftEvidence & { entryDigest?: string } {
  const allowed = ['evidenceId', 'kind', 'effect', 'sourceRef', 'verifiedAt', 'contentDigest']
  if (includesEntryDigest) allowed.push('entryDigest')
  const input = closedObject(value, allowed)
  if (!EVIDENCE_KINDS.includes(input.kind as RuntimeCapabilityEvidenceKindV2) ||
      !EVIDENCE_EFFECTS.includes(input.effect as RuntimeCapabilityEvidenceEffectV2)) {
    throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_VALUE')
  }
  const kind = input.kind as RuntimeCapabilityEvidenceKindV2
  const effect = input.effect as RuntimeCapabilityEvidenceEffectV2
  if (kind === 'user_narrowing_override' && effect === 'supports') {
    throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_VALUE')
  }
  const projection: DraftEvidence & { entryDigest?: string } = {
    evidenceId: validateIdentifier(requiredString(input, 'evidenceId')),
    kind,
    effect,
    sourceRef: validateSourceRef(kind, requiredString(input, 'sourceRef')),
    verifiedAt: validateTimestamp(requiredString(input, 'verifiedAt')),
    contentDigest: readGenerationV2Digest(
      GenerationV2Digest.create('evidence_digest', requiredString(input, 'contentDigest')), 'evidence_digest',
    ),
  }
  if (includesEntryDigest) {
    projection.entryDigest = readGenerationV2Digest(
      GenerationV2Digest.create('evidence_digest', requiredString(input, 'entryDigest')), 'evidence_digest',
    )
  }
  return Object.freeze(projection)
}

function decodeField(value: unknown): PersistedRuntimeCapabilityFieldV2 {
  const input = closedObject(value, ['path', 'state', 'domain', 'constraints', 'evidenceIds'])
  const path = decodeSemanticPath(input.path)
  if (!FIELD_STATES.includes(input.state as RuntimeCapabilityFieldStateV2)) {
    throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_VALUE')
  }
  const state = input.state as RuntimeCapabilityFieldStateV2
  if ((state === 'unsupported' || state === 'unavailable') !== (input.domain === undefined)) {
    throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_VALUE')
  }
  const domain = input.domain === undefined ? undefined : decodeDomain(input.domain)
  if (domain) assertDomainMatchesPath(path, domain)
  const constraints = closedDenseArray(input.constraints).map((item) => decodeConstraint(item, path))
  if (constraints.length > MAX_CONSTRAINTS_PER_FIELD) {
    throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_VALUE')
  }
  if ((state === 'unsupported' || state === 'unavailable') && constraints.length > 0) {
    throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_VALUE')
  }
  constraints.sort((left, right) => compareCodePoints(serializeBounded(left), serializeBounded(right)))
  if (new Set(constraints.map((item) => serializeBounded(item))).size !== constraints.length) {
    throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_DUPLICATE_VALUE')
  }
  const evidenceIds = closedDenseArray(input.evidenceIds).map((item) => {
    if (typeof item !== 'string') throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_VALUE')
    return validateIdentifier(item)
  })
  evidenceIds.sort(compareCodePoints)
  if (new Set(evidenceIds).size !== evidenceIds.length) {
    throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_DUPLICATE_VALUE')
  }
  if ((state === 'unavailable') !== (evidenceIds.length === 0)) {
    throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_EVIDENCE_MISMATCH')
  }
  return Object.freeze({
    path,
    state,
    ...(domain === undefined ? {} : { domain }),
    constraints: Object.freeze(constraints),
    evidenceIds: Object.freeze(evidenceIds),
  })
}

function decodeEvidenceIds(value: unknown): readonly string[] {
  const evidenceIds = closedDenseArray(value).map((item) => {
    if (typeof item !== 'string') throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_VALUE')
    return validateIdentifier(item)
  })
  evidenceIds.sort(compareCodePoints)
  if (new Set(evidenceIds).size !== evidenceIds.length) {
    throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_DUPLICATE_VALUE')
  }
  return Object.freeze(evidenceIds)
}

function decodeToolCapability(value: unknown): PersistedRuntimeToolCapabilityV2 {
  const input = closedObject(value, ['toolId', 'kind', 'state', 'sideEffectPolicy', 'evidenceIds'])
  if ((input.kind !== 'function' && input.kind !== 'provider_server') ||
      !FIELD_STATES.includes(input.state as RuntimeCapabilityFieldStateV2) ||
      (input.sideEffectPolicy !== 'none' && input.sideEffectPolicy !== 'confirmation_required_each_execution')) {
    throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_VALUE')
  }
  const state = input.state as RuntimeCapabilityFieldStateV2
  const evidenceIds = decodeEvidenceIds(input.evidenceIds)
  if ((state === 'unavailable') !== (evidenceIds.length === 0) ||
      state === 'requires_confirmation' && input.sideEffectPolicy !== 'confirmation_required_each_execution') {
    throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_EVIDENCE_MISMATCH')
  }
  return Object.freeze({
    toolId: readGenerationV2Identity(
      GenerationV2Identity.create('tool_id', requiredString(input, 'toolId')), 'tool_id',
    ),
    kind: input.kind,
    state,
    sideEffectPolicy: input.sideEffectPolicy,
    evidenceIds,
  })
}

function decodeContinuation(value: unknown): PersistedRuntimeContinuationCapabilityV2 {
  const discriminator = closedObject(value, [
    'kind', 'artifactKind', 'referenceKind', 'supportsBranchReplay', 'supportsRestartReplay', 'evidenceIds',
  ])
  if (discriminator.kind === 'unavailable') {
    const input = closedObject(value, ['kind', 'evidenceIds'])
    if (closedDenseArray(input.evidenceIds).length !== 0) {
      throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_EVIDENCE_MISMATCH')
    }
    return Object.freeze({ kind: 'unavailable', evidenceIds: Object.freeze([]) as readonly [] })
  }
  if (discriminator.kind === 'none') {
    const input = closedObject(value, ['kind', 'evidenceIds'])
    const evidenceIds = decodeEvidenceIds(input.evidenceIds)
    if (evidenceIds.length === 0) throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_EVIDENCE_MISMATCH')
    return Object.freeze({ kind: 'none', evidenceIds })
  }
  if (discriminator.kind === 'client_managed_native_replay') {
    const input = closedObject(value, [
      'kind', 'artifactKind', 'supportsBranchReplay', 'supportsRestartReplay', 'evidenceIds',
    ])
    if (typeof input.supportsBranchReplay !== 'boolean' || typeof input.supportsRestartReplay !== 'boolean') {
      throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_VALUE')
    }
    const evidenceIds = decodeEvidenceIds(input.evidenceIds)
    if (evidenceIds.length === 0) throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_EVIDENCE_MISMATCH')
    return Object.freeze({
      kind: 'client_managed_native_replay',
      artifactKind: validateIdentifier(requiredString(input, 'artifactKind')),
      supportsBranchReplay: input.supportsBranchReplay,
      supportsRestartReplay: input.supportsRestartReplay,
      evidenceIds,
    })
  }
  if (discriminator.kind === 'provider_managed_reference') {
    const input = closedObject(value, [
      'kind', 'referenceKind', 'supportsBranchReplay', 'supportsRestartReplay', 'evidenceIds',
    ])
    if (typeof input.supportsBranchReplay !== 'boolean' || typeof input.supportsRestartReplay !== 'boolean') {
      throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_VALUE')
    }
    const evidenceIds = decodeEvidenceIds(input.evidenceIds)
    if (evidenceIds.length === 0) throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_EVIDENCE_MISMATCH')
    return Object.freeze({
      kind: 'provider_managed_reference',
      referenceKind: validateIdentifier(requiredString(input, 'referenceKind')),
      supportsBranchReplay: input.supportsBranchReplay,
      supportsRestartReplay: input.supportsRestartReplay,
      evidenceIds,
    })
  }
  throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_VALUE')
}

function domainContainsScalar(domain: RuntimeCapabilityDomainV2 | undefined, value: RuntimeCapabilityScalarV2): boolean {
  if (!domain) return false
  if (domain.kind === 'boolean') return typeof value === 'boolean'
  if (domain.kind === 'identity') return typeof value === 'string' && (() => {
    try { validateIdentifier(value); return true } catch { return false }
  })()
  if (domain.kind === 'enum') return domain.values.some((item) => scalarKey(item) === scalarKey(value))
  if (domain.kind === 'range') {
    return typeof value === 'number' && value >= domain.min && value <= domain.max &&
      (!domain.integer || Number.isSafeInteger(value))
  }
  return false
}

function validateConstraints(fields: readonly PersistedRuntimeCapabilityFieldV2[]): void {
  const byPath = new Map(fields.map((field) => [field.path, field]))
  for (const field of fields) {
    const requires = new Set<string>()
    const forbids = new Set<string>()
    const constraintKindsByPath = new Set<string>()
    for (const constraint of field.constraints) {
      const kindPath = `${constraint.kind}\u0000${constraint.path}`
      if (constraintKindsByPath.has(kindPath)) {
        throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_VALUE')
      }
      constraintKindsByPath.add(kindPath)
      const target = byPath.get(constraint.path)
      for (const value of constraint.values) {
        if (!domainContainsScalar(target?.domain, value)) {
          throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_VALUE')
        }
        const key = `${constraint.path}\u0000${scalarKey(value)}`
        const own = constraint.kind === 'requires_value' ? requires : forbids
        const opposite = constraint.kind === 'requires_value' ? forbids : requires
        if (opposite.has(key)) {
          throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_VALUE')
        }
        own.add(key)
      }
    }
  }
}

function assertEvidenceRefs(
  evidenceIds: readonly string[],
  evidenceById: ReadonlyMap<string, DraftEvidence & { entryDigest?: string }>,
  expectedEffect?: RuntimeCapabilityEvidenceEffectV2,
): void {
  if (evidenceIds.some((id) => !evidenceById.has(id) ||
      expectedEffect !== undefined && evidenceById.get(id)?.effect !== expectedEffect)) {
    throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_EVIDENCE_MISMATCH')
  }
}

function decodeDraft(value: unknown, fullRecord: boolean): Readonly<{
  draft: DraftSnapshot
  supplied?: Readonly<{ evidenceDigest: string; semanticFieldsDigest: string; revision: string; snapshotHash: string }>
}> {
  const allowed = ['schemaVersion', 'resolvedAt', 'binding', 'evidence', 'fields', 'tools', 'continuation']
  if (fullRecord) allowed.push('evidenceDigest', 'semanticFieldsDigest', 'revision', 'snapshotHash')
  const input = closedObject(value, allowed)
  if (input.schemaVersion !== 2) throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_VALUE')
  const resolvedAt = validateTimestamp(requiredString(input, 'resolvedAt'))
  const resolvedAtMs = Date.parse(resolvedAt)
  const binding = decodeProviderBindingRecordV2(input.binding)
  if (binding.endpointBinding.kind === 'pinned' &&
      Date.parse(binding.endpointBinding.selector.selectedAt) > resolvedAtMs) {
    throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_VALUE')
  }
  const evidence = closedDenseArray(input.evidence).map((item) => decodeEvidence(item, fullRecord))
  if (evidence.length < 1 || evidence.length > MAX_EVIDENCE ||
      new Set(evidence.map((item) => item.evidenceId)).size !== evidence.length) {
    throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_DUPLICATE_VALUE')
  }
  evidence.sort((left, right) => compareCodePoints(left.evidenceId, right.evidenceId))
  if (evidence.some((item) => Date.parse(item.verifiedAt) > resolvedAtMs)) {
    throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_VALUE')
  }
  const fields = closedDenseArray(input.fields).map(decodeField)
  fields.sort((left, right) => compareCodePoints(left.path, right.path))
  if (fields.length !== RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2.length ||
      fields.some((field, index) => field.path !== RUNTIME_CAPABILITY_SEMANTIC_PATHS_V2[index])) {
    throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INCOMPLETE_FIELDS')
  }
  validateConstraints(fields)
  const tools = closedDenseArray(input.tools).map(decodeToolCapability)
  if (tools.length > MAX_TOOL_CAPABILITIES ||
      new Set(tools.map((tool) => tool.toolId)).size !== tools.length) {
    throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_DUPLICATE_VALUE')
  }
  tools.sort((left, right) => compareCodePoints(left.toolId, right.toolId))
  const continuation = decodeContinuation(input.continuation)
  const evidenceById = new Map(evidence.map((item) => [item.evidenceId, item]))
  const effectForState: Partial<Record<RuntimeCapabilityFieldStateV2, RuntimeCapabilityEvidenceEffectV2>> = {
    supported: 'supports', unsupported: 'rejects', requires_confirmation: 'requires_confirmation',
  }
  for (const field of fields) {
    const expectedEffect = effectForState[field.state]
    assertEvidenceRefs(field.evidenceIds, evidenceById, expectedEffect)
  }
  for (const tool of tools) {
    assertEvidenceRefs(tool.evidenceIds, evidenceById, effectForState[tool.state])
  }
  assertEvidenceRefs(
    continuation.evidenceIds,
    evidenceById,
    continuation.kind === 'unavailable' ? undefined : 'supports',
  )
  const canonicalEvidence = evidence.map(({ entryDigest: _entryDigest, ...item }) => item)
  const draft: DraftSnapshot = Object.freeze({
    schemaVersion: 2,
    resolvedAt,
    binding: projectDecodedProviderBindingRecordV2(binding),
    evidence: Object.freeze(canonicalEvidence),
    fields: Object.freeze(fields),
    tools: Object.freeze(tools),
    continuation,
  })
  if (!fullRecord) return Object.freeze({ draft })
  return Object.freeze({
    draft,
    supplied: Object.freeze({
      evidenceDigest: requiredString(input, 'evidenceDigest'),
      semanticFieldsDigest: requiredString(input, 'semanticFieldsDigest'),
      revision: requiredString(input, 'revision'),
      snapshotHash: requiredString(input, 'snapshotHash'),
    }),
  })
}

function buildRecord(draft: DraftSnapshot): PersistedRuntimeCapabilitySnapshotV2 {
  const evidence = draft.evidence.map((item) => Object.freeze({
    ...item,
    entryDigest: hash(item),
  }))
  const evidenceDigest = hash(evidence)
  const semanticFieldsDigest = hash({
    fields: draft.fields,
    tools: draft.tools,
    continuation: draft.continuation,
  })
  const revision = `capability-v2:${hash({ binding: draft.binding, evidenceDigest, semanticFieldsDigest })}`
  const payload = Object.freeze({
    ...draft,
    evidence: Object.freeze(evidence),
    evidenceDigest,
    semanticFieldsDigest,
    revision,
  })
  const record = { ...payload, snapshotHash: hash(payload) }
  serializeBounded(record)
  return Object.freeze(record)
}

export function canonicalizeUnverifiedRuntimeCapabilitySnapshotV2(value: unknown): PersistedRuntimeCapabilitySnapshotV2 {
  return buildRecord(decodeDraft(value, false).draft)
}

export function decodeRuntimeCapabilitySnapshotV2(value: unknown): DecodedRuntimeCapabilitySnapshotV2 {
  const decodedInput = decodeDraft(value, true)
  const expected = buildRecord(decodedInput.draft)
  const supplied = decodedInput.supplied!
  if (supplied.evidenceDigest !== expected.evidenceDigest ||
      supplied.semanticFieldsDigest !== expected.semanticFieldsDigest || supplied.revision !== expected.revision) {
    throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_DIGEST_MISMATCH')
  }
  if (supplied.snapshotHash !== expected.snapshotHash) {
    throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_HASH_MISMATCH')
  }
  const suppliedEvidence = closedDenseArray((value as ClosedInput).evidence)
  for (let index = 0; index < expected.evidence.length; index += 1) {
    const item = closedObject(suppliedEvidence[index], [
      'evidenceId', 'kind', 'effect', 'sourceRef', 'verifiedAt', 'contentDigest', 'entryDigest',
    ])
    const expectedEntry = expected.evidence[index]
    if (item.evidenceId !== expectedEntry.evidenceId || item.entryDigest !== expectedEntry.entryDigest) {
      throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_DIGEST_MISMATCH')
    }
  }
  const binding = decodeProviderBindingRecordV2(expected.binding)
  const evidence = expected.evidence.map((item) => Object.freeze({
    ...item,
    contentDigest: GenerationV2Digest.create('evidence_digest', item.contentDigest),
    entryDigest: GenerationV2Digest.create('evidence_digest', item.entryDigest),
  }))
  return Object.freeze({
    trust: 'decoded_unverified',
    executionAuthority: 'none',
    schemaVersion: 2,
    resolvedAt: expected.resolvedAt,
    binding,
    evidence: Object.freeze(evidence),
    fields: expected.fields,
    tools: expected.tools,
    continuation: expected.continuation,
    evidenceDigest: GenerationV2Digest.create('evidence_digest', expected.evidenceDigest),
    semanticFieldsDigest: GenerationV2Digest.create('capability_fields_digest', expected.semanticFieldsDigest),
    revision: GenerationV2Identity.create('capability_revision', expected.revision),
    snapshotHash: GenerationV2Digest.create('snapshot_hash', expected.snapshotHash),
    canonicalJson: serializeBounded(expected),
  })
}

export function decodeRuntimeCapabilitySnapshotJsonV2(value: string): DecodedRuntimeCapabilitySnapshotV2 {
  if (typeof value !== 'string' || new TextEncoder().encode(value).byteLength > RUNTIME_CAPABILITY_SNAPSHOT_V2_MAX_UTF8_BYTES) {
    throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_BYTE_LIMIT_EXCEEDED')
  }
  let parsed: unknown
  try { parsed = JSON.parse(value) } catch { throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_INVALID_SHAPE') }
  const decoded = decodeRuntimeCapabilitySnapshotV2(parsed)
  if (decoded.canonicalJson !== value) {
    throw new RuntimeCapabilitySnapshotV2Error('GENERATION_V2_CAPABILITY_NON_CANONICAL_JSON')
  }
  return decoded
}
