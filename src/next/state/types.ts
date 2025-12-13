export type RunStatus =
  | 'idle'
  | 'requesting'
  | 'streaming'
  | 'tool_waiting'
  | 'done'
  | 'error'
  | 'aborted'

export type MessageRole = 'user' | 'assistant' | 'tool'

export type ContentBlock =
  | Readonly<{ type: 'text'; text: string }>
  | Readonly<{ type: 'image'; url: string }>
  | Readonly<{ type: 'unknown'; raw: unknown }>

export type ReasoningViewVisibility = 'shown' | 'excluded' | 'not_returned'

export type ReasoningView = Readonly<{
  summaryText?: string
  reasoningText?: string
  hasEncrypted?: boolean
  visibility: ReasoningViewVisibility
}>

export type MessageVM = Readonly<{
  messageId: string
  role: MessageRole
  contentBlocks: ContentBlock[]
  toolCalls: unknown[]
  reasoningView: ReasoningView
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
  usage?: unknown
  error?: unknown
}>

export type DomainEvent =
  | Readonly<{ type: 'StreamComment'; text: string }>
  | Readonly<{ type: 'StreamError'; error: unknown; terminal: true }>
  | Readonly<{ type: 'StreamDone' }>
  | Readonly<{ type: 'StreamAbort'; reason?: string }>
  | Readonly<{ type: 'MessageDeltaText'; messageId: string; choiceIndex: number; text: string }>
  | Readonly<{ type: 'MessageDeltaToolCall'; messageId: string; choiceIndex: number; toolCallDelta: unknown }>
  | Readonly<{ type: 'MessageDeltaReasoningDetail'; messageId: string; choiceIndex: number; detail: unknown }>
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
  toolCalls: unknown[]
  reasoningDetailsRaw: unknown[]
  reasoningStreamingText: string
  reasoningSummaryText?: string
  hasEncryptedReasoning: boolean
  streaming: { isTarget: boolean; isComplete: boolean }
  /**
   * Whether reasoning.exclude was set to true in the original request.
   * Used to distinguish 'excluded' (intentional hide) from 'not_returned' (model didn't provide).
   * SSOT Reference: Section 3.4 "加密/隐藏/未返回" 的 UI 语义分离
   */
  requestedReasoningExclude?: boolean
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
  usage?: unknown
  error?: unknown
  comments: string[]
}>

export type RootState = Readonly<{
  runs: Record<string, RunState>
  messages: Record<string, MessageState>
  runMessageIds: Record<string, string[]>
}>

export type StartGenerationInput = Readonly<{
  runId: string
  requestId: string
  model?: string
  assistantMessageId?: string
  userMessageId?: string
  userMessageText?: string
  /**
   * Whether reasoning.exclude was set to true in the request.
   * Will be stored on the assistant message for visibility judgment.
   */
  reasoningExclude?: boolean
}>
