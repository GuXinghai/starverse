import {
  canonicalSourceFactDigestV1,
  type CanonicalSourceKindV1,
  type RawPayloadRefV1,
  type RawSourceSnapshotRefV1,
} from './canonicalSourceFactsV1'
import { stableSerializeProviderRequestBoundedV2 } from '../compiler/stableSerialize'

export const RAW_SOURCE_SANITIZER_REVISION_V1 = 'canonical-model-facts-raw-sanitizer-v1' as const

const SENSITIVE_KEY = /^(?:authorization|proxy-authorization|api[-_]?key|access[-_]?token|refresh[-_]?token|token|secret|password|cookie|set-cookie)$/iu
const MAX_RAW_DEPTH = 64
// The official models.dev API currently exceeds 100k JSON keys in one complete source snapshot.
// Keep a bounded ceiling while allowing that source-native payload to remain intact.
const MAX_RAW_KEYS = 500_000
const MAX_RAW_BYTES = 16 * 1024 * 1024

export type SanitizedRawPayloadV1 = Readonly<{
  ref: RawPayloadRefV1
  persistedPayload: unknown
  serializedPayload: string
  redactedPaths: readonly string[]
}>

export class RawSourceSnapshotV1Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_RAW_SOURCE_PAYLOAD_INVALID'
    | 'GENERATION_V2_RAW_SOURCE_PAYLOAD_TOO_LARGE') {
    super(code)
    this.name = 'RawSourceSnapshotV1Error'
  }
}

function invalid(code: RawSourceSnapshotV1Error['code'] = 'GENERATION_V2_RAW_SOURCE_PAYLOAD_INVALID'): never {
  throw new RawSourceSnapshotV1Error(code)
}

function validSourceKind(value: unknown): value is CanonicalSourceKindV1 {
  return value === 'provider_native' || value === 'models_dev' || value === 'capability_rule'
}

function validateRawPayloadRefV1(value: unknown): RawPayloadRefV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid()
  const ref = value as Record<string, unknown>
  const keys = Object.keys(ref).sort()
  const expected = ['persistedPayloadSha256', 'recordKey', 'sanitizerRevision', 'storeId',
    ...(ref.networkPayloadSha256 === undefined ? [] : ['networkPayloadSha256'])].sort()
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index]) ||
      typeof ref.persistedPayloadSha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(ref.persistedPayloadSha256) ||
      ref.storeId !== `canonical-raw-v1:${ref.persistedPayloadSha256}` ||
      typeof ref.recordKey !== 'string' || ref.recordKey.length < 1 || ref.recordKey.length > 1024 ||
      typeof ref.sanitizerRevision !== 'string' || ref.sanitizerRevision.length < 1 || ref.sanitizerRevision.length > 256 ||
      ref.networkPayloadSha256 !== undefined &&
      (typeof ref.networkPayloadSha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(ref.networkPayloadSha256))) invalid()
  return Object.freeze({ storeId: ref.storeId, persistedPayloadSha256: ref.persistedPayloadSha256,
    recordKey: ref.recordKey, sanitizerRevision: ref.sanitizerRevision,
    ...(ref.networkPayloadSha256 === undefined ? {} : { networkPayloadSha256: ref.networkPayloadSha256 }) }) as RawPayloadRefV1
}

function sanitize(value: unknown, path: string, state: { keys: number; redactedPaths: string[] }, depth: number): unknown {
  if (depth > MAX_RAW_DEPTH) return invalid()
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : invalid()
  if (Array.isArray(value)) return value.map((entry, index) => sanitize(entry, `${path}[${index}]`, state, depth + 1))
  if (!value || typeof value !== 'object' ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) return invalid()
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !('value' in descriptor))) invalid()
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(descriptors).sort()) {
    state.keys += 1
    if (state.keys > MAX_RAW_KEYS) return invalid('GENERATION_V2_RAW_SOURCE_PAYLOAD_TOO_LARGE')
    const childPath = path ? `${path}.${key}` : key
    if (SENSITIVE_KEY.test(key)) {
      out[key] = '[redacted]'
      state.redactedPaths.push(childPath)
      continue
    }
    out[key] = sanitize(descriptors[key]!.value, childPath, state, depth + 1)
  }
  return out
}

