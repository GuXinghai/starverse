import { createHash } from 'node:crypto'
import { stableSerializeProviderRequestV2 } from '../../compiler/stableSerialize'
import { GenerationV2Digest, GenerationV2Identity } from '../../domain/identityV2'

export const DEEPSEEK_STABLE_MODELS_EVIDENCE_MAX_BYTES_V2 = 1024 * 1024
export const DEEPSEEK_STABLE_MODELS_EVIDENCE_MAX_MODELS_V2 = 4096

export type PersistedDeepSeekStableModelsEvidenceV2 = Readonly<{
  object: 'list'
  data: readonly Readonly<{
    id: string
    object: 'model'
    owned_by: string
  }>[]
  response_digest: string
  response_revision: string
}>

export type DecodedDeepSeekStableModelsEvidenceV2 = Readonly<{
  trust: 'decoded_unverified'
  executionAuthority: 'none'
  object: 'list'
  models: readonly Readonly<{
    modelId: GenerationV2Identity<'model_id'>
    ownedBy: string
  }>[]
  responseDigest: GenerationV2Digest<'evidence_digest'>
  responseRevision: string
  canonicalJson: string
}>

export class DeepSeekStableModelsEvidenceV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_DEEPSEEK_MODELS_INVALID_SHAPE'
    | 'GENERATION_V2_DEEPSEEK_MODELS_UNKNOWN_FIELD'
    | 'GENERATION_V2_DEEPSEEK_MODELS_INVALID_VALUE'
    | 'GENERATION_V2_DEEPSEEK_MODELS_DUPLICATE_ID'
    | 'GENERATION_V2_DEEPSEEK_MODELS_LIMIT_EXCEEDED'
    | 'GENERATION_V2_DEEPSEEK_MODELS_DIGEST_MISMATCH') {
    super(code)
    this.name = 'DeepSeekStableModelsEvidenceV2Error'
  }
}

type ClosedInput = Readonly<Record<string, unknown>>
const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,511}$/u
const OWNED_BY_PATTERN = /^[^\u0000-\u001f\u007f]{1,512}$/u

function closedObject(value: unknown, allowed: readonly string[]): ClosedInput {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new DeepSeekStableModelsEvidenceV2Error('GENERATION_V2_DEEPSEEK_MODELS_INVALID_SHAPE')
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.values(descriptors).some((descriptor) =>
        !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined)) {
    throw new DeepSeekStableModelsEvidenceV2Error('GENERATION_V2_DEEPSEEK_MODELS_INVALID_SHAPE')
  }
  if (Object.keys(descriptors).some((key) => !allowed.includes(key))) {
    throw new DeepSeekStableModelsEvidenceV2Error('GENERATION_V2_DEEPSEEK_MODELS_UNKNOWN_FIELD')
  }
  return Object.freeze(Object.fromEntries(
    Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value]),
  ))
}

function denseArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype ||
      value.length > DEEPSEEK_STABLE_MODELS_EVIDENCE_MAX_MODELS_V2) {
    throw new DeepSeekStableModelsEvidenceV2Error(
      Array.isArray(value) && value.length > DEEPSEEK_STABLE_MODELS_EVIDENCE_MAX_MODELS_V2
        ? 'GENERATION_V2_DEEPSEEK_MODELS_LIMIT_EXCEEDED'
        : 'GENERATION_V2_DEEPSEEK_MODELS_INVALID_SHAPE',
    )
  }
  const keys = Reflect.ownKeys(value)
  const expected = [...Array.from({ length: value.length }, (_, index) => String(index)), 'length']
  if (keys.length !== expected.length || expected.some((key) => !keys.includes(key))) {
    throw new DeepSeekStableModelsEvidenceV2Error('GENERATION_V2_DEEPSEEK_MODELS_INVALID_SHAPE')
  }
  return Object.freeze(expected.slice(0, -1).map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor?.enumerable || !('value' in descriptor) || descriptor.value === undefined) {
      throw new DeepSeekStableModelsEvidenceV2Error('GENERATION_V2_DEEPSEEK_MODELS_INVALID_SHAPE')
    }
    return descriptor.value
  }))
}

