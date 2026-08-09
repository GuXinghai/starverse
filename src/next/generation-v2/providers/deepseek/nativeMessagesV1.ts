import { createHash } from 'node:crypto'
import { stableSerializeProviderRequestV2 } from '../../compiler/stableSerialize'

export const DEEPSEEK_NATIVE_HISTORY_ARTIFACT_KIND_V2 = 'deepseek_stable_ordered_native_messages_v2' as const
export const DEEPSEEK_NATIVE_HISTORY_CODEC_VERSION_V2 = 2 as const
export const DEEPSEEK_NATIVE_HISTORY_MAX_ENTRIES_V1 = 4_096
export const DEEPSEEK_NATIVE_HISTORY_MAX_TOOL_CALLS_V1 = 128
export const DEEPSEEK_NATIVE_HISTORY_MAX_STRING_BYTES_V1 = 4 * 1_024 * 1_024
export const DEEPSEEK_NATIVE_HISTORY_MAX_SERIALIZED_BYTES_V1 = 20 * 1_024 * 1_024

export type DeepSeekNativeFunctionToolCallV1 = Readonly<{
  id: string
  type: 'function'
  function: Readonly<{ name: string; arguments: string }>
}>

export type DeepSeekNativeSystemMessageV1 = Readonly<{
  role: 'system'
  content: string
  name?: string
}>

export type DeepSeekNativeUserMessageV1 = Readonly<{
  role: 'user'
  content: string
  name?: string
}>

export type DeepSeekNativeAssistantMessageV1 = Readonly<{
  role: 'assistant'
  content: string | null
  reasoning_content?: string | null
  tool_calls?: readonly DeepSeekNativeFunctionToolCallV1[]
}>

export type DeepSeekNativeToolMessageV1 = Readonly<{
  role: 'tool'
  content: string
  tool_call_id: string
}>

export type DeepSeekNativeMessageV1 =
  | DeepSeekNativeSystemMessageV1
  | DeepSeekNativeUserMessageV1
  | DeepSeekNativeAssistantMessageV1
  | DeepSeekNativeToolMessageV1

export type DeepSeekNativeHistoryEntryV1 = Readonly<
  | { kind: 'client'; message: DeepSeekNativeSystemMessageV1 | DeepSeekNativeUserMessageV1 | DeepSeekNativeToolMessageV1 }
  | { kind: 'assistant'; generatedWithThinking: 'enabled' | 'disabled'; message: DeepSeekNativeAssistantMessageV1 }
>

export type DeepSeekNativeHistoryArtifactV2 = Readonly<{
  schemaVersion: 2
  artifactKind: typeof DEEPSEEK_NATIVE_HISTORY_ARTIFACT_KIND_V2
  artifactCodecVersion: typeof DEEPSEEK_NATIVE_HISTORY_CODEC_VERSION_V2
  lineageDepth: number
  parentArtifactHash: string | null
  orderedEntries: readonly DeepSeekNativeHistoryEntryV1[]
  artifactHash: string
}>

export class DeepSeekNativeMessagesV1Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_DEEPSEEK_NATIVE_INVALID_SHAPE'
    | 'GENERATION_V2_DEEPSEEK_NATIVE_UNKNOWN_FIELD'
    | 'GENERATION_V2_DEEPSEEK_NATIVE_INVALID_VALUE'
    | 'GENERATION_V2_DEEPSEEK_NATIVE_LIMIT_EXCEEDED'
    | 'GENERATION_V2_DEEPSEEK_NATIVE_SEQUENCE_INVALID'
    | 'GENERATION_V2_DEEPSEEK_THINKING_REASONING_CONTENT_REQUIRED'
    | 'GENERATION_V2_DEEPSEEK_NATIVE_HASH_MISMATCH'
    | 'GENERATION_V2_DEEPSEEK_NATIVE_UNBRANDED') {
    super(code)
    this.name = 'DeepSeekNativeMessagesV1Error'
  }
}

type ClosedObject = Readonly<Record<string, unknown>>
const artifacts = new WeakSet<object>()

function closedObject(value: unknown, allowed: readonly string[], required: readonly string[]): ClosedObject {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new DeepSeekNativeMessagesV1Error('GENERATION_V2_DEEPSEEK_NATIVE_INVALID_SHAPE')
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined)) {
    throw new DeepSeekNativeMessagesV1Error('GENERATION_V2_DEEPSEEK_NATIVE_INVALID_SHAPE')
  }
  const keys = Object.keys(descriptors)
  if (keys.some((key) => !allowed.includes(key))) {
    throw new DeepSeekNativeMessagesV1Error('GENERATION_V2_DEEPSEEK_NATIVE_UNKNOWN_FIELD')
  }
  if (required.some((key) => !keys.includes(key))) {
    throw new DeepSeekNativeMessagesV1Error('GENERATION_V2_DEEPSEEK_NATIVE_INVALID_SHAPE')
  }
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, descriptors[key].value])))
}

