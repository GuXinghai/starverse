import { createHash } from 'node:crypto'
import { stableSerializeProviderRequestBoundedV2 } from '../../compiler/stableSerialize'

export type OllamaNativeToolCallV1 = Readonly<{ function: Readonly<{ name: string; arguments: Readonly<Record<string, unknown>> }> }>
export type OllamaNativeChatMessageV1 = Readonly<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string;
  thinking?: string; tool_calls?: readonly OllamaNativeToolCallV1[] }>
export type OllamaNativeChatArtifactV1 = Readonly<{ artifactCodecVersion: 1; artifactKind: 'ollama_chat_native_messages';
  messages: readonly OllamaNativeChatMessageV1[]; artifactHash: string }>

function jsonObject(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error('GENERATION_V2_OLLAMA_HISTORY_INVALID')
  return Object.freeze(JSON.parse(stableSerializeProviderRequestBoundedV2(value, 1024 * 1024)) as Record<string, unknown>)
}
function message(value: unknown): OllamaNativeChatMessageV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error('GENERATION_V2_OLLAMA_HISTORY_INVALID')
  const input = value as Record<string, unknown>; if (Object.keys(input).some((key) => !['role','content','thinking','tool_calls'].includes(key)) ||
      (input.role !== 'system' && input.role !== 'user' && input.role !== 'assistant' && input.role !== 'tool') || typeof input.content !== 'string' ||
      input.thinking !== undefined && typeof input.thinking !== 'string') throw new Error('GENERATION_V2_OLLAMA_HISTORY_INVALID')
  let toolCalls: readonly OllamaNativeToolCallV1[] | undefined
  if (input.tool_calls !== undefined) {
    if (!Array.isArray(input.tool_calls) || input.tool_calls.length === 0 || input.role !== 'assistant') throw new Error('GENERATION_V2_OLLAMA_HISTORY_INVALID')
    toolCalls = Object.freeze(input.tool_calls.map((raw) => { const row = jsonObject(raw); const fn = jsonObject(row.function)
      if (Object.keys(row).join('\0') !== 'function' || Object.keys(fn).sort().join('\0') !== 'arguments\0name' || typeof fn.name !== 'string') throw new Error('GENERATION_V2_OLLAMA_HISTORY_INVALID')
      return Object.freeze({ function: Object.freeze({ name: fn.name, arguments: jsonObject(fn.arguments) }) }) }))
  }
  return Object.freeze({ role: input.role, content: input.content, ...(input.thinking === undefined ? {} : { thinking: input.thinking }),
    ...(toolCalls === undefined ? {} : { tool_calls: toolCalls }) })
}
export function createOllamaNativeChatArtifactV1(messagesValue: readonly OllamaNativeChatMessageV1[]): OllamaNativeChatArtifactV1 {
  if (!Array.isArray(messagesValue) || messagesValue.length === 0 || messagesValue.length > 4096) throw new Error('GENERATION_V2_OLLAMA_HISTORY_INVALID')
  const messages = Object.freeze(messagesValue.map(message)); const payload = { artifactCodecVersion: 1 as const, artifactKind: 'ollama_chat_native_messages' as const, messages }
  const canonical = stableSerializeProviderRequestBoundedV2(payload, 20 * 1024 * 1024)
  return Object.freeze({ ...payload, artifactHash: createHash('sha256').update(canonical, 'utf8').digest('hex') })
}
export function decodeOllamaNativeChatArtifactV1(value: unknown): OllamaNativeChatArtifactV1 {
  const input = jsonObject(value)
  if (input.artifactCodecVersion !== 1 || input.artifactKind !== 'ollama_chat_native_messages' || !Array.isArray(input.messages) || typeof input.artifactHash !== 'string') throw new Error('GENERATION_V2_OLLAMA_HISTORY_INVALID')
  const decoded = createOllamaNativeChatArtifactV1(input.messages as OllamaNativeChatMessageV1[])
  if (decoded.artifactHash !== input.artifactHash) throw new Error('GENERATION_V2_OLLAMA_HISTORY_INVALID')
  return decoded
}
export function buildOllamaNativeChatRequestHistoryV1(input: Readonly<{
  replayMessages: readonly OllamaNativeChatMessageV1[]
}>): readonly OllamaNativeChatMessageV1[] {
  if (!Array.isArray(input.replayMessages) || input.replayMessages.at(-1)?.role !== 'user') {
    throw new Error('GENERATION_V2_OLLAMA_HISTORY_INVALID')
  }
  return createOllamaNativeChatArtifactV1(input.replayMessages).messages
}
