import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildOllamaTextChatMessages,
  streamOllamaTextChatAsDomainEvents,
  type OllamaTextChatConfig,
} from './ollamaTextChat'

const config: OllamaTextChatConfig = {
  providerKey: 'ollama_local',
  endpointUrl: 'http://127.0.0.1:11434',
  nativeControls: {
    diagnosticsEnabled: true,
    manualLoadUnloadEnabled: true,
    autoLoadBeforeSendEnabled: false,
    autoUnloadAfterSendEnabled: false,
    autoUnloadAfterIdleEnabled: false,
  },
  chatMode: 'native_rest',
  nativeRest: { basePath: '/api', preferredEndpoint: 'chat' },
  openAICompatible: { basePath: '/v1', preferredEndpoint: 'chat_completions' },
}

async function collectEvents(input?: Readonly<{
  signal?: AbortSignal
  userText?: string
  contextMessages?: readonly unknown[]
}>) {
  const out: any[] = []
  for await (const event of streamOllamaTextChatAsDomainEvents({
    requestId: 'ollama_req_renderer',
    assistantMessageId: 'assistant_1',
    config,
    model: 'llama3.2:latest',
    userText: input?.userText ?? 'hello',
    contextMessages: input?.contextMessages ?? [{ role: 'assistant', content: 'previous answer' }],
    signal: input?.signal,
  })) {
    out.push(event)
  }
  return out
}

describe('Ollama text chat renderer bridge', () => {
  const originalOllamaChat = (globalThis as any).ollamaChat

  afterEach(() => {
    ;(globalThis as any).ollamaChat = originalOllamaChat
  })

  it('builds text-only Ollama messages from normal chat context', () => {
    expect(buildOllamaTextChatMessages({
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

  it('streams Ollama text deltas into DomainEvents through the scoped bridge', async () => {
    const chunkListeners = new Map<string, (payload: unknown) => void>()
    const endListeners = new Map<string, () => void>()
    const startTextChat = vi.fn(async (payload: any) => {
      expect(payload).toMatchObject({
        requestId: 'ollama_req_renderer',
        config,
        model: 'llama3.2:latest',
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
        provider: 'ollama_local',
        headers: {},
      })
      chunkListeners.get(payload.requestId)?.({
        type: 'chunk',
        data: 'data: {"choices":[{"index":0,"delta":{"content":"OK"},"finish_reason":null}]}\n\n',
      })
      chunkListeners.get(payload.requestId)?.({ type: 'chunk', data: 'data: [DONE]\n\n' })
      endListeners.get(payload.requestId)?.()
      return { ok: true }
    })
    ;(globalThis as any).ollamaChat = {
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
    ;(globalThis as any).ollamaChat = undefined

    const events = await collectEvents()

    expect(events.filter((event) => event.type === 'StreamError')).toHaveLength(1)
    expect(events.some((event) => event.type === 'StreamDone')).toBe(false)
    expect(JSON.stringify(events)).toContain('ipc_renderer_missing')
  })

  it('returns a terminal validation error when there is no chat context or user text', async () => {
    const startTextChat = vi.fn(async () => ({ ok: true }))
    ;(globalThis as any).ollamaChat = {
      startTextChat,
      abortTextChat: vi.fn(async () => ({ ok: true })),
      onTextChatChunk: (_requestId: string, _callback: (payload: unknown) => void) => () => {},
      onTextChatEnd: (_requestId: string, _callback: () => void) => () => {},
    }

    const events = await collectEvents({ contextMessages: [], userText: '   ' })

    expect(startTextChat).not.toHaveBeenCalled()
    expect(events.filter((event) => event.type === 'StreamError')).toHaveLength(1)
    expect(events.some((event) => event.type === 'StreamDone')).toBe(false)
    expect(JSON.stringify(events)).toContain('Ollama text chat requires a text message.')
  })

  it('maps bridge start failures to a terminal stream error without exposing credentials', async () => {
    ;(globalThis as any).ollamaChat = {
      startTextChat: vi.fn(async () => ({
        ok: false,
        code: 'remote_host_rejected',
        error: 'Ollama endpoint must be localhost, 127.0.0.1, or [::1].',
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
