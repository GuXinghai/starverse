/* eslint-disable max-lines-per-function */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { decodeOpenRouterSSE } from '../openrouter/sse/decoder'
import { buildAbortEnvelope, sanitizeErrorEnvelope } from '../errors/openRouterErrorEnvelope'
import { mapChunkToEvents } from '../openrouter/mapChunkToEvents'
import { buildMidStreamSseErrorEnvelope, buildTransportErrorEnvelope } from '../errors/openRouterErrorEnvelope'
import { normalizeOpenRouterErrorFromSseChunkError, normalizeOpenRouterUnknownStreamingError } from '../errors/normalizeOpenRouterError'
import { applyEvent, applyEvents, createInitialState, startGeneration } from './reducer'
import type { DomainEvent } from './types'
import { selectRun, selectTranscript } from './selectors'

function readFixtureText(fileName: string) {
  const fullPath = path.join(process.cwd(), 'src/next/openrouter/sse/fixtures', fileName)
  return fs.readFileSync(fullPath, 'utf8')
}


  it('keeps non-target message references and transcript ids stable across deltas', () => {
    const runId = 'r1'
    const started = startGeneration(createInitialState(), {
      runId,
      requestId: 'req1',
      model: 'openrouter/auto',
      assistantMessageId: 'assistant_1',
      userMessageId: 'user_1',
      userMessageText: 'hello',
    })

    const s1 = started.state
    const idsRef = s1.views?.transcriptsByRunId?.[runId]
    const messagesByIdRef = s1.entities?.messagesById
    const userRef = messagesByIdRef?.user_1
    const assistantRef = messagesByIdRef?.assistant_1

    const s2 = applyEvents(s1, runId, [
      { type: 'MessageDeltaText', messageId: 'assistant_1', choiceIndex: 0, text: 'hi' },
      { type: 'MessageDeltaText', messageId: 'assistant_1', choiceIndex: 0, text: ' there' },
    ])

    expect(s2.views?.transcriptsByRunId?.[runId]).toBe(idsRef)
    expect(s2.entities?.messagesById).toBe(messagesByIdRef)
    expect(s2.entities?.messagesById?.user_1).toBe(userRef)
    expect(s2.entities?.messagesById?.assistant_1).not.toBe(assistantRef)
  })

  it('increments textVersion / reasoningVersion only on change', () => {
    const runId = 'r1'
    const started = startGeneration(createInitialState(), {
      runId,
      requestId: 'req1',
      model: 'openrouter/auto',
      assistantMessageId: 'assistant_1',
      userMessageId: 'user_1',
      userMessageText: 'hello',
    })

    const s1 = started.state
    const base = s1.entities?.messagesById?.assistant_1
    const baseTextVersion = base?.textVersion ?? 0
    const baseReasoningVersion = base?.reasoningVersion ?? 0

    const s2 = applyEvent(s1, runId, { type: 'MessageDeltaText', messageId: 'assistant_1', choiceIndex: 0, text: '' })
    expect(s2.entities?.messagesById?.assistant_1).toBe(base)
    expect(s2.entities?.messagesById?.assistant_1?.textVersion).toBe(baseTextVersion)

    const s3 = applyEvent(s1, runId, { type: 'MessageDeltaText', messageId: 'assistant_1', choiceIndex: 0, text: 'x' })
    expect(s3.entities?.messagesById?.assistant_1?.textVersion).toBe(baseTextVersion + 1)

    const s4 = applyEvent(s3, runId, {
      type: 'MessageDeltaReasoningDetailBatch',
      messageId: 'assistant_1',
      choiceIndex: 0,
      details: [],
    })
    expect(s4.entities?.messagesById?.assistant_1?.reasoningVersion).toBe(s3.entities?.messagesById?.assistant_1?.reasoningVersion)

    const s5 = applyEvent(s3, runId, {
      type: 'MessageDeltaReasoningDetail',
      messageId: 'assistant_1',
      choiceIndex: 0,
      detail: { type: 'reasoning.text', text: 'r' },
    })
    expect(s5.entities?.messagesById?.assistant_1?.reasoningVersion).toBe(baseReasoningVersion + 1)
  })