function denseArray(value: unknown, max: number, allowEmpty = false): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype ||
      value.length > max || (!allowEmpty && value.length === 0)) {
    throw new DeepSeekNativeMessagesV1Error(
      Array.isArray(value) && value.length > max
        ? 'GENERATION_V2_DEEPSEEK_NATIVE_LIMIT_EXCEEDED'
        : 'GENERATION_V2_DEEPSEEK_NATIVE_INVALID_SHAPE',
    )
  }
  const expected = [...Array.from({ length: value.length }, (_, index) => String(index)), 'length']
  const keys = Reflect.ownKeys(value)
  if (keys.length !== expected.length || expected.some((key) => !keys.includes(key))) {
    throw new DeepSeekNativeMessagesV1Error('GENERATION_V2_DEEPSEEK_NATIVE_INVALID_SHAPE')
  }
  return Object.freeze(expected.slice(0, -1).map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined) {
      throw new DeepSeekNativeMessagesV1Error('GENERATION_V2_DEEPSEEK_NATIVE_INVALID_SHAPE')
    }
    return descriptor.value
  }))
}

function stringValue(value: unknown, identifier = false): string {
  if (typeof value !== 'string' || new TextEncoder().encode(value).byteLength > DEEPSEEK_NATIVE_HISTORY_MAX_STRING_BYTES_V1 ||
      (identifier && (value.length === 0 || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)))) {
    throw new DeepSeekNativeMessagesV1Error(
      typeof value === 'string' && new TextEncoder().encode(value).byteLength > DEEPSEEK_NATIVE_HISTORY_MAX_STRING_BYTES_V1
        ? 'GENERATION_V2_DEEPSEEK_NATIVE_LIMIT_EXCEEDED'
        : 'GENERATION_V2_DEEPSEEK_NATIVE_INVALID_VALUE',
    )
  }
  return value
}

function optionalName(input: ClosedObject): Readonly<{ name?: string }> {
  return input.name === undefined ? Object.freeze({}) : Object.freeze({ name: stringValue(input.name, true) })
}

function decodeToolCall(value: unknown): DeepSeekNativeFunctionToolCallV1 {
  const input = closedObject(value, ['id', 'type', 'function'], ['id', 'type', 'function'])
  const fn = closedObject(input.function, ['name', 'arguments'], ['name', 'arguments'])
  if (input.type !== 'function') throw new DeepSeekNativeMessagesV1Error('GENERATION_V2_DEEPSEEK_NATIVE_INVALID_VALUE')
  return Object.freeze({
    id: stringValue(input.id, true),
    type: 'function',
    function: Object.freeze({ name: stringValue(fn.name, true), arguments: stringValue(fn.arguments) }),
  })
}

export function decodeDeepSeekNativeMessageV1(value: unknown): DeepSeekNativeMessageV1 {
  const discriminator = closedObject(
    value,
    ['role', 'content', 'name', 'reasoning_content', 'tool_calls', 'tool_call_id'],
    ['role', 'content'],
  )
  if (discriminator.role === 'system' || discriminator.role === 'user') {
    const input = closedObject(value, ['role', 'content', 'name'], ['role', 'content'])
    return Object.freeze({
      role: discriminator.role,
      content: stringValue(input.content),
      ...optionalName(input),
    })
  }
  if (discriminator.role === 'tool') {
    const input = closedObject(value, ['role', 'content', 'tool_call_id'], ['role', 'content', 'tool_call_id'])
    return Object.freeze({ role: 'tool', content: stringValue(input.content), tool_call_id: stringValue(input.tool_call_id, true) })
  }
  if (discriminator.role === 'assistant') {
    const input = closedObject(
      value,
      ['role', 'content', 'reasoning_content', 'tool_calls'],
      ['role', 'content'],
    )
    if (input.content !== null && typeof input.content !== 'string') {
      throw new DeepSeekNativeMessagesV1Error('GENERATION_V2_DEEPSEEK_NATIVE_INVALID_VALUE')
    }
    if (input.reasoning_content !== undefined && input.reasoning_content !== null && typeof input.reasoning_content !== 'string') {
      throw new DeepSeekNativeMessagesV1Error('GENERATION_V2_DEEPSEEK_NATIVE_INVALID_VALUE')
    }
    const toolCalls = input.tool_calls === undefined
      ? undefined
      : Object.freeze(denseArray(input.tool_calls, DEEPSEEK_NATIVE_HISTORY_MAX_TOOL_CALLS_V1).map(decodeToolCall))
    if (toolCalls && new Set(toolCalls.map((call) => call.id)).size !== toolCalls.length) {
      throw new DeepSeekNativeMessagesV1Error('GENERATION_V2_DEEPSEEK_NATIVE_SEQUENCE_INVALID')
    }
    return Object.freeze({
      role: 'assistant',
      content: input.content === null ? null : stringValue(input.content),
      ...(input.reasoning_content !== undefined
        ? { reasoning_content: input.reasoning_content === null ? null : stringValue(input.reasoning_content) }
        : {}),
      ...(toolCalls ? { tool_calls: toolCalls } : {}),
    })
  }
  throw new DeepSeekNativeMessagesV1Error('GENERATION_V2_DEEPSEEK_NATIVE_INVALID_VALUE')
}

