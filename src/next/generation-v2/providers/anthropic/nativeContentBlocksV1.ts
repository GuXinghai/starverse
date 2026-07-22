import {
  sha256PreparedBytesV2,
  stableSerializeProviderRequestBoundedV2,
  stableSerializeProviderRequestV2,
} from '../../compiler/stableSerialize'

export const ANTHROPIC_NATIVE_HISTORY_ARTIFACT_KIND_V1 = 'anthropic_messages_native_history_v1' as const
export const ANTHROPIC_NATIVE_HISTORY_CODEC_VERSION_V1 = 1 as const
export const ANTHROPIC_NATIVE_HISTORY_MAX_BLOCKS_V1 = 4_096
export const ANTHROPIC_NATIVE_HISTORY_MAX_SERIALIZED_BYTES_V1 = 20 * 1_024 * 1_024

export type AnthropicTextBlockV1 = Readonly<{ type: 'text'; text: string; citations: null }>
export type AnthropicThinkingBlockV1 = Readonly<{ type: 'thinking'; thinking: string; signature: string }>
export type AnthropicRedactedThinkingBlockV1 = Readonly<{ type: 'redacted_thinking'; data: string }>
export type AnthropicToolUseBlockV1 = Readonly<{
  type: 'tool_use'
  id: string
  name: string
  input: PlainJsonV1
  caller: Readonly<{ type: 'direct' }>
}>
export type AnthropicNativeContentBlockV1 =
  | AnthropicTextBlockV1
  | AnthropicThinkingBlockV1
  | AnthropicRedactedThinkingBlockV1
  | AnthropicToolUseBlockV1

export type PlainJsonV1 = null | boolean | number | string | readonly PlainJsonV1[] | Readonly<{ [key: string]: PlainJsonV1 }>

export type AnthropicNativeUsageV1 = Readonly<{
  input_tokens: number
  output_tokens: number
  cache_creation: null
  cache_creation_input_tokens: number | null
  cache_read_input_tokens: number | null
  inference_geo: string | null
  output_tokens_details: null
  server_tool_use: null
  service_tier: 'standard' | 'priority' | 'batch' | null
}>

export type AnthropicNativeHistoryArtifactV1 = Readonly<{
  artifactKind: typeof ANTHROPIC_NATIVE_HISTORY_ARTIFACT_KIND_V1
  artifactCodecVersion: typeof ANTHROPIC_NATIVE_HISTORY_CODEC_VERSION_V1
  providerKey: 'anthropic'
  sourceApi: 'anthropic_messages'
  assistantMessage: Readonly<{ role: 'assistant'; content: readonly AnthropicNativeContentBlockV1[] }>
  model: string
  stopReason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | 'pause_turn' | 'refusal'
  stopSequence: string | null
  usage: AnthropicNativeUsageV1
  artifactHash: string
}>

type ArtifactProjection = Omit<AnthropicNativeHistoryArtifactV1, 'artifactHash'>
type ClosedObject = Readonly<Record<string, unknown>>

export class AnthropicNativeContentBlocksV1Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_ANTHROPIC_NATIVE_INVALID_SHAPE'
    | 'GENERATION_V2_ANTHROPIC_NATIVE_UNKNOWN_FIELD'
    | 'GENERATION_V2_ANTHROPIC_NATIVE_INVALID_VALUE'
    | 'GENERATION_V2_ANTHROPIC_NATIVE_NOT_FINAL'
    | 'GENERATION_V2_ANTHROPIC_NATIVE_STOP_MISMATCH'
    | 'GENERATION_V2_ANTHROPIC_NATIVE_LIMIT_EXCEEDED'
    | 'GENERATION_V2_ANTHROPIC_NATIVE_HASH_MISMATCH'
    | 'GENERATION_V2_ANTHROPIC_NATIVE_NON_CANONICAL'
    | 'GENERATION_V2_ANTHROPIC_NATIVE_UNBRANDED') {
    super(code)
    this.name = 'AnthropicNativeContentBlocksV1Error'
  }
}

