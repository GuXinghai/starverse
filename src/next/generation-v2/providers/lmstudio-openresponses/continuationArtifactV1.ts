import { createHash } from 'node:crypto'
import { stableSerializeProviderRequestV2 } from '../../compiler/stableSerialize'
import {
  decodeLmStudioOpenResponsesClientItemsV1,
  decodeLmStudioOpenResponsesReplayItemsV1,
  decodeLmStudioOpenResponsesReturnedItemsV1,
  LMSTUDIO_OPENRESPONSES_MAX_REPLAY_ITEMS_V1,
  type LmStudioOpenResponsesClientItemV1,
  type LmStudioOpenResponsesReplayItemV1,
} from './nativeItemsV1'

export const LMSTUDIO_OPENRESPONSES_ARTIFACT_KIND_V1 = 'lmstudio_openresponses_native_items' as const
export const LMSTUDIO_OPENRESPONSES_ARTIFACT_CODEC_VERSION_V1 = 1 as const
export const LMSTUDIO_OPENRESPONSES_MAX_REPLAY_SERIALIZED_BYTES_V1 = 20 * 1_024 * 1_024
export const LMSTUDIO_OPENRESPONSES_MAX_ARTIFACT_BYTES_V1 = 20 * 1_024 * 1_024

export type LmStudioOpenResponsesContinuationArtifactV1 = Readonly<{
  schemaVersion: 1
  artifactKind: typeof LMSTUDIO_OPENRESPONSES_ARTIFACT_KIND_V1
  artifactCodecVersion: typeof LMSTUDIO_OPENRESPONSES_ARTIFACT_CODEC_VERSION_V1
  requestSequence: number
  orderedItems: readonly LmStudioOpenResponsesReplayItemV1[]
  artifactHash: string
}>

export class LmStudioOpenResponsesContinuationArtifactV1Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_LMSTUDIO_CONTINUATION_INVALID_SHAPE'
    | 'GENERATION_V2_LMSTUDIO_CONTINUATION_INVALID_VALUE'
    | 'GENERATION_V2_LMSTUDIO_CONTINUATION_HASH_MISMATCH'
    | 'GENERATION_V2_LMSTUDIO_CONTINUATION_LIMIT_EXCEEDED'
    | 'GENERATION_V2_LMSTUDIO_CONTINUATION_SEQUENCE_INVALID'
    | 'GENERATION_V2_LMSTUDIO_CONTINUATION_UNBRANDED') {
    super(code)
    this.name = 'LmStudioOpenResponsesContinuationArtifactV1Error'
  }
}

const artifacts = new WeakSet<object>()

function closedArtifact(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new LmStudioOpenResponsesContinuationArtifactV1Error('GENERATION_V2_LMSTUDIO_CONTINUATION_INVALID_SHAPE')
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const expected = [
    'artifactCodecVersion', 'artifactHash', 'artifactKind', 'orderedItems', 'requestSequence', 'schemaVersion',
  ]
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined) ||
      Object.keys(descriptors).sort().join('\0') !== expected.join('\0')) {
    throw new LmStudioOpenResponsesContinuationArtifactV1Error('GENERATION_V2_LMSTUDIO_CONTINUATION_INVALID_SHAPE')
  }
  return Object.freeze(Object.fromEntries(expected.map((key) => [key, descriptors[key].value])))
}

function safeSequence(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new LmStudioOpenResponsesContinuationArtifactV1Error('GENERATION_V2_LMSTUDIO_CONTINUATION_INVALID_VALUE')
  }
  return value as number
}

function projection(input: Readonly<{
  requestSequence: number
  orderedItems: readonly LmStudioOpenResponsesReplayItemV1[]
}>) {
  return Object.freeze({
    schemaVersion: 1 as const,
    artifactKind: LMSTUDIO_OPENRESPONSES_ARTIFACT_KIND_V1,
    artifactCodecVersion: LMSTUDIO_OPENRESPONSES_ARTIFACT_CODEC_VERSION_V1,
    requestSequence: input.requestSequence,
    orderedItems: input.orderedItems,
  })
}

