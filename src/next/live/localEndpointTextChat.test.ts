import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildLocalEndpointTextChatMessages,
  streamLocalEndpointTextChatAsDomainEvents,
} from './localEndpointTextChat'

async function collectEvents(input?: Readonly<{ signal?: AbortSignal }>) {
  const out: any[] = []
  for await (const event of streamLocalEndpointTextChatAsDomainEvents({
    requestId: 'local_req_renderer',
    assistantMessageId: 'assistant_1',
    endpointUrl: 'http://localhost:1234/v1',
    model: 'local-model',
    userText: 'hello',
    contextMessages: [{ role: 'assistant', content: 'previous answer' }],
    signal: input?.signal,
  })) {
    out.push(event)
  }
  return out
}

describe('localEndpointTextChat renderer bridge', () => {
  const originalLocalEndpointChat = (globalThis as any).localEndpointChat

  afterEach(() => {
    ;(globalThis as any).localEndpointChat = originalLocalEndpointChat
  })

  it('builds text-only local endpoint messages from normal chat context', () => {
    expect(buildLocalEndpointTextChatMessages({
      contextMessages: [
        { role: 'system', content: 'ignored' },
        { role: 'user', content: [{ type: 'text', text: 'prior question' }, { type: 'image', url: 'asset://x' }] },
        { role: 'assistant', content: 'prior answer' },
      ],
      userText: 'next question',
    })).toEqual([
      { role: 'user', content: 'prior question' },
      { role: 'assistant', content: 'prior answer' },
      { role: 'user', content: 'next question' },
    ])
  })

  it('streams OpenAI-compatible text deltas into DomainEvents', async () => {
    const chunkListeners = new Map<string, (payload: unknown) => void>()
    const endListeners = new Map<string, () => void>()
    const startTextChat = vi.fn(async (payload: any) => {
      expect(payload).toMatchObject({
        requestId: 'local_req_renderer',
        url: 'http://localhost:1234/v1',
        model: 'local-model',
        messages: [
          { role: 'assistant', content: 'previous answer' },
          { role: 'user', content: 'hello' },
        ],
      })
      expect(JSON.stringify(payload)).not.toContain('Authorization')
      chunkListeners.get(payload.requestId)?.({
        type: 'responseMeta',
        status: 200,
        requestId: payload.requestId,
        provider: 'local_endpoint',
        headers: {},
      })
      chunkListeners.get(payload.requestId)?.({
        type: 'chunk',
        data: 'data: {"id":"local_gen","model":"local-model","choices":[{"index":0,"delta":{"content":"hi"},"finish_reason":null}]}\n\n',
      })
      chunkListeners.get(payload.requestId)?.({ type: 'chunk', data: 'data: [DONE]\n\n' })
      endListeners.get(payload.requestId)?.()
      return { ok: true }
    })
    ;(globalThis as any).localEndpointChat = {
      startTextChat,
      abortTextChat: vi.fn(async () => ({ ok: true })),
      onTextChatChunk: (requestId: string, callback: (payload: unknown) => void) => {
        chunkListeners.set(requestId, callback)
        return () => chunkListeners.delete(requestId)
      },
      onTextChatEnd: (requestId: string, callback: () => void) => {
        endListeners.set(requestId, callback)
        return () => endListeners.delete(requestId)
      },
    }

    const events = await collectEvents()

    expect(events.some((event) => event.type === 'MessageDeltaText' && event.text === 'hi')).toBe(true)
    expect(events.filter((event) => event.type === 'StreamDone')).toHaveLength(1)
    expect(events.some((event) => event.type === 'StreamError')).toBe(false)
  })

  it('maps start validation failure before fetch to a terminal stream error', async () => {
    ;(globalThis as any).localEndpointChat = {
      startTextChat: vi.fn(async () => ({
        ok: false,
        code: 'remote_host_rejected',
        error: 'Local endpoint diagnostics only allow localhost URLs.',
        safeUrl: 'https://public.example.test/v1',
      })),
      abortTextChat: vi.fn(async () => ({ ok: true })),
      onTextChatChunk: (_requestId: string, _callback: (payload: unknown) => void) => () => {},
      onTextChatEnd: (_requestId: string, _callback: () => void) => () => {},
    }

    const events = await collectEvents()
    expect(events.filter((event) => event.type === 'StreamError')).toHaveLength(1)
    expect(events.some((event) => event.type === 'StreamDone')).toBe(false)
    const serialized = JSON.stringify(events)
    expect(serialized).not.toContain('Authorization')
    expect(serialized).not.toContain('Bearer')
  })
})
