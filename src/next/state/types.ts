import type { ErrorEnvelope } from '@/next/errors/openRouterErrorEnvelope'

export type RunStatus =
  | 'idle'
  | 'requesting'
  | 'streaming'
  | 'tool_waiting'
  | 'done'
  | 'error'
  | 'aborted'

export type MessageRole = 'user' | 'assistant' | 'tool'

/**
 * OpenRouter reasoning.effort enum (full set).
 * Note: reasoning.exclude is a separate switch; reasoning.enabled is not used in this repo.
 */
export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'

export type RequestedReasoningMode = 'auto' | 'effort'

export type ReasoningPrefs = Readonly<{
  mode: RequestedReasoningMode
  effort?: ReasoningEffort | 'auto'
  exclude?: boolean
}>

/**
 * Stream termination reason enum.
 * Priority order for classification: user_abort > mid_stream_error > pre_stream_error > transport_error > normal_complete
 */
export type StreamEndReason =
  | 'normal_complete'    // Received [DONE] signal
  | 'user_abort'         // User triggered abort
  | 'pre_stream_error'   // HTTP error before SSE streaming started
  | 'mid_stream_error'   // SSE error chunk during streaming
  | 'transport_error'    // Network/transport failure without other termination signals

export type CompletionOutcome =
  | 'complete'
  | 'truncated'
  | 'filtered'
  | 'tool_calls'
  | 'unknown'

export type ContentBlock =
  | Readonly<{ type: 'text'; text: string }>
  | Readonly<{ type: 'image'; url: string }>
  | Readonly<{ type: 'unknown'; raw: unknown }>

export type MessageAnnotation = Readonly<Record<string, unknown>>

export type ReasoningViewVisibility = 'shown' | 'excluded' | 'not_returned'

export type ReasoningPanelState = 'collapsed' | 'expanded'

export type ReasoningPiece = Readonly<{
  id: number
  text: string
}>

export type ToolCallVM = Readonly<{
  index: number
  id?: string
  type?: string
  name?: string
  argumentsText: string
}>

export type ToolCallDelta = Readonly<{
  index?: number
  id?: string
  type?: string
  function?: Readonly<{
    name?: string
    arguments?: string
  }>
}>

export type ReasoningView = Readonly<{
  summaryText?: string
  reasoningText?: string
  reasoningPieces?: ReasoningPiece[]
  hasEncrypted?: boolean
  visibility: ReasoningViewVisibility
  panelState: ReasoningPanelState
}>

export type MessageVM = Readonly<{
  messageId: string
  role: MessageRole
  contentBlocks: ContentBlock[]
  requestedImageGeneration?: boolean
  annotations?: MessageAnnotation[]
  toolCalls: ToolCallVM[]
  reasoningView: ReasoningView
  reasoningDurationMs?: number | null
  reasoningEndReason?: StreamEndReason
  reasoningDurationIsFallback?: boolean
  errorEnvelope?: ErrorEnvelope | null
  errorSummary?: Readonly<{
    completionClass?: string
    phase?: string
    code?: string
    message?: string
    provider?: string
  }> | null
  streaming: { isTarget: boolean; isComplete: boolean }
}>

export type RunVM = Readonly<{
  runId: string
  status: RunStatus
  requestId?: string
  generationId?: string
  model?: string
  provider?: string
  finishReason?: string
  nativeFinishReason?: string
  completionOutcome?: CompletionOutcome
  usage?: unknown
  error?: ErrorEnvelope | null
  localProcessingDurationMs?: number
  tAck?: number
}>

