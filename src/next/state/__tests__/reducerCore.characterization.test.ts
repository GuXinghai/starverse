import { describe, expect, it } from 'vitest'
import { applyEventCore, createInitialStateCore, startGenerationCore } from '../reducerCore'
import type { DomainEvent, MessageState, RootState, StartGenerationInput } from '../types'

type StartOperation = Readonly<{
  kind: 'start'
  at?: number
  input: StartGenerationInput
}>

type EventOperation = Readonly<{
  kind: 'event'
  at?: number
  runId: string
  event: DomainEvent
}>

type Operation = StartOperation | EventOperation

type Scenario = Readonly<{
  id: string
  userBehavior: string
  operations: readonly Operation[]
}>

const DOMAIN_EVENT_TYPES = [
  'StreamComment',
  'StreamError',
  'StreamDone',
  'StreamAbort',
  'TimingSnapshot',
  'MessageDeltaText',
  'MessageAppendContentBlock',
  'MessageDeltaToolCall',
  'MessageDeltaAnnotationBatch',
  'MessageDeltaReasoningDetail',
  'MessageDeltaReasoningDetailBatch',
  'UsageDelta',
  'MetaDelta',
] as const

const MID_STREAM_ERROR = {
  completionClass: 'error',
  phase: 'mid_stream',
  category: 'rate_limited',
  grade: 1,
} as const

const USER_ABORT = {
  completionClass: 'aborted',
  phase: 'mid_stream',
  category: 'user_cancelled',
  grade: 0,
} as const

