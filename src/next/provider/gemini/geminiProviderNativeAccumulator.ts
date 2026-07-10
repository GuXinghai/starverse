import type { StarverseStreamEvent } from '@/next/provider/providerTypes'
import {
  GEMINI_GENERATE_CONTENT_SOURCE_API,
  GEMINI_PROVIDER_NATIVE_PROVIDER_KEY,
  clonePlainJsonObject,
  normalizeGeminiProviderNativeSnapshot,
  type GeminiProviderNativeContent,
  type GeminiProviderNativePart,
  type GeminiProviderNativeSnapshot,
  type GeminiProviderNativeStatus,
} from '@/next/provider/gemini/geminiProviderNativeContent'

type CandidateState = {
  role: string
  parts: GeminiProviderNativePart[]
  finishReason?: string
}

type GeminiNativeChunk = Readonly<{
  candidates?: ReadonlyArray<unknown>
  usageMetadata?: unknown
  modelVersion?: unknown
}>

export type GeminiProviderNativeAccumulator = Readonly<{
  ingestChunk: (chunk: unknown, status?: GeminiProviderNativeStatus) => StarverseStreamEvent[]
  finalize: (status?: GeminiProviderNativeStatus) => StarverseStreamEvent[]
  snapshot: (status?: GeminiProviderNativeStatus) => GeminiProviderNativeSnapshot | null
}>

export function createGeminiProviderNativeAccumulator(input: Readonly<{
  messageId: string
  providerKey?: string
  candidateIndex?: number
}>): GeminiProviderNativeAccumulator {
  const messageId = String(input.messageId ?? '').trim()
  const providerKey = input.providerKey ?? GEMINI_PROVIDER_NATIVE_PROVIDER_KEY
  const candidateIndex = Number.isInteger(input.candidateIndex) && input.candidateIndex! >= 0
    ? input.candidateIndex!
    : 0
  const state: CandidateState = {
    role: 'model',
    parts: [],
  }
  let latestUsageMetadata: Record<string, unknown> | undefined
  let latestModelVersion: string | undefined

  function ingestChunk(chunk: unknown, status: GeminiProviderNativeStatus = 'streaming'): StarverseStreamEvent[] {
    const record = asRecord(chunk)
    if (!record) return []
    const typed = record as GeminiNativeChunk
    const candidates = Array.isArray(typed.candidates) ? typed.candidates : []
    for (const candidate of candidates) {
      const candidateRecord = asRecord(candidate)
      if (!candidateRecord) continue
      const index = typeof candidateRecord.index === 'number' && Number.isInteger(candidateRecord.index)
        ? candidateRecord.index
        : 0
      if (index !== candidateIndex) continue

      const content = asRecord(candidateRecord.content)
      const role = typeof content?.role === 'string' && content.role.trim() ? content.role.trim() : 'model'
      const parts = Array.isArray(content?.parts) ? content.parts : []
      state.role = role
      for (const part of parts) {
        appendPart(state.parts, clonePlainJsonObject(part, '$.candidates[].content.parts[]'))
      }
      if (typeof candidateRecord.finishReason === 'string' && candidateRecord.finishReason.trim()) {
        state.finishReason = candidateRecord.finishReason.trim()
      }
    }
    if (typed.usageMetadata !== undefined) {
      latestUsageMetadata = clonePlainJsonObject(typed.usageMetadata, '$.usageMetadata')
    }
    if (typeof typed.modelVersion === 'string' && typed.modelVersion.trim()) {
      latestModelVersion = typed.modelVersion.trim()
    }
    const event = snapshotToEvent(messageId, snapshot(status))
    return event ? [event] : []
  }

  function finalize(status: GeminiProviderNativeStatus = 'final'): StarverseStreamEvent[] {
    const event = snapshotToEvent(messageId, snapshot(status))
    return event ? [event] : []
  }

  function snapshot(status: GeminiProviderNativeStatus = 'streaming'): GeminiProviderNativeSnapshot | null {
    if (!messageId || providerKey !== GEMINI_PROVIDER_NATIVE_PROVIDER_KEY || state.parts.length === 0) return null
    const content: GeminiProviderNativeContent = {
      role: state.role || 'model',
      parts: state.parts.map((part) => clonePlainJsonObject(part, '$.content.parts[]')),
    }
    return normalizeGeminiProviderNativeSnapshot({
      providerKey: GEMINI_PROVIDER_NATIVE_PROVIDER_KEY,
      sourceApi: GEMINI_GENERATE_CONTENT_SOURCE_API,
      candidateIndex,
      status,
      content,
      ...(state.finishReason ? { finishReason: state.finishReason } : {}),
      ...(latestUsageMetadata ? { usageMetadata: latestUsageMetadata } : {}),
      ...(latestModelVersion ? { modelVersion: latestModelVersion } : {}),
    })
  }

  return { ingestChunk, finalize, snapshot }
}

