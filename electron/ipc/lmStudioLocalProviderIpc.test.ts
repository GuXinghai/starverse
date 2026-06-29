import { describe, expect, it, vi } from 'vitest'
import {
  parseLMStudioNativeModelsResponse,
  probeLMStudioLocalProvider,
  registerLMStudioLocalProviderIpc,
  validateLMStudioTextChatPayload,
  validateLMStudioEndpointUrl,
  type LMStudioTextChatWireEvent,
} from './lmStudioLocalProviderIpc'

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json', 'x-request-id': 'lmstudio_req_header' },
  })
}

function sseResponse(text: string, status = 200): Response {
  return new Response(text, {
    status,
    headers: { 'content-type': 'text/event-stream', 'x-request-id': 'lmstudio_req_header' },
  })
}

function nativeModels(loadedInstances: unknown[] = []) {
  return {
    models: [{
      key: 'openai/gpt-oss-20b',
      display_name: 'GPT OSS 20B',
      type: 'llm',
      publisher: 'openai',
      architecture: 'gpt-oss',
      quantization: { name: 'MXFP4' },
      max_context_length: 131072,
      params_string: '20B',
      loaded_instances: loadedInstances,
    }],
  }
}

function defaultConfig(overrides: Partial<{
  chatMode: 'openai_compatible' | 'native_rest'
  preferredEndpoint: 'chat_completions' | 'responses'
  autoLoadBeforeSendEnabled: boolean
  autoUnloadAfterSendEnabled: boolean
}> = {}) {
  return {
    providerKey: 'lm_studio' as const,
    endpointUrl: 'http://127.0.0.1:1234',
    nativeRestControls: {
      diagnosticsEnabled: true,
      manualLoadUnloadEnabled: true,
      autoLoadBeforeSendEnabled: overrides.autoLoadBeforeSendEnabled === true,
      autoUnloadAfterSendEnabled: overrides.autoUnloadAfterSendEnabled === true,
      autoUnloadAfterIdleEnabled: false,
    },
    chatMode: overrides.chatMode ?? 'openai_compatible' as const,
    openAICompatible: {
      basePath: '/v1' as const,
      preferredEndpoint: overrides.preferredEndpoint ?? 'chat_completions' as const,
    },
    nativeRest: { basePath: '/api/v1' as const },
  }
}

function createSender() {
  return { send: vi.fn() }
}

function sentEvents(sender: ReturnType<typeof createSender>, requestId: string): LMStudioTextChatWireEvent[] {
  return sender.send.mock.calls
    .filter(([channel]) => channel === `lm-studio-chat:chunk:${requestId}`)
    .map(([, payload]) => payload as LMStudioTextChatWireEvent)
}

function registeredHandler(registerInvoke: ReturnType<typeof vi.fn>, channel: string) {
  return registerInvoke.mock.calls.find(([registeredChannel]) => registeredChannel === channel)?.[1] as any
}

