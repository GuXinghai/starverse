import { createHash } from 'node:crypto'
import { stableSerializeProviderRequestBoundedV2, stableSerializeProviderRequestV2 } from '../../compiler/stableSerialize'
import type { OpenRouterChatStreamResultV1 } from './chatStreamV1'

export const OPENROUTER_CHAT_TERMINAL_ARTIFACT_KIND_V1 = 'openrouter_chat_terminal_result_v1' as const
export const OPENROUTER_CHAT_TERMINAL_ARTIFACT_CODEC_VERSION_V1 = 1 as const
export type OpenRouterChatTerminalArtifactV1 = Readonly<{
  artifactKind: typeof OPENROUTER_CHAT_TERMINAL_ARTIFACT_KIND_V1
  artifactCodecVersion: typeof OPENROUTER_CHAT_TERMINAL_ARTIFACT_CODEC_VERSION_V1
  responseId: string
  model: string
  provider: string | null
  finishReason: string
  usage: Readonly<Record<string, unknown>> | null
  artifactHash: string
}>

export class OpenRouterChatTerminalArtifactV1Error extends Error {
  constructor() { super('GENERATION_V2_OPENROUTER_CHAT_TERMINAL_ARTIFACT_INVALID') }
}
const branded = new WeakSet<object>()
function invalid(): never { throw new OpenRouterChatTerminalArtifactV1Error() }
function cloneUsage(value: unknown): Readonly<Record<string, unknown>> | null {
  if (value === null) return null
  try {
    const parsed = JSON.parse(stableSerializeProviderRequestBoundedV2(value, 1024 * 1024))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) invalid()
    return Object.freeze(parsed as Record<string, unknown>)
  } catch (error) { if (error instanceof OpenRouterChatTerminalArtifactV1Error) throw error; return invalid() }
}
function issue(value: Omit<OpenRouterChatTerminalArtifactV1, 'artifactHash'>): OpenRouterChatTerminalArtifactV1 {
  const artifact = Object.freeze({ ...value,
    artifactHash: createHash('sha256').update(stableSerializeProviderRequestV2(value), 'utf8').digest('hex') })
  branded.add(artifact); return artifact
}
export function createOpenRouterChatTerminalArtifactV1(result: OpenRouterChatStreamResultV1): OpenRouterChatTerminalArtifactV1 {
  if (!result || typeof result.responseId !== 'string' || result.responseId.length === 0 ||
      typeof result.model !== 'string' || result.model.length === 0 ||
      (result.provider !== null && (typeof result.provider !== 'string' || result.provider.length === 0)) ||
      typeof result.finishReason !== 'string' || result.finishReason.length === 0) invalid()
  return issue({ artifactKind: OPENROUTER_CHAT_TERMINAL_ARTIFACT_KIND_V1,
    artifactCodecVersion: OPENROUTER_CHAT_TERMINAL_ARTIFACT_CODEC_VERSION_V1,
    responseId: result.responseId, model: result.model, provider: result.provider,
    finishReason: result.finishReason, usage: cloneUsage(result.usage) })
}
export function isOpenRouterChatTerminalArtifactV1(value: unknown): value is OpenRouterChatTerminalArtifactV1 {
  return Boolean(value && typeof value === 'object' && branded.has(value))
}
export function serializeOpenRouterChatTerminalArtifactV1(value: OpenRouterChatTerminalArtifactV1): string {
  if (!isOpenRouterChatTerminalArtifactV1(value)) invalid()
  return stableSerializeProviderRequestV2(value)
}
