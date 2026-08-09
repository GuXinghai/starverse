import { createHash } from 'node:crypto'
import { stableSerializeProviderRequestV2 } from '../../compiler/stableSerialize'

/**
 * Lossless OpenRouter Chat continuation artifact.  The assistant message is
 * retained as provider-native JSON, including `reasoning_details`, `tool_calls`
 * and annotations.  Nothing in this module reads presentation projections.
 */
export const OPENROUTER_NATIVE_HISTORY_ARTIFACT_KIND_V1 =
  'openrouter_chat_ordered_native_messages_v1' as const

export type OpenRouterNativeMessageV1 = Readonly<Record<string, unknown>>
export type OpenRouterNativeHistoryArtifactV1 = Readonly<{
  schemaVersion: 1
  artifactKind: typeof OPENROUTER_NATIVE_HISTORY_ARTIFACT_KIND_V1
  lineageDepth: number
  parentArtifactHash: string | null
  orderedMessages: readonly OpenRouterNativeMessageV1[]
  artifactHash: string
}>

export class OpenRouterNativeMessagesV1Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENROUTER_NATIVE_HISTORY_INVALID'
    | 'GENERATION_V2_OPENROUTER_NATIVE_HISTORY_LIMIT'
    | 'GENERATION_V2_OPENROUTER_NATIVE_HISTORY_HASH_MISMATCH'
    | 'GENERATION_V2_OPENROUTER_NATIVE_HISTORY_UNBRANDED') {
    super(code)
    this.name = 'OpenRouterNativeMessagesV1Error'
  }
}

const branded = new WeakSet<object>()
const MAX_MESSAGES = 4_096
const MAX_BYTES = 20 * 1024 * 1024

function cloneNativeMessage(value: unknown): OpenRouterNativeMessageV1 {
  try {
    const encoded = stableSerializeProviderRequestV2(value)
    if (new TextEncoder().encode(encoded).byteLength > MAX_BYTES) {
      throw new OpenRouterNativeMessagesV1Error('GENERATION_V2_OPENROUTER_NATIVE_HISTORY_LIMIT')
    }
    const parsed = JSON.parse(encoded)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) ||
        typeof (parsed as Record<string, unknown>).role !== 'string') {
      throw new OpenRouterNativeMessagesV1Error('GENERATION_V2_OPENROUTER_NATIVE_HISTORY_INVALID')
    }
    return Object.freeze(parsed as Record<string, unknown>)
  } catch (error) {
    if (error instanceof OpenRouterNativeMessagesV1Error) throw error
    throw new OpenRouterNativeMessagesV1Error('GENERATION_V2_OPENROUTER_NATIVE_HISTORY_INVALID')
  }
}

function canonicalMessages(value: unknown): readonly OpenRouterNativeMessageV1[] {
  if (!Array.isArray(value) || value.length > MAX_MESSAGES) {
    throw new OpenRouterNativeMessagesV1Error('GENERATION_V2_OPENROUTER_NATIVE_HISTORY_LIMIT')
  }
  return Object.freeze(value.map(cloneNativeMessage))
}

function createArtifact(
  lineageDepth: unknown,
  parentArtifactHash: unknown,
  orderedMessages: unknown,
): OpenRouterNativeHistoryArtifactV1 {
  if (!Number.isSafeInteger(lineageDepth) || (lineageDepth as number) < 0 ||
      (parentArtifactHash !== null && (typeof parentArtifactHash !== 'string' || !/^[a-f0-9]{64}$/u.test(parentArtifactHash)))) {
    throw new OpenRouterNativeMessagesV1Error('GENERATION_V2_OPENROUTER_NATIVE_HISTORY_INVALID')
  }
  const messages = canonicalMessages(orderedMessages)
  if (((lineageDepth as number) === 0 && (parentArtifactHash !== null || messages.length !== 0)) ||
      ((lineageDepth as number) === 1 && parentArtifactHash !== null) ||
      ((lineageDepth as number) > 1 && parentArtifactHash === null)) {
    throw new OpenRouterNativeMessagesV1Error('GENERATION_V2_OPENROUTER_NATIVE_HISTORY_INVALID')
  }
  const projection = Object.freeze({
    schemaVersion: 1 as const,
    artifactKind: OPENROUTER_NATIVE_HISTORY_ARTIFACT_KIND_V1,
    lineageDepth: lineageDepth as number,
    parentArtifactHash: parentArtifactHash as string | null,
    orderedMessages: messages,
  })
  const encoded = stableSerializeProviderRequestV2(projection)
  if (new TextEncoder().encode(encoded).byteLength > MAX_BYTES) {
    throw new OpenRouterNativeMessagesV1Error('GENERATION_V2_OPENROUTER_NATIVE_HISTORY_LIMIT')
  }
  const artifact = Object.freeze({
    ...projection,
    artifactHash: createHash('sha256').update(encoded, 'utf8').digest('hex'),
  })
  branded.add(artifact)
  return artifact
}

export function createOpenRouterNativeHistoryArtifactV1(input: Readonly<{
  lineageDepth: unknown
  parentArtifactHash: unknown
  orderedMessages: unknown
}>): OpenRouterNativeHistoryArtifactV1 {
  return createArtifact(input.lineageDepth, input.parentArtifactHash, input.orderedMessages)
}