function codePointCompare(left: string, right: string): number {
  const a = Array.from(left)
  const b = Array.from(right)
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const difference = (a[index].codePointAt(0) ?? 0) - (b[index].codePointAt(0) ?? 0)
    if (difference !== 0) return difference
  }
  return a.length - b.length
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function canonicalProjection(value: unknown): Readonly<{
  object: 'list'
  data: PersistedDeepSeekStableModelsEvidenceV2['data']
}> {
  const root = closedObject(value, ['object', 'data'])
  if (root.object !== 'list') {
    throw new DeepSeekStableModelsEvidenceV2Error('GENERATION_V2_DEEPSEEK_MODELS_INVALID_VALUE')
  }
  const models = denseArray(root.data).map((item) => {
    const model = closedObject(item, ['id', 'object', 'owned_by'])
    if (model.object !== 'model' || typeof model.id !== 'string' ||
        !MODEL_ID_PATTERN.test(model.id) || typeof model.owned_by !== 'string' ||
        model.owned_by.trim() !== model.owned_by || !OWNED_BY_PATTERN.test(model.owned_by)) {
      throw new DeepSeekStableModelsEvidenceV2Error('GENERATION_V2_DEEPSEEK_MODELS_INVALID_VALUE')
    }
    return Object.freeze({ id: model.id, object: 'model' as const, owned_by: model.owned_by })
  }).sort((left, right) => codePointCompare(left.id, right.id))
  if (new Set(models.map((model) => model.id)).size !== models.length) {
    throw new DeepSeekStableModelsEvidenceV2Error('GENERATION_V2_DEEPSEEK_MODELS_DUPLICATE_ID')
  }
  return Object.freeze({ object: 'list' as const, data: Object.freeze(models) })
}

function buildPersisted(value: unknown): PersistedDeepSeekStableModelsEvidenceV2 {
  const projection = canonicalProjection(value)
  const projectionJson = stableSerializeProviderRequestV2(projection)
  if (Buffer.byteLength(projectionJson, 'utf8') > DEEPSEEK_STABLE_MODELS_EVIDENCE_MAX_BYTES_V2) {
    throw new DeepSeekStableModelsEvidenceV2Error('GENERATION_V2_DEEPSEEK_MODELS_LIMIT_EXCEEDED')
  }
  const responseDigest = sha256(projectionJson)
  return Object.freeze({
    ...projection,
    response_digest: responseDigest,
    response_revision: `deepseek-stable-models-response-v1:${responseDigest}`,
  })
}

export function canonicalizeDeepSeekStableModelsEvidenceV2(
  value: unknown,
): PersistedDeepSeekStableModelsEvidenceV2 {
  return buildPersisted(value)
}

export function decodeDeepSeekStableModelsEvidenceV2(
  value: unknown,
): DecodedDeepSeekStableModelsEvidenceV2 {
  const input = closedObject(value, ['object', 'data', 'response_digest', 'response_revision'])
  const expected = buildPersisted({ object: input.object, data: input.data })
  if (input.response_digest !== expected.response_digest ||
      input.response_revision !== expected.response_revision) {
    throw new DeepSeekStableModelsEvidenceV2Error('GENERATION_V2_DEEPSEEK_MODELS_DIGEST_MISMATCH')
  }
  const canonicalJson = stableSerializeProviderRequestV2(expected)
  if (Buffer.byteLength(canonicalJson, 'utf8') > DEEPSEEK_STABLE_MODELS_EVIDENCE_MAX_BYTES_V2) {
    throw new DeepSeekStableModelsEvidenceV2Error('GENERATION_V2_DEEPSEEK_MODELS_LIMIT_EXCEEDED')
  }
  return Object.freeze({
    trust: 'decoded_unverified' as const,
    executionAuthority: 'none' as const,
    object: 'list' as const,
    models: Object.freeze(expected.data.map((model) => Object.freeze({
      modelId: GenerationV2Identity.create('model_id', model.id),
      ownedBy: model.owned_by,
    }))),
    responseDigest: GenerationV2Digest.create('evidence_digest', expected.response_digest),
    responseRevision: expected.response_revision,
    canonicalJson,
  })
}

export function decodeDeepSeekStableModelsEvidenceJsonV2(
  value: string,
): DecodedDeepSeekStableModelsEvidenceV2 {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > DEEPSEEK_STABLE_MODELS_EVIDENCE_MAX_BYTES_V2) {
    throw new DeepSeekStableModelsEvidenceV2Error('GENERATION_V2_DEEPSEEK_MODELS_LIMIT_EXCEEDED')
  }
  let parsed: unknown
  try { parsed = JSON.parse(value) } catch {
    throw new DeepSeekStableModelsEvidenceV2Error('GENERATION_V2_DEEPSEEK_MODELS_INVALID_SHAPE')
  }
  const decoded = decodeDeepSeekStableModelsEvidenceV2(parsed)
  if (decoded.canonicalJson !== value) {
    throw new DeepSeekStableModelsEvidenceV2Error('GENERATION_V2_DEEPSEEK_MODELS_DIGEST_MISMATCH')
  }
  return decoded
}
