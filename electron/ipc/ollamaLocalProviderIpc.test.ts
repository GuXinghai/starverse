import { describe, expect, it, vi } from 'vitest'
import {
  parseOllamaPsResponse,
  parseOllamaTagsResponse,
  probeOllamaLocalProvider,
  registerOllamaLocalProviderIpc,
  validateOllamaEndpointUrl,
  validateOllamaTextChatPayload,
  type OllamaTextChatWireEvent,
} from './ollamaLocalProviderIpc'

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json', 'x-request-id': 'ollama_req_header' },
  })
}

function streamResponse(text: string, status = 200, contentType = 'application/x-ndjson'): Response {
  return new Response(text, {
    status,
    headers: { 'content-type': contentType, 'x-request-id': 'ollama_req_header' },
  })
}

function ollamaTags(models: unknown[] = [{
  name: 'llama3.2:latest',
  model: 'llama3.2:latest',
  digest: 'digest-local',
  size: 123,
  details: {
    family: 'llama',
    parameter_size: '3.2B',
    quantization_level: 'Q4_K_M',
  },
}]) {
  return { models }
}

function ollamaPs(models: unknown[] = []) {
  return { models }
}

function defaultConfig(overrides: Partial<{
  chatMode: 'native_rest' | 'openai_compatible'
  nativePreferredEndpoint: 'chat' | 'generate'
  openAIPreferredEndpoint: 'chat_completions' | 'responses'
  autoLoadBeforeSendEnabled: boolean
  autoUnloadAfterSendEnabled: boolean
}> = {}) {
  return {
    providerKey: 'ollama_local' as const,
    endpointUrl: 'http://127.0.0.1:11434',
    nativeControls: {
      diagnosticsEnabled: true,
      manualLoadUnloadEnabled: true,
      autoLoadBeforeSendEnabled: overrides.autoLoadBeforeSendEnabled === true,
      autoUnloadAfterSendEnabled: overrides.autoUnloadAfterSendEnabled === true,
      autoUnloadAfterIdleEnabled: false,
    },
    chatMode: overrides.chatMode ?? 'native_rest' as const,
    nativeRest: {
      basePath: '/api' as const,
      preferredEndpoint: overrides.nativePreferredEndpoint ?? 'chat' as const,
    },
    openAICompatible: {
      basePath: '/v1' as const,
      preferredEndpoint: overrides.openAIPreferredEndpoint ?? 'chat_completions' as const,
    },
  }
}

function createSender() {
  return { send: vi.fn() }
}

function sentEvents(sender: ReturnType<typeof createSender>, requestId: string): OllamaTextChatWireEvent[] {
  return sender.send.mock.calls
    .filter(([channel]) => channel === `ollama-chat:chunk:${requestId}`)
    .map(([, payload]) => payload as OllamaTextChatWireEvent)
}

function registeredHandler(registerInvoke: ReturnType<typeof vi.fn>, channel: string) {
  return registerInvoke.mock.calls.find(([registeredChannel]) => registeredChannel === channel)?.[1] as any
}