async function replayFixture(_runId: string, assistantMessageId: string, fileName: string): Promise<DomainEvent[]> {
  const text = readFixtureText(fileName)
  const bytes = new TextEncoder().encode(text)

  async function* chunks() {
    for (let i = 0; i < bytes.length; i += 11) {
      yield bytes.slice(i, i + 11)
    }
  }

  const out: DomainEvent[] = []
  for await (const ev of decodeOpenRouterSSE(chunks())) {
    if (ev.type === 'comment') {
      out.push({ type: 'StreamComment', text: ev.text })
      continue
    }
    if (ev.type === 'done') {
      out.push({ type: 'StreamDone' })
      continue
    }
    if (ev.type === 'protocol_error') {
      const normalized = normalizeOpenRouterUnknownStreamingError({ message: ev.message, details: { raw: ev.raw ? { raw: ev.raw } : {} } })
      const envelope = buildTransportErrorEnvelope({
        phase: 'mid_stream',
        completionClass: 'error',
        message: ev.message,
        normalized,
        kind: 'parse_error',
      })
      out.push({ type: 'StreamError', error: envelope, terminal: true })
      break
    }
    if (ev.type === 'terminal_error') {
      // Decoder already emitted the error JSON chunk; mapper produces StreamError.
      break
    }
    if (ev.type === 'json') {
      const mapped = mapChunkToEvents({ chunk: ev.value as any, messageId: assistantMessageId })
      for (const m of mapped as any as DomainEvent[]) {
        if (m.type === 'StreamError') {
          const normalized = normalizeOpenRouterErrorFromSseChunkError({ chunkError: (m as any).error, meta: {} })
          const envelope = buildMidStreamSseErrorEnvelope({
            phase: 'mid_stream',
            completionClass: 'error',
            normalized,
            request: { model: 'openrouter/auto', stream: true },
          })
          out.push({ type: 'StreamError', error: envelope, terminal: true })
          continue
        }
        out.push(m)
      }
    }
  }
  return out
}