const SCENARIOS: Scenario[] = [
  {
    id: 'send_message_initializes_run_and_transcript',
    userBehavior: 'User sends first prompt; reducer seeds user + assistant placeholder.',
    operations: [
      {
        kind: 'start',
        input: {
          runId: 'run-send',
          requestId: 'req-send-1',
          model: 'openrouter/auto',
          assistantMessageId: 'a-send-1',
          userMessageId: 'u-send-1',
          userMessageText: 'hello world',
        },
      },
    ],
  },
  {
    id: 'first_text_delta_transitions_requesting_to_streaming',
    userBehavior: 'Assistant starts streaming tokens after request is accepted.',
    operations: [
      {
        kind: 'start',
        input: {
          runId: 'run-stream',
          requestId: 'req-stream-1',
          model: 'openrouter/auto',
          assistantMessageId: 'a-stream-1',
        },
      },
      { kind: 'event', at: 100, runId: 'run-stream', event: { type: 'TimingSnapshot', tAck: 100 } },
      { kind: 'event', at: 120, runId: 'run-stream', event: { type: 'MessageDeltaText', messageId: 'a-stream-1', choiceIndex: 0, text: 'hi' } },
      { kind: 'event', at: 121, runId: 'run-stream', event: { type: 'StreamComment', text: 'OPENROUTER PROCESSING' } },
    ],
  },
  {
    id: 'stream_done_with_finish_reason_length_sets_truncated',
    userBehavior: 'Stream completes with length stop reason and marks completion outcome.',
    operations: [
      {
        kind: 'start',
        input: {
          runId: 'run-length',
          requestId: 'req-length-1',
          model: 'openrouter/auto',
          assistantMessageId: 'a-length-1',
        },
      },
      { kind: 'event', at: 200, runId: 'run-length', event: { type: 'MessageDeltaText', messageId: 'a-length-1', choiceIndex: 0, text: 'partial' } },
      { kind: 'event', at: 210, runId: 'run-length', event: { type: 'MetaDelta', meta: { finish_reason: 'length' } } },
      { kind: 'event', at: 220, runId: 'run-length', event: { type: 'StreamDone' } },
    ],
  },
  {
    id: 'text_plus_image_blocks_merge_and_dedupe',
    userBehavior: 'Mixed text/image streaming keeps text order and deduplicates repeated image URL.',
    operations: [
      {
        kind: 'start',
        input: {
          runId: 'run-blocks',
          requestId: 'req-blocks-1',
          model: 'openrouter/auto',
          assistantMessageId: 'a-blocks-1',
        },
      },
      { kind: 'event', at: 300, runId: 'run-blocks', event: { type: 'MessageDeltaText', messageId: 'a-blocks-1', choiceIndex: 0, text: 'hello ' } },
      {
        kind: 'event',
        at: 301,
        runId: 'run-blocks',
        event: {
          type: 'MessageAppendContentBlock',
          messageId: 'a-blocks-1',
          choiceIndex: 0,
          block: { type: 'image', url: 'https://example.com/cat.png' },
        },
      },
      {
        kind: 'event',
        at: 302,
        runId: 'run-blocks',
        event: {
          type: 'MessageAppendContentBlock',
          messageId: 'a-blocks-1',
          choiceIndex: 0,
          block: { type: 'image', url: 'https://example.com/cat.png' },
        },
      },
      { kind: 'event', at: 303, runId: 'run-blocks', event: { type: 'MessageDeltaText', messageId: 'a-blocks-1', choiceIndex: 0, text: 'world' } },
    ],
  },
  {
    id: 'tool_call_append_then_replace_merge_behavior',
    userBehavior: 'Tool-call arguments stream in append mode, then final replace overwrites arguments text.',
    operations: [
      {
        kind: 'start',
        input: {
          runId: 'run-tools',
          requestId: 'req-tools-1',
          model: 'openrouter/auto',
          assistantMessageId: 'a-tools-1',
        },
      },
      {
        kind: 'event',
        at: 400,
        runId: 'run-tools',
        event: {
          type: 'MessageDeltaToolCall',
          messageId: 'a-tools-1',
          choiceIndex: 0,
          mergeStrategy: 'append',
          toolCallDeltas: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'lookup', arguments: '{"q":"a' } }],
        },
      },
      {
        kind: 'event',
        at: 401,
        runId: 'run-tools',
        event: {
          type: 'MessageDeltaToolCall',
          messageId: 'a-tools-1',
          choiceIndex: 0,
          mergeStrategy: 'append',
          toolCallDeltas: [{ index: 0, function: { arguments: '"}' } }],
        },
      },
      {
        kind: 'event',
        at: 402,
        runId: 'run-tools',
        event: {
          type: 'MessageDeltaToolCall',
          messageId: 'a-tools-1',
          choiceIndex: 0,
          mergeStrategy: 'replace',
          toolCallDeltas: [{ index: 0, function: { arguments: '{"q":"b"}' } }],
        },
      },
    ],
  },
  {
    id: 'annotation_append_dedupe_and_replace',
    userBehavior: 'Citation annotations append incrementally, dedupe by merge key, then replace on terminal update.',
    operations: [
      {
        kind: 'start',
        input: {
          runId: 'run-annotations',
          requestId: 'req-annotations-1',
          model: 'openrouter/auto',
          assistantMessageId: 'a-annotations-1',
        },
      },
      {
        kind: 'event',
        at: 500,
        runId: 'run-annotations',
        event: {
          type: 'MessageDeltaAnnotationBatch',
          messageId: 'a-annotations-1',
          choiceIndex: 0,
          mergeStrategy: 'append',
          annotations: [
            {
              type: 'url_citation',
              url_citation: {
                url: 'https://example.com/a',
                start_index: 0,
                end_index: 5,
              },
            },
          ],
        },
      },
      {
        kind: 'event',
        at: 501,
        runId: 'run-annotations',
        event: {
          type: 'MessageDeltaAnnotationBatch',
          messageId: 'a-annotations-1',
          choiceIndex: 0,
          mergeStrategy: 'append',
          annotations: [
            {
              type: 'url_citation',
              url_citation: {
                url: 'https://example.com/a',
                start_index: 0,
                end_index: 5,
              },
            },
            {
              type: 'url_citation',
              url_citation: {
                url: 'https://example.com/b',
                start_index: 6,
                end_index: 8,
              },
            },
          ],
        },
      },
      {
        kind: 'event',
        at: 502,
        runId: 'run-annotations',
        event: {
          type: 'MessageDeltaAnnotationBatch',
          messageId: 'a-annotations-1',
          choiceIndex: 0,
          mergeStrategy: 'replace',
          annotations: [
            {
              type: 'url_citation',
              url_citation: {
                url: 'https://example.com/b',
                start_index: 6,
                end_index: 8,
              },
            },
          ],
        },
      },
    ],
  },
  {
    id: 'reasoning_detail_and_batch_merge_summary_and_encrypted',
    userBehavior: 'Reasoning details stream as patches; summary/text merge while encrypted marker is retained.',
    operations: [
      {
        kind: 'start',
        input: {
          runId: 'run-reasoning',
          requestId: 'req-reasoning-1',
          model: 'openrouter/auto',
          assistantMessageId: 'a-reasoning-1',
          requestedReasoningMode: 'effort',
          requestedReasoningEffort: 'high',
          requestedReasoningExclude: false,
        },
      },
      {
        kind: 'event',
        at: 600,
        runId: 'run-reasoning',
        event: {
          type: 'MessageDeltaReasoningDetail',
          messageId: 'a-reasoning-1',
          choiceIndex: 0,
          detail: {
            id: 'd1',
            index: 0,
            type: 'reasoning.text',
            format: 'text',
            text: 'abc',
            summary: 'S1',
          },
        },
      },
      {
        kind: 'event',
        at: 601,
        runId: 'run-reasoning',
        event: {
          type: 'MessageDeltaReasoningDetailBatch',
          messageId: 'a-reasoning-1',
          choiceIndex: 0,
          details: [
            {
              id: 'd1',
              index: 0,
              type: 'reasoning.text',
              format: 'text',
              text: 'abcdef',
              summary: 'S12',
            },
            {
              id: 'd2',
              index: 1,
              type: 'reasoning.encrypted',
            },
          ],
        },
      },
      { kind: 'event', at: 602, runId: 'run-reasoning', event: { type: 'StreamDone' } },
    ],
  },
  {
    id: 'stream_error_mid_stream_marks_error_and_finalizes_timing',
    userBehavior: 'Mid-stream provider error keeps partial text and marks run/message as failed.',
    operations: [
      {
        kind: 'start',
        input: {
          runId: 'run-error',
          requestId: 'req-error-1',
          model: 'openrouter/auto',
          assistantMessageId: 'a-error-1',
        },
      },
      { kind: 'event', at: 700, runId: 'run-error', event: { type: 'TimingSnapshot', tAck: 700 } },
      { kind: 'event', at: 740, runId: 'run-error', event: { type: 'MessageDeltaText', messageId: 'a-error-1', choiceIndex: 0, text: 'partial' } },
      {
        kind: 'event',
        at: 760,
        runId: 'run-error',
        event: {
          type: 'StreamError',
          terminal: true,
          error: MID_STREAM_ERROR as any,
        },
      },
    ],
  },
  {
    id: 'stream_abort_user_abort_and_ignores_late_error_and_done',
    userBehavior: 'User abort terminates run; late StreamError/StreamDone are ignored for terminal semantics.',
    operations: [
      {
        kind: 'start',
        input: {
          runId: 'run-abort',
          requestId: 'req-abort-1',
          model: 'openrouter/auto',
          assistantMessageId: 'a-abort-1',
        },
      },
      { kind: 'event', at: 800, runId: 'run-abort', event: { type: 'TimingSnapshot', tAck: 800 } },
      { kind: 'event', at: 830, runId: 'run-abort', event: { type: 'MessageDeltaText', messageId: 'a-abort-1', choiceIndex: 0, text: 'part' } },
      {
        kind: 'event',
        at: 840,
        runId: 'run-abort',
        event: {
          type: 'StreamAbort',
          reason: 'user',
          envelope: USER_ABORT as any,
        },
      },
      {
        kind: 'event',
        at: 841,
        runId: 'run-abort',
        event: {
          type: 'StreamError',
          terminal: true,
          error: MID_STREAM_ERROR as any,
        },
      },
      { kind: 'event', at: 842, runId: 'run-abort', event: { type: 'StreamDone' } },
    ],
  },
  {
    id: 'retry_start_generation_clears_run_error_and_rebinds_target',
    userBehavior: 'User retries after an error: run state resets and target assistant message changes.',
    operations: [
      {
        kind: 'start',
        input: {
          runId: 'run-retry',
          requestId: 'req-retry-1',
          model: 'openrouter/auto',
          assistantMessageId: 'a-retry-1',
        },
      },
      { kind: 'event', at: 900, runId: 'run-retry', event: { type: 'MessageDeltaText', messageId: 'a-retry-1', choiceIndex: 0, text: 'partial' } },
      {
        kind: 'event',
        at: 910,
        runId: 'run-retry',
        event: {
          type: 'StreamError',
          terminal: true,
          error: MID_STREAM_ERROR as any,
        },
      },
      {
        kind: 'start',
        input: {
          runId: 'run-retry',
          requestId: 'req-retry-2',
          model: 'openrouter/auto',
          assistantMessageId: 'a-retry-2',
          userMessageId: 'u-retry-2',
          userMessageText: 'retry prompt',
        },
      },
    ],
  },
  {
    id: 'regenerate_reuses_existing_ids_without_duplicates',
    userBehavior: 'Regenerate against preloaded transcript keeps message-id list deduplicated.',
    operations: [
      {
        kind: 'start',
        input: {
          runId: 'run-regenerate',
          requestId: 'req-regenerate-1',
          model: 'openrouter/auto',
          assistantMessageId: 'a-regenerate-1',
          userMessageId: 'u-regenerate-1',
          userMessageText: 'Q1',
        },
      },
      {
        kind: 'start',
        input: {
          runId: 'run-regenerate',
          requestId: 'req-regenerate-2',
          model: 'openrouter/auto',
          assistantMessageId: 'a-regenerate-1',
          userMessageId: 'u-regenerate-1',
          userMessageText: 'Q1',
        },
      },
    ],
  },
  {
    id: 'branch_switch_like_multi_run_isolation',
    userBehavior: 'Switching between branches (runIds) keeps event application isolated per run.',
    operations: [
      {
        kind: 'start',
        input: {
          runId: 'run-branch-a',
          requestId: 'req-branch-a-1',
          model: 'openrouter/auto',
          assistantMessageId: 'a-branch-a-1',
          userMessageId: 'u-branch-a-1',
          userMessageText: 'A',
        },
      },
      {
        kind: 'start',
        input: {
          runId: 'run-branch-b',
          requestId: 'req-branch-b-1',
          model: 'openrouter/auto',
          assistantMessageId: 'a-branch-b-1',
          userMessageId: 'u-branch-b-1',
          userMessageText: 'B',
        },
      },
      { kind: 'event', at: 1000, runId: 'run-branch-a', event: { type: 'MessageDeltaText', messageId: 'a-branch-a-1', choiceIndex: 0, text: 'A1' } },
      { kind: 'event', at: 1010, runId: 'run-branch-b', event: { type: 'MessageDeltaText', messageId: 'a-branch-b-1', choiceIndex: 0, text: 'B1' } },
      { kind: 'event', at: 1020, runId: 'run-branch-a', event: { type: 'StreamDone' } },
    ],
  },
  {
    id: 'meta_and_usage_delta_update_run_fields',
    userBehavior: 'Model/provider preferences and usage telemetry flow through run metadata.',
    operations: [
      {
        kind: 'start',
        input: {
          runId: 'run-meta',
          requestId: 'req-meta-1',
          model: 'openrouter/auto',
          assistantMessageId: 'a-meta-1',
        },
      },
      {
        kind: 'event',
        at: 1100,
        runId: 'run-meta',
        event: {
          type: 'MetaDelta',
          meta: {
            id: 'gen-meta-1',
            model: 'anthropic/claude-3.7-sonnet',
            provider: 'openrouter',
            finish_reason: 'tool_calls',
            native_finish_reason: 'tool_calls',
          },
        },
      },
      {
        kind: 'event',
        at: 1110,
        runId: 'run-meta',
        event: {
          type: 'UsageDelta',
          usage: {
            prompt_tokens: 120,
            completion_tokens: 33,
            total_tokens: 153,
          },
        },
      },
    ],
  },
  {
    id: 'unknown_message_text_delta_can_flip_status_without_message_mutation',
    userBehavior: 'Out-of-order text event references missing message id while run is still requesting.',
    operations: [
      {
        kind: 'start',
        input: {
          runId: 'run-missing-message',
          requestId: 'req-missing-message-1',
          model: 'openrouter/auto',
          assistantMessageId: 'a-missing-message-1',
        },
      },
      {
        kind: 'event',
        at: 1200,
        runId: 'run-missing-message',
        event: {
          type: 'MessageDeltaText',
          messageId: 'ghost-message',
          choiceIndex: 0,
          text: 'ghost',
        },
      },
    ],
  },
  {
    id: 'generated_ids_are_masked_in_snapshot',
    userBehavior: 'When IDs are generated instead of injected, snapshot output stays deterministic via masking.',
    operations: [
      {
        kind: 'start',
        input: {
          runId: 'run-generated',
          requestId: 'req-generated-1',
          model: 'openrouter/auto',
        },
      },
    ],
  },
]

