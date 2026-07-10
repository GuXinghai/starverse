import type { StarverseStreamEvent } from '@/next/provider/providerTypes'
import type { ReasoningDisplayBlock } from '@/next/state/types'

export type GeminiReasoningDisplayAssemblerState = {
  textByCandidateKey: Map<string, string>
}

export type GeminiThoughtSummaryFinalization = Readonly<{
  block: ReasoningDisplayBlock | null
  diagnostic: unknown | null
}>

export function createGeminiReasoningDisplayAssemblerState(): GeminiReasoningDisplayAssemblerState {
  return {
    textByCandidateKey: new Map(),
  }
}

export function appendGeminiThoughtSummaryDelta(input: Readonly<{
  messageId: string
  candidateIndex: number
  text: string
  state?: GeminiReasoningDisplayAssemblerState
}>): ReasoningDisplayBlock | null {
  if (input.text.length === 0) return null
  const candidateKey = buildGeminiThoughtSummaryCandidateKey(input.candidateIndex)
  const previous = input.state?.textByCandidateKey.get(candidateKey) ?? ''
  const nextText = `${previous}${input.text}`
  input.state?.textByCandidateKey.set(candidateKey, nextText)
  return createGeminiThoughtSummaryDisplayBlock({
    messageId: input.messageId,
    candidateIndex: input.candidateIndex,
    text: nextText,
  })
}

export function buildGeminiFinalThoughtSummaryDisplayBlock(input: Readonly<{
  messageId: string
  candidateIndex: number
  text: string
  state?: GeminiReasoningDisplayAssemblerState
}>): GeminiThoughtSummaryFinalization {
  const candidateKey = buildGeminiThoughtSummaryCandidateKey(input.candidateIndex)
  const previous = input.state?.textByCandidateKey.get(candidateKey)

  if (input.text.length === 0) {
    return {
      block: null,
      diagnostic: previous && previous.length > 0
        ? createGeminiThoughtSummaryFinalDiagnostic({
            type: 'gemini_thought_summary_final_empty',
            candidateIndex: input.candidateIndex,
            streamText: previous,
            finalText: '',
          })
        : null,
    }
  }

  if (previous === input.text) {
    return { block: null, diagnostic: null }
  }

  input.state?.textByCandidateKey.set(candidateKey, input.text)
  return {
    block: createGeminiThoughtSummaryDisplayBlock({
      messageId: input.messageId,
      candidateIndex: input.candidateIndex,
      text: input.text,
    }),
    diagnostic: previous !== undefined
      ? createGeminiThoughtSummaryFinalDiagnostic({
          type: 'gemini_thought_summary_final_mismatch',
          candidateIndex: input.candidateIndex,
          streamText: previous,
          finalText: input.text,
        })
      : null,
  }
}

export function collectGeminiThoughtSummaryTextByCandidate(response: unknown): Map<number, string> {
  const out = new Map<number, string>()
  const record = asRecord(response)
  const candidates = Array.isArray(record?.candidates) ? record.candidates : []
  for (const candidate of candidates) {
    const candidateRecord = asRecord(candidate)
    if (!candidateRecord) continue
    const candidateIndex = readCandidateIndex(candidateRecord)
    const content = asRecord(candidateRecord.content)
    const parts = Array.isArray(content?.parts) ? content.parts : []
    let text = out.get(candidateIndex) ?? ''
    for (const part of parts) {
      const partRecord = asRecord(part)
      if (!partRecord || partRecord.thought !== true || typeof partRecord.text !== 'string') continue
      if (partRecord.text.length === 0) continue
      text += partRecord.text
    }
    if (text.length > 0) out.set(candidateIndex, text)
  }
  return out
}

