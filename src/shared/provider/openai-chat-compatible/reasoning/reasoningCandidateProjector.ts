import type { CompatibleExtensionContext, CompatibleSemanticExtensionCandidate } from '../extensions'
import type { CompatibleJsonValue } from '../request/messageTypes'
import type { CompatibleReasoningCandidate, CompatibleReasoningSource } from './reasoningTypes'

export function projectCompatibleReasoningCandidate(input: Readonly<{
  context: CompatibleExtensionContext
  choiceIndex: number
  sequence: number
  phase: 'stream' | 'final'
  source: CompatibleReasoningSource
  sourceKey: string
  mode: 'append' | 'snapshot'
  value: CompatibleJsonValue
}>): CompatibleReasoningCandidate | null {
  const value = normalize(input.value)
  return value === null ? null : Object.freeze({ ...input, value })
}

export function projectCustomReasoningCandidate(candidate: CompatibleSemanticExtensionCandidate): CompatibleReasoningCandidate | null {
  if (candidate.semantic !== 'reasoning' || candidate.choiceIndex === undefined) return null
  return projectCompatibleReasoningCandidate({ context: candidate.context, choiceIndex: candidate.choiceIndex, sequence: candidate.sequence, phase: candidate.source === 'stream' ? 'stream' : 'final', source: 'custom', sourceKey: `custom:${candidate.mappingId}:${candidate.mappingVersion}:${candidate.normalizedPath}`, mode: candidate.mode === 'append' ? 'append' : 'snapshot', value: candidate.value })
}

export function projectMappedCompatibleReasoningCandidate(input: Readonly<{
  context: CompatibleExtensionContext
  choiceIndex: number
  sequence: number
  phase: 'stream' | 'final'
  sourceKey: string
  value: CompatibleJsonValue
  rule: Readonly<{ stream: Readonly<{ mode: 'append' | 'snapshot'; textPath?: string }>; final?: Readonly<{ mode: 'snapshot' | 'blocks'; textPath?: string }>; semantic: 'text' | 'blocks' | 'opaque' }>
}>): CompatibleReasoningCandidate | null {
  if (input.rule.semantic === 'opaque') return null
  const phaseRule = input.phase === 'final' ? input.rule.final : input.rule.stream
  if (!phaseRule) return null
  const mode = phaseRule.mode
  let projected: CompatibleJsonValue = input.value
  if (phaseRule.textPath) {
    if (input.rule.semantic === 'blocks' && Array.isArray(input.value)) {
      const values = input.value.map((item) => readTextPath(item, phaseRule.textPath!))
      if (values.some((item) => typeof item !== 'string')) return null
      projected = values as string[]
    } else projected = readTextPath(input.value, phaseRule.textPath)
  }
  const normalized = normalize(projected)
  if (normalized === null) return null
  return Object.freeze({ context: input.context, choiceIndex: input.choiceIndex, sequence: input.sequence, phase: input.phase, source: 'custom', sourceKey: input.sourceKey, mode: mode === 'append' ? 'append' : 'snapshot', value: normalized })
}

function readTextPath(value: CompatibleJsonValue, path: string): CompatibleJsonValue {
  let current: CompatibleJsonValue = value
  for (const segment of path.split('.')) {
    if (Array.isArray(current)) {
      if (!/^(?:0|[1-9][0-9]{0,5})$/.test(segment) || Number(segment) >= current.length) return null
      current = current[Number(segment)]!
    } else {
      if (!current || typeof current !== 'object' || !(segment in current)) return null
      current = current[segment]!
    }
  }
  return current
}

function normalize(value: CompatibleJsonValue): string | null {
  if (typeof value === 'string') return value.trim() ? value : null
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    const text = value.join('')
    return text.trim() ? text : null
  }
  return null
}