export function mapGeminiGenerateContentResponseToNativeSnapshots(
  response: unknown,
  status: GeminiProviderNativeStatus = 'final',
): GeminiProviderNativeSnapshot[] {
  const record = asRecord(response)
  if (!record) return []
  const candidates = Array.isArray(record.candidates) ? record.candidates : []
  const out: GeminiProviderNativeSnapshot[] = []
  for (const candidate of candidates) {
    const candidateRecord = asRecord(candidate)
    if (!candidateRecord) continue
    const index = typeof candidateRecord.index === 'number' && Number.isInteger(candidateRecord.index)
      ? candidateRecord.index
      : 0
    const content = asRecord(candidateRecord.content)
    if (!content || !Array.isArray(content.parts) || content.parts.length === 0) continue
    const snapshot = normalizeGeminiProviderNativeSnapshot({
      providerKey: GEMINI_PROVIDER_NATIVE_PROVIDER_KEY,
      sourceApi: GEMINI_GENERATE_CONTENT_SOURCE_API,
      candidateIndex: index,
      status,
      content: {
        role: typeof content.role === 'string' && content.role.trim() ? content.role.trim() : 'model',
        parts: content.parts.map((part) => clonePlainJsonObject(part, '$.candidates[].content.parts[]')),
      },
      ...(typeof candidateRecord.finishReason === 'string' && candidateRecord.finishReason.trim()
        ? { finishReason: candidateRecord.finishReason.trim() }
        : {}),
      ...(record.usageMetadata !== undefined ? { usageMetadata: clonePlainJsonObject(record.usageMetadata, '$.usageMetadata') } : {}),
      ...(typeof record.modelVersion === 'string' && record.modelVersion.trim() ? { modelVersion: record.modelVersion.trim() } : {}),
    })
    out.push(snapshot)
  }
  return out
}

function snapshotToEvent(messageId: string, snapshot: GeminiProviderNativeSnapshot | null): StarverseStreamEvent | null {
  if (!snapshot) return null
  return {
    type: 'message.provider_native_content_upsert',
    messageId,
    choiceIndex: snapshot.candidateIndex,
    snapshot,
  } as StarverseStreamEvent
}

function appendPart(parts: GeminiProviderNativePart[], next: GeminiProviderNativePart) {
  const prev = parts[parts.length - 1]
  if (prev && canMergeTextDelta(prev, next)) {
    parts[parts.length - 1] = {
      ...prev,
      text: `${String(prev.text ?? '')}${String(next.text ?? '')}`,
    }
    return
  }
  parts.push(next)
}

function canMergeTextDelta(prev: GeminiProviderNativePart, next: GeminiProviderNativePart): boolean {
  const prevKeys = Object.keys(prev).sort()
  const nextKeys = Object.keys(next).sort()
  const allowed = (keys: string[]) =>
    keys.length === 1 && keys[0] === 'text' ||
    keys.length === 2 && keys[0] === 'text' && keys[1] === 'thought'
  if (!allowed(prevKeys) || !allowed(nextKeys)) return false
  if (typeof prev.text !== 'string' || typeof next.text !== 'string') return false
  return prev.thought === next.thought
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}