describe('lmStudioLocalProviderIpc', () => {
  it('validates loopback endpoints and rejects remote hosts, credentials, and unsupported schemes', () => {
    expect(validateLMStudioEndpointUrl(undefined)).toMatchObject({
      ok: true,
      safeBaseUrl: 'http://127.0.0.1:1234',
    })
    expect(validateLMStudioEndpointUrl('http://localhost:4321')).toMatchObject({ ok: true })
    expect(validateLMStudioEndpointUrl('http://127.0.0.1:1234')).toMatchObject({ ok: true })
    expect(validateLMStudioEndpointUrl('http://[::1]:1234')).toMatchObject({ ok: true })

    expect(validateLMStudioEndpointUrl('http://192.168.1.12:1234')).toMatchObject({
      ok: false,
      code: 'remote_host_rejected',
    })
    expect(validateLMStudioEndpointUrl('https://api.example.test:1234')).toMatchObject({
      ok: false,
      code: 'remote_host_rejected',
    })
    expect(validateLMStudioEndpointUrl('file:///tmp/lmstudio.sock')).toMatchObject({
      ok: false,
      code: 'invalid_url',
    })
    const credentialResult = validateLMStudioEndpointUrl('http://user:pass@localhost:1234?token=sk-hidden')
    expect(credentialResult).toMatchObject({
      ok: false,
      code: 'embedded_credentials_rejected',
      safeUrl: 'http://localhost:1234',
    })
    expect(JSON.stringify(credentialResult)).not.toContain('user:pass')
    expect(JSON.stringify(credentialResult)).not.toContain('sk-hidden')
  })

  it('parses native REST model metadata with loaded and unloaded state', () => {
    expect(parseLMStudioNativeModelsResponse(nativeModels([{ id: 'openai/gpt-oss-20b/instance-1' }]))).toMatchObject({
      ok: true,
      source: 'lm_studio_api_v1_models',
      loadedCount: 1,
      unloadedCount: 0,
      modelIds: ['openai/gpt-oss-20b'],
      models: [expect.objectContaining({
        key: 'openai/gpt-oss-20b',
        displayName: 'GPT OSS 20B',
        loaded: true,
        loadedInstances: ['openai/gpt-oss-20b/instance-1'],
        quantization: 'MXFP4',
        maxContextLength: 131072,
      })],
    })

    expect(parseLMStudioNativeModelsResponse({ models: [{ display_name: 'missing key' }] })).toMatchObject({
      ok: false,
      code: 'invalid_response',
    })
  })

  it('probes native REST and OpenAI-compatible model lists without sending credentials or leaking raw errors', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(init?.method).toBe('GET')
      expect(init?.redirect).toBe('error')
      expect(init?.headers).toEqual({ Accept: 'application/json' })
      expect(JSON.stringify(init)).not.toContain('Authorization')
      expect(JSON.stringify(init)).not.toContain('Bearer')
      if (url.endsWith('/api/v1/models')) return jsonResponse(nativeModels([{ id: 'inst-1' }]))
      if (url.endsWith('/v1/models')) return jsonResponse({ data: [{ id: 'openai/gpt-oss-20b' }] })
      throw new Error('unexpected url')
    }) as unknown as typeof fetch

    const result = await probeLMStudioLocalProvider({
      endpointUrl: 'http://127.0.0.1:1234?token=sk-hidden',
      selectedModel: 'openai/gpt-oss-20b',
      timeoutMs: 750,
    }, { fetchImpl })

    expect(result).toMatchObject({
      ok: true,
      diagnostics: {
        safeBaseUrl: 'http://127.0.0.1:1234',
        nativeRestAvailable: true,
        openAICompatibleAvailable: true,
        selectedModelLoaded: true,
        selectedModelLoadedInstances: ['inst-1'],
      },
    })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(result)).not.toContain('sk-hidden')
  })

  it('reports unavailable probe sides safely without raw response bodies', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('Bearer sk-local-secret Authorization user:pass')
    }) as unknown as typeof fetch

    const result = await probeLMStudioLocalProvider({
      endpointUrl: 'http://localhost:1234',
      selectedModel: 'openai/gpt-oss-20b',
      timeoutMs: 750,
    }, { fetchImpl })

    expect(result).toMatchObject({
      ok: true,
      diagnostics: {
        nativeRestAvailable: false,
        openAICompatibleAvailable: false,
        nativeRest: { ok: false, code: 'network_error' },
        openAICompatible: { ok: false, code: 'network_error' },
      },
    })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('sk-local-secret')
    expect(serialized).not.toContain('Authorization')
    expect(serialized).not.toContain('user:pass')
  })

  it('sends OpenAI-compatible text plus image_url content only when the loaded model is vision-capable', async () => {
    const urls: string[] = []
    const bodies: unknown[] = []
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      urls.push(url)
      if (init?.body) bodies.push(JSON.parse(String(init.body)))
      if (url.endsWith('/api/v1/models')) {
        return jsonResponse({
          models: [{
            key: 'vision-model',
            display_name: 'Vision Model',
            type: 'llm',
            capabilities: { vision: true },
            loaded_instances: [{ id: 'vision-model/loaded' }],
          }],
        })
      }
      if (url.endsWith('/v1/chat/completions')) {
        return sseResponse('data: {"choices":[{"index":0,"delta":{"content":"OK"},"finish_reason":null}]}\n\ndata: [DONE]\n\n')
      }
      throw new Error(`unexpected url: ${url}`)
    }) as unknown as typeof fetch
    const registerInvoke = vi.fn()
    registerLMStudioLocalProviderIpc({ registerInvoke, fetchImpl })
    const startHandler = registeredHandler(registerInvoke, 'lm-studio-chat:stream-text')
    const sender = createSender()
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo='

    expect(startHandler({ sender }, {
      requestId: 'lm_studio_req_image',
      assistantMessageId: 'assistant_1',
      config: defaultConfig(),
      model: 'vision-model',
      messages: [{ role: 'user', content: [
        { type: 'text', text: 'Describe it.' },
        { type: 'image_url', image_url: { url: dataUrl } },
      ] }],
      timeoutMs: 750,
    })).toEqual({ ok: true })

    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledWith('lm-studio-chat:end:lm_studio_req_image'))
    expect(urls).toEqual([
      'http://127.0.0.1:1234/api/v1/models',
      'http://127.0.0.1:1234/v1/chat/completions',
    ])
    expect(bodies[0]).toEqual({
      model: 'vision-model',
      messages: [{ role: 'user', content: [
        { type: 'text', text: 'Describe it.' },
        { type: 'image_url', image_url: { url: dataUrl } },
      ] }],
      stream: true,
    })
    expect(JSON.stringify(bodies)).not.toContain('originalPath')
    expect(JSON.stringify(bodies)).not.toContain('storagePath')
    expect(JSON.stringify(bodies)).not.toContain('blobId')
  })

  it('blocks LM Studio image input when the selected model vision capability is unknown', async () => {
    const urls: string[] = []
    const fetchImpl = vi.fn(async (url: string) => {
      urls.push(url)
      if (url.endsWith('/api/v1/models')) return jsonResponse(nativeModels([{ id: 'openai/gpt-oss-20b/loaded' }]))
      throw new Error(`unexpected url: ${url}`)
    }) as unknown as typeof fetch
    const registerInvoke = vi.fn()
    registerLMStudioLocalProviderIpc({ registerInvoke, fetchImpl })
    const startHandler = registeredHandler(registerInvoke, 'lm-studio-chat:stream-text')
    const sender = createSender()

    expect(startHandler({ sender }, {
      requestId: 'lm_studio_req_image_unknown',
      assistantMessageId: 'assistant_1',
      config: defaultConfig(),
      model: 'openai/gpt-oss-20b',
      messages: [{ role: 'user', content: [
        { type: 'text', text: 'Describe it.' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' } },
      ] }],
      timeoutMs: 750,
    })).toEqual({ ok: true })

    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledWith('lm-studio-chat:end:lm_studio_req_image_unknown'))
    expect(urls).toEqual(['http://127.0.0.1:1234/api/v1/models'])
    const events = sentEvents(sender, 'lm_studio_req_image_unknown')
    expect(events.some((event) =>
      event.type === 'error' &&
      event.error.code === 'unsupported_image_input'
    )).toBe(true)
  })

  it('runs manual load and unload only through native REST control-plane endpoints', async () => {
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
      if (url.endsWith('/api/v1/models/load')) return jsonResponse({ instance_id: 'inst-load', status: 'loaded', type: 'llm' })
      if (url.endsWith('/api/v1/models/unload')) return jsonResponse({ instance_id: 'inst-load' })
      throw new Error('unexpected url')
    }) as unknown as typeof fetch

    const registerInvoke = vi.fn()
    registerLMStudioLocalProviderIpc({ registerInvoke, fetchImpl })
    const loadHandler = registeredHandler(registerInvoke, 'lm-studio:load-model')
    const unloadHandler = registeredHandler(registerInvoke, 'lm-studio:unload-model')

    await expect(loadHandler({}, {
      endpointUrl: 'http://localhost:1234',
      model: 'openai/gpt-oss-20b',
      manualLoadUnloadEnabled: true,
      timeoutMs: 750,
    })).resolves.toMatchObject({ ok: true, operation: 'load', instanceId: 'inst-load' })

    await expect(unloadHandler({}, {
      endpointUrl: 'http://localhost:1234',
      instanceId: 'inst-load',
      manualLoadUnloadEnabled: true,
      timeoutMs: 750,
    })).resolves.toMatchObject({ ok: true, operation: 'unload', instanceId: 'inst-load' })

    expect(bodies).toEqual([
      { model: 'openai/gpt-oss-20b', echo_load_config: true },
      { instance_id: 'inst-load' },
    ])
    expect(urls).toEqual([
      'http://localhost:1234/api/v1/models/load',
      'http://localhost:1234/api/v1/models/unload',
    ])
    expect(urls.join('\n')).not.toContain('download')
  })

  it('blocks manual load and unload when the native REST controls are disabled', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const registerInvoke = vi.fn()
    registerLMStudioLocalProviderIpc({ registerInvoke, fetchImpl })
    const loadHandler = registeredHandler(registerInvoke, 'lm-studio:load-model')
    const unloadHandler = registeredHandler(registerInvoke, 'lm-studio:unload-model')

    await expect(loadHandler({}, {
      endpointUrl: 'http://localhost:1234',
      model: 'openai/gpt-oss-20b',
      manualLoadUnloadEnabled: false,
    })).resolves.toMatchObject({ ok: false, code: 'controls_disabled' })
    await expect(unloadHandler({}, {
      endpointUrl: 'http://localhost:1234',
      instanceId: 'inst-load',
      manualLoadUnloadEnabled: false,
    })).resolves.toMatchObject({ ok: false, code: 'controls_disabled' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('blocks chat before send when selected model is known unloaded and auto-load is disabled', async () => {
    const urls: string[] = []
    const fetchImpl = vi.fn(async (url: string) => {
      urls.push(url)
      expect(url).toBe('http://127.0.0.1:1234/api/v1/models')
      return jsonResponse(nativeModels([]))
    }) as unknown as typeof fetch
    const registerInvoke = vi.fn()
    registerLMStudioLocalProviderIpc({ registerInvoke, fetchImpl })
    const startHandler = registeredHandler(registerInvoke, 'lm-studio-chat:stream-text')
    const sender = createSender()

    const start = await startHandler({ sender }, {
      requestId: 'lm_studio_req_unloaded',
      assistantMessageId: 'assistant_1',
      config: defaultConfig({ autoLoadBeforeSendEnabled: false }),
      model: 'openai/gpt-oss-20b',
      messages: [{ role: 'user', content: 'hello' }],
      timeoutMs: 750,
    })

    expect(start).toEqual({ ok: true })
    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledWith('lm-studio-chat:end:lm_studio_req_unloaded'))
    const events = sentEvents(sender, 'lm_studio_req_unloaded')
    expect(events.some((event) => event.type === 'error' && event.error.code === 'model_not_loaded')).toBe(true)
    expect(urls).toEqual(['http://127.0.0.1:1234/api/v1/models'])
  })

  it('auto-loads before OpenAI-compatible chat and unloads only after a normal send completes', async () => {
    const urls: string[] = []
    const bodies: unknown[] = []
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      urls.push(url)
      if (init?.body) bodies.push(JSON.parse(String(init.body)))
      expect(JSON.stringify(init)).not.toContain('Authorization')
      expect(JSON.stringify(init)).not.toContain('Bearer')
      if (url.endsWith('/api/v1/models')) return jsonResponse(nativeModels([]))
      if (url.endsWith('/api/v1/models/load')) return jsonResponse({ instance_id: 'inst-auto', status: 'loaded', type: 'llm' })
      if (url.endsWith('/v1/chat/completions')) {
        return sseResponse('data: {"choices":[{"index":0,"delta":{"content":"OK"},"finish_reason":null}]}\n\ndata: [DONE]\n\n')
      }
      if (url.endsWith('/api/v1/models/unload')) return jsonResponse({ instance_id: 'inst-auto' })
      throw new Error(`unexpected url: ${url}`)
    }) as unknown as typeof fetch
    const registerInvoke = vi.fn()
    registerLMStudioLocalProviderIpc({ registerInvoke, fetchImpl })
    const startHandler = registeredHandler(registerInvoke, 'lm-studio-chat:stream-text')
    const sender = createSender()

    expect(startHandler({ sender }, {
      requestId: 'lm_studio_req_auto',
      assistantMessageId: 'assistant_1',
      config: defaultConfig({
        autoLoadBeforeSendEnabled: true,
        autoUnloadAfterSendEnabled: true,
      }),
      model: 'openai/gpt-oss-20b',
      messages: [{ role: 'user', content: 'please say OK' }],
      timeoutMs: 750,
    })).toEqual({ ok: true })

    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledWith('lm-studio-chat:end:lm_studio_req_auto'))
    expect(urls).toEqual([
      'http://127.0.0.1:1234/api/v1/models',
      'http://127.0.0.1:1234/api/v1/models/load',
      'http://127.0.0.1:1234/v1/chat/completions',
      'http://127.0.0.1:1234/api/v1/models/unload',
    ])
    expect(bodies).toEqual([
      { model: 'openai/gpt-oss-20b', echo_load_config: true },
      { model: 'openai/gpt-oss-20b', messages: [{ role: 'user', content: 'please say OK' }], stream: true },
      { instance_id: 'inst-auto' },
    ])
    const events = sentEvents(sender, 'lm_studio_req_auto')
    expect(events[0]).toMatchObject({ type: 'responseMeta', status: 200, provider: 'lm_studio' })
    expect(events.some((event) => event.type === 'chunk' && event.data.includes('OK'))).toBe(true)
  })

  it('auto-loads before native REST chat and unloads only after a normal native send completes', async () => {
    const urls: string[] = []
    const bodies: unknown[] = []
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      urls.push(url)
      if (init?.body) bodies.push(JSON.parse(String(init.body)))
      expect(JSON.stringify(init)).not.toContain('Authorization')
      expect(JSON.stringify(init)).not.toContain('Bearer')
      if (url.endsWith('/api/v1/models')) return jsonResponse(nativeModels([]))
      if (url.endsWith('/api/v1/models/load')) return jsonResponse({ instance_id: 'inst-native-auto', status: 'loaded', type: 'llm' })
      if (url.endsWith('/api/v1/chat')) {
        return sseResponse([
          'event: message.delta',
          'data: {"content":"OK"}',
          '',
          'event: chat.end',
          'data: {}',
          '',
          '',
        ].join('\n'))
      }
      if (url.endsWith('/api/v1/models/unload')) return jsonResponse({ instance_id: 'inst-native-auto' })
      throw new Error(`unexpected url: ${url}`)
    }) as unknown as typeof fetch
    const registerInvoke = vi.fn()
    registerLMStudioLocalProviderIpc({ registerInvoke, fetchImpl })
    const startHandler = registeredHandler(registerInvoke, 'lm-studio-chat:stream-text')
    const sender = createSender()

    expect(startHandler({ sender }, {
      requestId: 'lm_studio_req_native_auto',
      assistantMessageId: 'assistant_1',
      config: defaultConfig({
        chatMode: 'native_rest',
        autoLoadBeforeSendEnabled: true,
        autoUnloadAfterSendEnabled: true,
      }),
      model: 'openai/gpt-oss-20b',
      messages: [{ role: 'user', content: 'please say OK' }],
      timeoutMs: 750,
    })).toEqual({ ok: true })

    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledWith('lm-studio-chat:end:lm_studio_req_native_auto'))
    expect(urls).toEqual([
      'http://127.0.0.1:1234/api/v1/models',
      'http://127.0.0.1:1234/api/v1/models/load',
      'http://127.0.0.1:1234/api/v1/chat',
      'http://127.0.0.1:1234/api/v1/models/unload',
    ])
    expect(bodies).toEqual([
      { model: 'openai/gpt-oss-20b', echo_load_config: true },
      { model: 'openai/gpt-oss-20b', input: 'please say OK', stream: true, store: false },
      { instance_id: 'inst-native-auto' },
    ])
    const chunks = sentEvents(sender, 'lm_studio_req_native_auto')
      .filter((event) => event.type === 'chunk')
      .map((event) => event.data)
      .join('')
    expect(chunks).toContain('OK')
    expect(chunks).toContain('[DONE]')
  })

  it('supports the OpenAI-compatible Responses endpoint as an explicit mode option', async () => {
    const urls: string[] = []
    const bodies: unknown[] = []
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      urls.push(url)
      if (init?.body) bodies.push(JSON.parse(String(init.body)))
      if (url.endsWith('/api/v1/models')) return jsonResponse(nativeModels([{ id: 'inst-loaded' }]))
      if (url.endsWith('/v1/responses')) {
        return sseResponse('event: response.output_text.delta\ndata: {"delta":"OK"}\n\nevent: response.completed\ndata: {}\n\n')
      }
      throw new Error(`unexpected url: ${url}`)
    }) as unknown as typeof fetch
    const registerInvoke = vi.fn()
    registerLMStudioLocalProviderIpc({ registerInvoke, fetchImpl })
    const startHandler = registeredHandler(registerInvoke, 'lm-studio-chat:stream-text')
    const sender = createSender()

    expect(startHandler({ sender }, {
      requestId: 'lm_studio_req_responses',
      assistantMessageId: 'assistant_1',
      config: defaultConfig({ preferredEndpoint: 'responses' }),
      model: 'openai/gpt-oss-20b',
      messages: [{ role: 'user', content: 'please say OK' }],
      timeoutMs: 750,
    })).toEqual({ ok: true })

    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledWith('lm-studio-chat:end:lm_studio_req_responses'))
    expect(urls).toEqual([
      'http://127.0.0.1:1234/api/v1/models',
      'http://127.0.0.1:1234/v1/responses',
    ])
    expect(bodies).toEqual([{
      model: 'openai/gpt-oss-20b',
      input: [{ role: 'user', content: 'please say OK', type: 'message' }],
      stream: true,
    }])
  })

  it('maps native REST chat events to visible text deltas without surfacing metadata', async () => {
    const urls: string[] = []
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      urls.push(url)
      if (url.endsWith('/api/v1/models')) return jsonResponse(nativeModels([{ id: 'inst-loaded' }]))
      expect(url).toBe('http://127.0.0.1:1234/api/v1/chat')
      const body = JSON.parse(String(init?.body ?? '{}'))
      expect(body).toEqual({
        model: 'openai/gpt-oss-20b',
        input: 'please say OK',
        stream: true,
        store: false,
      })
      return sseResponse([
        'event: chat.start',
        'data: {"conversation_id":"hidden-meta"}',
        '',
        'event: message.delta',
        'data: {"content":"O"}',
        '',
        'event: message.delta',
        'data: {"content":"K"}',
        '',
        'event: chat.end',
        'data: {"stats":{"tokens":2}}',
        '',
        '',
      ].join('\n'))
    }) as unknown as typeof fetch
    const registerInvoke = vi.fn()
    registerLMStudioLocalProviderIpc({ registerInvoke, fetchImpl })
    const startHandler = registeredHandler(registerInvoke, 'lm-studio-chat:stream-text')
    const sender = createSender()

    expect(startHandler({ sender }, {
      requestId: 'lm_studio_req_native',
      assistantMessageId: 'assistant_1',
      config: defaultConfig({ chatMode: 'native_rest' }),
      model: 'openai/gpt-oss-20b',
      messages: [{ role: 'user', content: 'please say OK' }],
      timeoutMs: 750,
    })).toEqual({ ok: true })

    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledWith('lm-studio-chat:end:lm_studio_req_native'))
    expect(urls).toEqual([
      'http://127.0.0.1:1234/api/v1/models',
      'http://127.0.0.1:1234/api/v1/chat',
    ])
    const events = sentEvents(sender, 'lm_studio_req_native')
    const chunks = events
      .filter((event) => event.type === 'chunk')
      .map((event) => event.data)
      .join('')
    expect(chunks).toContain('"content":"O"')
    expect(chunks).toContain('"content":"K"')
    expect(chunks).toContain('[DONE]')
    const serialized = JSON.stringify(events)
    expect(serialized).not.toContain('hidden-meta')
  })

  it('aborts a text chat by timeout and does not unload while the stream is still active', async () => {
    const fetchImpl = vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith('/api/v1/models')) return Promise.resolve(jsonResponse(nativeModels([{ id: 'inst-loaded' }])))
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
    registerLMStudioLocalProviderIpc({ registerInvoke, fetchImpl })
    const startHandler = registeredHandler(registerInvoke, 'lm-studio-chat:stream-text')
    const sender = createSender()

    expect(startHandler({ sender }, {
      requestId: 'lm_studio_req_timeout',
      assistantMessageId: 'assistant_1',
      config: defaultConfig({ autoUnloadAfterSendEnabled: true }),
      model: 'openai/gpt-oss-20b',
      messages: [{ role: 'user', content: 'hello' }],
      timeoutMs: 1000,
    })).toEqual({ ok: true })

    await vi.waitFor(
      () => expect(sender.send).toHaveBeenCalledWith('lm-studio-chat:end:lm_studio_req_timeout'),
      { timeout: 2500 },
    )
    const events = sentEvents(sender, 'lm_studio_req_timeout')
    expect(events.some((event) =>
      event.type === 'error' &&
      event.error.kind === 'transport_error' &&
      event.error.code === 'timeout'
    )).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('normalizes text chat payloads by keeping the latest messages and truncating oversized content', () => {
    const messages = Array.from({ length: 90 }, (_unused, index) => ({
      role: index % 2 === 0 ? 'assistant' as const : 'user' as const,
      content: index === 89 ? 'x'.repeat(20050) : `msg-${index}`,
    }))

    const result = validateLMStudioTextChatPayload({
      requestId: 'lm_studio_req_truncate',
      assistantMessageId: 'assistant_1',
      config: defaultConfig(),
      model: 'openai/gpt-oss-20b',
      messages,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected valid LM Studio payload')
    expect(result.messages).toHaveLength(80)
    expect(result.messages[0]).toEqual({ role: 'assistant', content: 'msg-10' })
    expect(result.messages[result.messages.length - 1]).toEqual({ role: 'user', content: 'x'.repeat(20000) })
  })

  it('rejects non-text chat payloads before fetch and aborts through the explicit channel', async () => {
    const fetchImpl = vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith('/api/v1/models')) return Promise.resolve(jsonResponse(nativeModels([{ id: 'inst-loaded' }])))
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal as AbortSignal
        if (signal.aborted) {
          reject(new DOMException('Aborted', 'AbortError'))
          return
        }
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      })
    }) as unknown as typeof fetch
    const registerInvoke = vi.fn()
    registerLMStudioLocalProviderIpc({ registerInvoke, fetchImpl })
    const startHandler = registeredHandler(registerInvoke, 'lm-studio-chat:stream-text')
    const abortHandler = registeredHandler(registerInvoke, 'lm-studio-chat:abort')
    const sender = createSender()

    expect(startHandler({ sender }, {
      requestId: 'lm_studio_req_bad',
      assistantMessageId: 'assistant_1',
      config: defaultConfig(),
      model: 'openai/gpt-oss-20b',
      messages: [{ role: 'system', content: 'not allowed' }],
    })).toMatchObject({ ok: false, code: 'invalid_payload' })
    expect(fetchImpl).not.toHaveBeenCalled()

    expect(startHandler({ sender }, {
      requestId: 'lm_studio_req_abort',
      assistantMessageId: 'assistant_1',
      config: defaultConfig(),
      model: 'openai/gpt-oss-20b',
      messages: [{ role: 'user', content: 'hello' }],
      timeoutMs: 10000,
    })).toEqual({ ok: true })
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2))
    await abortHandler({}, 'lm_studio_req_abort')

    await vi.waitFor(() => expect(sender.send).toHaveBeenCalledWith('lm-studio-chat:end:lm_studio_req_abort'))
    const events = sentEvents(sender, 'lm_studio_req_abort')
    expect(events.some((event) => event.type === 'error' && event.error.kind === 'aborted')).toBe(true)
  })
})
