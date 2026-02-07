import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyEvent, startGeneration, createInitialState } from './reducer'

describe('reducerAdapter compaction behavior', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('async compact keeps transcript/message references semantically valid', async () => {
    vi.useFakeTimers()

    const runId = 'run-compaction'
    const { state: started, assistantMessageId } = startGeneration(createInitialState(), {
      runId,
      requestId: 'req-compaction',
      model: 'openrouter/auto',
      assistantMessageId: 'assistant_compact',
    })

    const transcriptRef = started.views.transcriptsByRunId[runId]
    const messagesByIdRef = started.entities.messagesById
    const hugeText = 'x'.repeat(2048 * 201)

    const next = applyEvent(started, runId, {
      type: 'MessageDeltaReasoningDetail',
      messageId: assistantMessageId,
      choiceIndex: 0,
      detail: {
        id: 'detail-1',
        index: 0,
        type: 'reasoning.text',
        format: 'text',
        text: hugeText,
      },
    })

    await vi.runAllTimersAsync()

    expect(next.views.transcriptsByRunId[runId]).toBe(transcriptRef)
    expect(next.entities.messagesById).toBe(messagesByIdRef)
    expect(next.entities.messagesById[assistantMessageId]).toBeDefined()
    expect(next.views.transcriptsByRunId[runId]).toContain(assistantMessageId)

    const assistant = next.entities.messagesById[assistantMessageId]
    expect(Array.isArray(assistant.reasoningPieces)).toBe(true)
    expect((assistant.reasoningPieces ?? []).length).toBeLessThanOrEqual(200)
  })
})
