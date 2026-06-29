import { describe, expect, it, vi } from 'vitest'
import {
  abortOpenAIResponsesTextChat,
  registerOpenAIResponsesTextChatIpc,
  validateOpenAIResponsesTextChatPayload,
  type OpenAIResponsesTextChatWireEvent,
} from './openAIResponsesTextChatIpc'
import type { ProviderCredentialService } from '../credentials/providerCredentialService'

function textDeltaSse(delta: string, seq = 1): string {
  return `event: response.output_text.delta\ndata: ${JSON.stringify({ type: 'response.output_text.delta', delta, item_id: 'i1', content_index: 0, output_index: 0, sequence_number: seq })}`
}

function completedSse(seq = 10): string {
  return `event: response.completed\ndata: ${JSON.stringify({ type: 'response.completed', response: { id: 'resp_1', status: 'completed' }, sequence_number: seq })}`
}

function makeSseResponse(...lines: string[]): Response {
  const body = `${lines.join('\n\n')}\n\ndata: [DONE]\n\n`
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

function createSender() {
  return { send: vi.fn() }
}

function sentEvents(sender: ReturnType<typeof createSender>, requestId: string): OpenAIResponsesTextChatWireEvent[] {
  return sender.send.mock.calls
    .filter(([channel]) => channel === `openai-responses-chat:chunk:${requestId}`)
    .map(([, payload]) => payload as OpenAIResponsesTextChatWireEvent)
}

function createCredentialService(apiKey?: string): ProviderCredentialService {
  return {
    readApiKey: vi.fn(() => apiKey
      ? { ok: true, providerKey: 'openai_responses', apiKey, source: 'secure_store', backend: 'electron_safe_storage', migratedFromLegacy: false, warnings: [] }
      : { ok: false, providerKey: 'openai_responses', code: 'credential_missing', message: 'missing', source: 'missing', backend: 'electron_safe_storage', warnings: [] }),
  } as unknown as ProviderCredentialService
}

describe('openAIResponsesTextChatIpc', () => {
  const uploadBlock = {
    type: 'starverse_provider_file_upload',
    provider: 'openai_responses',
    assetId: 'asset-upload',
    revisionId: 'rev-upload',
    blobSha256: 'a'.repeat(64),
    mimeType: 'application/pdf',
    sizeBytes: 4,
    kind: 'pdf',
    filename: 'manual.pdf',
    dataBase64: 'JVBERg==',
  }

  it('validates text-only payloads before fetch', () => {
    expect(validateOpenAIResponsesTextChatPayload({
      requestId: 'openai_responses_req_1',
      assistantMessageId: 'assistant_1',
      model: 'gpt-4.1-mini',
      messages: [{ role: 'user', content: 'hello' }],
    })).toMatchObject({ ok: true })

    expect(validateOpenAIResponsesTextChatPayload({
      requestId: 'openai_responses_req_bad',
      assistantMessageId: 'assistant_1',
      model: 'gpt-4.1-mini',
      messages: [{ role: 'tool', content: 'unsupported' }],
    })).toMatchObject({ ok: false, code: 'invalid_payload' })
  })

  it('streams native OpenAI Responses text deltas with main-process credential resolution', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://api.openai.com/v1/responses')
      expect(init?.method).toBe('POST')
      expect(init?.redirect).toBe('error')
      expect((init?.headers as Record<string, string>)?.Authorization).toBe('Bearer sk-openai-secret')
      const body = JSON.parse(String(init?.body ?? '{}'))
      expect(body).toMatchObject({
        model: 'gpt-4.1-mini',
        stream: true,
        input: [{ role: 'user', content: 'hello' }],
      })
      return makeSseResponse(textDeltaSse('hello'), completedSse())
    }) as unknown as typeof fetch

    const registerInvoke = vi.fn()
    registerOpenAIResponsesTextChatIpc({ registerInvoke, credentialService: createCredentialService('sk-openai-secret'), fetchImpl })
    const handler = registerInvoke.mock.calls.find(([channel]) => channel === 'openai-responses-chat:stream-text')?.[1]
    const sender = createSender()

    const start = await handler({ sender }, {
      requestId: 'openai_responses_req_ok',
      assistantMessageId: 'assistant_1',
      model: 'gpt-4.1-mini',
      messages: [{ role: 'user', content: 'hello' }],
      timeoutMs: 1000,
    })

    expect(start).toEqual({ ok: true })
    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledWith('openai-responses-chat:end:openai_responses_req_ok'))
    const events = sentEvents(sender, 'openai_responses_req_ok')
    expect(events.some((event) =>
      event.type === 'event' &&
      event.event.type === 'message.text_delta' &&
      event.event.text === 'hello',
    )).toBe(true)
    expect(events.some((event) => event.type === 'event' && event.event.type === 'stream.done')).toBe(true)
    const serializedEvents = JSON.stringify(events)
    expect(serializedEvents).not.toContain('sk-openai-secret')
    expect(serializedEvents).not.toContain('Bearer sk-openai-secret')
  })

  it('fails before fetch when the OpenAI Responses API key is missing', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const registerInvoke = vi.fn()
    registerOpenAIResponsesTextChatIpc({ registerInvoke, credentialService: createCredentialService(), fetchImpl })
    const handler = registerInvoke.mock.calls.find(([channel]) => channel === 'openai-responses-chat:stream-text')?.[1]
    const sender = createSender()

    const start = await handler({ sender }, {
      requestId: 'openai_responses_req_missing_key',
      assistantMessageId: 'assistant_1',
      model: 'gpt-4.1-mini',
      messages: [{ role: 'user', content: 'hello' }],
    })

    expect(start).toEqual({ ok: true })
    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledWith('openai-responses-chat:end:openai_responses_req_missing_key'))
    expect(fetchImpl).not.toHaveBeenCalled()
    const events = sentEvents(sender, 'openai_responses_req_missing_key')
    expect(events.some((event) =>
      event.type === 'event' &&
      event.event.type === 'stream.error' &&
      event.event.error.code === 'credential_missing',
    )).toBe(true)
    expect(events.some((event) => event.type === 'event' && event.event.type === 'stream.done')).toBe(false)
  })

  it('resolves provider upload blocks before building the OpenAI Responses request body', async () => {
    const providerFileUploadService = {
      resolveContentBlocks: vi.fn(async () => ({
        ok: true,
        blocks: [
          { type: 'input_file', file_id: 'file-openai-uploaded' },
        ],
        cacheEvents: [],
      })),
      invalidate: vi.fn(),
    }
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}'))
      const serializedBody = JSON.stringify(body)
      expect(body.input[0].content).toEqual([
        { type: 'input_text', text: 'Read it.' },
        { type: 'input_file', file_id: 'file-openai-uploaded' },
      ])
      expect(serializedBody).not.toContain('data:application/pdf')
      expect(serializedBody).not.toContain('originalPath')
      expect(serializedBody).not.toContain('storagePath')
      expect(serializedBody).not.toContain('blobId')
      expect(serializedBody).not.toContain('originalUrl')
      expect(serializedBody).not.toContain('sk-openai-secret')
      return makeSseResponse(textDeltaSse('done'), completedSse())
    }) as unknown as typeof fetch
    const registerInvoke = vi.fn()
    registerOpenAIResponsesTextChatIpc({
      registerInvoke,
      credentialService: createCredentialService('sk-openai-secret'),
      providerFileUploadService: providerFileUploadService as any,
      fetchImpl,
    })
    const handler = registerInvoke.mock.calls.find(([channel]) => channel === 'openai-responses-chat:stream-text')?.[1]
    const sender = createSender()

    await handler({ sender }, {
      requestId: 'openai_responses_req_upload',
      assistantMessageId: 'assistant_1',
      model: 'gpt-5.4-nano',
      messages: [{ role: 'user', content: 'Read it.' }],
      currentUserContentBlocks: [uploadBlock],
    })

    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1))
    expect(providerFileUploadService.resolveContentBlocks).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'openai_responses',
      baseUrl: 'https://api.openai.com/v1',
    }))
  })

  it('normalizes malicious transport errors before sending them to the renderer', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('Authorization: Bearer sk-openai-secret at https://public.example.test')
    }) as unknown as typeof fetch
    const registerInvoke = vi.fn()
    registerOpenAIResponsesTextChatIpc({ registerInvoke, credentialService: createCredentialService('sk-openai-secret'), fetchImpl })
    const handler = registerInvoke.mock.calls.find(([channel]) => channel === 'openai-responses-chat:stream-text')?.[1]
    const sender = createSender()

    await handler({ sender }, {
      requestId: 'openai_responses_req_error',
      assistantMessageId: 'assistant_1',
      model: 'gpt-4.1-mini',
      messages: [{ role: 'user', content: 'hello' }],
    })

    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledWith('openai-responses-chat:end:openai_responses_req_error'))
    const serialized = JSON.stringify(sentEvents(sender, 'openai_responses_req_error'))
    expect(serialized).not.toContain('sk-openai-secret')
    expect(serialized).not.toContain('Authorization')
    expect(serialized).not.toContain('Bearer')
    expect(serialized).not.toContain('public.example.test')
    expect(serialized).toContain('OpenAI Responses text chat failed safely.')
  })

  it('supports abort through the explicit OpenAI Responses chat abort channel', async () => {
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
    registerOpenAIResponsesTextChatIpc({ registerInvoke, credentialService: createCredentialService('sk-openai-secret'), fetchImpl })
    const startHandler = registerInvoke.mock.calls.find(([channel]) => channel === 'openai-responses-chat:stream-text')?.[1]
    const abortHandler = registerInvoke.mock.calls.find(([channel]) => channel === 'openai-responses-chat:abort')?.[1]
    const sender = createSender()

    await startHandler({ sender }, {
      requestId: 'openai_responses_req_abort',
      assistantMessageId: 'assistant_1',
      model: 'gpt-4.1-mini',
      messages: [{ role: 'user', content: 'hello' }],
      timeoutMs: 10000,
    })
    abortOpenAIResponsesTextChat('openai_responses_req_abort')
    await abortHandler({}, 'openai_responses_req_abort')

    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledWith('openai-responses-chat:end:openai_responses_req_abort'))
    const events = sentEvents(sender, 'openai_responses_req_abort')
    expect(events.some((event) =>
      event.type === 'event' &&
      event.event.type === 'stream.abort',
    )).toBe(true)
  })
})
