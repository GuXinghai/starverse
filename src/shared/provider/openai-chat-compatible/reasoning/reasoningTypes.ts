import type { CompatibleExtensionContext } from '../extensions'

export type CompatibleReasoningSource = 'custom' | 'reasoning' | 'reasoning_content' | 'thinking' | 'inline'
export type CompatibleReasoningMode = 'custom_preferred_with_builtin_fallback' | 'custom_only'
export type CompatibleReasoningConflictKind =
  | 'multiple_sources_in_same_event'
  | 'duplicate_equivalent_source'
  | 'different_value_source'
  | 'late_higher_priority_source'
  | 'late_lower_priority_source'
  | 'final_source_mismatch'
  | 'custom_and_builtin_overlap'
  | 'structured_and_inline_overlap'

export type CompatibleReasoningCandidate = Readonly<{
  context: CompatibleExtensionContext
  choiceIndex: number
  sequence: number
  phase: 'stream' | 'final'
  source: CompatibleReasoningSource
  sourceKey: string
  mode: 'append' | 'snapshot'
  value: string
  segmentId?: string
  segmentOrdinal?: number
  sequenceStart?: number
}>

export type CompatibleReasoningConflict = Readonly<{
  kind: CompatibleReasoningConflictKind
  source: CompatibleReasoningSource
  sequence: number
}>

export type CompatibleReasoningChoiceState = Readonly<{
  context: CompatibleExtensionContext
  choiceIndex: number
  mode: CompatibleReasoningMode
  status: 'unselected' | 'locked' | 'terminal'
  lockedSource: CompatibleReasoningSource | null
  lockedSourceKey: string | null
  value: string
  selectedSegmentIds: readonly string[]
  conflicts: readonly CompatibleReasoningConflict[]
}>

export type CompatibleReasoningReplayPolicy =
  | Readonly<{ format: 'disabled'; scope: 'never' }>
  | Readonly<{ format: 'assistant_field'; field: string; scope: 'tool_call_chain_only' | 'all_assistant_messages' }>
  | Readonly<{ format: 'assistant_content_tags'; openTag: string; closeTag: string; scope: 'tool_call_chain_only' | 'all_assistant_messages' }>
