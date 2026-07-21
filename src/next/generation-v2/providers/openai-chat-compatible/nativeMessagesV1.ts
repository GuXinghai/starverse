import { createHash } from 'node:crypto'
import { stableSerializeProviderRequestBoundedV2 } from '../../compiler/stableSerialize'
import { buildCompatibleChatRequest } from '../../../../shared/provider/openai-chat-compatible/request/buildCompatibleChatRequest'
import type { CompatibleRequestMessage } from '../../../../shared/provider/openai-chat-compatible/request/messageTypes'

const MAX_ARTIFACT_BYTES = 20 * 1024 * 1024
const validationProfile = Object.freeze({ schemaVersion: 1 as const, standardFieldOwnership: 'builder' as const,
  unsupportedFieldPolicy: 'error_before_fetch' as const, defaults: Object.freeze({}),
  extraBody: Object.freeze({ enabled: false, maxDepth: 1, maxKeys: 1, maxBytes: 1 }) })

export type OpenAIChatCompatibleNativeArtifactV1 = Readonly<{
  artifactCodecVersion: 1
  artifactKind: 'openai_chat_compatible_messages'
  messages: readonly CompatibleRequestMessage[]
  artifactHash: string
}>

export class OpenAIChatCompatibleNativeArtifactV1Error extends Error {
  constructor(readonly code: 'GENERATION_V2_OPENAI_COMPATIBLE_HISTORY_INVALID') {
    super(code)
    this.name = 'OpenAIChatCompatibleNativeArtifactV1Error'
  }
}

function fail(): never { throw new OpenAIChatCompatibleNativeArtifactV1Error('GENERATION_V2_OPENAI_COMPATIBLE_HISTORY_INVALID') }
function canonicalMessages(value: unknown): readonly CompatibleRequestMessage[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4096) return fail()
  try {
    // The typed V2 codec owns validation; it accepts no extension/profile field,
    // so this is also a closed native-history boundary.
    const body = buildCompatibleChatRequest({ modelId: 'history-validation', messages: value as CompatibleRequestMessage[],
      stream: true, profile: validationProfile }).body as { messages?: unknown }
    if (!Array.isArray(body.messages)) return fail()
    return Object.freeze(body.messages.map((message) => Object.freeze(message as CompatibleRequestMessage)))
  } catch { return fail() }
}

export function createOpenAIChatCompatibleNativeArtifactV1(
  messagesValue: readonly CompatibleRequestMessage[],
): OpenAIChatCompatibleNativeArtifactV1 {
  const messages = canonicalMessages(messagesValue)
  const payload = Object.freeze({ artifactCodecVersion: 1 as const, artifactKind: 'openai_chat_compatible_messages' as const, messages })
  const canonical = stableSerializeProviderRequestBoundedV2(payload, MAX_ARTIFACT_BYTES)
  return Object.freeze({ ...payload, artifactHash: createHash('sha256').update(canonical, 'utf8').digest('hex') })
}

export function decodeOpenAIChatCompatibleNativeArtifactV1(value: unknown): OpenAIChatCompatibleNativeArtifactV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return fail()
  const input = value as Record<string, unknown>
  if (Object.keys(input).sort().join('\0') !== 'artifactCodecVersion\0artifactHash\0artifactKind\0messages' ||
      input.artifactCodecVersion !== 1 || input.artifactKind !== 'openai_chat_compatible_messages' || typeof input.artifactHash !== 'string') return fail()
  const decoded = createOpenAIChatCompatibleNativeArtifactV1(input.messages as CompatibleRequestMessage[])
  if (decoded.artifactHash !== input.artifactHash) return fail()
  return decoded
}