function replayOperations(operations: readonly Operation[]): RootState {
  let state = createInitialStateCore()
  let now = 0
  let generatedCounter = 0
  const options = {
    now: () => now,
    generateId: (prefix: string) => `${prefix}_generated_${++generatedCounter}`,
  }

  for (const op of operations) {
    if (typeof op.at === 'number') now = op.at
    if (op.kind === 'start') {
      state = startGenerationCore(state, op.input, options).state
      continue
    }
    state = applyEventCore(state, op.runId, op.event, options)
  }

  return state
}

function summarizeError(error: unknown): Record<string, unknown> | null {
  if (!error || typeof error !== 'object') return null
  const row = error as Record<string, unknown>
  return {
    completionClass: typeof row.completionClass === 'string' ? row.completionClass : null,
    phase: typeof row.phase === 'string' ? row.phase : null,
    category: typeof row.category === 'string' ? row.category : null,
    grade: typeof row.grade === 'number' ? row.grade : null,
    code: typeof row.code === 'string' ? row.code : null,
    message: typeof row.message === 'string' ? row.message : null,
    provider: typeof row.provider === 'string' ? row.provider : null,
  }
}

function stableUnknown(input: unknown): unknown {
  if (Array.isArray(input)) return input.map((entry) => stableUnknown(entry))
  if (typeof input === 'string') return maskGeneratedId(input)
  if (!input || typeof input !== 'object') return input

  const row = input as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(row).sort()) {
    out[key] = stableUnknown(row[key])
  }
  return out
}