function decodeEntry(value: unknown): DeepSeekNativeHistoryEntryV1 {
  const input = closedObject(value, ['kind', 'generatedWithThinking', 'message'], ['kind', 'message'])
  const message = decodeDeepSeekNativeMessageV1(input.message)
  if (input.kind === 'client') {
    if (input.generatedWithThinking !== undefined || message.role === 'assistant') {
      throw new DeepSeekNativeMessagesV1Error('GENERATION_V2_DEEPSEEK_NATIVE_INVALID_VALUE')
    }
    return Object.freeze({ kind: 'client', message }) as DeepSeekNativeHistoryEntryV1
  }
  if (input.kind === 'assistant' && message.role === 'assistant' &&
      (input.generatedWithThinking === 'enabled' || input.generatedWithThinking === 'disabled')) {
    if (input.generatedWithThinking === 'enabled' && message.tool_calls &&
        (typeof message.reasoning_content !== 'string' || message.reasoning_content.length === 0)) {
      throw new DeepSeekNativeMessagesV1Error('GENERATION_V2_DEEPSEEK_THINKING_REASONING_CONTENT_REQUIRED')
    }
    return Object.freeze({ kind: 'assistant', generatedWithThinking: input.generatedWithThinking, message })
  }
  throw new DeepSeekNativeMessagesV1Error('GENERATION_V2_DEEPSEEK_NATIVE_INVALID_VALUE')
}

function decodeEntries(value: unknown): readonly DeepSeekNativeHistoryEntryV1[] {
  return Object.freeze(denseArray(value, DEEPSEEK_NATIVE_HISTORY_MAX_ENTRIES_V1, true).map(decodeEntry))
}

function validateSequence(entries: readonly DeepSeekNativeHistoryEntryV1[], requireSettled: boolean): void {
  const allCallIds = new Set<string>()
  let pending: string[] = []
  for (const entry of entries) {
    const message = entry.message
    if (message.role === 'tool') {
      if (pending.shift() !== message.tool_call_id) {
        throw new DeepSeekNativeMessagesV1Error('GENERATION_V2_DEEPSEEK_NATIVE_SEQUENCE_INVALID')
      }
      continue
    }
    if (pending.length > 0) throw new DeepSeekNativeMessagesV1Error('GENERATION_V2_DEEPSEEK_NATIVE_SEQUENCE_INVALID')
    if (message.role === 'assistant' && message.tool_calls) {
      for (const call of message.tool_calls) {
        if (allCallIds.has(call.id)) throw new DeepSeekNativeMessagesV1Error('GENERATION_V2_DEEPSEEK_NATIVE_SEQUENCE_INVALID')
        allCallIds.add(call.id)
      }
      pending = message.tool_calls.map((call) => call.id)
    }
  }
  if (requireSettled && pending.length > 0) {
    throw new DeepSeekNativeMessagesV1Error('GENERATION_V2_DEEPSEEK_NATIVE_SEQUENCE_INVALID')
  }
}

function safeLineageDepth(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new DeepSeekNativeMessagesV1Error('GENERATION_V2_DEEPSEEK_NATIVE_INVALID_VALUE')
  }
  return value as number
}

function parentArtifactHash(value: unknown): string | null {
  if (value !== null && (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value))) {
    throw new DeepSeekNativeMessagesV1Error('GENERATION_V2_DEEPSEEK_NATIVE_INVALID_VALUE')
  }
  return value
}

