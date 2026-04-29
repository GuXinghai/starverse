export type RunStatus =
  | 'idle'
  | 'requesting'
  | 'streaming'
  | 'tool_waiting'
  | 'done'
  | 'error'
  | 'aborted'

export type MessageRole = 'user' | 'assistant' | 'tool'

export type StreamEndReason =
  | 'normal_complete'
  | 'user_abort'
  | 'pre_stream_error'
  | 'mid_stream_error'
  | 'transport_error'

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

export type ErrorEnvelopeView = Readonly<{
  completionClass?: string
  phase?: string
  truncated?: boolean
  openrouter?: Readonly<{
    provider?: string
    code?: string
    message?: string
    metadata?: unknown
  }>
}> & Record<string, unknown>

export type ErrorSummaryView = Readonly<{
  completionClass?: string
  phase?: string
  code?: string
  message?: string
  provider?: string
}>

export type ErrorPanelViewModel = Readonly<{
  completionClass: string
  phase: string
  code: string
  message: string
  provider: string
  truncated: boolean
  details?: unknown | null
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
  errorEnvelope?: ErrorEnvelopeView | null
  errorSummary?: ErrorSummaryView | null
  streaming: { isTarget: boolean; isComplete: boolean }
}>

export type MessageAttachmentDisplayStatus =
  | 'ready'
  | 'ready_with_warnings'
  | 'incompatible_with_current_model'
  | 'excluded_from_current_context'
  | 'failed'
  | 'unsupported'
  | 'parsing'

export type MessageAttachmentBorderTone = 'green' | 'yellow' | 'red' | 'neutral'

export type MessageAttachmentIconKind =
  | 'image'
  | 'pdf'
  | 'text'
  | 'link'
  | 'audio'
  | 'video'
  | 'file'

export type MessageAttachmentVM = Readonly<{
  messageId: string
  attachmentId: string
  assetId: string
  filename: string
  extension: string | null
  mime: string | null
  assetKind: string
  aiPayloadKind: string
  sourceKind: string
  displayStatus: MessageAttachmentDisplayStatus
  borderTone: MessageAttachmentBorderTone
  isHistoryIncompatible: boolean
  incompatibilityReason: string | null
  isActiveLocatedAttachment: boolean
  previewDataUrl: string | null
  iconKind: MessageAttachmentIconKind
  createdAt: number
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
  error?: ErrorEnvelopeView | null
  localProcessingDurationMs?: number
  tAck?: number
}>

