import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildDeepSeekTextChatMessages,
  streamDeepSeekTextChatAsDomainEvents,
} from './deepSeekTextChat'

async function collectEvents(input?: Readonly<{ signal?: AbortSignal }>) {
  const out: any[] = []
  for await (const event of streamDeepSeekTextChatAsDomainEvents({
    requestId: 'deepseek_req_renderer',
    assistantMessageId: 'assistant_1',
    model: 'deepseek-chat',
    userText: 'hello',
    contextMessages: [{ role: 'assistant', content: 'previous answer' }],
    signal: input?.signal,
  })) {
    out.push(event)
  }
  return out
}

describe('deepSeekTextChat renderer bridge', () => {
  const originalDeepSeekChat = (globalThis as any).deepSeekChat

  afterEach(() => {
    ;(globalThis as any).deepSeekChat = originalDeepSeekChat
  })

  it('builds text-only DeepSeek official messages from normal chat context', () => {
    expect(buildDeepSeekTextChatMessages({
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

  it('streams official DeepSeek text deltas into DomainEvents', async () => {
    const chunkListeners = new Map<string, (payload: unknown) => void>()
    const endListeners = new Map<string, () => void>()
    const startTextChat = vi.fn(async (payload: any) => {
      expect(payload).toMatchObject({
        requestId: 'deepseek_req_renderer',
        assistantMessageId: 'assistant_1',
        model: 'deepseek-chat',
        messages: [
          { role: 'assistant', content: 'previous answer' },
          { role: 'user', content: 'hello' },
        ],
      })
      const serialized = JSON.stringify(payload)
      expect(serialized).not.toContain('Authorization')
      expect(serialized).not.toContain('Bearer')
      expect(serialized).not.toContain('sk-deepseek')
      chunkListeners.get(payload.requestId)?.({
        type: 'event',
        event: {
          type: 'message.text_delta',
          messageId: 'assistant_1',
          choiceIndex: 0,
          text: 'hi',
        },
      })
      chunkListeners.get(payload.requestId)?.({
        type: 'event',
        event: { type: 'stream.done' },
      })
      chunkListeners.get(payload.requestId)?.({ type: 'end' })
      endListeners.get(payload.requestId)?.()
      return { ok: true }
    })
    ;(globalThis as any).deepSeekChat = {
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

  it('maps missing credential start failure to terminal stream error without stream.done', async () => {
    ;(globalThis as any).deepSeekChat = {
      startTextChat: vi.fn(async () => ({
        ok: false,
        code: 'credential_missing',
        error: 'DeepSeek API key is not configured.',
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
    expect(serialized).not.toContain('sk-deepseek')
  })
})