function maskGeneratedId(value: string): string {
  if (/^assistant_generated_\d+$/.test(value)) return 'assistant_generated_*'
  if (/^user_generated_\d+$/.test(value)) return 'user_generated_*'
  return value
}

function summarizeMessage(message: MessageState): Record<string, unknown> {
  return {
    messageId: maskGeneratedId(message.messageId),
    role: message.role,
    contentText: message.contentText,
    contentBlocks: message.contentBlocks.map((block) => stableUnknown(block)),
    toolCalls: message.toolCalls.map((toolCall) => stableUnknown(toolCall)),
    annotations: message.annotations ? stableUnknown(message.annotations) : null,
    requestedImageGeneration: message.requestedImageGeneration ?? false,
    requestedReasoningMode: message.requestedReasoningMode,
    requestedReasoningEffort: message.requestedReasoningEffort ?? null,
    requestedReasoningExclude: message.requestedReasoningExclude,
    textVersion: message.textVersion,
    reasoningVersion: message.reasoningVersion,
    reasoning: {
      detailsCount: message.reasoningDetailsRaw.length,
      summaryText: message.reasoningSummaryText ?? null,
      piecesText: (message.reasoningPieces ?? []).map((piece) => piece.text).join(''),
      piecesCount: (message.reasoningPieces ?? []).length,
      lastPieceLen: message.reasoningLastPieceLen ?? null,
      panelState: message.reasoningPanelState,
      hasEncryptedReasoning: message.hasEncryptedReasoning,
      durationMs: message.reasoningDurationMs ?? null,
      endReason: message.reasoningEndReason ?? null,
      durationIsFallback: message.reasoningDurationIsFallback ?? null,
    },
    streaming: {
      isTarget: message.streaming.isTarget,
      isComplete: message.streaming.isComplete,
    },
    error: summarizeError(message.errorEnvelope),
  }
}