describe('next/state reducer', () => {
  it('creates assistant placeholder before streaming and accumulates deltas', async () => {
    const runId = 'r1'
    const started = startGeneration(createInitialState(), {
      runId,
      requestId: 'req1',
      model: 'openrouter/auto',
      assistantMessageId: 'assistant_1',
    })

    const events = await replayFixture(runId, started.assistantMessageId, 'comment_done.txt')
    const finalState = applyEvents(started.state, runId, events)

    expect(selectRun(finalState, runId)).toMatchInlineSnapshot(`
      {
        "completionOutcome": undefined,
        "error": undefined,
        "finishReason": undefined,
        "generationId": "gen_1",
        "localProcessingDurationMs": undefined,
        "model": "openrouter/auto",
        "nativeFinishReason": undefined,
        "provider": undefined,
        "requestId": "req1",
        "runId": "r1",
        "status": "done",
        "tAck": undefined,
        "usage": undefined,
      }
    `)

    expect(selectTranscript(finalState, runId)).toMatchInlineSnapshot(`
      [
        {
          "contentBlocks": [
            {
              "text": "hi",
              "type": "text",
            },
          ],
          "errorEnvelope": null,
          "errorSummary": null,
          "messageId": "assistant_1",
          "reasoningDurationIsFallback": undefined,
          "reasoningDurationMs": null,
          "reasoningEndReason": "normal_complete",
          "reasoningView": {
            "hasEncrypted": false,
            "panelState": "expanded",
            "reasoningPieces": undefined,
            "reasoningText": "",
            "summaryText": undefined,
            "visibility": "not_returned",
          },
          "role": "assistant",
          "streaming": {
            "isComplete": true,
            "isTarget": true,
          },
          "toolCalls": [],
        },
      ]
    `)
  })

  it('mid-stream error preserves partial content and marks run error', async () => {
    const runId = 'r1'
    const started = startGeneration(createInitialState(), {
      runId,
      requestId: 'req1',
      model: 'openrouter/auto',
      assistantMessageId: 'assistant_1',
    })

    const events = await replayFixture(runId, started.assistantMessageId, 'midstream_error.txt')
    const finalState = applyEvents(started.state, runId, events)

    const run = selectRun(finalState, runId)
    expect(run?.status).toBe('error')
    const transcript = selectTranscript(finalState, runId)
    expect(transcript[0]?.contentBlocks?.[0]).toEqual({ type: 'text', text: 'partial' })
  })

  it('image blocks: append-only and do not overwrite existing text blocks', () => {
    const runId = 'r1'
    const started = startGeneration(createInitialState(), {
      runId,
      requestId: 'req1',
      model: 'openrouter/auto',
      assistantMessageId: 'assistant_1',
    })
    const assistantMessageId = started.assistantMessageId

    const finalState = applyEvents(started.state, runId, [
      { type: 'MessageDeltaText', messageId: assistantMessageId, choiceIndex: 0, text: 'hello ' },
      {
        type: 'MessageAppendContentBlock',
        messageId: assistantMessageId,
        choiceIndex: 0,
        block: { type: 'image', url: 'https://example.com/cat.png' },
      },
      { type: 'MessageDeltaText', messageId: assistantMessageId, choiceIndex: 0, text: 'world' },
    ])

    const [assistant] = selectTranscript(finalState, runId)
    expect(assistant?.contentBlocks).toEqual([
      { type: 'text', text: 'hello ' },
      { type: 'image', url: 'https://example.com/cat.png' },
      { type: 'text', text: 'world' },
    ])
  })

  it('image block can start streaming (requesting -> streaming)', () => {
    const runId = 'r1'
    const started = startGeneration(createInitialState(), {
      runId,
      requestId: 'req1',
      model: 'openrouter/auto',
      assistantMessageId: 'assistant_1',
    })
    const assistantMessageId = started.assistantMessageId

    const finalState = applyEvents(started.state, runId, [
      {
        type: 'MessageAppendContentBlock',
        messageId: assistantMessageId,
        choiceIndex: 0,
        block: { type: 'image', url: 'https://example.com/cat.png' },
      },
    ])

    expect(selectRun(finalState, runId)?.status).toBe('streaming')
  })

  it('tool_calls: merges streaming deltas, sets finishReason=tool_calls, and exposes structured toolCalls in VM', async () => {
    const runId = 'r1'
    const started = startGeneration(createInitialState(), {
      runId,
      requestId: 'req1',
      model: 'openrouter/auto',
      assistantMessageId: 'assistant_1',
    })

    const events = await replayFixture(runId, started.assistantMessageId, 'tool_calls.txt')
    const finalState = applyEvents(started.state, runId, events)

    const run = selectRun(finalState, runId)
    expect(run?.status).toBe('done')
    expect(run?.finishReason).toBe('tool_calls')

    const [assistant] = selectTranscript(finalState, runId)
    expect(assistant?.role).toBe('assistant')
    expect(assistant?.toolCalls?.length).toBe(1)
    expect(assistant?.toolCalls?.[0]).toMatchObject({
      index: 0,
      id: 'call_1',
      type: 'function',
      name: 'lookup',
      argumentsText: '{"q":"x"}',
    })
  })

  it('StreamDone + finish_reason=length sets completionOutcome=truncated without changing existing end semantics', () => {
    const runId = 'r1'
    const started = startGeneration(createInitialState(), {
      runId,
      requestId: 'req1',
      model: 'openrouter/auto',
      assistantMessageId: 'assistant_1',
    })
    const assistantMessageId = started.assistantMessageId

    const finalState = applyEvents(started.state, runId, [
      { type: 'MessageDeltaText', messageId: assistantMessageId, choiceIndex: 0, text: 'partial' },
      { type: 'MetaDelta', meta: { finish_reason: 'length' } },
      { type: 'StreamDone' },
    ])

    const run = selectRun(finalState, runId)
    expect(run?.completionOutcome).toBe('truncated')
    expect(run?.status).toBe('done')
    expect(finalState.runs[runId]?.endReason).toBe('normal_complete')
  })

  it('StreamError terminal never writes truncated completionOutcome even if finish_reason=length was seen', () => {
    const runId = 'r1'
    const started = startGeneration(createInitialState(), {
      runId,
      requestId: 'req1',
      model: 'openrouter/auto',
      assistantMessageId: 'assistant_1',
    })

    const envelope = sanitizeErrorEnvelope({
      phase: 'mid_stream',
      completionClass: 'error',
      openrouter: { code: 'provider_error', message: 'broken stream' },
      truncated: false,
      kind: 'mid_stream_sse',
    })

    const finalState = applyEvents(started.state, runId, [
      { type: 'MetaDelta', meta: { finish_reason: 'length' } },
      { type: 'StreamError', error: envelope, terminal: true },
    ])

    const run = selectRun(finalState, runId)
    expect(run?.completionOutcome).toBeUndefined()
    expect(run?.status).toBe('error')
    expect(finalState.runs[runId]?.endReason).toBe('mid_stream_error')
  })

  it('abort preserves partial content and marks run aborted', () => {
    const runId = 'r1'
    const started = startGeneration(createInitialState(), {
      runId,
      requestId: 'req1',
      model: 'openrouter/auto',
      assistantMessageId: 'assistant_1',
    })
    const assistantMessageId = started.assistantMessageId

    const events: DomainEvent[] = [
      { type: 'MessageDeltaText', messageId: assistantMessageId, choiceIndex: 0, text: 'par' },
      { type: 'StreamAbort', reason: 'user', envelope: buildAbortEnvelope({ phase: 'mid_stream', completionClass: 'aborted', reason: 'user' }) },
    ]
    const finalState = applyEvents(started.state, runId, events)

    expect(selectRun(finalState, runId)?.status).toBe('aborted')
    expect(selectTranscript(finalState, runId)[0]?.contentBlocks?.[0]).toEqual({ type: 'text', text: 'par' })
  })

  it('truncated completionClass resolves to done (not error)', () => {
    const runId = 'r1'
    const started = startGeneration(createInitialState(), {
      runId,
      requestId: 'req1',
      model: 'openrouter/auto',
      assistantMessageId: 'assistant_1',
    })
    const assistantMessageId = started.assistantMessageId

    const envelope = sanitizeErrorEnvelope({
      phase: 'responses',
      completionClass: 'truncated',
      openrouter: { code: 'max_tokens_exceeded', message: 'trimmed' },
      truncated: false,
      kind: 'responses_event',
    })

    const finalState = applyEvents(started.state, runId, [
      { type: 'MessageDeltaText', messageId: assistantMessageId, choiceIndex: 0, text: 'partial' },
      { type: 'StreamError', error: envelope, terminal: true },
    ])

    expect(selectRun(finalState, runId)?.status).toBe('done')
  })
})