const brandedArtifacts = new WeakSet<object>()
const STOP_REASONS = new Set<AnthropicNativeHistoryArtifactV1['stopReason']>([
  'end_turn', 'max_tokens', 'stop_sequence', 'tool_use', 'pause_turn', 'refusal',
])

function fail(code: AnthropicNativeContentBlocksV1Error['code']): never {
  throw new AnthropicNativeContentBlocksV1Error(code)
}

function closedObject(value: unknown, allowed: readonly string[], required: readonly string[]): ClosedObject {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    return fail('GENERATION_V2_ANTHROPIC_NATIVE_INVALID_SHAPE')
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.values(descriptors).some((descriptor) =>
        !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined)) {
    return fail('GENERATION_V2_ANTHROPIC_NATIVE_INVALID_SHAPE')
  }
  const keys = Object.keys(descriptors)
  if (keys.some((key) => !allowed.includes(key))) return fail('GENERATION_V2_ANTHROPIC_NATIVE_UNKNOWN_FIELD')
  if (required.some((key) => !keys.includes(key))) return fail('GENERATION_V2_ANTHROPIC_NATIVE_INVALID_SHAPE')
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, descriptors[key].value])))
}

function denseArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    return fail('GENERATION_V2_ANTHROPIC_NATIVE_INVALID_SHAPE')
  }
  if (value.length > ANTHROPIC_NATIVE_HISTORY_MAX_BLOCKS_V1) {
    return fail('GENERATION_V2_ANTHROPIC_NATIVE_LIMIT_EXCEEDED')
  }
  const expected = [...Array.from({ length: value.length }, (_, index) => String(index)), 'length']
  const keys = Reflect.ownKeys(value)
  if (keys.length !== expected.length || expected.some((key) => !keys.includes(key))) {
    return fail('GENERATION_V2_ANTHROPIC_NATIVE_INVALID_SHAPE')
  }
  return Object.freeze(expected.slice(0, -1).map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined) {
      return fail('GENERATION_V2_ANTHROPIC_NATIVE_INVALID_SHAPE')
    }
    return descriptor.value
  }))
}

function stringValue(value: unknown, nonEmpty = false): string {
  if (typeof value !== 'string' || (nonEmpty && value.length === 0)) {
    return fail('GENERATION_V2_ANTHROPIC_NATIVE_INVALID_VALUE')
  }
  return value
}

function clonePlainJson(value: unknown, active = new WeakSet<object>(), depth = 0): PlainJsonV1 {
  if (depth > 128) return fail('GENERATION_V2_ANTHROPIC_NATIVE_INVALID_VALUE')
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return fail('GENERATION_V2_ANTHROPIC_NATIVE_INVALID_VALUE')
    return value
  }
  if (!value || typeof value !== 'object' || active.has(value)) {
    return fail('GENERATION_V2_ANTHROPIC_NATIVE_INVALID_VALUE')
  }
  active.add(value)
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) return fail('GENERATION_V2_ANTHROPIC_NATIVE_INVALID_SHAPE')
      const expected = [...Array.from({ length: value.length }, (_, index) => String(index)), 'length']
      const keys = Reflect.ownKeys(value)
      if (keys.length !== expected.length || expected.some((key) => !keys.includes(key))) {
        return fail('GENERATION_V2_ANTHROPIC_NATIVE_INVALID_SHAPE')
      }
      return Object.freeze(expected.slice(0, -1).map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key)
        if (!descriptor || !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined) {
          return fail('GENERATION_V2_ANTHROPIC_NATIVE_INVALID_SHAPE')
        }
        return clonePlainJson(descriptor.value, active, depth + 1)
      }))
    }
    const input = closedObject(value, Object.keys(value), Object.keys(value))
    return Object.freeze(Object.fromEntries(Object.keys(input).map((key) => [
      key, clonePlainJson(input[key], active, depth + 1),
    ]))) as Readonly<{ [key: string]: PlainJsonV1 }>
  } finally {
    active.delete(value)
  }
}