describe('ollamaLocalProviderIpc', () => {
  it('validates loopback endpoints and rejects remote hosts, credentials, and unsupported schemes', () => {
    expect(validateOllamaEndpointUrl(undefined)).toMatchObject({
      ok: true,
      safeBaseUrl: 'http://127.0.0.1:11434',
    })
    expect(validateOllamaEndpointUrl('http://localhost:11434')).toMatchObject({ ok: true })
    expect(validateOllamaEndpointUrl('http://127.0.0.1:11434')).toMatchObject({ ok: true })
    expect(validateOllamaEndpointUrl('http://[::1]:11434')).toMatchObject({ ok: true })

    expect(validateOllamaEndpointUrl('http://192.168.1.12:11434')).toMatchObject({
      ok: false,
      code: 'remote_host_rejected',
    })
    expect(validateOllamaEndpointUrl('https://api.example.test:11434')).toMatchObject({
      ok: false,
      code: 'remote_host_rejected',
    })
    expect(validateOllamaEndpointUrl('file:///tmp/ollama.sock')).toMatchObject({
      ok: false,
      code: 'invalid_url',
    })
    const credentialResult = validateOllamaEndpointUrl('http://user:pass@localhost:11434?token=sk-hidden')
    expect(credentialResult).toMatchObject({
      ok: false,
      code: 'embedded_credentials_rejected',
      safeUrl: 'http://localhost:11434',
    })
    expect(JSON.stringify(credentialResult)).not.toContain('user:pass')
    expect(JSON.stringify(credentialResult)).not.toContain('sk-hidden')
  })

  it('parses native tags and ps model metadata', () => {
    expect(parseOllamaTagsResponse(ollamaTags())).toMatchObject({
      ok: true,
      source: 'ollama_api_tags',
      count: 1,
      modelIds: ['llama3.2:latest'],
      models: [expect.objectContaining({
        key: 'llama3.2:latest',
        running: false,
        digest: 'digest-local',
        details: expect.objectContaining({
          family: 'llama',
          parameterSize: '3.2B',
          quantizationLevel: 'Q4_K_M',
        }),
      })],
    })
    expect(parseOllamaPsResponse(ollamaPs([{ name: 'llama3.2:latest', model: 'llama3.2:latest', size_vram: 456 }]))).toMatchObject({
      ok: true,
      source: 'ollama_api_ps',
      modelIds: ['llama3.2:latest'],
      models: [expect.objectContaining({ key: 'llama3.2:latest', running: true, sizeVramBytes: 456 })],
    })
    expect(parseOllamaTagsResponse({ models: [{ display_name: 'missing model key' }] })).toMatchObject({
      ok: false,
      code: 'invalid_response',
    })
  })

  it('probes native REST and OpenAI-compatible surfaces without sending credentials or leaking raw errors', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(init?.method).toBe('GET')
      expect(init?.redirect).toBe('error')
      expect(init?.headers).toEqual({ Accept: 'application/json' })
      expect(JSON.stringify(init)).not.toContain('Authorization')
      expect(JSON.stringify(init)).not.toContain('Bearer')
      if (url.endsWith('/api/tags')) return jsonResponse(ollamaTags())
      if (url.endsWith('/api/ps')) return jsonResponse(ollamaPs([{ name: 'llama3.2:latest', model: 'llama3.2:latest' }]))
      if (url.endsWith('/api/version')) return jsonResponse({ version: '0.12.0' })
      if (url.endsWith('/v1/models')) return jsonResponse({ data: [{ id: 'llama3.2:latest' }] })
      throw new Error(`unexpected url: ${url}`)
    }) as unknown as typeof fetch

    const result = await probeOllamaLocalProvider({
      endpointUrl: 'http://127.0.0.1:11434?token=sk-hidden',
      selectedModel: 'llama3.2:latest',
      timeoutMs: 750,
    }, { fetchImpl })

    expect(result).toMatchObject({
      ok: true,
      diagnostics: {
        safeBaseUrl: 'http://127.0.0.1:11434',
        nativeRestAvailable: true,
        openAICompatibleAvailable: true,
        selectedModelKnown: true,
        selectedModelRunning: true,
      },
    })
    expect(fetchImpl).toHaveBeenCalledTimes(4)
    expect(JSON.stringify(result)).not.toContain('sk-hidden')
  })

  it('runs manual load and unload through empty native chat messages only', async () => {
    const urls: string[] = []
    const bodies: unknown[] = []
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      urls.push(url)
      bodies.push(JSON.parse(String(init?.body ?? '{}')))
      expect(init?.method).toBe('POST')
      expect(init?.headers).toEqual({
        Accept: 'application/json',
        'Content-Type': 'application/json',
      })
      expect(JSON.stringify(init)).not.toContain('Authorization')
      expect(JSON.stringify(init)).not.toContain('Bearer')
      if (url.endsWith('/api/chat')) return jsonResponse({ model: 'llama3.2:latest', done: true })
      throw new Error(`unexpected url: ${url}`)
    }) as unknown as typeof fetch
    const registerInvoke = vi.fn()
    registerOllamaLocalProviderIpc({ registerInvoke, fetchImpl })
    const loadHandler = registeredHandler(registerInvoke, 'ollama:load-model')
    const unloadHandler = registeredHandler(registerInvoke, 'ollama:unload-model')

    await expect(loadHandler({}, {
      endpointUrl: 'http://localhost:11434',
      model: 'llama3.2:latest',
      manualLoadUnloadEnabled: true,
      timeoutMs: 750,
    })).resolves.toMatchObject({ ok: true, operation: 'load', model: 'llama3.2:latest' })

    await expect(unloadHandler({}, {
      endpointUrl: 'http://localhost:11434',
      model: 'llama3.2:latest',
      manualLoadUnloadEnabled: true,
      timeoutMs: 750,
    })).resolves.toMatchObject({ ok: true, operation: 'unload', model: 'llama3.2:latest' })

    expect(urls).toEqual([
      'http://localhost:11434/api/chat',
      'http://localhost:11434/api/chat',
    ])
    expect(bodies).toEqual([
      { model: 'llama3.2:latest', messages: [], stream: false },
      { model: 'llama3.2:latest', messages: [], stream: false, keep_alive: 0 },
    ])
    expect(urls.join('\n')).not.toContain('pull')
    expect(urls.join('\n')).not.toContain('download')
  })

  it('blocks manual load and unload when native controls are disabled', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const registerInvoke = vi.fn()
    registerOllamaLocalProviderIpc({ registerInvoke, fetchImpl })
    const loadHandler = registeredHandler(registerInvoke, 'ollama:load-model')
    const unloadHandler = registeredHandler(registerInvoke, 'ollama:unload-model')

    await expect(loadHandler({}, {
      endpointUrl: 'http://localhost:11434',
      model: 'llama3.2:latest',
      manualLoadUnloadEnabled: false,
    })).resolves.toMatchObject({ ok: false, code: 'controls_disabled' })
    await expect(unloadHandler({}, {
      endpointUrl: 'http://localhost:11434',
      model: 'llama3.2:latest',
      manualLoadUnloadEnabled: false,
    })).resolves.toMatchObject({ ok: false, code: 'controls_disabled' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('blocks chat when the selected model is known not running and auto-load is disabled', async () => {
    const urls: string[] = []
    const fetchImpl = vi.fn(async (url: string) => {
      urls.push(url)
      if (url.endsWith('/api/ps')) return jsonResponse(ollamaPs([]))
      if (url.endsWith('/api/tags')) return jsonResponse(ollamaTags())
      throw new Error(`unexpected url: ${url}`)
    }) as unknown as typeof fetch
    const registerInvoke = vi.fn()
    registerOllamaLocalProviderIpc({ registerInvoke, fetchImpl })
    const startHandler = registeredHandler(registerInvoke, 'ollama-chat:stream-text')
    const sender = createSender()

    expect(startHandler({ sender }, {
      requestId: 'ollama_req_unloaded',
      assistantMessageId: 'assistant_1',
      config: defaultConfig({ autoLoadBeforeSendEnabled: false }),
      model: 'llama3.2:latest',
      messages: [{ role: 'user', content: 'hello' }],
      timeoutMs: 750,
    })).toEqual({ ok: true })

    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledWith('ollama-chat:end:ollama_req_unloaded'))
    expect(urls).toEqual([
      'http://127.0.0.1:11434/api/ps',
      'http://127.0.0.1:11434/api/tags',
    ])
    expect(sentEvents(sender, 'ollama_req_unloaded').some((event) =>
      event.type === 'error' && event.error.code === 'model_not_loaded'
    )).toBe(true)
  })

  it('auto-loads before native REST chat, filters thinking metadata, and unloads after a normal send', async () => {
    const urls: string[] = []
    const bodies: unknown[] = []
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      urls.push(url)
      if (init?.body) bodies.push(JSON.parse(String(init.body)))
      expect(JSON.stringify(init)).not.toContain('Authorization')
      expect(JSON.stringify(init)).not.toContain('Bearer')
      if (url.endsWith('/api/ps')) return jsonResponse(ollamaPs([]))
      if (url.endsWith('/api/tags')) return jsonResponse(ollamaTags())
      if (url.endsWith('/api/chat') && bodies.length === 1) return jsonResponse({ model: 'llama3.2:latest', done: true })
      if (url.endsWith('/api/chat') && bodies.length === 2) {
        return streamResponse([
          '{"model":"llama3.2:latest","message":{"role":"assistant","thinking":"hidden","content":"O"},"done":false}',
          '{"model":"llama3.2:latest","message":{"role":"assistant","content":"K"},"done":false}',
          '{"model":"llama3.2:latest","done":true,"total_duration":123}',
          '',
        ].join('\n'))
      }
      if (url.endsWith('/api/chat') && bodies.length === 3) return jsonResponse({ model: 'llama3.2:latest', done: true })
      throw new Error(`unexpected url: ${url}`)
    }) as unknown as typeof fetch
    const registerInvoke = vi.fn()
    registerOllamaLocalProviderIpc({ registerInvoke, fetchImpl })
    const startHandler = registeredHandler(registerInvoke, 'ollama-chat:stream-text')
    const sender = createSender()

    expect(startHandler({ sender }, {
      requestId: 'ollama_req_native_auto',
      assistantMessageId: 'assistant_1',
      config: defaultConfig({
        autoLoadBeforeSendEnabled: true,
        autoUnloadAfterSendEnabled: true,
      }),
      model: 'llama3.2:latest',
      messages: [{ role: 'user', content: 'please say OK' }],
      timeoutMs: 750,
    })).toEqual({ ok: true })

    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledWith('ollama-chat:end:ollama_req_native_auto'))
    expect(urls).toEqual([
      'http://127.0.0.1:11434/api/ps',
      'http://127.0.0.1:11434/api/tags',
      'http://127.0.0.1:11434/api/chat',
      'http://127.0.0.1:11434/api/chat',
      'http://127.0.0.1:11434/api/chat',
    ])
    expect(bodies).toEqual([
      { model: 'llama3.2:latest', messages: [], stream: false },
      { model: 'llama3.2:latest', messages: [{ role: 'user', content: 'please say OK' }], stream: true },
      { model: 'llama3.2:latest', messages: [], stream: false, keep_alive: 0 },
    ])
    const events = sentEvents(sender, 'ollama_req_native_auto')
    const chunks = events
      .filter((event) => event.type === 'chunk')
      .map((event) => event.data)
      .join('')
    expect(chunks).toContain('"content":"O"')
    expect(chunks).toContain('"content":"K"')
    expect(chunks).toContain('[DONE]')
    const serialized = JSON.stringify(events)
    expect(serialized).not.toContain('hidden')
    expect(serialized).not.toContain('total_duration')
  })

  it('supports native generate and OpenAI-compatible chat modes as explicit options', async () => {
    const urls: string[] = []
    const bodies: unknown[] = []
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      urls.push(url)
      if (init?.body) bodies.push(JSON.parse(String(init.body)))
      if (url.endsWith('/api/ps')) return jsonResponse(ollamaPs([{ name: 'llama3.2:latest', model: 'llama3.2:latest' }]))
      if (url.endsWith('/api/generate')) return streamResponse('{"response":"OK","done":true}\n')
      if (url.endsWith('/v1/chat/completions')) {
        return streamResponse(
          'data: {"choices":[{"index":0,"delta":{"content":"OK"},"finish_reason":null}]}\n\ndata: [DONE]\n\n',
          200,
          'text/event-stream',
        )
      }
      throw new Error(`unexpected url: ${url}`)
    }) as unknown as typeof fetch
    const registerInvoke = vi.fn()
    registerOllamaLocalProviderIpc({ registerInvoke, fetchImpl })
    const startHandler = registeredHandler(registerInvoke, 'ollama-chat:stream-text')
    const sender = createSender()

    expect(startHandler({ sender }, {
      requestId: 'ollama_req_generate',
      assistantMessageId: 'assistant_1',
      config: defaultConfig({ nativePreferredEndpoint: 'generate' }),
      model: 'llama3.2:latest',
      messages: [{ role: 'assistant', content: 'prior' }, { role: 'user', content: 'next' }],
      timeoutMs: 750,
    })).toEqual({ ok: true })
    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledWith('ollama-chat:end:ollama_req_generate'))

    expect(startHandler({ sender }, {
      requestId: 'ollama_req_openai',
      assistantMessageId: 'assistant_2',
      config: defaultConfig({ chatMode: 'openai_compatible' }),
      model: 'llama3.2:latest',
      messages: [{ role: 'user', content: 'hello' }],
      timeoutMs: 750,
    })).toEqual({ ok: true })
    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledWith('ollama-chat:end:ollama_req_openai'))

    expect(urls).toEqual([
      'http://127.0.0.1:11434/api/ps',
      'http://127.0.0.1:11434/api/generate',
      'http://127.0.0.1:11434/api/ps',
      'http://127.0.0.1:11434/v1/chat/completions',
    ])
    expect(bodies).toEqual([
      {
        model: 'llama3.2:latest',
        prompt: 'assistant: prior\nuser: next',
        stream: true,
      },
      {
        model: 'llama3.2:latest',
        messages: [{ role: 'user', content: 'hello' }],
        stream: true,
      },
    ])
  })

  it('supports OpenAI-compatible Responses mapping when explicitly selected', async () => {
    const urls: string[] = []
    const bodies: unknown[] = []
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      urls.push(url)
      if (init?.body) bodies.push(JSON.parse(String(init.body)))
      if (url.endsWith('/api/ps')) return jsonResponse(ollamaPs([{ name: 'llama3.2:latest', model: 'llama3.2:latest' }]))
      if (url.endsWith('/v1/responses')) {
        return streamResponse(
          'event: response.output_text.delta\ndata: {"delta":"OK"}\n\nevent: response.completed\ndata: {}\n\n',
          200,
          'text/event-stream',
        )
      }
      throw new Error(`unexpected url: ${url}`)
    }) as unknown as typeof fetch
    const registerInvoke = vi.fn()
    registerOllamaLocalProviderIpc({ registerInvoke, fetchImpl })
    const startHandler = registeredHandler(registerInvoke, 'ollama-chat:stream-text')
    const sender = createSender()

    expect(startHandler({ sender }, {
      requestId: 'ollama_req_responses',
      assistantMessageId: 'assistant_1',
      config: defaultConfig({
        chatMode: 'openai_compatible',
        openAIPreferredEndpoint: 'responses',
      }),
      model: 'llama3.2:latest',
      messages: [{ role: 'user', content: 'please say OK' }],
      timeoutMs: 750,
    })).toEqual({ ok: true })

    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledWith('ollama-chat:end:ollama_req_responses'))
    expect(urls).toEqual([
      'http://127.0.0.1:11434/api/ps',
      'http://127.0.0.1:11434/v1/responses',
    ])
    expect(bodies).toEqual([{
      model: 'llama3.2:latest',
      input: [{ role: 'user', content: 'please say OK', type: 'message' }],
      stream: true,
    }])
    expect(JSON.stringify(sentEvents(sender, 'ollama_req_responses'))).toContain('OK')
  })

  it('aborts a text chat by timeout and normalizes oversized text payloads', async () => {
    const fetchImpl = vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith('/api/ps')) return Promise.resolve(jsonResponse(ollamaPs([{ name: 'llama3.2:latest', model: 'llama3.2:latest' }])))
      if (url.endsWith('/v1/chat/completions')) {
        return new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal as AbortSignal | undefined
          if (signal?.aborted) {
            reject(new DOMException('Aborted', 'AbortError'))
            return
          }
          signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
        })
      }
      throw new Error(`unexpected url: ${url}`)
    }) as unknown as typeof fetch
    const registerInvoke = vi.fn()
    registerOllamaLocalProviderIpc({ registerInvoke, fetchImpl })
    const startHandler = registeredHandler(registerInvoke, 'ollama-chat:stream-text')
    const sender = createSender()

    expect(startHandler({ sender }, {
      requestId: 'ollama_req_timeout',
      assistantMessageId: 'assistant_1',
      config: defaultConfig({ chatMode: 'openai_compatible', autoUnloadAfterSendEnabled: true }),
      model: 'llama3.2:latest',
      messages: [{ role: 'user', content: 'hello' }],
      timeoutMs: 1000,
    })).toEqual({ ok: true })

    await vi.waitFor(
      () => expect(sender.send).toHaveBeenCalledWith('ollama-chat:end:ollama_req_timeout'),
      { timeout: 2500 },
    )
    expect(sentEvents(sender, 'ollama_req_timeout').some((event) =>
      event.type === 'error' &&
      event.error.kind === 'transport_error' &&
      event.error.code === 'timeout'
    )).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(2)

    const messages = Array.from({ length: 90 }, (_unused, index) => ({
      role: index % 2 === 0 ? 'assistant' as const : 'user' as const,
      content: index === 89 ? 'x'.repeat(20050) : `msg-${index}`,
    }))
    const result = validateOllamaTextChatPayload({
      requestId: 'ollama_req_truncate',
      assistantMessageId: 'assistant_1',
      config: defaultConfig(),
      model: 'llama3.2:latest',
      messages,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected valid Ollama payload')
    expect(result.messages).toHaveLength(80)
    expect(result.messages[0]).toEqual({ role: 'assistant', content: 'msg-10' })
    expect(result.messages[result.messages.length - 1]).toEqual({ role: 'user', content: 'x'.repeat(20000) })
  })
})
