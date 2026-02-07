/* eslint-disable max-lines-per-function */
import { describe, expect, it } from 'vitest'
import { applyEventCore, createInitialStateCore, startGenerationCore } from './reducerCore'
import type { DomainEvent, RootState } from './types'

function summarizeState(state: RootState, runId: string) {
  const run = state.runs[runId]
  const ids = state.runMessageIds[runId] ?? []
  const messages = ids
    .map((id) => state.messages[id])
    .filter((m): m is NonNullable<(typeof state.messages)[string]> => !!m)
    .map((m) => ({
      id: m.messageId,
      role: m.role,
      text: m.contentText,
      isComplete: m.streaming.isComplete,
      reasoningEndReason: m.reasoningEndReason ?? null,
      reasoningDurationMs: m.reasoningDurationMs ?? null,
      reasoningSummaryText: m.reasoningSummaryText ?? null,
      reasoningPiecesText: (m.reasoningPieces ?? []).map((p) => p.text).join(''),
      error: m.errorEnvelope
        ? {
            completionClass: (m.errorEnvelope as any).completionClass ?? null,
            phase: (m.errorEnvelope as any).phase ?? null,
            category: (m.errorEnvelope as any).category ?? null,
            grade: (m.errorEnvelope as any).grade ?? null,
          }
        : null,
    }))

  return {
    run: run
      ? {
          runId: run.runId,
          status: run.status,
          endReason: run.endReason ?? null,
          timingFinalized: run.timingFinalized,
          tAck: run.tAck ?? null,
          tEnd: run.tEnd ?? null,
          localProcessingDurationMs: run.localProcessingDurationMs ?? null,
          error: run.error
            ? {
                completionClass: (run.error as any).completionClass ?? null,
                phase: (run.error as any).phase ?? null,
                category: (run.error as any).category ?? null,
                grade: (run.error as any).grade ?? null,
              }
            : null,
        }
      : null,
    messageCount: messages.length,
    messages,
  }
}

function assertCoreInvariants(state: RootState, runId: string): void {
  const ids = state.runMessageIds[runId] ?? []
  expect(new Set(ids).size).toBe(ids.length)
  for (const id of ids) {
    expect(state.messages[id]).toBeDefined()
  }
}

function replayWithClock(
  state: RootState,
  runId: string,
  steps: Array<{ at: number; event: DomainEvent }>
): RootState {
  let now = 0
  let next = state
  const options = { now: () => now }
  for (const step of steps) {
    now = step.at
    next = applyEventCore(next, runId, step.event, options)
  }
  return next
}