function decodeBlock(value: unknown): AnthropicNativeContentBlockV1 {
  const discriminator = closedObject(
    value,
    ['type', 'text', 'citations', 'thinking', 'signature', 'data', 'id', 'name', 'input', 'caller'],
    ['type'],
  )
  if (discriminator.type === 'text') {
    const block = closedObject(value, ['type', 'text', 'citations'], ['type', 'text', 'citations'])
    if (block.citations !== null) return fail('GENERATION_V2_ANTHROPIC_NATIVE_INVALID_VALUE')
    return Object.freeze({ type: 'text', text: stringValue(block.text), citations: null })
  }
  if (discriminator.type === 'thinking') {
    const block = closedObject(value, ['type', 'thinking', 'signature'], ['type', 'thinking', 'signature'])
    return Object.freeze({
      type: 'thinking', thinking: stringValue(block.thinking), signature: stringValue(block.signature, true),
    })
  }
  if (discriminator.type === 'redacted_thinking') {
    const block = closedObject(value, ['type', 'data'], ['type', 'data'])
    return Object.freeze({ type: 'redacted_thinking', data: stringValue(block.data, true) })
  }
  if (discriminator.type === 'tool_use') {
    const block = closedObject(value, ['type', 'id', 'name', 'input', 'caller'], ['type', 'id', 'name', 'input', 'caller'])
    const caller = closedObject(block.caller, ['type'], ['type'])
    if (caller.type !== 'direct') return fail('GENERATION_V2_ANTHROPIC_NATIVE_INVALID_VALUE')
    return Object.freeze({
      type: 'tool_use',
      id: stringValue(block.id, true),
      name: stringValue(block.name, true),
      input: clonePlainJson(block.input),
      caller: Object.freeze({ type: 'direct' as const }),
    })
  }
  return fail('GENERATION_V2_ANTHROPIC_NATIVE_INVALID_VALUE')
}

function decodeBlocks(value: unknown): readonly AnthropicNativeContentBlockV1[] {
  const blocks = denseArray(value)
  if (blocks.length === 0) return fail('GENERATION_V2_ANTHROPIC_NATIVE_INVALID_VALUE')
  return Object.freeze(blocks.map(decodeBlock))
}

function usageInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    return fail('GENERATION_V2_ANTHROPIC_NATIVE_INVALID_VALUE')
  }
  return value as number
}

function decodeUsage(value: unknown): AnthropicNativeUsageV1 {
  const input = closedObject(
    value,
    [
      'cache_creation', 'cache_creation_input_tokens', 'cache_read_input_tokens', 'inference_geo',
      'input_tokens', 'output_tokens', 'output_tokens_details', 'server_tool_use', 'service_tier',
    ],
    [
      'cache_creation', 'cache_creation_input_tokens', 'cache_read_input_tokens', 'inference_geo',
      'input_tokens', 'output_tokens', 'output_tokens_details', 'server_tool_use', 'service_tier',
    ],
  )
  if (input.cache_creation !== null || input.output_tokens_details !== null || input.server_tool_use !== null ||
      (input.cache_creation_input_tokens !== null && !Number.isSafeInteger(input.cache_creation_input_tokens)) ||
      (input.cache_read_input_tokens !== null && !Number.isSafeInteger(input.cache_read_input_tokens)) ||
      (input.inference_geo !== null && typeof input.inference_geo !== 'string') ||
      (input.service_tier !== null && input.service_tier !== 'standard' && input.service_tier !== 'priority' &&
        input.service_tier !== 'batch')) {
    return fail('GENERATION_V2_ANTHROPIC_NATIVE_INVALID_VALUE')
  }
  return Object.freeze({
    cache_creation: null,
    cache_creation_input_tokens: input.cache_creation_input_tokens === null
      ? null : usageInteger(input.cache_creation_input_tokens),
    cache_read_input_tokens: input.cache_read_input_tokens === null
      ? null : usageInteger(input.cache_read_input_tokens),
    inference_geo: input.inference_geo === null ? null : stringValue(input.inference_geo),
    input_tokens: usageInteger(input.input_tokens),
    output_tokens: usageInteger(input.output_tokens),
    output_tokens_details: null,
    server_tool_use: null,
    service_tier: input.service_tier as AnthropicNativeUsageV1['service_tier'],
  })
}