export function buildGeminiThoughtSummaryDeltaEvents(input: Readonly<{
  response: unknown
  messageId: string
  state?: GeminiReasoningDisplayAssemblerState
}>): StarverseStreamEvent[] {
  const events: StarverseStreamEvent[] = []
  const texts = collectGeminiThoughtSummaryTextByCandidate(input.response)
  for (const [candidateIndex, text] of texts) {
    const block = appendGeminiThoughtSummaryDelta({
      messageId: input.messageId,
      candidateIndex,
      text,
      state: input.state,
    })
    if (!block) continue
    events.push({
      type: 'message.reasoning_display_block_upsert',
      messageId: input.messageId,
      choiceIndex: candidateIndex,
      block,
    })
  }
  return events
}

export function buildGeminiFinalThoughtSummaryEvents(input: Readonly<{
  response: unknown
  messageId: string
  state?: GeminiReasoningDisplayAssemblerState
}>): StarverseStreamEvent[] {
  const events: StarverseStreamEvent[] = []
  const candidates = Array.isArray(asRecord(input.response)?.candidates)
    ? (asRecord(input.response)!.candidates as unknown[])
    : []
  const finalTexts = collectGeminiThoughtSummaryTextByCandidate(input.response)
  const candidateIndexes = new Set<number>()
  for (const candidate of candidates) {
    const record = asRecord(candidate)
    if (record) candidateIndexes.add(readCandidateIndex(record))
  }
  for (const key of input.state?.textByCandidateKey.keys() ?? []) {
    const parsed = parseCandidateKey(key)
    if (parsed !== null) candidateIndexes.add(parsed)
  }

  for (const candidateIndex of candidateIndexes) {
    const result = buildGeminiFinalThoughtSummaryDisplayBlock({
      messageId: input.messageId,
      candidateIndex,
      text: finalTexts.get(candidateIndex) ?? '',
      state: input.state,
    })
    if (result.diagnostic) {
      events.push({
        type: 'message.reasoning_raw_detail',
        messageId: input.messageId,
        choiceIndex: candidateIndex,
        detail: result.diagnostic,
      })
    }
    if (result.block) {
      events.push({
        type: 'message.reasoning_display_block_upsert',
        messageId: input.messageId,
        choiceIndex: candidateIndex,
        block: result.block,
      })
    }
  }
  return events
}

function createGeminiThoughtSummaryDisplayBlock(input: Readonly<{
  messageId: string
  candidateIndex: number
  text: string
}>): ReasoningDisplayBlock {
  return {
    blockId: `${input.messageId}:reasoning-display:google_ai_studio:gemini_generate_content:${input.candidateIndex}:thought_summary`,
    ordinal: input.candidateIndex,
    type: 'text',
    text: input.text,
    semanticRole: 'thought',
    providerKey: 'google_ai_studio',
    sourceEventType: 'candidate.part.thought.text',
  }
}

function buildGeminiThoughtSummaryCandidateKey(candidateIndex: number): string {
  return `candidate:${candidateIndex}:thought_summary`
}

function parseCandidateKey(key: string): number | null {
  const match = /^candidate:(\d+):thought_summary$/.exec(key)
  if (!match) return null
  const index = Number(match[1])
  return Number.isInteger(index) && index >= 0 ? index : null
}

function readCandidateIndex(candidate: Record<string, unknown>): number {
  return typeof candidate.index === 'number' && Number.isInteger(candidate.index) && candidate.index >= 0
    ? candidate.index
    : 0
}

function createGeminiThoughtSummaryFinalDiagnostic(input: Readonly<{
  type: 'gemini_thought_summary_final_empty' | 'gemini_thought_summary_final_mismatch'
  candidateIndex: number
  streamText: string
  finalText: string
}>): Readonly<Record<string, unknown>> {
  return {
    type: input.type,
    provider: 'google_ai_studio',
    candidateIndex: input.candidateIndex,
    streamLength: input.streamText.length,
    finalLength: input.finalText.length,
    streamHash: stableTextHash(input.streamText),
    finalHash: stableTextHash(input.finalText),
  }
}

function stableTextHash(text: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}