describe('reducerCore semantic snapshots', () => {
  it('normal stream flow snapshot', () => {
    const runId = 'run-normal'
    const started = startGenerationCore(createInitialStateCore(), {
      runId,
      requestId: 'req-normal',
      model: 'openrouter/auto',
      assistantMessageId: 'a1',
      userMessageId: 'u1',
      userMessageText: 'hello',
    })

    const finalState = replayWithClock(started.state, runId, [
      { at: 100, event: { type: 'TimingSnapshot', tAck: 100 } },
      { at: 120, event: { type: 'MessageDeltaText', messageId: 'a1', choiceIndex: 0, text: 'hi' } },
      { at: 130, event: { type: 'StreamDone' } },
    ])

    assertCoreInvariants(finalState, runId)
    expect(summarizeState(finalState, runId)).toMatchInlineSnapshot(`
      {
        "messageCount": 2,
        "messages": [
          {
            "error": null,
            "id": "u1",
            "isComplete": true,
            "reasoningDurationMs": null,
            "reasoningEndReason": null,
            "reasoningPiecesText": "",
            "reasoningSummaryText": null,
            "role": "user",
            "text": "hello",
          },
          {
            "error": null,
            "id": "a1",
            "isComplete": true,
            "reasoningDurationMs": 20,
            "reasoningEndReason": "normal_complete",
            "reasoningPiecesText": "",
            "reasoningSummaryText": null,
            "role": "assistant",
            "text": "hi",
          },
        ],
        "run": {
          "endReason": "normal_complete",
          "error": null,
          "localProcessingDurationMs": 20,
          "runId": "run-normal",
          "status": "done",
          "tAck": 100,
          "tEnd": 120,
          "timingFinalized": true,
        },
      }
    `)
  })

  it('mid-stream error snapshot', () => {
    const runId = 'run-error'
    const started = startGenerationCore(createInitialStateCore(), {
      runId,
      requestId: 'req-error',
      model: 'openrouter/auto',
      assistantMessageId: 'a2',
    })

    const finalState = replayWithClock(started.state, runId, [
      { at: 200, event: { type: 'TimingSnapshot', tAck: 200 } },
      { at: 240, event: { type: 'MessageDeltaText', messageId: 'a2', choiceIndex: 0, text: 'partial' } },
      {
        at: 260,
        event: {
          type: 'StreamError',
          terminal: true,
          error: { completionClass: 'error', phase: 'mid_stream', category: 'rate_limited', grade: 1 } as any,
        },
      },
    ])

    assertCoreInvariants(finalState, runId)
    expect(summarizeState(finalState, runId)).toMatchInlineSnapshot(`
      {
        "messageCount": 1,
        "messages": [
          {
            "error": {
              "category": "rate_limited",
              "completionClass": "error",
              "grade": 1,
              "phase": "mid_stream",
            },
            "id": "a2",
            "isComplete": true,
            "reasoningDurationMs": 40,
            "reasoningEndReason": "mid_stream_error",
            "reasoningPiecesText": "",
            "reasoningSummaryText": null,
            "role": "assistant",
            "text": "partial",
          },
        ],
        "run": {
          "endReason": "mid_stream_error",
          "error": {
            "category": "rate_limited",
            "completionClass": "error",
            "grade": 1,
            "phase": "mid_stream",
          },
          "localProcessingDurationMs": 40,
          "runId": "run-error",
          "status": "error",
          "tAck": 200,
          "tEnd": 240,
          "timingFinalized": true,
        },
      }
    `)
  })

  it('user-cancelled snapshot', () => {
    const runId = 'run-cancel'
    const started = startGenerationCore(createInitialStateCore(), {
      runId,
      requestId: 'req-cancel',
      model: 'openrouter/auto',
      assistantMessageId: 'a3',
    })

    const finalState = replayWithClock(started.state, runId, [
      { at: 300, event: { type: 'TimingSnapshot', tAck: 300 } },
      { at: 350, event: { type: 'MessageDeltaText', messageId: 'a3', choiceIndex: 0, text: 'part' } },
      { at: 360, event: { type: 'StreamAbort', reason: 'user', envelope: { completionClass: 'aborted', phase: 'mid_stream' } as any } },
    ])

    assertCoreInvariants(finalState, runId)
    expect(summarizeState(finalState, runId)).toMatchInlineSnapshot(`
      {
        "messageCount": 1,
        "messages": [
          {
            "error": {
              "category": null,
              "completionClass": "aborted",
              "grade": null,
              "phase": "mid_stream",
            },
            "id": "a3",
            "isComplete": true,
            "reasoningDurationMs": 50,
            "reasoningEndReason": "user_abort",
            "reasoningPiecesText": "",
            "reasoningSummaryText": null,
            "role": "assistant",
            "text": "part",
          },
        ],
        "run": {
          "endReason": "user_abort",
          "error": null,
          "localProcessingDurationMs": 50,
          "runId": "run-cancel",
          "status": "aborted",
          "tAck": 300,
          "tEnd": 350,
          "timingFinalized": true,
        },
      }
    `)
  })

  it('reasoning detail batch snapshot', () => {
    const runId = 'run-reasoning'
    const started = startGenerationCore(createInitialStateCore(), {
      runId,
      requestId: 'req-reasoning',
      model: 'openrouter/auto',
      assistantMessageId: 'a4',
    })

    const finalState = replayWithClock(started.state, runId, [
      {
        at: 410,
        event: {
          type: 'MessageDeltaReasoningDetailBatch',
          messageId: 'a4',
          choiceIndex: 0,
          details: [
            { id: 'd1', index: 0, type: 'reasoning.text', format: 'text', text: 'abc', summary: 'S1' },
            { id: 'd1', index: 0, type: 'reasoning.text', format: 'text', text: 'abcdef', summary: 'S12' },
          ],
        },
      },
      { at: 420, event: { type: 'StreamDone' } },
    ])

    assertCoreInvariants(finalState, runId)
    expect(summarizeState(finalState, runId)).toMatchInlineSnapshot(`
      {
        "messageCount": 1,
        "messages": [
          {
            "error": null,
            "id": "a4",
            "isComplete": true,
            "reasoningDurationMs": null,
            "reasoningEndReason": "normal_complete",
            "reasoningPiecesText": "abcdef",
            "reasoningSummaryText": "S12",
            "role": "assistant",
            "text": "",
          },
        ],
        "run": {
          "endReason": "normal_complete",
          "error": null,
          "localProcessingDurationMs": null,
          "runId": "run-reasoning",
          "status": "done",
          "tAck": null,
          "tEnd": 420,
          "timingFinalized": true,
        },
      }
    `)
  })
})