function hashProjection(value: ReturnType<typeof projection>): string {
  return createHash('sha256').update(stableSerializeProviderRequestV2(value), 'utf8').digest('hex')
}

function validateSequence(items: readonly LmStudioOpenResponsesReplayItemV1[]): void {
  const returnedIds = new Set<string>()
  const calls = new Set<string>()
  const completedCalls = new Set<string>()
  for (const item of items) {
    if ('id' in item) {
      if (returnedIds.has(item.id)) {
        throw new LmStudioOpenResponsesContinuationArtifactV1Error(
          'GENERATION_V2_LMSTUDIO_CONTINUATION_SEQUENCE_INVALID',
        )
      }
      returnedIds.add(item.id)
    }
    if ('type' in item && item.type === 'function_call') {
      if (calls.has(item.call_id)) {
        throw new LmStudioOpenResponsesContinuationArtifactV1Error(
          'GENERATION_V2_LMSTUDIO_CONTINUATION_SEQUENCE_INVALID',
        )
      }
      calls.add(item.call_id)
    } else if ('type' in item && item.type === 'function_call_output') {
      if (!calls.has(item.call_id) || completedCalls.has(item.call_id)) {
        throw new LmStudioOpenResponsesContinuationArtifactV1Error(
          'GENERATION_V2_LMSTUDIO_CONTINUATION_SEQUENCE_INVALID',
        )
      }
      completedCalls.add(item.call_id)
    }
  }
}

function createArtifact(input: Readonly<{
  requestSequence: unknown
  orderedItems: unknown
}>): LmStudioOpenResponsesContinuationArtifactV1 {
  const requestSequence = safeSequence(input.requestSequence)
  const orderedItems = decodeLmStudioOpenResponsesReplayItemsV1(input.orderedItems)
  validateSequence(orderedItems)
  const semanticProjection = projection({ requestSequence, orderedItems })
  const artifact: LmStudioOpenResponsesContinuationArtifactV1 = Object.freeze({
    ...semanticProjection,
    artifactHash: hashProjection(semanticProjection),
  })
  if (new TextEncoder().encode(stableSerializeProviderRequestV2(artifact)).byteLength >
      LMSTUDIO_OPENRESPONSES_MAX_ARTIFACT_BYTES_V1) {
    throw new LmStudioOpenResponsesContinuationArtifactV1Error(
      'GENERATION_V2_LMSTUDIO_CONTINUATION_LIMIT_EXCEEDED',
    )
  }
  artifacts.add(artifact)
  return artifact
}

export function createLmStudioOpenResponsesContinuationArtifactV1(input: Readonly<{
  requestSequence: unknown
  orderedItems: unknown
}>): LmStudioOpenResponsesContinuationArtifactV1 {
  return createArtifact(input)
}

export function decodeLmStudioOpenResponsesContinuationArtifactV1(
  value: unknown,
): LmStudioOpenResponsesContinuationArtifactV1 {
  const input = closedArtifact(value)
  if (input.schemaVersion !== 1 || input.artifactKind !== LMSTUDIO_OPENRESPONSES_ARTIFACT_KIND_V1 ||
      input.artifactCodecVersion !== LMSTUDIO_OPENRESPONSES_ARTIFACT_CODEC_VERSION_V1 ||
      typeof input.artifactHash !== 'string' || !/^[0-9a-f]{64}$/u.test(input.artifactHash)) {
    throw new LmStudioOpenResponsesContinuationArtifactV1Error('GENERATION_V2_LMSTUDIO_CONTINUATION_INVALID_VALUE')
  }
  const artifact = createArtifact({ requestSequence: input.requestSequence, orderedItems: input.orderedItems })
  if (artifact.artifactHash !== input.artifactHash) {
    throw new LmStudioOpenResponsesContinuationArtifactV1Error('GENERATION_V2_LMSTUDIO_CONTINUATION_HASH_MISMATCH')
  }
  return artifact
}