export function sanitizeRawSourcePayloadV1(input: Readonly<{
  payload: unknown
  recordKey: string
  networkPayloadSha256?: string
}>): SanitizedRawPayloadV1 {
  if (!input.recordKey || input.recordKey.length > 1024 ||
      (input.networkPayloadSha256 !== undefined && !/^[0-9a-f]{64}$/u.test(input.networkPayloadSha256))) invalid()
  const state = { keys: 0, redactedPaths: [] as string[] }
  const persistedPayload = sanitize(input.payload, '', state, 0)
  let serializedPayload: string
  try {
    serializedPayload = stableSerializeProviderRequestBoundedV2(persistedPayload, MAX_RAW_BYTES)
  } catch {
    return invalid('GENERATION_V2_RAW_SOURCE_PAYLOAD_TOO_LARGE')
  }
  const persistedPayloadSha256 = canonicalSourceFactDigestV1(persistedPayload)
  const storeId = `canonical-raw-v1:${persistedPayloadSha256}`
  const ref = Object.freeze({ storeId, persistedPayloadSha256, recordKey: input.recordKey,
    sanitizerRevision: RAW_SOURCE_SANITIZER_REVISION_V1,
    ...(input.networkPayloadSha256 === undefined ? {} : { networkPayloadSha256: input.networkPayloadSha256 }) })
  return Object.freeze({ ref, persistedPayload, serializedPayload,
    redactedPaths: Object.freeze([...state.redactedPaths].sort()) })
}

export function buildRawSourceSnapshotRefV1(input: Readonly<{
  sourceKind: CanonicalSourceKindV1
  sourceScopeId: string
  recordSetCompleteness: RawSourceSnapshotRefV1['recordSetCompleteness']
  rawEnvelopeRefs: readonly RawPayloadRefV1[]
}>): RawSourceSnapshotRefV1 {
  if (!validSourceKind(input.sourceKind) || !input.sourceScopeId || input.sourceScopeId.length > 1024 ||
      input.sourceScopeId.trim() !== input.sourceScopeId || input.rawEnvelopeRefs.length < 1 ||
      input.rawEnvelopeRefs.length > 64 || !['complete', 'partial', 'unknown', 'not_applicable']
        .includes(input.recordSetCompleteness)) invalid()
  const rawEnvelopeRefs = input.rawEnvelopeRefs.map(validateRawPayloadRefV1).sort((left, right) =>
    `${left.storeId}\0${left.recordKey}`.localeCompare(`${right.storeId}\0${right.recordKey}`, 'en'))
  if (new Set(rawEnvelopeRefs.map((ref) => `${ref.storeId}\0${ref.recordKey}`)).size !== rawEnvelopeRefs.length) invalid()
  const projection = Object.freeze({ sourceKind: input.sourceKind, sourceScopeId: input.sourceScopeId,
    recordSetCompleteness: input.recordSetCompleteness, rawEnvelopeRefs: Object.freeze(rawEnvelopeRefs) })
  return Object.freeze({ ...projection,
    rawSourceSnapshotRevision: `raw-source-snapshot-v1:${canonicalSourceFactDigestV1(projection)}` })
}

export function decodeRawSourceSnapshotRefV1(value: unknown): RawSourceSnapshotRefV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid()
  const candidate = value as Record<string, unknown>
  const keys = Object.keys(candidate).sort()
  const expected = ['sourceKind', 'sourceScopeId', 'rawSourceSnapshotRevision', 'recordSetCompleteness',
    'rawEnvelopeRefs'].sort()
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index]) ||
      !validSourceKind(candidate.sourceKind) || !Array.isArray(candidate.rawEnvelopeRefs)) invalid()
  const rebuilt = buildRawSourceSnapshotRefV1({ sourceKind: candidate.sourceKind,
    sourceScopeId: candidate.sourceScopeId as string,
    recordSetCompleteness: candidate.recordSetCompleteness as RawSourceSnapshotRefV1['recordSetCompleteness'],
    rawEnvelopeRefs: candidate.rawEnvelopeRefs as readonly RawPayloadRefV1[] })
  if (candidate.rawSourceSnapshotRevision !== rebuilt.rawSourceSnapshotRevision) invalid()
  return rebuilt
}

export interface RawPayloadReaderV1 {
  readRawPayload(ref: RawPayloadRefV1): unknown
}

export class InMemoryRawPayloadStoreV1 implements RawPayloadReaderV1 {
  readonly #payloads = new Map<string, unknown>()

  put(payload: SanitizedRawPayloadV1): void {
    const current = this.#payloads.get(payload.ref.storeId)
    if (current !== undefined && canonicalSourceFactDigestV1(current) !== payload.ref.persistedPayloadSha256) invalid()
    this.#payloads.set(payload.ref.storeId, payload.persistedPayload)
  }

  readRawPayload(ref: RawPayloadRefV1): unknown {
    const value = this.#payloads.get(ref.storeId)
    if (value === undefined || canonicalSourceFactDigestV1(value) !== ref.persistedPayloadSha256) invalid()
    return value
  }
}
