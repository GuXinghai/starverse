import { createHash } from 'node:crypto'
import { stableSerializeProviderRequestV2 } from '../../compiler/stableSerialize'
import { GenerationV2Digest, GenerationV2Identity } from '../../domain/identityV2'

export const OPENAI_RESPONSES_MODELS_MAX_BYTES_V2 = 1024 * 1024
export const OPENAI_RESPONSES_MODELS_MAX_COUNT_V2 = 4096

export type PersistedOpenAIResponsesModelsEvidenceV2 = Readonly<{
  object: 'list'
  data: readonly Readonly<{ id: string; object: 'model'; created: number; owned_by: string }>[]
  response_digest: string
  response_revision: string
}>

export type DecodedOpenAIResponsesModelsEvidenceV2 = Readonly<{
  trust: 'decoded_unverified'
  executionAuthority: 'none'
  models: readonly Readonly<{
    modelId: GenerationV2Identity<'model_id'>
    created: number
    ownedBy: string
  }>[]
  responseDigest: GenerationV2Digest<'evidence_digest'>
  responseRevision: string
  canonicalJson: string
}>

export class OpenAIResponsesModelsEvidenceV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENAI_MODELS_INVALID_SHAPE'
    | 'GENERATION_V2_OPENAI_MODELS_UNKNOWN_FIELD'
    | 'GENERATION_V2_OPENAI_MODELS_INVALID_VALUE'
    | 'GENERATION_V2_OPENAI_MODELS_DUPLICATE_ID'
    | 'GENERATION_V2_OPENAI_MODELS_LIMIT_EXCEEDED'
    | 'GENERATION_V2_OPENAI_MODELS_DIGEST_MISMATCH') {
    super(code)
    this.name = 'OpenAIResponsesModelsEvidenceV2Error'
  }
}

const decodedAuthorities = new WeakSet<object>()

export function isDecodedOpenAIResponsesModelsEvidenceV2(
  value: unknown,
): value is DecodedOpenAIResponsesModelsEvidenceV2 {
  return Boolean(value && typeof value === 'object' && decodedAuthorities.has(value))
}

type ClosedObject = Readonly<Record<string, unknown>>
const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,511}$/u
const OWNER_PATTERN = /^[^\u0000-\u001f\u007f]{1,512}$/u

function fail(code: OpenAIResponsesModelsEvidenceV2Error['code']): never {
  throw new OpenAIResponsesModelsEvidenceV2Error(code)
}

function closedObject(value: unknown, allowed: readonly string[]): ClosedObject {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    return fail('GENERATION_V2_OPENAI_MODELS_INVALID_SHAPE')
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined)) {
    return fail('GENERATION_V2_OPENAI_MODELS_INVALID_SHAPE')
  }
  if (Object.keys(descriptors).some((key) => !allowed.includes(key))) return fail('GENERATION_V2_OPENAI_MODELS_UNKNOWN_FIELD')
  return Object.freeze(Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value])))
}

function denseArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > OPENAI_RESPONSES_MODELS_MAX_COUNT_V2) {
    return fail(Array.isArray(value) && value.length > OPENAI_RESPONSES_MODELS_MAX_COUNT_V2
      ? 'GENERATION_V2_OPENAI_MODELS_LIMIT_EXCEEDED'
      : 'GENERATION_V2_OPENAI_MODELS_INVALID_SHAPE')
  }
  const expected = [...Array.from({ length: value.length }, (_, index) => String(index)), 'length']
  if (Reflect.ownKeys(value).length !== expected.length || expected.some((key) => !Reflect.ownKeys(value).includes(key))) {
    return fail('GENERATION_V2_OPENAI_MODELS_INVALID_SHAPE')
  }
  return Object.freeze(expected.slice(0, -1).map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor?.enumerable || !('value' in descriptor) || descriptor.value === undefined) {
      return fail('GENERATION_V2_OPENAI_MODELS_INVALID_SHAPE')
    }
    return descriptor.value
  }))
}

function compareCodePoints(left: string, right: string): number {
  const a = Array.from(left); const b = Array.from(right)
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const difference = (a[index].codePointAt(0) ?? 0) - (b[index].codePointAt(0) ?? 0)
    if (difference !== 0) return difference
  }
  return a.length - b.length
}

function projection(value: unknown) {
  const root = closedObject(value, ['object', 'data'])
  if (root.object !== 'list') return fail('GENERATION_V2_OPENAI_MODELS_INVALID_VALUE')
  const data = denseArray(root.data).map((raw) => {
    const model = closedObject(raw, ['id', 'object', 'created', 'owned_by'])
    if (model.object !== 'model' || typeof model.id !== 'string' || !MODEL_PATTERN.test(model.id) ||
        !Number.isSafeInteger(model.created) || (model.created as number) < 0 ||
        typeof model.owned_by !== 'string' || model.owned_by.trim() !== model.owned_by || !OWNER_PATTERN.test(model.owned_by)) {
      return fail('GENERATION_V2_OPENAI_MODELS_INVALID_VALUE')
    }
    return Object.freeze({ id: model.id, object: 'model' as const, created: model.created as number, owned_by: model.owned_by })
  }).sort((left, right) => compareCodePoints(left.id, right.id))
  if (new Set(data.map((model) => model.id)).size !== data.length) return fail('GENERATION_V2_OPENAI_MODELS_DUPLICATE_ID')
  return Object.freeze({ object: 'list' as const, data: Object.freeze(data) })
}

function build(value: unknown): PersistedOpenAIResponsesModelsEvidenceV2 {
  const semantic = projection(value)
  const canonical = stableSerializeProviderRequestV2(semantic)
  if (Buffer.byteLength(canonical, 'utf8') > OPENAI_RESPONSES_MODELS_MAX_BYTES_V2) {
    return fail('GENERATION_V2_OPENAI_MODELS_LIMIT_EXCEEDED')
  }
  const digest = createHash('sha256').update(canonical, 'utf8').digest('hex')
  return Object.freeze({
    ...semantic, response_digest: digest, response_revision: `openai-responses-models-v1:${digest}`,
  })
}

export function canonicalizeOpenAIResponsesModelsEvidenceV2(value: unknown): PersistedOpenAIResponsesModelsEvidenceV2 {
  return build(value)
}

export function decodeOpenAIResponsesModelsEvidenceV2(value: unknown): DecodedOpenAIResponsesModelsEvidenceV2 {
  const input = closedObject(value, ['object', 'data', 'response_digest', 'response_revision'])
  const expected = build({ object: input.object, data: input.data })
  if (input.response_digest !== expected.response_digest || input.response_revision !== expected.response_revision) {
    return fail('GENERATION_V2_OPENAI_MODELS_DIGEST_MISMATCH')
  }
  const canonicalJson = stableSerializeProviderRequestV2(expected)
  const decoded = Object.freeze({
    trust: 'decoded_unverified', executionAuthority: 'none',
    models: Object.freeze(expected.data.map((model) => Object.freeze({
      modelId: GenerationV2Identity.create('model_id', model.id), created: model.created, ownedBy: model.owned_by,
    }))),
    responseDigest: GenerationV2Digest.create('evidence_digest', expected.response_digest),
    responseRevision: expected.response_revision,
    canonicalJson,
  })
  decodedAuthorities.add(decoded)
  return decoded
}