function summarizeState(state: RootState): Record<string, unknown> {
  const runIds = Object.keys(state.runs).sort()

  return {
    aliases: {
      entitiesMessagesByIdIsMessages: state.entities.messagesById === state.messages,
      viewsTranscriptsByRunIdIsRunMessageIds: state.views.transcriptsByRunId === state.runMessageIds,
    },
    runCount: runIds.length,
    runs: runIds.map((runId) => {
      const run = state.runs[runId]
      const ids = (state.runMessageIds[runId] ?? []).map(maskGeneratedId)
      return {
        runId,
        requestId: run.requestId ?? null,
        status: run.status,
        targetAssistantMessageId: run.targetAssistantMessageId ? maskGeneratedId(run.targetAssistantMessageId) : null,
        generationId: run.generationId ? maskGeneratedId(run.generationId) : null,
        model: run.model ?? null,
        provider: run.provider ?? null,
        finishReason: run.finishReason ?? null,
        nativeFinishReason: run.nativeFinishReason ?? null,
        completionOutcome: run.completionOutcome ?? null,
        usage: run.usage ? stableUnknown(run.usage) : null,
        error: summarizeError(run.error),
        comments: [...run.comments],
        timing: {
          tRequestStart: run.tRequestStart ?? null,
          tAck: run.tAck ?? null,
          tEnd: run.tEnd ?? null,
          tTransportClosed: run.tTransportClosed ?? null,
          endReason: run.endReason ?? null,
          localProcessingDurationMs: run.localProcessingDurationMs ?? null,
          timingFinalized: run.timingFinalized ?? false,
        },
        transcriptMessageIds: ids,
        transcript: ids.map((messageId) => {
          const raw = state.messages[messageId]
          return raw
            ? summarizeMessage(raw)
            : {
                messageId,
                missing: true,
              }
        }),
      }
    }),
    allMessageIds: Object.keys(state.messages).sort().map(maskGeneratedId),
  }
}

