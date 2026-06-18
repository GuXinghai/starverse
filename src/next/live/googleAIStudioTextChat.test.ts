import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  buildGoogleAIStudioTextChatMessages,
  streamGoogleAIStudioTextChatAsDomainEvents,
} from './googleAIStudioTextChat'

async function collect(options: Partial<Parameters<typeof streamGoogleAIStudioTextChatAsDomainEvents>[0]> = {}) {
  const events = []
  for await (const event of streamGoogleAIStudioTextChatAsDomainEvents({
    requestId: 'google_ai_studio_req_1',
    assistantMessageId: 'assistant_1',
    model: 'gemini-2.5-flash',
    userText: 'hello',
    ...options,
  })) {
    events.push(event)
  }
  return events
}

describe('googleAIStudioTextChat renderer bridge', () => {
  const originalGoogleAIStudioChat = (globalThis as any).googleAIStudioChat

  afterEach(() => {
    ;(globalThis as any).googleAIStudioChat = originalGoogleAIStudioChat
  })

  it('builds text-only Google AI Studio messages from normal chat context', () => {
    expect(buildGoogleAIStudioTextChatMessages({
      contextMessages: [
        { role: 'user', content: [{ type: 'text', text: 'previous user' }] },
        { role: 'assistant', content: 'previous assistant' },
        { role: 'system', content: 'ignored' },
      ],
      userText: 'current user',
    })).toEqual([
      { role: 'user', content: 'previous user' },
      { role: 'assistant', content: 'previous assistant' },
      { role: 'user', content: 'current user' },
    ])
  })

  it('streams native Gemini text deltas into DomainEvents', async () => {
    const listeners = new Map<string, (payload: unknown) => void>()
    const endListeners = new Map<string, () => void>()
    const startTextChat = vi.fn(async (payload: any) => {
      expect(payload).toMatchObject({
        requestId: 'google_ai_studio_req_1',
        assistantMessageId: 'assistant_1',
        model: 'gemini-2.5-flash',
        messages: [{ role: 'user', content: 'hello' }],
      })
      queueMicrotask(() => {
        listeners.get('google_ai_studio_req_1')?.({
          type: 'event',
          event: {
            type: 'message.text_delta',
            messageId: 'assistant_1',
            choiceIndex: 0,
            text: 'gemini hi',
          },
        })
        listeners.get('google_ai_studio_req_1')?.({
          type: 'event',
          event: { type: 'stream.done' },
        })
        endListeners.get('google_ai_studio_req_1')?.()
      })
      return { ok: true }
    })

    ;(globalThis as any).googleAIStudioChat = {
      startTextChat,
      abortTextChat: vi.fn(async () => ({ ok: true })),
      onTextChatChunk: (requestId: string, cb: (payload: unknown) => void) => {
        listeners.set(requestId, cb)
        return () => listeners.delete(requestId)
      },
      onTextChatEnd: (requestId: string, cb: () => void) => {
        endListeners.set(requestId, cb)
        return () => endListeners.delete(requestId)
      },
    }

    const events = await collect()
    expect(events.some((event: any) => event.type === 'MessageDeltaText' && event.text === 'gemini hi')).toBe(true)
    expect(events.some((event: any) => event.type === 'StreamDone')).toBe(true)
    expect(JSON.stringify(events)).not.toContain('AIza-')
    expect(JSON.stringify(events)).not.toContain('Authorization')
  })

  it('returns safe error when credential start fails before fetch', async () => {
    ;(globalThis as any).googleAIStudioChat = {
      startTextChat: vi.fn(async () => ({
        ok: false,
        code: 'credential_missing',
        error: 'Google AI Studio API key is not configured.',
      })),
      abortTextChat: vi.fn(async () => ({ ok: true })),
      onTextChatChunk: () => () => {},
      onTextChatEnd: () => () => {},
    }

    const events = await collect()
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'StreamError',
        error: expect.objectContaining({
          phase: 'pre_stream',
          openrouter: expect.objectContaining({
            code: 'credential_missing',
            message: 'Google AI Studio API key is not configured.',
          }),
        }),
      }),
    ]))
  })

  it('aborts through the explicit Google AI Studio chat bridge', async () => {
    const listeners = new Map<string, (payload: unknown) => void>()
    const endListeners = new Map<string, () => void>()
    const startTextChat = vi.fn(async () => ({ ok: true }))
    const abortTextChat = vi.fn(async (requestId: string) => {
      listeners.get(requestId)?.({
        type: 'event',
        event: {
          type: 'stream.abort',
          reason: 'aborted',
          error: {
            phase: 'abort',
            provider: 'google-ai-studio',
            category: 'aborted',
            code: 'aborted',
            message: 'Google AI Studio text chat was aborted.',
          },
        },
      })
      endListeners.get(requestId)?.()
      return { ok: true }
    })
    ;(globalThis as any).googleAIStudioChat = {
      startTextChat,
      abortTextChat,
      onTextChatChunk: (requestId: string, cb: (payload: unknown) => void) => {
        listeners.set(requestId, cb)
        return () => listeners.delete(requestId)
      },
      onTextChatEnd: (requestId: string, cb: () => void) => {
        endListeners.set(requestId, cb)
        return () => endListeners.delete(requestId)
      },
    }

    const controller = new AbortController()
    const eventsPromise = collect({ signal: controller.signal })
    await vi.waitFor(() => expect(startTextChat).toHaveBeenCalled())
    controller.abort()

    const events = await eventsPromise
    expect(abortTextChat).toHaveBeenCalledWith('google_ai_studio_req_1')
    expect(events.some((event: any) => event.type === 'StreamAbort')).toBe(true)
  })
})