export function isLmStudioOpenResponsesContinuationArtifactV1(
  value: unknown,
): value is LmStudioOpenResponsesContinuationArtifactV1 {
  if (!value || typeof value !== 'object' || !artifacts.has(value)) return false
  const artifact = value as LmStudioOpenResponsesContinuationArtifactV1
  return artifact.artifactHash === hashProjection(projection(artifact))
}

function requireArtifact(
  artifact: LmStudioOpenResponsesContinuationArtifactV1 | null,
): LmStudioOpenResponsesContinuationArtifactV1 | null {
  if (artifact !== null && !isLmStudioOpenResponsesContinuationArtifactV1(artifact)) {
    throw new LmStudioOpenResponsesContinuationArtifactV1Error('GENERATION_V2_LMSTUDIO_CONTINUATION_UNBRANDED')
  }
  return artifact
}

export function serializeLmStudioOpenResponsesContinuationArtifactV1(
  artifact: LmStudioOpenResponsesContinuationArtifactV1,
): string {
  if (!isLmStudioOpenResponsesContinuationArtifactV1(artifact)) {
    throw new LmStudioOpenResponsesContinuationArtifactV1Error('GENERATION_V2_LMSTUDIO_CONTINUATION_UNBRANDED')
  }
  return stableSerializeProviderRequestV2(artifact)
}

export function buildLmStudioOpenResponsesReplayInputV1(input: Readonly<{
  priorArtifact: LmStudioOpenResponsesContinuationArtifactV1 | null
  clientItems: unknown
}>): readonly LmStudioOpenResponsesReplayItemV1[] {
  const prior = requireArtifact(input.priorArtifact)
  const clientItems = decodeLmStudioOpenResponsesClientItemsV1(input.clientItems)
  const combined = [...(prior?.orderedItems ?? []), ...clientItems]
  if (combined.length > LMSTUDIO_OPENRESPONSES_MAX_REPLAY_ITEMS_V1) {
    throw new LmStudioOpenResponsesContinuationArtifactV1Error(
      'GENERATION_V2_LMSTUDIO_CONTINUATION_LIMIT_EXCEEDED',
    )
  }
  const replay = decodeLmStudioOpenResponsesReplayItemsV1(combined)
  validateSequence(replay)
  if (new TextEncoder().encode(stableSerializeProviderRequestV2(replay)).byteLength >
      LMSTUDIO_OPENRESPONSES_MAX_REPLAY_SERIALIZED_BYTES_V1) {
    throw new LmStudioOpenResponsesContinuationArtifactV1Error(
      'GENERATION_V2_LMSTUDIO_CONTINUATION_LIMIT_EXCEEDED',
    )
  }
  return replay
}

export function completeLmStudioOpenResponsesRequestV1(input: Readonly<{
  priorArtifact: LmStudioOpenResponsesContinuationArtifactV1 | null
  requestSequence: unknown
  clientItems: unknown
  returnedItems: unknown
}>): LmStudioOpenResponsesContinuationArtifactV1 {
  const prior = requireArtifact(input.priorArtifact)
  const requestSequence = safeSequence(input.requestSequence)
  if (requestSequence !== (prior?.requestSequence ?? 0) + 1) {
    throw new LmStudioOpenResponsesContinuationArtifactV1Error(
      'GENERATION_V2_LMSTUDIO_CONTINUATION_SEQUENCE_INVALID',
    )
  }
  const replay = buildLmStudioOpenResponsesReplayInputV1({
    priorArtifact: prior,
    clientItems: input.clientItems,
  })
  const returned = decodeLmStudioOpenResponsesReturnedItemsV1(input.returnedItems)
  return createArtifact({ requestSequence, orderedItems: [...replay, ...returned] })
}

export function projectLmStudioOpenResponsesClientItemsV1(
  items: readonly LmStudioOpenResponsesClientItemV1[],
): readonly LmStudioOpenResponsesClientItemV1[] {
  return decodeLmStudioOpenResponsesClientItemsV1(items)
}
