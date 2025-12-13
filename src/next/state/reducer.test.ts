import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { decodeOpenRouterSSE } from '../openrouter/sse/decoder'
import { mapChunkToEvents } from '../openrouter/mapChunkToEvents'
import { applyEvents, createInitialState, startGeneration } from './reducer'
import type { DomainEvent } from './types'
import { selectSession, selectTranscript } from './selectors'

function readFixtureText(fileName: string) {
  const fullPath = path.join(process.cwd(), 'src/next/openrouter/sse/fixtures', fileName)
  return fs.readFileSync(fullPath, 'utf8')
}

async function replayFixture(sessionId: string, assistantMessageId: string, fileName: string): Promise<DomainEvent[]> {
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
      out.push({ type: 'StreamError', error: { message: ev.message, raw: ev.raw }, terminal: true })
      break
    }
    if (ev.type === 'terminal_error') {
      // Decoder already emitted the error JSON chunk; mapper produces StreamError.
      break
    }
    if (ev.type === 'json') {
      const mapped = mapChunkToEvents({ chunk: ev.value as any, messageId: assistantMessageId })
      out.push(...(mapped as any))
    }
  }
  return out
}

describe('next/state reducer', () => {
  it('creates assistant placeholder before streaming and accumulates deltas', async () => {
    const sessionId = 's1'
    const started = startGeneration(createInitialState(), {
      sessionId,
      requestId: 'r1',
      model: 'openrouter/auto',
      assistantMessageId: 'assistant_1',
    })

    const events = await replayFixture(sessionId, started.assistantMessageId, 'comment_done.txt')
    const finalState = applyEvents(started.state, sessionId, events)

    expect(selectSession(finalState, sessionId)).toMatchInlineSnapshot(`
      {
        "error": undefined,
        "finishReason": undefined,
        "generationId": "gen_1",
        "model": "openrouter/auto",
        "nativeFinishReason": undefined,
        "provider": undefined,
        "requestId": "r1",
        "sessionId": "s1",
        "status": "done",
        "usage": undefined,
      }
    `)

    expect(selectTranscript(finalState, sessionId)).toMatchInlineSnapshot(`
      [
        {
          "contentBlocks": [
            {
              "text": "hi",
              "type": "text",
            },
          ],
          "messageId": "assistant_1",
          "reasoningView": {
            "hasEncrypted": false,
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

  it('mid-stream error preserves partial content and marks session error', async () => {
    const sessionId = 's1'
    const started = startGeneration(createInitialState(), {
      sessionId,
      requestId: 'r1',
      model: 'openrouter/auto',
      assistantMessageId: 'assistant_1',
    })

    const events = await replayFixture(sessionId, started.assistantMessageId, 'midstream_error.txt')
    const finalState = applyEvents(started.state, sessionId, events)

    const session = selectSession(finalState, sessionId)
    expect(session?.status).toBe('error')
    const transcript = selectTranscript(finalState, sessionId)
    expect(transcript[0]?.contentBlocks?.[0]).toEqual({ type: 'text', text: 'partial' })
  })

  it('abort preserves partial content and marks session aborted', () => {
    const sessionId = 's1'
    const started = startGeneration(createInitialState(), {
      sessionId,
      requestId: 'r1',
      model: 'openrouter/auto',
      assistantMessageId: 'assistant_1',
    })
    const assistantMessageId = started.assistantMessageId

    const events: DomainEvent[] = [
      { type: 'MessageDeltaText', messageId: assistantMessageId, choiceIndex: 0, text: 'par' },
      { type: 'StreamAbort', reason: 'user' },
    ]
    const finalState = applyEvents(started.state, sessionId, events)

    expect(selectSession(finalState, sessionId)?.status).toBe('aborted')
    expect(selectTranscript(finalState, sessionId)[0]?.contentBlocks?.[0]).toEqual({ type: 'text', text: 'par' })
  })
})
