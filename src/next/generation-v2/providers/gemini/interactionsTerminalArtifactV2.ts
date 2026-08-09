import { createHash } from 'node:crypto'
import { stableSerializeProviderRequestBoundedV2, stableSerializeProviderRequestV2 } from '../../compiler/stableSerialize'
import type { GeminiInteractionsImageResultV1, GeminiInteractionsReasoningDetailV1, GeminiInteractionsSearchEvidenceV1 } from './interactionsStreamV1'
import { isGeminiInteractionsImageModelIdV1 } from './interactionsImageCapabilityPolicyV1'

export const GEMINI_INTERACTIONS_IMAGE_TERMINAL_ARTIFACT_KIND_V2 = 'gemini_interactions_image_terminal_v2' as const
export const GEMINI_INTERACTIONS_IMAGE_TERMINAL_ARTIFACT_CODEC_VERSION_V2 = 2 as const
const MAX_SEARCH_EVENT_BYTES = 4 * 1024 * 1024
const MAX_SEARCH_EVIDENCE_BYTES = 8 * 1024 * 1024

export type GeminiInteractionsImageTerminalArtifactV2 = Readonly<{
  artifactKind: typeof GEMINI_INTERACTIONS_IMAGE_TERMINAL_ARTIFACT_KIND_V2
  artifactCodecVersion: typeof GEMINI_INTERACTIONS_IMAGE_TERMINAL_ARTIFACT_CODEC_VERSION_V2
  interactionId: string
  model: string
  usage: Readonly<Record<string, unknown>>
  image: Readonly<{ mime: string; byteLength: number; sha256: string }>
  text: Readonly<{ byteLength: number; sha256: string }>
  reasoningDetails: readonly GeminiInteractionsReasoningDetailV1[]
  searchEvidence: GeminiInteractionsSearchEvidenceV1
  orderedEvents: readonly Readonly<{ eventType: string; canonicalEventSha256: string; canonicalEventByteLength: number }>[]
  artifactHash: string
}>

export class GeminiInteractionsImageTerminalArtifactV2Error extends Error {
  constructor() { super('GENERATION_V2_GEMINI_INTERACTIONS_TERMINAL_ARTIFACT_INVALID') }
}

const branded = new WeakSet<object>()
function invalid(): never { throw new GeminiInteractionsImageTerminalArtifactV2Error() }

function hasImagePayload(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasImagePayload)
  if (!value || typeof value !== 'object') return false
  const object = value as Record<string, unknown>
  if (object.type === 'image') return true
  return Object.entries(object).some(([key, child]) => key === 'data' && typeof child === 'string' && child.length > 256
    ? true : hasImagePayload(child))
}

function validateSearchEvidence(value: GeminiInteractionsSearchEvidenceV1): void {
  if (!value || !Array.isArray(value.events) || !Array.isArray(value.calls) ||
      !Array.isArray(value.results) || !Array.isArray(value.annotations)) invalid()
  for (const event of value.events) {
    if (!event || (event.eventType !== 'step.start' && event.eventType !== 'step.delta' &&
        event.eventType !== 'step.stop' && event.eventType !== 'interaction.completed') ||
        (event.stepType !== 'google_search_call' && event.stepType !== 'google_search_result') ||
        !Number.isSafeInteger(event.stepIndex) || event.stepIndex < 0 || typeof event.canonicalJson !== 'string' ||
        hasImagePayload(event.raw) || stableSerializeProviderRequestBoundedV2(event.raw, MAX_SEARCH_EVENT_BYTES) !== event.canonicalJson) invalid()
  }
  try { stableSerializeProviderRequestBoundedV2(value, MAX_SEARCH_EVIDENCE_BYTES) } catch { invalid() }
}

export function createGeminiInteractionsImageTerminalArtifactV2(
  result: GeminiInteractionsImageResultV1,
): GeminiInteractionsImageTerminalArtifactV2 {
  if (!result || !isGeminiInteractionsImageModelIdV1(result.model) || typeof result.interactionId !== 'string' ||
      result.interactionId.length < 1 || result.bytes.byteLength < 1 || typeof result.mime !== 'string' || typeof result.text !== 'string' ||
      !Array.isArray(result.reasoningDetails) || !Array.isArray(result.events)) invalid()
  let usage: Readonly<Record<string, unknown>>
  try {
    const parsed = JSON.parse(stableSerializeProviderRequestBoundedV2(result.usage, 1024 * 1024))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) invalid()
    usage = Object.freeze(parsed as Record<string, unknown>)
    validateSearchEvidence(result.searchEvidence)
  } catch (error) { if (error instanceof GeminiInteractionsImageTerminalArtifactV2Error) throw error; return invalid() }
  const orderedEvents = Object.freeze(result.events.map((event) => Object.freeze({
    eventType: event.eventType,
    canonicalEventSha256: createHash('sha256').update(event.canonicalJson, 'utf8').digest('hex'),
    canonicalEventByteLength: Buffer.byteLength(event.canonicalJson, 'utf8'),
  })))
  const projection = Object.freeze({
    artifactKind: GEMINI_INTERACTIONS_IMAGE_TERMINAL_ARTIFACT_KIND_V2,
    artifactCodecVersion: GEMINI_INTERACTIONS_IMAGE_TERMINAL_ARTIFACT_CODEC_VERSION_V2,
    interactionId: result.interactionId,
    model: result.model,
    usage,
    image: Object.freeze({ mime: result.mime, byteLength: result.bytes.byteLength,
      sha256: createHash('sha256').update(result.bytes).digest('hex') }),
    text: Object.freeze({ byteLength: Buffer.byteLength(result.text, 'utf8'),
      sha256: createHash('sha256').update(result.text, 'utf8').digest('hex') }),
    reasoningDetails: Object.freeze(result.reasoningDetails.map((detail) => Object.freeze({ ...detail }))),
    searchEvidence: Object.freeze({
      events: Object.freeze(result.searchEvidence.events.map((event) => Object.freeze({ ...event }))),
      calls: Object.freeze(result.searchEvidence.calls.map((call) => Object.freeze({ ...call }))),
      results: Object.freeze(result.searchEvidence.results.map((searchResult) => Object.freeze({ ...searchResult }))),
      annotations: Object.freeze(result.searchEvidence.annotations.map((annotation) => Object.freeze({ ...annotation }))),
    }),
    orderedEvents,
  })
  const artifact = Object.freeze({ ...projection,
    artifactHash: createHash('sha256').update(stableSerializeProviderRequestV2(projection), 'utf8').digest('hex') })
  branded.add(artifact)
  return artifact
}

export function isGeminiInteractionsImageTerminalArtifactV2(value: unknown): value is GeminiInteractionsImageTerminalArtifactV2 {
  return Boolean(value && typeof value === 'object' && branded.has(value))
}

export function serializeGeminiInteractionsImageTerminalArtifactV2(value: GeminiInteractionsImageTerminalArtifactV2): string {
  if (!isGeminiInteractionsImageTerminalArtifactV2(value)) invalid()
  return stableSerializeProviderRequestV2(value)
}
