import { describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createInitialState, applyEvent, startGeneration } from '@/next/state/reducer'
import type { DomainEvent } from '@/next/state/types'
import { replayOpenRouterSSEFixtureAsEvents } from '@/next/openrouter/replayFixtureStream'
import { buildOpenRouterMessages, type InternalMessage } from '@/next/context/buildMessages'

async function readFixture(name: string): Promise<string> {
  return fs.readFile(
    path.resolve(process.cwd(), 'src/next/openrouter/sse/fixtures', name),
    'utf8'
  )
}

async function runFixture(
  name: string,
  options: Readonly<{ abortAfterFirstText?: boolean }> = {}
): Promise<{
  events: DomainEvent[]
  state: ReturnType<typeof createInitialState>
  runId: string
  assistantMessageId: string
}> {
  const fixtureText = await readFixture(name)

  const runId = `run_${name}`
  const assistantMessageId = `assistant_${name}`

  let state = createInitialState()
  state = startGeneration(state, {
    runId,
    requestId: `req_${name}`,
    model: 'openrouter/auto',
    assistantMessageId,
    userMessageId: `user_${name}`,
    userMessageText: `hello_${name}`,
  }).state

  const controller = new AbortController()
  const events: DomainEvent[] = []
  let aborted = false

  for await (const ev of replayOpenRouterSSEFixtureAsEvents(fixtureText, {
    assistantMessageId,
    signal: controller.signal,
  })) {
    events.push(ev)
    state = applyEvent(state, runId, ev)

    if (
      options.abortAfterFirstText &&
      !aborted &&
      ev.type === 'MessageDeltaText' &&
      typeof ev.text === 'string' &&
      ev.text.length > 0
    ) {
      aborted = true
      controller.abort()
    }
  }

  return { events, state, runId, assistantMessageId }
}

function pickObservability(state: any, runId: string) {
  const s = state.runs[runId]
  return {
    generationId: s?.generationId,
    finishReason: s?.finishReason,
    nativeFinishReason: s?.nativeFinishReason,
    usage: s?.usage,
    error: s?.error,
    status: s?.status,
  }
}

describe('TC-11 — vertical slice E2E smoke (fixture replay)', () => {
  it('streaming + usage include: usage tail chunk updates run usage', async () => {
    const { state, runId, assistantMessageId } = await runFixture('usage_tail_choices_empty.txt')

    const obs = pickObservability(state, runId)
    expect(obs.status).toBe('done')
    expect(obs.generationId).toBe('gen_usage_1')
    expect(obs.usage).toMatchObject({
      total_tokens: 123,
      prompt_tokens: 100,
      completion_tokens: 23,
    })

    const msg = state.messages[assistantMessageId]
    expect(msg.contentText).toBe('hello')
    expect(msg.streaming.isComplete).toBe(true)
  })

  it('mid-stream error: preserves partial output and ends in error', async () => {
    const { state, runId, assistantMessageId } = await runFixture('midstream_error.txt')

    const obs = pickObservability(state, runId)
    expect(obs.status).toBe('error')
    expect(obs.generationId).toBe('gen_1')
    expect(obs.finishReason).toBe('error')
    expect(obs.nativeFinishReason).toBe('error')
    expect(obs.error).toMatchObject({ message: 'Upstream error' })

    const msg = state.messages[assistantMessageId]
    expect(msg.contentText).toBe('partial')
    expect(msg.streaming.isComplete).toBe(true)
  })

  it('abort: stops early, keeps partial output, marks run aborted', async () => {
    const { state, runId, assistantMessageId, events } = await runFixture(
      'usage_tail_choices_empty.txt',
      { abortAfterFirstText: true }
    )

    expect(events.some((e) => e.type === 'StreamAbort')).toBe(true)
    const obs = pickObservability(state, runId)
    expect(obs.status).toBe('aborted')
    expect(obs.usage).toBeUndefined()

    const msg = state.messages[assistantMessageId]
    expect(msg.contentText).toBe('hello')
    expect(msg.streaming.isComplete).toBe(true)
  })

  it('debug chunk (choices=[]): does not crash and still streams content', async () => {
    const { state, runId, assistantMessageId } = await runFixture('debug_choices_empty.txt')

    const obs = pickObservability(state, runId)
    expect(obs.status).toBe('done')
    expect(obs.generationId).toBe('gen_dbg_1')

    const msg = state.messages[assistantMessageId]
    expect(msg.contentText).toBe('ok')
    expect(msg.streaming.isComplete).toBe(true)
  })

  it('tool loop + optional reasoning blocks return: default off, advanced preserves sequence', () => {
    const reasoningBlocks = [
      { type: 'reasoning.text', text: 'r1' },
      { type: 'reasoning.summary', summary: 'r2' },
      { type: 'reasoning.encrypted', data: 'abc', format: 'base64' },
    ]

    const history: InternalMessage[] = [
      { role: 'user', content: 'Use a tool and continue.' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'lookup', arguments: '{"q":"x"}' },
          },
        ],
        reasoningDetailsRaw: reasoningBlocks,
      },
      { role: 'tool', toolCallId: 'call_1', toolName: 'lookup', content: '{"ok":true}' },
      { role: 'assistant', content: 'Done.' },
    ]

    const defaultMsgs = buildOpenRouterMessages(history, { mode: 'default' }) as any[]
    expect(defaultMsgs.some((m) => m && typeof m === 'object' && 'reasoning_details' in m)).toBe(false)

    const advancedMsgs = buildOpenRouterMessages(history, { mode: 'advanced_reasoning_blocks' }) as any[]
    const assistantToolCallMsg = advancedMsgs.find((m) => m.role === 'assistant' && Array.isArray(m.tool_calls))
    expect(assistantToolCallMsg).toBeTruthy()
    expect(assistantToolCallMsg.reasoning_details).toEqual(reasoningBlocks)

    const toolMsg = advancedMsgs.find((m) => m.role === 'tool')
    expect(toolMsg).toMatchObject({ tool_call_id: 'call_1', name: 'lookup' })
  })
})