function projection(
  lineageDepth: number,
  parentHash: string | null,
  orderedEntries: readonly DeepSeekNativeHistoryEntryV1[],
) {
  return Object.freeze({
    schemaVersion: 2 as const,
    artifactKind: DEEPSEEK_NATIVE_HISTORY_ARTIFACT_KIND_V2,
    artifactCodecVersion: DEEPSEEK_NATIVE_HISTORY_CODEC_VERSION_V2,
    lineageDepth,
    parentArtifactHash: parentHash,
    orderedEntries,
  })
}

function hashProjection(value: ReturnType<typeof projection>): string {
  return createHash('sha256').update(stableSerializeProviderRequestV2(value), 'utf8').digest('hex')
}

function createArtifact(
  lineageDepth: unknown,
  rawParentArtifactHash: unknown,
  rawEntries: unknown,
): DeepSeekNativeHistoryArtifactV2 {
  const depth = safeLineageDepth(lineageDepth)
  const parentHash = parentArtifactHash(rawParentArtifactHash)
  const entries = decodeEntries(rawEntries)
  if ((depth === 0 && (parentHash !== null || entries.length !== 0)) ||
      (depth === 1 && parentHash !== null) ||
      (depth > 1 && parentHash === null)) {
    throw new DeepSeekNativeMessagesV1Error('GENERATION_V2_DEEPSEEK_NATIVE_SEQUENCE_INVALID')
  }
  validateSequence(entries, false)
  const semantic = projection(depth, parentHash, entries)
  const artifact = Object.freeze({ ...semantic, artifactHash: hashProjection(semantic) })
  if (new TextEncoder().encode(stableSerializeProviderRequestV2(artifact)).byteLength > DEEPSEEK_NATIVE_HISTORY_MAX_SERIALIZED_BYTES_V1) {
    throw new DeepSeekNativeMessagesV1Error('GENERATION_V2_DEEPSEEK_NATIVE_LIMIT_EXCEEDED')
  }
  artifacts.add(artifact)
  return artifact
}

export function createDeepSeekNativeHistoryArtifactV2(input: Readonly<{
  lineageDepth: unknown
  parentArtifactHash: unknown
  orderedEntries: unknown
}>): DeepSeekNativeHistoryArtifactV2 {
  return createArtifact(input.lineageDepth, input.parentArtifactHash, input.orderedEntries)
}

export function decodeDeepSeekNativeHistoryArtifactV2(value: unknown): DeepSeekNativeHistoryArtifactV2 {
  const input = closedObject(
    value,
    ['schemaVersion', 'artifactKind', 'artifactCodecVersion', 'lineageDepth', 'parentArtifactHash', 'orderedEntries', 'artifactHash'],
    ['schemaVersion', 'artifactKind', 'artifactCodecVersion', 'lineageDepth', 'parentArtifactHash', 'orderedEntries', 'artifactHash'],
  )
  if (input.schemaVersion !== 2 || input.artifactKind !== DEEPSEEK_NATIVE_HISTORY_ARTIFACT_KIND_V2 ||
      input.artifactCodecVersion !== DEEPSEEK_NATIVE_HISTORY_CODEC_VERSION_V2 ||
      typeof input.artifactHash !== 'string' || !/^[0-9a-f]{64}$/u.test(input.artifactHash)) {
    throw new DeepSeekNativeMessagesV1Error('GENERATION_V2_DEEPSEEK_NATIVE_INVALID_VALUE')
  }
  const artifact = createArtifact(input.lineageDepth, input.parentArtifactHash, input.orderedEntries)
  if (artifact.artifactHash !== input.artifactHash) {
    throw new DeepSeekNativeMessagesV1Error('GENERATION_V2_DEEPSEEK_NATIVE_HASH_MISMATCH')
  }
  return artifact
}

export function isDeepSeekNativeHistoryArtifactV2(value: unknown): value is DeepSeekNativeHistoryArtifactV2 {
  if (!value || typeof value !== 'object' || !artifacts.has(value)) return false
  const artifact = value as DeepSeekNativeHistoryArtifactV2
  return artifact.artifactHash === hashProjection(
    projection(artifact.lineageDepth, artifact.parentArtifactHash, artifact.orderedEntries),
  )
}

export function hasPendingDeepSeekAssistantToolCallsV2(
  artifact: DeepSeekNativeHistoryArtifactV2,
): boolean {
  if (!isDeepSeekNativeHistoryArtifactV2(artifact)) return false
  const entry = artifact.orderedEntries.at(-1)
  return Boolean(entry?.kind === 'assistant' && entry.message.role === 'assistant' &&
    Array.isArray(entry.message.tool_calls) && entry.message.tool_calls.length > 0)
}

