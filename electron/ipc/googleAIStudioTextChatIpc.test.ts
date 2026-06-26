import { describe, expect, it, vi } from 'vitest'
import {
  abortGoogleAIStudioTextChat,
  registerGoogleAIStudioTextChatIpc,
  validateGoogleAIStudioTextChatPayload,
  type GoogleAIStudioTextChatWireEvent,
} from './googleAIStudioTextChatIpc'
import type { ProviderCredentialService } from '../credentials/providerCredentialService'

function textChunk(text: string): string {
  return `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] })}`
}

function doneChunk(): string {
  return `data: ${JSON.stringify({ candidates: [{ finishReason: 'STOP' }] })}`
}

function makeSseResponse(...lines: string[]): Response {
  return new Response(`${lines.join('\n\n')}\n\n`, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
}

function createSender() {
  return { send: vi.fn() }
}

function sentEvents(sender: ReturnType<typeof createSender>, requestId: string): GoogleAIStudioTextChatWireEvent[] {
  return sender.send.mock.calls
    .filter(([channel]) => channel === `google-ai-studio-chat:chunk:${requestId}`)
    .map(([, payload]) => payload as GoogleAIStudioTextChatWireEvent)
}

function createCredentialService(apiKey?: string): ProviderCredentialService {
  return {
    readApiKey: vi.fn(() => apiKey
      ? { ok: true, providerKey: 'google_ai_studio', apiKey, source: 'secure_store', backend: 'electron_safe_storage', migratedFromLegacy: false, warnings: [] }
      : { ok: false, providerKey: 'google_ai_studio', code: 'credential_missing', message: 'missing', source: 'missing', backend: 'electron_safe_storage', warnings: [] }),
  } as unknown as ProviderCredentialService
}

describe('googleAIStudioTextChatIpc', () => {
  it('validates text-only payloads before fetch', () => {
    expect(validateGoogleAIStudioTextChatPayload({
      requestId: 'google_ai_studio_req_1',
      assistantMessageId: 'assistant_1',
      model: 'gemini-2.5-flash',
      messages: [{ role: 'user', content: 'hello' }],
    })).toMatchObject({ ok: true })

    expect(validateGoogleAIStudioTextChatPayload({
      requestId: 'google_ai_studio_req_bad',
      assistantMessageId: 'assistant_1',
      model: 'gemini-2.5-flash',
      messages: [{ role: 'tool', content: 'unsupported' }],
    })).toMatchObject({ ok: false, code: 'invalid_payload' })
  })

  it('streams native Gemini text deltas with main-process Google AI Studio credential resolution', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse')
      expect(init?.method).toBe('POST')
      expect(init?.redirect).toBe('error')
      expect((init?.headers as Record<string, string>)?.['x-goog-api-key']).toBe('AIza-google-secret')
      expect((init?.headers as Record<string, string>)?.Authorization).toBeUndefined()
      const body = JSON.parse(String(init?.body ?? '{}'))
      expect(body).toMatchObject({
        contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
      })
      return makeSseResponse(textChunk('gemini hello'), doneChunk())
    }) as unknown as typeof fetch

    const registerInvoke = vi.fn()
    registerGoogleAIStudioTextChatIpc({ registerInvoke, credentialService: createCredentialService('AIza-google-secret'), fetchImpl })
    const handler = registerInvoke.mock.calls.find(([channel]) => channel === 'google-ai-studio-chat:stream-text')?.[1]
    const sender = createSender()

    const start = await handler({ sender }, {
      requestId: 'google_ai_studio_req_ok',
      assistantMessageId: 'assistant_1',
      model: 'gemini-2.5-flash',
      messages: [{ role: 'user', content: 'hello' }],
      timeoutMs: 1000,
    })

    expect(start).toEqual({ ok: true })
    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledWith('google-ai-studio-chat:end:google_ai_studio_req_ok'))
    const events = sentEvents(sender, 'google_ai_studio_req_ok')
    expect(events.some((event) =>
      event.type === 'event' &&
      event.event.type === 'message.text_delta' &&
      event.event.text === 'gemini hello',
    )).toBe(true)
    expect(events.some((event) => event.type === 'event' && event.event.type === 'stream.done')).toBe(true)
    const serializedEvents = JSON.stringify(events)
    expect(serializedEvents).not.toContain('AIza-google-secret')
    expect(serializedEvents).not.toContain('x-goog-api-key')
    expect(serializedEvents).not.toContain('Authorization')
    expect(serializedEvents).not.toContain('Bearer')
  })

  it('fails before fetch when the Google AI Studio API key is missing', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const registerInvoke = vi.fn()
    registerGoogleAIStudioTextChatIpc({ registerInvoke, credentialService: createCredentialService(), fetchImpl })
    const handler = registerInvoke.mock.calls.find(([channel]) => channel === 'google-ai-studio-chat:stream-text')?.[1]
    const sender = createSender()

    const start = await handler({ sender }, {
      requestId: 'google_ai_studio_req_missing_key',
      assistantMessageId: 'assistant_1',
      model: 'gemini-2.5-flash',
      messages: [{ role: 'user', content: 'hello' }],
    })

    expect(start).toEqual({ ok: true })
    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledWith('google-ai-studio-chat:end:google_ai_studio_req_missing_key'))
    expect(fetchImpl).not.toHaveBeenCalled()
    const events = sentEvents(sender, 'google_ai_studio_req_missing_key')
    expect(events.some((event) =>
      event.type === 'event' &&
      event.event.type === 'stream.error' &&
      event.event.error.code === 'credential_missing',
    )).toBe(true)
    expect(events.some((event) => event.type === 'event' && event.event.type === 'stream.done')).toBe(false)
  })

  it('normalizes malicious transport errors before sending them to the renderer', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('Authorization: Bearer AIza-google-secret at https://public.example.test')
    }) as unknown as typeof fetch
    const registerInvoke = vi.fn()
    registerGoogleAIStudioTextChatIpc({ registerInvoke, credentialService: createCredentialService('AIza-google-secret'), fetchImpl })
    const handler = registerInvoke.mock.calls.find(([channel]) => channel === 'google-ai-studio-chat:stream-text')?.[1]
    const sender = createSender()

    await handler({ sender }, {
      requestId: 'google_ai_studio_req_error',
      assistantMessageId: 'assistant_1',
      model: 'gemini-2.5-flash',
      messages: [{ role: 'user', content: 'hello' }],
    })

    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledWith('google-ai-studio-chat:end:google_ai_studio_req_error'))
    const serialized = JSON.stringify(sentEvents(sender, 'google_ai_studio_req_error'))
    expect(serialized).not.toContain('AIza-google-secret')
    expect(serialized).not.toContain('Authorization')
    expect(serialized).not.toContain('Bearer')
    expect(serialized).not.toContain('public.example.test')
    expect(serialized).toContain('Google AI Studio text chat failed safely.')
  })

  it('supports abort through the explicit Google AI Studio chat abort channel', async () => {
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
    registerGoogleAIStudioTextChatIpc({ registerInvoke, credentialService: createCredentialService('AIza-google-secret'), fetchImpl })
    const startHandler = registerInvoke.mock.calls.find(([channel]) => channel === 'google-ai-studio-chat:stream-text')?.[1]
    const abortHandler = registerInvoke.mock.calls.find(([channel]) => channel === 'google-ai-studio-chat:abort')?.[1]
    const sender = createSender()

    await startHandler({ sender }, {
      requestId: 'google_ai_studio_req_abort',
      assistantMessageId: 'assistant_1',
      model: 'gemini-2.5-flash',
      messages: [{ role: 'user', content: 'hello' }],
      timeoutMs: 10000,
    })
    abortGoogleAIStudioTextChat('google_ai_studio_req_abort')
    await abortHandler({}, 'google_ai_studio_req_abort')

    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledWith('google-ai-studio-chat:end:google_ai_studio_req_abort'))
    const events = sentEvents(sender, 'google_ai_studio_req_abort')
    expect(events.some((event) =>
      event.type === 'event' &&
      event.event.type === 'stream.abort',
    )).toBe(true)
  })
})
