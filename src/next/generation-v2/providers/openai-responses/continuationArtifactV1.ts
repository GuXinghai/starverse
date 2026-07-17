import { createHash } from 'node:crypto'
import { stableSerializeProviderRequestV2 } from '../../compiler/stableSerialize'
import {
  decodeOpenAIResponsesClientItemsV1,
  decodeOpenAIResponsesReplayItemsV1,
  decodeOpenAIResponsesReturnedItemsV1,
  OPENAI_RESPONSES_MAX_REPLAY_ITEMS_V1,
  type OpenAIResponsesClientItemV1,
  type OpenAIResponsesReplayItemV1,
} from './nativeItemsV1'

export const OPENAI_RESPONSES_ARTIFACT_KIND_V1 = 'openai_responses_ordered_native_items_v1' as const
export const OPENAI_RESPONSES_ARTIFACT_CODEC_VERSION_V1 = 1 as const
export const OPENAI_RESPONSES_MAX_ARTIFACT_BYTES_V1 = 28 * 1_024 * 1_024

export type OpenAIResponsesContinuationArtifactV1 = Readonly<{
  schemaVersion: 1
  artifactKind: typeof OPENAI_RESPONSES_ARTIFACT_KIND_V1
  artifactCodecVersion: typeof OPENAI_RESPONSES_ARTIFACT_CODEC_VERSION_V1
  requestSequence: number
  parentArtifactHash: string | null
  orderedItems: readonly OpenAIResponsesReplayItemV1[]
  artifactHash: string
}>

export class OpenAIResponsesContinuationArtifactV1Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENAI_CONTINUATION_INVALID_SHAPE'
    | 'GENERATION_V2_OPENAI_CONTINUATION_INVALID_VALUE'
    | 'GENERATION_V2_OPENAI_CONTINUATION_HASH_MISMATCH'
    | 'GENERATION_V2_OPENAI_CONTINUATION_LIMIT_EXCEEDED'
    | 'GENERATION_V2_OPENAI_CONTINUATION_SEQUENCE_INVALID'
    | 'GENERATION_V2_OPENAI_CONTINUATION_UNBRANDED') {
    super(code)
    this.name = 'OpenAIResponsesContinuationArtifactV1Error'
  }
}

const artifacts = new WeakSet<object>()

function fail(code: OpenAIResponsesContinuationArtifactV1Error['code']): never {
  throw new OpenAIResponsesContinuationArtifactV1Error(code)
}

function closedArtifact(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    return fail('GENERATION_V2_OPENAI_CONTINUATION_INVALID_SHAPE')
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const expected = [
    'artifactCodecVersion', 'artifactHash', 'artifactKind', 'orderedItems', 'parentArtifactHash', 'requestSequence', 'schemaVersion',
  ]
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined) ||
      Object.keys(descriptors).sort().join('\0') !== expected.join('\0')) {
    return fail('GENERATION_V2_OPENAI_CONTINUATION_INVALID_SHAPE')
  }
  return Object.freeze(Object.fromEntries(expected.map((key) => [key, descriptors[key].value])))
}

function sequence(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) return fail('GENERATION_V2_OPENAI_CONTINUATION_INVALID_VALUE')
  return value as number
}

function parentHash(value: unknown): string | null {
  if (value !== null && (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value))) {
    return fail('GENERATION_V2_OPENAI_CONTINUATION_INVALID_VALUE')
  }
  return value
}

function semanticProjection(input: Readonly<{
  requestSequence: number
  parentArtifactHash: string | null
  orderedItems: readonly OpenAIResponsesReplayItemV1[]
}>) {
  return Object.freeze({
    schemaVersion: 1 as const,
    artifactKind: OPENAI_RESPONSES_ARTIFACT_KIND_V1,
    artifactCodecVersion: OPENAI_RESPONSES_ARTIFACT_CODEC_VERSION_V1,
    requestSequence: input.requestSequence,
    parentArtifactHash: input.parentArtifactHash,
    orderedItems: input.orderedItems,
  })
}

function hash(value: ReturnType<typeof semanticProjection>): string {
  return createHash('sha256').update(stableSerializeProviderRequestV2(value), 'utf8').digest('hex')
}

function validateSequence(items: readonly OpenAIResponsesReplayItemV1[]): void {
  const itemIds = new Set<string>()
  const calls = new Set<string>()
  const outputs = new Set<string>()
  for (const item of items) {
    if ('id' in item && item.id !== undefined) {
      if (itemIds.has(item.id)) return fail('GENERATION_V2_OPENAI_CONTINUATION_SEQUENCE_INVALID')
      itemIds.add(item.id)
    }
    if ('type' in item && item.type === 'function_call') {
      if (calls.has(item.call_id)) return fail('GENERATION_V2_OPENAI_CONTINUATION_SEQUENCE_INVALID')
      calls.add(item.call_id)
    } else if ('type' in item && item.type === 'function_call_output') {
      if (!calls.has(item.call_id) || outputs.has(item.call_id)) {
        return fail('GENERATION_V2_OPENAI_CONTINUATION_SEQUENCE_INVALID')
      }
      outputs.add(item.call_id)
    }
  }
}

