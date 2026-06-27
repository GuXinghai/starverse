import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildLMStudioTextChatMessages,
  streamLMStudioTextChatAsDomainEvents,
  type LMStudioTextChatConfig,
} from './lmStudioTextChat'

const config: LMStudioTextChatConfig = {
  providerKey: 'lm_studio',
  endpointUrl: 'http://127.0.0.1:1234',
  nativeRestControls: {
    diagnosticsEnabled: true,
    manualLoadUnloadEnabled: true,
    autoLoadBeforeSendEnabled: false,
    autoUnloadAfterSendEnabled: false,
    autoUnloadAfterIdleEnabled: false,
  },
  chatMode: 'openai_compatible',
  openAICompatible: { basePath: '/v1', preferredEndpoint: 'chat_completions' },
  nativeRest: { basePath: '/api/v1' },
}

async function collectEvents(input?: Readonly<{
  signal?: AbortSignal
  userText?: string
  contextMessages?: readonly unknown[]
}>) {
  const out: any[] = []
  for await (const event of streamLMStudioTextChatAsDomainEvents({
    requestId: 'lm_studio_req_renderer',
    assistantMessageId: 'assistant_1',
    config,
    model: 'openai/gpt-oss-20b',
    userText: input?.userText ?? 'hello',
    contextMessages: input?.contextMessages ?? [{ role: 'assistant', content: 'previous answer' }],
    signal: input?.signal,
  })) {
    out.push(event)
  }
  return out
}

describe('LM Studio text chat renderer bridge', () => {
  const originalLMStudioChat = (globalThis as any).lmStudioChat

  afterEach(() => {
    ;(globalThis as any).lmStudioChat = originalLMStudioChat
  })

  it('builds text-only LM Studio messages from normal chat context', () => {
    expect(buildLMStudioTextChatMessages({
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

  it('streams LM Studio text deltas into DomainEvents without exposing auth fields', async () => {
    const chunkListeners = new Map<string, (payload: unknown) => void>()
    const endListeners = new Map<string, () => void>()
    const startTextChat = vi.fn(async (payload: any) => {
      expect(payload).toMatchObject({
        requestId: 'lm_studio_req_renderer',
        config,
        model: 'openai/gpt-oss-20b',
        messages: [
          { role: 'assistant', content: 'previous answer' },
          { role: 'user', content: 'hello' },
        ],
      })
      expect(JSON.stringify(payload)).not.toContain('Authorization')
      expect(JSON.stringify(payload)).not.toContain('Bearer')
      chunkListeners.get(payload.requestId)?.({
        type: 'responseMeta',
        status: 200,
        requestId: payload.requestId,
        provider: 'lm_studio',
        headers: {},
      })
      chunkListeners.get(payload.requestId)?.({
        type: 'chunk',
        data: 'data: {"id":"lmstudio_gen","model":"openai/gpt-oss-20b","choices":[{"index":0,"delta":{"content":"OK"},"finish_reason":null}]}\n\n',
      })
      chunkListeners.get(payload.requestId)?.({ type: 'chunk', data: 'data: [DONE]\n\n' })
      endListeners.get(payload.requestId)?.()
      return { ok: true }
    })
    ;(globalThis as any).lmStudioChat = {
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

    expect(events.some((event) => event.type === 'MessageDeltaText' && event.text === 'OK')).toBe(true)
    expect(events.filter((event) => event.type === 'StreamDone')).toHaveLength(1)
    expect(events.some((event) => event.type === 'StreamError')).toBe(false)
  })

  it('returns a terminal stream error when the renderer bridge is unavailable', async () => {
    ;(globalThis as any).lmStudioChat = undefined

    const events = await collectEvents()

    expect(events.filter((event) => event.type === 'StreamError')).toHaveLength(1)
    expect(events.some((event) => event.type === 'StreamDone')).toBe(false)
    expect(JSON.stringify(events)).toContain('ipc_renderer_missing')
  })

  it('returns a terminal validation error when there is no chat context or user text', async () => {
    const startTextChat = vi.fn(async () => ({ ok: true }))
    ;(globalThis as any).lmStudioChat = {
      startTextChat,
      abortTextChat: vi.fn(async () => ({ ok: true })),
      onTextChatChunk: (_requestId: string, _callback: (payload: unknown) => void) => () => {},
      onTextChatEnd: (_requestId: string, _callback: () => void) => () => {},
    }

    const events = await collectEvents({ contextMessages: [], userText: '   ' })

    expect(startTextChat).not.toHaveBeenCalled()
    expect(events.filter((event) => event.type === 'StreamError')).toHaveLength(1)
    expect(events.some((event) => event.type === 'StreamDone')).toBe(false)
    expect(JSON.stringify(events)).toContain('LM Studio text chat requires a text message.')
  })

  it('maps start validation failures before fetch to a terminal stream error', async () => {
    ;(globalThis as any).lmStudioChat = {
      startTextChat: vi.fn(async () => ({
        ok: false,
        code: 'remote_host_rejected',
        error: 'LM Studio endpoint must be localhost, 127.0.0.1, or [::1].',
        safeUrl: 'https://public.example.test',
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