export function decodeOpenRouterNativeHistoryArtifactV1(value: unknown): OpenRouterNativeHistoryArtifactV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new OpenRouterNativeMessagesV1Error('GENERATION_V2_OPENROUTER_NATIVE_HISTORY_INVALID')
  }
  const input = value as Record<string, unknown>
  if (input.schemaVersion !== 1 || input.artifactKind !== OPENROUTER_NATIVE_HISTORY_ARTIFACT_KIND_V1 ||
      typeof input.artifactHash !== 'string') {
    throw new OpenRouterNativeMessagesV1Error('GENERATION_V2_OPENROUTER_NATIVE_HISTORY_INVALID')
  }
  const decoded = createArtifact(input.lineageDepth, input.parentArtifactHash, input.orderedMessages)
  if (decoded.artifactHash !== input.artifactHash) {
    throw new OpenRouterNativeMessagesV1Error('GENERATION_V2_OPENROUTER_NATIVE_HISTORY_HASH_MISMATCH')
  }
  return decoded
}

export function isOpenRouterNativeHistoryArtifactV1(value: unknown): value is OpenRouterNativeHistoryArtifactV1 {
  return Boolean(value && typeof value === 'object' && branded.has(value))
}

export function hasCompleteOpenRouterAssistantToolCallsV1(
  artifact: OpenRouterNativeHistoryArtifactV1,
): boolean {
  if (!isOpenRouterNativeHistoryArtifactV1(artifact)) return false
  const assistant = artifact.orderedMessages.at(-1)
  if (!assistant || assistant.role !== 'assistant' || !Array.isArray(assistant.tool_calls) ||
      assistant.tool_calls.length === 0) return false
  return assistant.tool_calls.every((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false
    const call = value as Record<string, unknown>
    const fn = call.function
    return typeof call.id === 'string' && call.id.length > 0 && call.type === 'function' &&
      Boolean(fn && typeof fn === 'object' && !Array.isArray(fn) &&
        typeof (fn as Record<string, unknown>).name === 'string' &&
        ((fn as Record<string, unknown>).name as string).length > 0 &&
        typeof (fn as Record<string, unknown>).arguments === 'string')
  })
}

export function buildOpenRouterNativeRequestHistoryV1(input: Readonly<{
  priorArtifact: OpenRouterNativeHistoryArtifactV1 | null
  clientMessages: unknown
}>): readonly OpenRouterNativeMessageV1[] {
  if (input.priorArtifact !== null && !isOpenRouterNativeHistoryArtifactV1(input.priorArtifact)) {
    throw new OpenRouterNativeMessagesV1Error('GENERATION_V2_OPENROUTER_NATIVE_HISTORY_UNBRANDED')
  }
  const client = canonicalMessages(input.clientMessages)
  const all = Object.freeze([...(input.priorArtifact?.orderedMessages ?? []), ...client])
  if (all.length === 0 || all.length > MAX_MESSAGES) {
    throw new OpenRouterNativeMessagesV1Error('GENERATION_V2_OPENROUTER_NATIVE_HISTORY_INVALID')
  }
  return all
}

export function buildOpenRouterProjectedNativeRequestHistoryV1(input: Readonly<{
  replayMessages: unknown
}>): readonly OpenRouterNativeMessageV1[] {
  const messages = canonicalMessages(input.replayMessages)
  if (messages.length === 0) {
    throw new OpenRouterNativeMessagesV1Error('GENERATION_V2_OPENROUTER_NATIVE_HISTORY_INVALID')
  }
  return messages
}

export function completeOpenRouterNativeHistoryV1(input: Readonly<{
  priorArtifact: OpenRouterNativeHistoryArtifactV1 | null
  clientMessages: unknown
  assistantMessage: unknown
}>): OpenRouterNativeHistoryArtifactV1 {
  const history = buildOpenRouterNativeRequestHistoryV1(input)
  const assistant = cloneNativeMessage(input.assistantMessage)
  if (assistant.role !== 'assistant') {
    throw new OpenRouterNativeMessagesV1Error('GENERATION_V2_OPENROUTER_NATIVE_HISTORY_INVALID')
  }
  return createArtifact(
    (input.priorArtifact?.lineageDepth ?? 0) + 1,
    input.priorArtifact?.artifactHash ?? null,
    [...history, assistant],
  )
}

export function completeOpenRouterProjectedNativeHistoryV1(input: Readonly<{
  projectedPrefixMessages: unknown
  clientMessages: unknown
  assistantMessage: unknown
}>): OpenRouterNativeHistoryArtifactV1 {
  const prefix = canonicalMessages(input.projectedPrefixMessages)
  const client = canonicalMessages(input.clientMessages)
  const assistant = cloneNativeMessage(input.assistantMessage)
  if (assistant.role !== 'assistant') {
    throw new OpenRouterNativeMessagesV1Error('GENERATION_V2_OPENROUTER_NATIVE_HISTORY_INVALID')
  }
  return createArtifact(1, null, [...prefix, ...client, assistant])
}
