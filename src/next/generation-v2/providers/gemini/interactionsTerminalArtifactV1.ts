import { createHash } from 'node:crypto'
import { stableSerializeProviderRequestBoundedV2, stableSerializeProviderRequestV2 } from '../../compiler/stableSerialize'
import type { GeminiInteractionsImageResultV1 } from './interactionsStreamV1'

export const GEMINI_INTERACTIONS_IMAGE_TERMINAL_ARTIFACT_KIND_V1 = 'gemini_interactions_image_terminal_v1' as const
export const GEMINI_INTERACTIONS_IMAGE_TERMINAL_ARTIFACT_CODEC_VERSION_V1 = 1 as const

export type GeminiInteractionsImageTerminalArtifactV1 = Readonly<{
  artifactKind: typeof GEMINI_INTERACTIONS_IMAGE_TERMINAL_ARTIFACT_KIND_V1
  artifactCodecVersion: typeof GEMINI_INTERACTIONS_IMAGE_TERMINAL_ARTIFACT_CODEC_VERSION_V1
  interactionId: string
  model: 'gemini-3.1-flash-image'
  usage: Readonly<Record<string, unknown>>
  image: Readonly<{ mime: string; byteLength: number; sha256: string }>
  orderedEvents: readonly Readonly<{ eventType: string; canonicalEventSha256: string; canonicalEventByteLength: number }>[]
  artifactHash: string
}>

export class GeminiInteractionsImageTerminalArtifactV1Error extends Error {
  constructor() { super('GENERATION_V2_GEMINI_INTERACTIONS_TERMINAL_ARTIFACT_INVALID') }
}
const branded = new WeakSet<object>()
function invalid(): never { throw new GeminiInteractionsImageTerminalArtifactV1Error() }

export function createGeminiInteractionsImageTerminalArtifactV1(
  result: GeminiInteractionsImageResultV1,
): GeminiInteractionsImageTerminalArtifactV1 {
  if (!result || result.model !== 'gemini-3.1-flash-image' || typeof result.interactionId !== 'string' ||
      result.interactionId.length < 1 || result.bytes.byteLength < 1 || typeof result.mime !== 'string' ||
      !Array.isArray(result.events) || result.events.length < 3) invalid()
  let usage: Readonly<Record<string, unknown>>
  try {
    const parsed = JSON.parse(stableSerializeProviderRequestBoundedV2(result.usage, 1024 * 1024))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) invalid()
    usage = Object.freeze(parsed as Record<string, unknown>)
  } catch (error) { if (error instanceof GeminiInteractionsImageTerminalArtifactV1Error) throw error; return invalid() }
  const orderedEvents = Object.freeze(result.events.map((event) => Object.freeze({
    eventType: event.eventType,
    canonicalEventSha256: createHash('sha256').update(event.canonicalJson, 'utf8').digest('hex'),
    canonicalEventByteLength: Buffer.byteLength(event.canonicalJson, 'utf8'),
  })))
  const projection = Object.freeze({
    artifactKind: GEMINI_INTERACTIONS_IMAGE_TERMINAL_ARTIFACT_KIND_V1,
    artifactCodecVersion: GEMINI_INTERACTIONS_IMAGE_TERMINAL_ARTIFACT_CODEC_VERSION_V1,
    interactionId: result.interactionId,
    model: result.model,
    usage,
    image: Object.freeze({ mime: result.mime, byteLength: result.bytes.byteLength,
      sha256: createHash('sha256').update(result.bytes).digest('hex') }),
    orderedEvents,
  })
  const artifact = Object.freeze({ ...projection,
    artifactHash: createHash('sha256').update(stableSerializeProviderRequestV2(projection), 'utf8').digest('hex') })
  branded.add(artifact)
  return artifact
}
export function isGeminiInteractionsImageTerminalArtifactV1(value: unknown): value is GeminiInteractionsImageTerminalArtifactV1 {
  return Boolean(value && typeof value === 'object' && branded.has(value))
}
export function serializeGeminiInteractionsImageTerminalArtifactV1(value: GeminiInteractionsImageTerminalArtifactV1): string {
  if (!isGeminiInteractionsImageTerminalArtifactV1(value)) invalid()
  return stableSerializeProviderRequestV2(value)
}