export type DomainEvent =
  | Readonly<{ type: 'StreamComment'; text: string }>
  | Readonly<{ type: 'StreamError'; error: ErrorEnvelope; terminal: true }>
  | Readonly<{ type: 'StreamDone' }>
  | Readonly<{ type: 'StreamAbort'; reason?: string; envelope: ErrorEnvelope }>
  | Readonly<{
    type: 'TimingSnapshot'
    tRequestStart?: number
    tAck?: number
    tEnd?: number
    endReason?: StreamEndReason
    tTransportClosed?: number
  }>
  | Readonly<{ type: 'MessageDeltaText'; messageId: string; choiceIndex: number; text: string }>
  | Readonly<{ type: 'MessageAppendContentBlock'; messageId: string; choiceIndex: number; block: ContentBlock }>
  | Readonly<{
    type: 'MessageDeltaToolCall'
    messageId: string
    choiceIndex: number
    mergeStrategy: 'append' | 'replace'
    toolCallDeltas: ToolCallDelta[]
  }>
  | Readonly<{
    type: 'MessageDeltaAnnotationBatch'
    messageId: string
    choiceIndex: number
    mergeStrategy: 'append' | 'replace'
    annotations: MessageAnnotation[]
  }>
  | Readonly<{ type: 'MessageDeltaReasoningDetail'; messageId: string; choiceIndex: number; detail: unknown; chunkNo?: number }>
  | Readonly<{ type: 'MessageDeltaReasoningDetailBatch'; messageId: string; choiceIndex: number; details: unknown[] }>
  | Readonly<{ type: 'UsageDelta'; usage: unknown }>
  | Readonly<{
    type: 'MetaDelta'
    meta: {
      id?: string
      model?: string
      provider?: string
      finish_reason?: string
      native_finish_reason?: string
    }
  }>

export type MessageState = Readonly<{
  messageId: string
  role: MessageRole
  contentText: string
  contentBlocks: ContentBlock[]
  requestedImageGeneration?: boolean
  annotations?: MessageAnnotation[]
  toolCalls: ToolCallVM[]
  reasoningDetailsRaw: unknown[]
  reasoningStreamingText: string
  reasoningSummaryText?: string
  reasoningPieces?: ReasoningPiece[]
  reasoningLastPieceLen?: number
  reasoningPanelState: ReasoningPanelState
  hasEncryptedReasoning: boolean
  reasoningDurationMs?: number | null
  reasoningEndReason?: StreamEndReason
  reasoningDurationIsFallback?: boolean
  streaming: { isTarget: boolean; isComplete: boolean }
  textVersion: number
  reasoningVersion: number
  /**
   * Requested reasoning config recorded at send-time.
   * These fields are request-side only; selectors MUST NOT infer visibility from effort.
   */
  requestedReasoningMode: RequestedReasoningMode
  requestedReasoningEffort?: ReasoningEffort
  requestedReasoningExclude: boolean
  errorEnvelope?: ErrorEnvelope | null
  errorSummary?: Readonly<{
    completionClass?: string
    phase?: string
    code?: string
    message?: string
    provider?: string
  }> | null
}>

export type RunState = Readonly<{
  runId: string
  status: RunStatus
  requestId?: string
  targetAssistantMessageId?: string
  generationId?: string
  model?: string
  provider?: string
  finishReason?: string
  nativeFinishReason?: string
  completionOutcome?: CompletionOutcome
  usage?: unknown
  error?: ErrorEnvelope | null
  comments: string[]
  // Timing fields for local processing duration tracking
  tRequestStart?: number            // When request initiated (Date.now())
  tAck?: number                     // First OPENROUTER PROCESSING comment or first data chunk
  tEnd?: number                     // Stream termination time
  endReason?: StreamEndReason       // Termination reason
  tTransportClosed?: number         // Actual transport close time (diagnostics only)
  localProcessingDurationMs?: number // Calculated: tEnd - tAck (milliseconds)
  timingFinalized?: boolean         // Prevent double-finalize / overwrite on late events
}>

export type RootState = Readonly<{
  runs: Record<string, RunState>
  messages: Record<string, MessageState>
  runMessageIds: Record<string, string[]>
  entities: Readonly<{
    messagesById: Record<string, MessageState>
  }>
  views: Readonly<{
    transcriptsByRunId: Record<string, string[]>
  }>
}>

export type StartGenerationInput = Readonly<{
  runId: string
  requestId: string
  model?: string
  assistantMessageId?: string
  userMessageId?: string
  userMessageText?: string
  requestedImageGeneration?: boolean
  requestedReasoningMode?: RequestedReasoningMode
  requestedReasoningEffort?: ReasoningEffort
  requestedReasoningExclude?: boolean
  reasoningPanelDefaultExpanded?: boolean
}>
