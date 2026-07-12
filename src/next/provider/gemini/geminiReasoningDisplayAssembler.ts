import type { StarverseStreamEvent } from '@/next/provider/providerTypes'
import type { ReasoningDisplayBlock } from '@/next/state/types'

export type GeminiReasoningDisplayAssemblerState = {
  textByCandidateKey: Map<string, string>
}

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

function readCandidateIndex(candidate: Record<string, unknown>): number {
  return typeof candidate.index === 'number' && Number.isInteger(candidate.index) && candidate.index >= 0
    ? candidate.index
    : 0
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}