function stopReason(value: unknown): AnthropicNativeHistoryArtifactV1['stopReason'] {
  if (typeof value !== 'string' || !STOP_REASONS.has(value as AnthropicNativeHistoryArtifactV1['stopReason'])) {
    return fail('GENERATION_V2_ANTHROPIC_NATIVE_INVALID_VALUE')
  }
  return value as AnthropicNativeHistoryArtifactV1['stopReason']
}

function projection(input: Readonly<{
  blocks: readonly AnthropicNativeContentBlockV1[]
  model: string
  stopReason: AnthropicNativeHistoryArtifactV1['stopReason']
  stopSequence: string | null
  usage: AnthropicNativeUsageV1
}>): ArtifactProjection {
  return Object.freeze({
    artifactKind: ANTHROPIC_NATIVE_HISTORY_ARTIFACT_KIND_V1,
    artifactCodecVersion: ANTHROPIC_NATIVE_HISTORY_CODEC_VERSION_V1,
    providerKey: 'anthropic' as const,
    sourceApi: 'anthropic_messages' as const,
    assistantMessage: Object.freeze({ role: 'assistant' as const, content: input.blocks }),
    model: input.model,
    stopReason: input.stopReason,
    stopSequence: input.stopSequence,
    usage: input.usage,
  })
}

function issueArtifact(semantic: ArtifactProjection): AnthropicNativeHistoryArtifactV1 {
  let canonicalProjection: string
  try {
    canonicalProjection = stableSerializeProviderRequestBoundedV2(
      semantic,
      ANTHROPIC_NATIVE_HISTORY_MAX_SERIALIZED_BYTES_V1,
    )
  } catch {
    return fail('GENERATION_V2_ANTHROPIC_NATIVE_LIMIT_EXCEEDED')
  }
  const artifact = Object.freeze({
    ...semantic,
    artifactHash: sha256PreparedBytesV2(new TextEncoder().encode(canonicalProjection)),
  })
  try {
    stableSerializeProviderRequestBoundedV2(artifact, ANTHROPIC_NATIVE_HISTORY_MAX_SERIALIZED_BYTES_V1)
  } catch {
    return fail('GENERATION_V2_ANTHROPIC_NATIVE_LIMIT_EXCEEDED')
  }
  brandedArtifacts.add(artifact)
  return artifact
}

function createFromParts(input: Readonly<{
  blocks: unknown
  model: unknown
  stopReason: unknown
  stopSequence: unknown
  usage: unknown
}>): AnthropicNativeHistoryArtifactV1 {
  const blocks = decodeBlocks(input.blocks)
  const reason = stopReason(input.stopReason)
  if (reason === 'tool_use' && !blocks.some((block) => block.type === 'tool_use')) {
    return fail('GENERATION_V2_ANTHROPIC_NATIVE_STOP_MISMATCH')
  }
  if (input.stopSequence !== null && typeof input.stopSequence !== 'string') {
    return fail('GENERATION_V2_ANTHROPIC_NATIVE_INVALID_VALUE')
  }
  return issueArtifact(projection({
    blocks,
    model: stringValue(input.model, true),
    stopReason: reason,
    stopSequence: input.stopSequence,
    usage: decodeUsage(input.usage),
  }))
}

/** Converts only a closed, final legacy Anthropic provider-native snapshot. */
export function createAnthropicNativeHistoryArtifactV1(snapshot: unknown): AnthropicNativeHistoryArtifactV1 {
  const input = closedObject(
    snapshot,
    ['providerKey', 'sourceApi', 'snapshotKey', 'role', 'status', 'content', 'model', 'stopReason', 'stopSequence', 'usage'],
    ['providerKey', 'sourceApi', 'snapshotKey', 'role', 'status', 'content', 'model', 'stopReason', 'stopSequence', 'usage'],
  )
  if (input.providerKey !== 'anthropic' || input.sourceApi !== 'anthropic_messages' ||
      input.snapshotKey !== 'assistant' || input.role !== 'assistant') {
    return fail('GENERATION_V2_ANTHROPIC_NATIVE_INVALID_VALUE')
  }
  if (input.status !== 'final') return fail('GENERATION_V2_ANTHROPIC_NATIVE_NOT_FINAL')
  return createFromParts({
    blocks: input.content,
    model: input.model,
    stopReason: input.stopReason,
    stopSequence: input.stopSequence,
    usage: input.usage,
  })
}