function assertCoreInvariants(state: RootState): void {
  expect(state.entities.messagesById).toBe(state.messages)
  expect(state.views.transcriptsByRunId).toBe(state.runMessageIds)

  for (const [runId, run] of Object.entries(state.runs)) {
    const ids = state.runMessageIds[runId] ?? []
    expect(new Set(ids).size).toBe(ids.length)

    for (const messageId of ids) {
      expect(state.messages[messageId]).toBeDefined()
    }

    if (run.targetAssistantMessageId) {
      expect(state.messages[run.targetAssistantMessageId]).toBeDefined()
      expect(ids.includes(run.targetAssistantMessageId)).toBe(true)
    }

    if (run.timingFinalized) {
      expect(typeof run.tEnd).toBe('number')
    }

    if (run.error) {
      expect(run.status).toBe('error')
    }

    if ((run.status === 'done' || run.status === 'error' || run.status === 'aborted') && run.targetAssistantMessageId) {
      const target = state.messages[run.targetAssistantMessageId]
      if (target) {
        expect(target.streaming.isComplete).toBe(true)
      }
    }
  }
}

function summarizeEventDistribution(scenarios: readonly Scenario[]): Record<string, unknown> {
  const byType: Record<string, number> = Object.fromEntries(DOMAIN_EVENT_TYPES.map((type) => [type, 0]))

  const perCase = scenarios.map((scenario) => {
    const events = scenario.operations.filter((op): op is EventOperation => op.kind === 'event').map((op) => op.event)
    const seen = new Set<string>()
    for (const event of events) {
      byType[event.type] = (byType[event.type] ?? 0) + 1
      seen.add(event.type)
    }
    return {
      id: scenario.id,
      operationCount: scenario.operations.length,
      eventCount: events.length,
      eventTypes: [...seen].sort(),
    }
  })

  return {
    scenarioCount: scenarios.length,
    eventCount: perCase.reduce((sum, row) => sum + (row.eventCount as number), 0),
    eventTypeCounts: byType,
    uncoveredEventTypes: DOMAIN_EVENT_TYPES.filter((type) => byType[type] === 0),
    perCase,
  }
}

describe('reducerCore characterization: event surface and distribution', () => {
  it('documents domain event coverage for this characterization suite', () => {
    expect(summarizeEventDistribution(SCENARIOS)).toMatchSnapshot()
  })
})

describe('reducerCore characterization snapshots', () => {
  for (const scenario of SCENARIOS) {
    it(scenario.id, () => {
      const finalState = replayOperations(scenario.operations)
      assertCoreInvariants(finalState)

      expect({
        caseId: scenario.id,
        userBehavior: scenario.userBehavior,
        state: summarizeState(finalState),
      }).toMatchSnapshot()
    })
  }
})
