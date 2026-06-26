import { describe, expect, it, vi } from 'vitest'
import {
  abortAnthropicTextChat,
  registerAnthropicTextChatIpc,
  validateAnthropicTextChatPayload,
  type AnthropicTextChatWireEvent,
} from './anthropicTextChatIpc'
import type { ProviderCredentialService } from '../credentials/providerCredentialService'

function textDeltaSse(delta: string): string {
  return `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: delta } })}`
}

function messageStopSse(): string {
  return `event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}`
}

function makeSseResponse(...lines: string[]): Response {
  const body = `${lines.join('\n\n')}\n\n`
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

function createSender() {
  return { send: vi.fn() }
}

function sentEvents(sender: ReturnType<typeof createSender>, requestId: string): AnthropicTextChatWireEvent[] {
  return sender.send.mock.calls
    .filter(([channel]) => channel === `anthropic-chat:chunk:${requestId}`)
    .map(([, payload]) => payload as AnthropicTextChatWireEvent)
}

function createCredentialService(apiKey?: string): ProviderCredentialService {
  return {
    readApiKey: vi.fn(() => apiKey
      ? { ok: true, providerKey: 'anthropic', apiKey, source: 'secure_store', backend: 'electron_safe_storage', migratedFromLegacy: false, warnings: [] }
      : { ok: false, providerKey: 'anthropic', code: 'credential_missing', message: 'missing', source: 'missing', backend: 'electron_safe_storage', warnings: [] }),
  } as unknown as ProviderCredentialService
}

describe('anthropicTextChatIpc', () => {
  it('validates text-only payloads before fetch', () => {
    expect(validateAnthropicTextChatPayload({
      requestId: 'anthropic_req_1',
      assistantMessageId: 'assistant_1',
      model: 'claude-sonnet-4-5',
      messages: [{ role: 'user', content: 'hello' }],
    })).toMatchObject({ ok: true })

    expect(validateAnthropicTextChatPayload({
      requestId: 'anthropic_req_bad',
      assistantMessageId: 'assistant_1',
      model: 'claude-sonnet-4-5',
      messages: [{ role: 'tool', content: 'unsupported' }],
    })).toMatchObject({ ok: false, code: 'invalid_payload' })
  })

  it('streams native Anthropic Messages text deltas with main-process credential resolution', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://api.anthropic.com/v1/messages')
      expect(init?.method).toBe('POST')
      expect(init?.redirect).toBe('error')
      expect((init?.headers as Record<string, string>)?.['x-api-key']).toBe('sk-ant-secret')
      expect((init?.headers as Record<string, string>)?.Authorization).toBeUndefined()
      const body = JSON.parse(String(init?.body ?? '{}'))
      expect(body).toMatchObject({
        model: 'claude-sonnet-4-5',
        stream: true,
        max_tokens: 4096,
        messages: [{ role: 'user', content: 'hello' }],
      })
      expect(body.thinking).toBeUndefined()
      expect(body.tools).toBeUndefined()
      return makeSseResponse(textDeltaSse('hello'), messageStopSse())
    }) as unknown as typeof fetch

    const registerInvoke = vi.fn()
    registerAnthropicTextChatIpc({ registerInvoke, credentialService: createCredentialService('sk-ant-secret'), fetchImpl })
    const handler = registerInvoke.mock.calls.find(([channel]) => channel === 'anthropic-chat:stream-text')?.[1]
    const sender = createSender()

    const start = await handler({ sender }, {
      requestId: 'anthropic_req_ok',
      assistantMessageId: 'assistant_1',
      model: 'claude-sonnet-4-5',
      messages: [{ role: 'user', content: 'hello' }],
      timeoutMs: 1000,
    })

    expect(start).toEqual({ ok: true })
    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledWith('anthropic-chat:end:anthropic_req_ok'))
    const events = sentEvents(sender, 'anthropic_req_ok')
    expect(events.some((event) =>
      event.type === 'event' &&
      event.event.type === 'message.text_delta' &&
      event.event.text === 'hello',
    )).toBe(true)
    expect(events.some((event) => event.type === 'event' && event.event.type === 'stream.done')).toBe(true)
    const serializedEvents = JSON.stringify(events)
    expect(serializedEvents).not.toContain('sk-ant-secret')
    expect(serializedEvents).not.toContain('x-api-key')
    expect(serializedEvents).not.toContain('Bearer')
    expect(serializedEvents).not.toContain('Authorization')
  })

  it('fails before fetch when the Anthropic API key is missing', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const registerInvoke = vi.fn()
    registerAnthropicTextChatIpc({ registerInvoke, credentialService: createCredentialService(), fetchImpl })
    const handler = registerInvoke.mock.calls.find(([channel]) => channel === 'anthropic-chat:stream-text')?.[1]
    const sender = createSender()

    const start = await handler({ sender }, {
      requestId: 'anthropic_req_missing_key',
      assistantMessageId: 'assistant_1',
      model: 'claude-sonnet-4-5',
      messages: [{ role: 'user', content: 'hello' }],
    })

    expect(start).toEqual({ ok: true })
    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledWith('anthropic-chat:end:anthropic_req_missing_key'))
    expect(fetchImpl).not.toHaveBeenCalled()
    const events = sentEvents(sender, 'anthropic_req_missing_key')
    expect(events.some((event) =>
      event.type === 'event' &&
      event.event.type === 'stream.error' &&
      event.event.error.code === 'credential_missing',
    )).toBe(true)
    expect(events.some((event) => event.type === 'event' && event.event.type === 'stream.done')).toBe(false)
  })

  it('normalizes malicious transport errors before sending them to the renderer', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('Authorization: Bearer sk-ant-secret at https://public.example.test')
    }) as unknown as typeof fetch
    const registerInvoke = vi.fn()
    registerAnthropicTextChatIpc({ registerInvoke, credentialService: createCredentialService('sk-ant-secret'), fetchImpl })
    const handler = registerInvoke.mock.calls.find(([channel]) => channel === 'anthropic-chat:stream-text')?.[1]
    const sender = createSender()

    await handler({ sender }, {
      requestId: 'anthropic_req_error',
      assistantMessageId: 'assistant_1',
      model: 'claude-sonnet-4-5',
      messages: [{ role: 'user', content: 'hello' }],
    })

    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledWith('anthropic-chat:end:anthropic_req_error'))
    const serialized = JSON.stringify(sentEvents(sender, 'anthropic_req_error'))
    expect(serialized).not.toContain('sk-ant-secret')
    expect(serialized).not.toContain('Authorization')
    expect(serialized).not.toContain('Bearer')
    expect(serialized).not.toContain('public.example.test')
    expect(serialized).toContain('Anthropic Messages text chat failed safely.')
  })

  it('supports abort through the explicit Anthropic chat abort channel', async () => {
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
    registerAnthropicTextChatIpc({ registerInvoke, credentialService: createCredentialService('sk-ant-secret'), fetchImpl })
    const startHandler = registerInvoke.mock.calls.find(([channel]) => channel === 'anthropic-chat:stream-text')?.[1]
    const abortHandler = registerInvoke.mock.calls.find(([channel]) => channel === 'anthropic-chat:abort')?.[1]
    const sender = createSender()

    await startHandler({ sender }, {
      requestId: 'anthropic_req_abort',
      assistantMessageId: 'assistant_1',
      model: 'claude-sonnet-4-5',
      messages: [{ role: 'user', content: 'hello' }],
      timeoutMs: 10000,
    })
    abortAnthropicTextChat('anthropic_req_abort')
    await abortHandler({}, 'anthropic_req_abort')

    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledWith('anthropic-chat:end:anthropic_req_abort'))
    const events = sentEvents(sender, 'anthropic_req_abort')
    expect(events.some((event) =>
      event.type === 'event' &&
      event.event.type === 'stream.abort',
    )).toBe(true)
  })
})