export function decodeAnthropicNativeHistoryArtifactV1(value: unknown): AnthropicNativeHistoryArtifactV1 {
  const input = closedObject(
    value,
    ['artifactKind', 'artifactCodecVersion', 'providerKey', 'sourceApi', 'assistantMessage', 'model', 'stopReason', 'stopSequence', 'usage', 'artifactHash'],
    ['artifactKind', 'artifactCodecVersion', 'providerKey', 'sourceApi', 'assistantMessage', 'model', 'stopReason', 'stopSequence', 'usage', 'artifactHash'],
  )
  if (input.artifactKind !== ANTHROPIC_NATIVE_HISTORY_ARTIFACT_KIND_V1 ||
      input.artifactCodecVersion !== ANTHROPIC_NATIVE_HISTORY_CODEC_VERSION_V1 ||
      input.providerKey !== 'anthropic' || input.sourceApi !== 'anthropic_messages' ||
      typeof input.artifactHash !== 'string' || !/^[0-9a-f]{64}$/u.test(input.artifactHash)) {
    return fail('GENERATION_V2_ANTHROPIC_NATIVE_INVALID_VALUE')
  }
  const message = closedObject(input.assistantMessage, ['role', 'content'], ['role', 'content'])
  if (message.role !== 'assistant') return fail('GENERATION_V2_ANTHROPIC_NATIVE_INVALID_VALUE')
  const artifact = createFromParts({
    blocks: message.content,
    model: input.model,
    stopReason: input.stopReason,
    stopSequence: input.stopSequence,
    usage: input.usage,
  })
  if (artifact.artifactHash !== input.artifactHash) {
    return fail('GENERATION_V2_ANTHROPIC_NATIVE_HASH_MISMATCH')
  }
  return artifact
}

export function deserializeAnthropicNativeHistoryArtifactV1(canonicalJson: string): AnthropicNativeHistoryArtifactV1 {
  if (typeof canonicalJson !== 'string' || new TextEncoder().encode(canonicalJson).byteLength >
      ANTHROPIC_NATIVE_HISTORY_MAX_SERIALIZED_BYTES_V1) {
    return fail('GENERATION_V2_ANTHROPIC_NATIVE_LIMIT_EXCEEDED')
  }
  let raw: unknown
  try {
    raw = JSON.parse(canonicalJson)
  } catch {
    return fail('GENERATION_V2_ANTHROPIC_NATIVE_INVALID_SHAPE')
  }
  const artifact = decodeAnthropicNativeHistoryArtifactV1(raw)
  if (stableSerializeProviderRequestV2(artifact) !== canonicalJson) {
    return fail('GENERATION_V2_ANTHROPIC_NATIVE_NON_CANONICAL')
  }
  return artifact
}

export function isAnthropicNativeHistoryArtifactV1(value: unknown): value is AnthropicNativeHistoryArtifactV1 {
  if (!value || typeof value !== 'object' || !brandedArtifacts.has(value)) return false
  const artifact = value as AnthropicNativeHistoryArtifactV1
  const { artifactHash: _artifactHash, ...semantic } = artifact
  return artifact.artifactHash === sha256PreparedBytesV2(
    new TextEncoder().encode(stableSerializeProviderRequestV2(semantic)),
  )
}

export function hasPendingAnthropicToolUseBlocksV1(
  artifact: AnthropicNativeHistoryArtifactV1,
): boolean {
  return isAnthropicNativeHistoryArtifactV1(artifact) && artifact.stopReason === 'tool_use' &&
    artifact.assistantMessage.content.some((block) => block.type === 'tool_use')
}

export function serializeAnthropicNativeHistoryArtifactV1(artifact: AnthropicNativeHistoryArtifactV1): string {
  if (!isAnthropicNativeHistoryArtifactV1(artifact)) {
    return fail('GENERATION_V2_ANTHROPIC_NATIVE_UNBRANDED')
  }
  return stableSerializeProviderRequestV2(artifact)
}
