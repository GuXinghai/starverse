import { createHash } from 'node:crypto'
import { stableSerializeProviderRequestBoundedV2 } from '../../compiler/stableSerialize'

export type GenericLocalOpenAIChatMessageV1 =
  | Readonly<{ role: 'system' | 'user'; content: string }>
  | Readonly<{ role: 'assistant'; content: string | null }>

export type GenericLocalOpenAIChatArtifactV1 = Readonly<{
  artifactCodecVersion: 1
  artifactKind: 'generic_local_openai_chat_messages'
  messages: readonly GenericLocalOpenAIChatMessageV1[]
  artifactHash: string
}>

const MAX_ARTIFACT_BYTES = 20 * 1024 * 1024

function message(value: unknown): GenericLocalOpenAIChatMessageV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error('GENERATION_V2_GENERIC_LOCAL_HISTORY_INVALID')
  }
  const input = value as Record<string, unknown>
  const keys = Object.keys(input).sort().join('\0')
  if (keys !== 'content\0role' || (input.role !== 'system' && input.role !== 'user' && input.role !== 'assistant') ||
      (input.role === 'assistant' ? input.content !== null && typeof input.content !== 'string' : typeof input.content !== 'string')) {
    throw new Error('GENERATION_V2_GENERIC_LOCAL_HISTORY_INVALID')
  }
  return Object.freeze({ role: input.role, content: input.content } as GenericLocalOpenAIChatMessageV1)
}

export function createGenericLocalOpenAIChatArtifactV1(
  messagesValue: readonly GenericLocalOpenAIChatMessageV1[],
): GenericLocalOpenAIChatArtifactV1 {
  if (!Array.isArray(messagesValue) || messagesValue.length === 0 || messagesValue.length > 4096) {
    throw new Error('GENERATION_V2_GENERIC_LOCAL_HISTORY_INVALID')
  }
  const messages = Object.freeze(messagesValue.map(message))
  const payload = { artifactCodecVersion: 1 as const, artifactKind: 'generic_local_openai_chat_messages' as const, messages }
  const canonical = stableSerializeProviderRequestBoundedV2(payload, MAX_ARTIFACT_BYTES)
  return Object.freeze({ ...payload, artifactHash: createHash('sha256').update(canonical, 'utf8').digest('hex') })
}

export function decodeGenericLocalOpenAIChatArtifactV1(value: unknown): GenericLocalOpenAIChatArtifactV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error('GENERATION_V2_GENERIC_LOCAL_HISTORY_INVALID')
  }
  const input = value as Record<string, unknown>
  if (Object.keys(input).sort().join('\0') !== 'artifactCodecVersion\0artifactHash\0artifactKind\0messages' ||
      input.artifactCodecVersion !== 1 || input.artifactKind !== 'generic_local_openai_chat_messages' ||
      typeof input.artifactHash !== 'string' || !Array.isArray(input.messages)) {
    throw new Error('GENERATION_V2_GENERIC_LOCAL_HISTORY_INVALID')
  }
  const decoded = createGenericLocalOpenAIChatArtifactV1(input.messages as GenericLocalOpenAIChatMessageV1[])
  if (decoded.artifactHash !== input.artifactHash) throw new Error('GENERATION_V2_GENERIC_LOCAL_HISTORY_INVALID')
  return decoded
}

export function buildGenericLocalOpenAIChatRequestHistoryV1(input: Readonly<{
  priorArtifact: GenericLocalOpenAIChatArtifactV1 | null
  systemBody?: string | null
  userBody: string
}>): readonly GenericLocalOpenAIChatMessageV1[] {
  if (typeof input.userBody !== 'string' || input.userBody.trim().length === 0) {
    throw new Error('GENERATION_V2_GENERIC_LOCAL_HISTORY_INVALID')
  }
  const messages: GenericLocalOpenAIChatMessageV1[] = input.priorArtifact ? [...input.priorArtifact.messages] : []
  if (!input.priorArtifact && input.systemBody) messages.push(Object.freeze({ role: 'system', content: input.systemBody }))
  messages.push(Object.freeze({ role: 'user', content: input.userBody }))
  return createGenericLocalOpenAIChatArtifactV1(messages).messages
}