function requireArtifact(value: DeepSeekNativeHistoryArtifactV2 | null): DeepSeekNativeHistoryArtifactV2 | null {
  if (value !== null && !isDeepSeekNativeHistoryArtifactV2(value)) {
    throw new DeepSeekNativeMessagesV1Error('GENERATION_V2_DEEPSEEK_NATIVE_UNBRANDED')
  }
  return value
}

export function buildDeepSeekNativeRequestHistoryV2(input: Readonly<{
  priorArtifact: DeepSeekNativeHistoryArtifactV2 | null
  clientEntries: unknown
}>): readonly DeepSeekNativeMessageV1[] {
  const prior = requireArtifact(input.priorArtifact)
  const clientEntries = decodeEntries(input.clientEntries)
  if (clientEntries.some((entry) => entry.kind !== 'client')) {
    throw new DeepSeekNativeMessagesV1Error('GENERATION_V2_DEEPSEEK_NATIVE_INVALID_VALUE')
  }
  const entries = Object.freeze([...(prior?.orderedEntries ?? []), ...clientEntries])
  if (entries.length > DEEPSEEK_NATIVE_HISTORY_MAX_ENTRIES_V1) {
    throw new DeepSeekNativeMessagesV1Error('GENERATION_V2_DEEPSEEK_NATIVE_LIMIT_EXCEEDED')
  }
  validateSequence(entries, true)
  return Object.freeze(entries.map((entry) => entry.message))
}

export function buildDeepSeekProjectedNativeRequestHistoryV2(input: Readonly<{
  replayEntries: unknown
}>): readonly DeepSeekNativeMessageV1[] {
  const entries = decodeEntries(input.replayEntries)
  if (entries.length > DEEPSEEK_NATIVE_HISTORY_MAX_ENTRIES_V1) {
    throw new DeepSeekNativeMessagesV1Error('GENERATION_V2_DEEPSEEK_NATIVE_LIMIT_EXCEEDED')
  }
  validateSequence(entries, true)
  return Object.freeze(entries.map((entry) => entry.message))
}

export function completeDeepSeekNativeRequestV2(input: Readonly<{
  priorArtifact: DeepSeekNativeHistoryArtifactV2 | null
  clientEntries: unknown
  assistantMessage: unknown
  generatedWithThinking: 'enabled' | 'disabled'
}>): DeepSeekNativeHistoryArtifactV2 {
  const prior = requireArtifact(input.priorArtifact)
  const clientEntries = decodeEntries(input.clientEntries)
  if (clientEntries.some((entry) => entry.kind !== 'client')) {
    throw new DeepSeekNativeMessagesV1Error('GENERATION_V2_DEEPSEEK_NATIVE_INVALID_VALUE')
  }
  const assistant = decodeEntry({
    kind: 'assistant', generatedWithThinking: input.generatedWithThinking, message: input.assistantMessage,
  })
  return createArtifact(
    (prior?.lineageDepth ?? 0) + 1,
    prior?.artifactHash ?? null,
    [...(prior?.orderedEntries ?? []), ...clientEntries, assistant],
  )
}

export function completeDeepSeekProjectedNativeRequestV2(input: Readonly<{
  projectedPrefixEntries: unknown
  clientEntries: unknown
  assistantMessage: unknown
  generatedWithThinking: 'enabled' | 'disabled'
}>): DeepSeekNativeHistoryArtifactV2 {
  const prefix = decodeEntries(input.projectedPrefixEntries)
  const clientEntries = decodeEntries(input.clientEntries)
  if (clientEntries.some((entry) => entry.kind !== 'client')) {
    throw new DeepSeekNativeMessagesV1Error('GENERATION_V2_DEEPSEEK_NATIVE_INVALID_VALUE')
  }
  const assistant = decodeEntry({
    kind: 'assistant', generatedWithThinking: input.generatedWithThinking, message: input.assistantMessage,
  })
  return createArtifact(1, null, [...prefix, ...clientEntries, assistant])
}

export function serializeDeepSeekNativeHistoryArtifactV2(artifact: DeepSeekNativeHistoryArtifactV2): string {
  if (!isDeepSeekNativeHistoryArtifactV2(artifact)) {
    throw new DeepSeekNativeMessagesV1Error('GENERATION_V2_DEEPSEEK_NATIVE_UNBRANDED')
  }
  return stableSerializeProviderRequestV2(artifact)
}
