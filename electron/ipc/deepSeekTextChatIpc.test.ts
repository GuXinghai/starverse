import { describe, expect, it, vi } from 'vitest'
import {
  abortDeepSeekTextChat,
  registerDeepSeekTextChatIpc,
  validateDeepSeekTextChatPayload,
  type DeepSeekTextChatWireEvent,
} from './deepSeekTextChatIpc'
import { DEEPSEEK_API_KEY_STORE_KEY } from './deepSeekCredentialSettingsIpc'

function textDeltaSse(delta: string): string {
  return `data: ${JSON.stringify({ id: 'ds_1', model: 'deepseek-chat', choices: [{ index: 0, delta: { content: delta }, finish_reason: null }] })}`
}

function reasoningDeltaSse(delta: string): string {
  return `data: ${JSON.stringify({ id: 'ds_1', model: 'deepseek-reasoner', choices: [{ index: 0, delta: { reasoning_content: delta }, finish_reason: null }] })}`
}

function finishSse(): string {
  return `data: ${JSON.stringify({ id: 'ds_1', model: 'deepseek-chat', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}`
}

function doneSse(): string {
  return 'data: [DONE]'
}

function makeSseResponse(...lines: string[]): Response {
  const body = `${lines.join('\n\n')}\n\n`
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

function createSender() {
  return { send: vi.fn() }
}

function sentEvents(sender: ReturnType<typeof createSender>, requestId: string): DeepSeekTextChatWireEvent[] {
  return sender.send.mock.calls
    .filter(([channel]) => channel === `deepseek-chat:chunk:${requestId}`)
    .map(([, payload]) => payload as DeepSeekTextChatWireEvent)
}

function createStore(apiKey?: string) {
  return {
    get: vi.fn((key: string) => key === DEEPSEEK_API_KEY_STORE_KEY ? apiKey : undefined),
  } as any
}

describe('deepSeekTextChatIpc', () => {
  it('validates text-only payloads before fetch', () => {
    expect(validateDeepSeekTextChatPayload({
      requestId: 'deepseek_req_1',
      assistantMessageId: 'assistant_1',
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: 'hello' }],
    })).toMatchObject({ ok: true })

    expect(validateDeepSeekTextChatPayload({
      requestId: 'deepseek_req_bad',
      assistantMessageId: 'assistant_1',
      model: 'deepseek-chat',
      messages: [{ role: 'tool', content: 'unsupported' }],
    })).toMatchObject({ ok: false, code: 'invalid_payload' })
  })

  it('streams official DeepSeek text deltas with main-process credential resolution', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://api.deepseek.com/v1/chat/completions')
      expect(init?.method).toBe('POST')
      expect(init?.redirect).toBe('error')
      expect((init?.headers as Record<string, string>)?.Authorization).toBe('Bearer sk-deepseek-secret')
      const body = JSON.parse(String(init?.body ?? '{}'))
      expect(body).toMatchObject({
        model: 'deepseek-chat',
        stream: true,
        messages: [{ role: 'user', content: 'hello' }],
      })
      expect(body.tools).toBeUndefined()
      expect(body.reasoning_effort).toBeUndefined()
      return makeSseResponse(textDeltaSse('hello'), finishSse(), doneSse())
    }) as unknown as typeof fetch

    const registerInvoke = vi.fn()
    registerDeepSeekTextChatIpc({ registerInvoke, store: createStore('sk-deepseek-secret'), fetchImpl })
    const handler = registerInvoke.mock.calls.find(([channel]) => channel === 'deepseek-chat:stream-text')?.[1]
    const sender = createSender()

    const start = await handler({ sender }, {
      requestId: 'deepseek_req_ok',
      assistantMessageId: 'assistant_1',
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: 'hello' }],
      timeoutMs: 1000,
    })

    expect(start).toEqual({ ok: true })
    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledWith('deepseek-chat:end:deepseek_req_ok'))
    const events = sentEvents(sender, 'deepseek_req_ok')
    expect(events.some((event) =>
      event.type === 'event' &&
      event.event.type === 'message.text_delta' &&
      event.event.text === 'hello',
    )).toBe(true)
    expect(events.some((event) => event.type === 'event' && event.event.type === 'stream.done')).toBe(true)
    const serializedEvents = JSON.stringify(events)
    expect(serializedEvents).not.toContain('sk-deepseek-secret')
    expect(serializedEvents).not.toContain('Bearer')
    expect(serializedEvents).not.toContain('Authorization')
  })

  it('filters reasoning_content from renderer wire events in the text-only live slice', async () => {
    const fetchImpl = vi.fn(async () =>
      makeSseResponse(reasoningDeltaSse('private chain of thought'), textDeltaSse('visible answer'), finishSse(), doneSse()),
    ) as unknown as typeof fetch
    const registerInvoke = vi.fn()
    registerDeepSeekTextChatIpc({ registerInvoke, store: createStore('sk-deepseek-secret'), fetchImpl })
    const handler = registerInvoke.mock.calls.find(([channel]) => channel === 'deepseek-chat:stream-text')?.[1]
    const sender = createSender()

    await handler({ sender }, {
      requestId: 'deepseek_req_reasoning',
      assistantMessageId: 'assistant_1',
      model: 'deepseek-reasoner',
      messages: [{ role: 'user', content: 'hello' }],
    })

    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledWith('deepseek-chat:end:deepseek_req_reasoning'))
    const events = sentEvents(sender, 'deepseek_req_reasoning')
    expect(events.some((event) =>
      event.type === 'event' &&
      event.event.type === 'message.text_delta' &&
      event.event.text === 'visible answer',
    )).toBe(true)
    expect(events.some((event) => event.type === 'event' && event.event.type === 'message.reasoning_detail')).toBe(false)
    expect(JSON.stringify(events)).not.toContain('private chain of thought')
  })

  it('fails before fetch when the DeepSeek API key is missing', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const registerInvoke = vi.fn()
    registerDeepSeekTextChatIpc({ registerInvoke, store: createStore(), fetchImpl })
    const handler = registerInvoke.mock.calls.find(([channel]) => channel === 'deepseek-chat:stream-text')?.[1]
    const sender = createSender()

    const start = await handler({ sender }, {
      requestId: 'deepseek_req_missing_key',
      assistantMessageId: 'assistant_1',
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: 'hello' }],
    })

    expect(start).toEqual({ ok: true })
    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledWith('deepseek-chat:end:deepseek_req_missing_key'))
    expect(fetchImpl).not.toHaveBeenCalled()
    const events = sentEvents(sender, 'deepseek_req_missing_key')
    expect(events.some((event) =>
      event.type === 'event' &&
      event.event.type === 'stream.error' &&
      event.event.error.code === 'credential_missing',
    )).toBe(true)
    expect(events.some((event) => event.type === 'event' && event.event.type === 'stream.done')).toBe(false)
  })

  it('normalizes malicious transport errors before sending them to the renderer', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('Authorization: Bearer sk-deepseek-secret at https://public.example.test')
    }) as unknown as typeof fetch
    const registerInvoke = vi.fn()
    registerDeepSeekTextChatIpc({ registerInvoke, store: createStore('sk-deepseek-secret'), fetchImpl })
    const handler = registerInvoke.mock.calls.find(([channel]) => channel === 'deepseek-chat:stream-text')?.[1]
    const sender = createSender()

    await handler({ sender }, {
      requestId: 'deepseek_req_error',
      assistantMessageId: 'assistant_1',
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: 'hello' }],
    })

    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledWith('deepseek-chat:end:deepseek_req_error'))
    const serialized = JSON.stringify(sentEvents(sender, 'deepseek_req_error'))
    expect(serialized).not.toContain('sk-deepseek-secret')
    expect(serialized).not.toContain('Authorization')
    expect(serialized).not.toContain('Bearer')
    expect(serialized).not.toContain('public.example.test')
    expect(serialized).toContain('DeepSeek official text chat failed safely.')
  })

  it('supports abort through the explicit DeepSeek chat abort channel', async () => {
    let signal: AbortSignal | null = null
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => {
      signal = init?.signal as AbortSignal
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
    }) as unknown as typeof fetch
    const registerInvoke = vi.fn()
    registerDeepSeekTextChatIpc({ registerInvoke, store: createStore('sk-deepseek-secret'), fetchImpl })
    const startHandler = registerInvoke.mock.calls.find(([channel]) => channel === 'deepseek-chat:stream-text')?.[1]
    const abortHandler = registerInvoke.mock.calls.find(([channel]) => channel === 'deepseek-chat:abort')?.[1]
    const sender = createSender()

    await startHandler({ sender }, {
      requestId: 'deepseek_req_abort',
      assistantMessageId: 'assistant_1',
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: 'hello' }],
      timeoutMs: 10000,
    })
    abortDeepSeekTextChat('deepseek_req_abort')
    await abortHandler({}, 'deepseek_req_abort')

    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledWith('deepseek-chat:end:deepseek_req_abort'))
    const events = sentEvents(sender, 'deepseek_req_abort')
    expect(events.some((event) =>
      event.type === 'event' &&
      event.event.type === 'stream.abort',
    )).toBe(true)
  })
})
