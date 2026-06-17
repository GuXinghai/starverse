import { describe, expect, it, vi } from 'vitest'
import {
  abortLocalEndpointTextChat,
  registerLocalEndpointTextChatIpc,
  validateLocalEndpointTextChatPayload,
  type LocalEndpointTextChatWireEvent,
} from './localEndpointTextChatIpc'

function textStreamResponse(text: string, status = 200): Response {
  return new Response(text, {
    status,
    headers: { 'content-type': 'text/event-stream', 'x-request-id': 'local_req_header' },
  })
}

function createSender() {
  return {
    send: vi.fn(),
  }
}

function sentEvents(sender: ReturnType<typeof createSender>, requestId: string): LocalEndpointTextChatWireEvent[] {
  return sender.send.mock.calls
    .filter(([channel]) => channel === `local-endpoint-chat:chunk:${requestId}`)
    .map(([, payload]) => payload as LocalEndpointTextChatWireEvent)
}

describe('localEndpointTextChatIpc', () => {
  it('validates loopback text-only payloads and rejects remote or credential-bearing URLs', () => {
    expect(validateLocalEndpointTextChatPayload({
      requestId: 'local_req_1',
      url: 'http://localhost:1234/v1',
      model: 'local-model',
      messages: [{ role: 'user', content: 'hello' }],
    })).toMatchObject({ ok: true })

    expect(validateLocalEndpointTextChatPayload({
      requestId: 'local_req_remote',
      url: 'https://api.example.com/v1',
      model: 'local-model',
      messages: [{ role: 'user', content: 'hello' }],
    })).toMatchObject({ ok: false, code: 'remote_host_rejected' })

    const credentialResult = validateLocalEndpointTextChatPayload({
      requestId: 'local_req_secret',
      url: 'http://user:pass@localhost:1234/v1?token=sk-hidden',
      model: 'local-model',
      messages: [{ role: 'user', content: 'hello' }],
    })
    expect(credentialResult).toMatchObject({ ok: false, code: 'embedded_credentials_rejected' })
    expect(JSON.stringify(credentialResult)).not.toContain('user:pass')
    expect(JSON.stringify(credentialResult)).not.toContain('sk-hidden')
  })

  it('streams OpenAI-compatible text deltas without sending secrets or unsupported options', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('http://localhost:1234/v1/chat/completions')
      expect(init?.method).toBe('POST')
      expect(init?.redirect).toBe('error')
      expect(init?.headers).toEqual({
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
      })
      const body = JSON.parse(String(init?.body ?? '{}'))
      expect(body).toEqual({
        model: 'local-model',
        messages: [{ role: 'user', content: 'hello' }],
        stream: true,
      })
      expect(JSON.stringify(init)).not.toContain('Authorization')
      expect(JSON.stringify(init)).not.toContain('Bearer')
      return textStreamResponse('data: {"choices":[{"delta":{"content":"he"}}]}\n\ndata: {"choices":[{"delta":{"content":"llo"}}]}\n\ndata: [DONE]\n\n')
    }) as unknown as typeof fetch

    const registerInvoke = vi.fn()
    registerLocalEndpointTextChatIpc({ registerInvoke, fetchImpl })
    const handler = registerInvoke.mock.calls.find(([channel]) => channel === 'local-endpoint-chat:stream-text')?.[1]
    const sender = createSender()

    const start = await handler({ sender }, {
      requestId: 'local_req_ok',
      url: 'http://localhost:1234/v1?token=sk-hidden',
      model: 'local-model',
      messages: [{ role: 'user', content: 'hello' }],
      timeoutMs: 1000,
    })

    expect(start).toEqual({ ok: true })
    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledWith('local-endpoint-chat:end:local_req_ok'))
    const events = sentEvents(sender, 'local_req_ok')
    expect(events[0]).toMatchObject({ type: 'responseMeta', status: 200, provider: 'local_endpoint' })
    expect(events.filter((event) => event.type === 'chunk').map((event) => event.type)).toEqual(['chunk'])
    expect(events[events.length - 1]).toEqual({ type: 'end' })
    expect(JSON.stringify(events)).not.toContain('sk-hidden')
  })

  it('does not follow redirects and redacts public redirect targets', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.redirect).toBe('error')
      throw new Error('redirect to https://public.example.test?token=sk-redirect Authorization Bearer')
    }) as unknown as typeof fetch
    const registerInvoke = vi.fn()
    registerLocalEndpointTextChatIpc({ registerInvoke, fetchImpl })
    const handler = registerInvoke.mock.calls.find(([channel]) => channel === 'local-endpoint-chat:stream-text')?.[1]
    const sender = createSender()

    await handler({ sender }, {
      requestId: 'local_req_redirect',
      url: 'http://localhost:1234/v1',
      model: 'local-model',
      messages: [{ role: 'user', content: 'hello' }],
      timeoutMs: 1000,
    })

    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledWith('local-endpoint-chat:end:local_req_redirect'))
    const serialized = JSON.stringify(sentEvents(sender, 'local_req_redirect'))
    expect(serialized).not.toContain('public.example.test')
    expect(serialized).not.toContain('sk-redirect')
    expect(serialized).not.toContain('Authorization')
    expect(serialized).not.toContain('Bearer')
    expect(serialized).toContain('network_error')
  })

  it('supports abort through the explicit local endpoint chat abort channel', async () => {
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
    registerLocalEndpointTextChatIpc({ registerInvoke, fetchImpl })
    const startHandler = registerInvoke.mock.calls.find(([channel]) => channel === 'local-endpoint-chat:stream-text')?.[1]
    const abortHandler = registerInvoke.mock.calls.find(([channel]) => channel === 'local-endpoint-chat:abort')?.[1]
    const sender = createSender()

    await startHandler({ sender }, {
      requestId: 'local_req_abort',
      url: 'http://localhost:1234/v1',
      model: 'local-model',
      messages: [{ role: 'user', content: 'hello' }],
      timeoutMs: 10000,
    })
    abortLocalEndpointTextChat('local_req_abort')
    await abortHandler({}, 'local_req_abort')

    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledWith('local-endpoint-chat:end:local_req_abort'))
    const events = sentEvents(sender, 'local_req_abort')
    expect(events.some((event) => event.type === 'error' && event.error.kind === 'aborted')).toBe(true)
  })
})