function createArtifact(input: Readonly<{
  requestSequence: unknown
  parentArtifactHash: unknown
  orderedItems: unknown
}>): OpenAIResponsesContinuationArtifactV1 {
  const requestSequence = sequence(input.requestSequence)
  const decodedParentHash = parentHash(input.parentArtifactHash)
  const orderedItems = decodeOpenAIResponsesReplayItemsV1(input.orderedItems)
  validateSequence(orderedItems)
  const projection = semanticProjection({ requestSequence, parentArtifactHash: decodedParentHash, orderedItems })
  const artifact = Object.freeze({ ...projection, artifactHash: hash(projection) })
  if (new TextEncoder().encode(stableSerializeProviderRequestV2(artifact)).byteLength > OPENAI_RESPONSES_MAX_ARTIFACT_BYTES_V1) {
    return fail('GENERATION_V2_OPENAI_CONTINUATION_LIMIT_EXCEEDED')
  }
  artifacts.add(artifact)
  return artifact
}

export function decodeOpenAIResponsesContinuationArtifactV1(value: unknown): OpenAIResponsesContinuationArtifactV1 {
  const input = closedArtifact(value)
  if (input.schemaVersion !== 1 || input.artifactKind !== OPENAI_RESPONSES_ARTIFACT_KIND_V1 ||
      input.artifactCodecVersion !== OPENAI_RESPONSES_ARTIFACT_CODEC_VERSION_V1 ||
      typeof input.artifactHash !== 'string' || !/^[0-9a-f]{64}$/u.test(input.artifactHash)) {
    return fail('GENERATION_V2_OPENAI_CONTINUATION_INVALID_VALUE')
  }
  const decoded = createArtifact({
    requestSequence: input.requestSequence,
    parentArtifactHash: input.parentArtifactHash,
    orderedItems: input.orderedItems,
  })
  if (decoded.artifactHash !== input.artifactHash) return fail('GENERATION_V2_OPENAI_CONTINUATION_HASH_MISMATCH')
  return decoded
}

export function isOpenAIResponsesContinuationArtifactV1(value: unknown): value is OpenAIResponsesContinuationArtifactV1 {
  if (!value || typeof value !== 'object' || !artifacts.has(value)) return false
  const artifact = value as OpenAIResponsesContinuationArtifactV1
  return artifact.artifactHash === hash(semanticProjection(artifact))
}

function requireArtifact(value: OpenAIResponsesContinuationArtifactV1 | null): OpenAIResponsesContinuationArtifactV1 | null {
  if (value !== null && !isOpenAIResponsesContinuationArtifactV1(value)) {
    return fail('GENERATION_V2_OPENAI_CONTINUATION_UNBRANDED')
  }
  return value
}

export function buildOpenAIResponsesReplayInputV1(input: Readonly<{
  priorArtifact: OpenAIResponsesContinuationArtifactV1 | null
  clientItems: unknown
}>): readonly OpenAIResponsesReplayItemV1[] {
  const prior = requireArtifact(input.priorArtifact)
  const clientItems = decodeOpenAIResponsesClientItemsV1(input.clientItems)
  const combined = [...(prior?.orderedItems ?? []), ...clientItems]
  if (combined.length > OPENAI_RESPONSES_MAX_REPLAY_ITEMS_V1) {
    return fail('GENERATION_V2_OPENAI_CONTINUATION_LIMIT_EXCEEDED')
  }
  const replay = decodeOpenAIResponsesReplayItemsV1(combined)
  validateSequence(replay)
  return replay
}

export function completeOpenAIResponsesRequestV1(input: Readonly<{
  priorArtifact: OpenAIResponsesContinuationArtifactV1 | null
  requestSequence: unknown
  clientItems: unknown
  returnedItems: unknown
}>): OpenAIResponsesContinuationArtifactV1 {
  const prior = requireArtifact(input.priorArtifact)
  const requestSequence = sequence(input.requestSequence)
  if (requestSequence !== (prior?.requestSequence ?? 0) + 1) {
    return fail('GENERATION_V2_OPENAI_CONTINUATION_SEQUENCE_INVALID')
  }
  const replay = buildOpenAIResponsesReplayInputV1({ priorArtifact: prior, clientItems: input.clientItems })
  const returned = decodeOpenAIResponsesReturnedItemsV1(input.returnedItems)
  return createArtifact({
    requestSequence,
    parentArtifactHash: prior?.artifactHash ?? null,
    orderedItems: [...replay, ...returned],
  })
}

export function projectOpenAIResponsesClientItemsV1(
  items: readonly OpenAIResponsesClientItemV1[],
): readonly OpenAIResponsesClientItemV1[] {
  return decodeOpenAIResponsesClientItemsV1(items)
}
