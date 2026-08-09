import { createHash } from 'node:crypto'
import { stableSerializeProviderRequestBoundedV2 } from '../../compiler/stableSerialize'
import { buildCompatibleChatRequest } from '../../../../shared/provider/openai-chat-compatible/request/buildCompatibleChatRequest'
import type { CompatibleRequestMessage } from '../../../../shared/provider/openai-chat-compatible/request/messageTypes'
import type { CompatibleHistoryReasoningReplay } from '../../../../shared/provider/openai-chat-compatible/request/buildCompatibleChatRequest'

const MAX_ARTIFACT_BYTES = 20 * 1024 * 1024
const validationProfile = Object.freeze({ schemaVersion: 1 as const, standardFieldOwnership: 'builder' as const,
  unsupportedFieldPolicy: 'error_before_fetch' as const, defaults: Object.freeze({}),
  extraBody: Object.freeze({ enabled: false, maxDepth: 1, maxKeys: 1, maxBytes: 1 }) })

export type OpenAIChatCompatibleNativeArtifactV2 = Readonly<{
  artifactCodecVersion: 2
  artifactKind: 'openai_chat_compatible_messages_v2'
  messages: readonly CompatibleRequestMessage[]
  reasoningReplay: readonly CompatibleHistoryReasoningReplay[]
  artifactHash: string
}>

export class OpenAIChatCompatibleNativeArtifactV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_OPENAI_COMPATIBLE_HISTORY_INVALID') { super(code); this.name = 'OpenAIChatCompatibleNativeArtifactV2Error' }
}
function fail(): never { throw new OpenAIChatCompatibleNativeArtifactV2Error('GENERATION_V2_OPENAI_COMPATIBLE_HISTORY_INVALID') }
function canonicalMessages(value: unknown): readonly CompatibleRequestMessage[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4096) return fail()
  try {
    const body = buildCompatibleChatRequest({ modelId: 'history-validation', messages: value as CompatibleRequestMessage[], stream: true,
      profile: validationProfile }).body as { messages?: unknown }
    if (!Array.isArray(body.messages)) return fail()
    return Object.freeze(body.messages.map((message) => Object.freeze(message as CompatibleRequestMessage)))
  } catch { return fail() }
}
function canonicalReplay(value: unknown, messages: readonly CompatibleRequestMessage[]): readonly CompatibleHistoryReasoningReplay[] {
  if (!Array.isArray(value) || value.length > messages.length) return fail()
  const seen = new Set<number>()
  const result = value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.getPrototypeOf(item) !== Object.prototype) return fail()
    const raw = item as Record<string, unknown>
    if (Object.keys(raw).sort().join('\0') !== 'assistantMessageIndex\0hasCompleteToolChain\0reasoning' ||
        !Number.isSafeInteger(raw.assistantMessageIndex) || (raw.assistantMessageIndex as number) < 0 ||
        (raw.assistantMessageIndex as number) >= messages.length || seen.has(raw.assistantMessageIndex as number) ||
        typeof raw.reasoning !== 'string' || raw.reasoning.length > 1_000_000 || typeof raw.hasCompleteToolChain !== 'boolean' ||
        messages[raw.assistantMessageIndex as number]?.role !== 'assistant') return fail()
    seen.add(raw.assistantMessageIndex as number)
    return Object.freeze({ assistantMessageIndex: raw.assistantMessageIndex as number, reasoning: raw.reasoning,
      hasCompleteToolChain: raw.hasCompleteToolChain as boolean })
  }).sort((left, right) => left.assistantMessageIndex - right.assistantMessageIndex)
  return Object.freeze(result)
}

export function createOpenAIChatCompatibleNativeArtifactV2(input: Readonly<{
  messages: readonly CompatibleRequestMessage[]
  reasoningReplay?: readonly CompatibleHistoryReasoningReplay[]
}>): OpenAIChatCompatibleNativeArtifactV2 {
  const messages = canonicalMessages(input.messages); const reasoningReplay = canonicalReplay(input.reasoningReplay ?? [], messages)
  const payload = Object.freeze({ artifactCodecVersion: 2 as const, artifactKind: 'openai_chat_compatible_messages_v2' as const, messages, reasoningReplay })
  const canonical = stableSerializeProviderRequestBoundedV2(payload, MAX_ARTIFACT_BYTES)
  return Object.freeze({ ...payload, artifactHash: createHash('sha256').update(canonical, 'utf8').digest('hex') })
}
export function decodeOpenAIChatCompatibleNativeArtifactV2(value: unknown): OpenAIChatCompatibleNativeArtifactV2 {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return fail()
  const input = value as Record<string, unknown>
  if (Object.keys(input).sort().join('\0') !== 'artifactCodecVersion\0artifactHash\0artifactKind\0messages\0reasoningReplay' ||
      input.artifactCodecVersion !== 2 || input.artifactKind !== 'openai_chat_compatible_messages_v2' || typeof input.artifactHash !== 'string') return fail()
  const decoded = createOpenAIChatCompatibleNativeArtifactV2({ messages: input.messages as CompatibleRequestMessage[], reasoningReplay: input.reasoningReplay as CompatibleHistoryReasoningReplay[] })
  if (decoded.artifactHash !== input.artifactHash) return fail()
  return decoded
}
