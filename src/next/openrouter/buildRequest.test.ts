import { describe, expect, it } from 'vitest'
import { buildOpenRouterChatCompletionsRequest } from './buildRequest'

describe('buildOpenRouterChatCompletionsRequest', () => {
  const base = {
    model: 'openrouter/auto',
    messages: [{ role: 'user', content: 'hi' }],
  } as const

  it('requires boolean stream', () => {
    expect(() =>
      buildOpenRouterChatCompletionsRequest({
        ...base,
        // @ts-expect-error intentional
        stream: 'true',
      })
    ).toThrow(/stream must be boolean/)
  })

  it('omits reasoning when not provided', () => {
    const req = buildOpenRouterChatCompletionsRequest({
      ...base,
      stream: true,
    })
    expect('reasoning' in req).toBe(false)
  })

  it('supports reasoning effort', () => {
    const req = buildOpenRouterChatCompletionsRequest({
      ...base,
      stream: true,
      reasoning: { effort: 'high' },
    })
    expect(req.reasoning).toEqual({ effort: 'high' })
  })

  it('defines "disable reasoning" as effort="none" and rejects max_tokens with it', () => {
    const req = buildOpenRouterChatCompletionsRequest({
      ...base,
      stream: true,
      reasoning: { effort: 'none' },
    })
    expect(req.reasoning).toEqual({ effort: 'none' })

    const reqExclude = buildOpenRouterChatCompletionsRequest({
      ...base,
      stream: true,
      reasoning: { effort: 'none', exclude: true },
    })
    expect(reqExclude.reasoning).toEqual({ effort: 'none' })

    expect(() =>
      buildOpenRouterChatCompletionsRequest({
        ...base,
        stream: true,
        reasoning: { effort: 'none', max_tokens: 10 },
      })
    ).toThrow(/exactly one of effort\/max_tokens/)
  })

  it('supports reasoning max_tokens', () => {
    const req = buildOpenRouterChatCompletionsRequest({
      ...base,
      stream: true,
      reasoning: { max_tokens: 128 },
    })
    expect(req.reasoning).toEqual({ max_tokens: 128 })
  })

  it('supports provider.require_parameters routing param (snake_case in body)', () => {
    const reqTrue = buildOpenRouterChatCompletionsRequest({
      ...base,
      stream: true,
      providerRequireParameters: true,
    })
    expect(reqTrue).toHaveProperty('provider.require_parameters', true)

    const reqFalse = buildOpenRouterChatCompletionsRequest({
      ...base,
      stream: true,
      providerRequireParameters: false,
    })
    expect(reqFalse).toHaveProperty('provider.require_parameters', false)
  })

  it('enforces reasoning control mode mutual exclusivity', () => {
    expect(() =>
      buildOpenRouterChatCompletionsRequest({
        ...base,
        stream: true,
        reasoning: { effort: 'high', max_tokens: 100 },
      })
    ).toThrow(/exactly one of effort\/max_tokens/)
  })

  it('passes through reasoning.exclude when present', () => {
    const req = buildOpenRouterChatCompletionsRequest({
      ...base,
      stream: true,
      reasoning: { effort: 'low', exclude: true },
    })
    expect(req.reasoning).toEqual({ effort: 'low', exclude: true })
  })

  it('requires max_tokens to be a positive integer', () => {
    expect(() =>
      buildOpenRouterChatCompletionsRequest({
        ...base,
        stream: true,
        reasoning: { max_tokens: 0 },
      })
    ).toThrow(/reasoning\.max_tokens must be a positive integer/)
  })

  it('injects validated sampling parameters at top-level and omits unspecified keys', () => {
    const req = buildOpenRouterChatCompletionsRequest({
      ...base,
      stream: true,
      samplingParams: {
        temperature: 0.7,
        top_p: 0.95,
        top_k: 20.4,
        seed: 42.2,
        max_tokens: 1024,
      },
    })

    expect(req).toMatchObject({
      temperature: 0.7,
      top_p: 0.95,
      top_k: 20,
      seed: 42,
      max_tokens: 1024,
    })
    expect(req).not.toHaveProperty('frequency_penalty')
    expect(req).not.toHaveProperty('presence_penalty')
  })

  it('rejects invalid sampling parameters', () => {
    expect(() =>
      buildOpenRouterChatCompletionsRequest({
        ...base,
        stream: true,
        samplingParams: {
          temperature: 99,
        },
      })
    ).toThrow(/samplingParams\.temperature is invalid/)
  })

  it('snapshot matrix: stream/reasoning (offline, reproducible)', () => {
    const reasoningCases: Array<[string, any | undefined]> = [
      ['none', undefined],
      ['disabled', { effort: 'none' }],
      ['effort_high', { effort: 'high' }],
      ['effort_high_exclude', { effort: 'high', exclude: true }],
      ['max_tokens_128', { max_tokens: 128 }],
    ]

    const snapshots: Record<string, unknown> = {}
    for (const stream of [true, false]) {
      for (const [label, reasoning] of reasoningCases) {
        const key = `stream=${stream};reasoning=${label}`
        const req = buildOpenRouterChatCompletionsRequest({
          ...base,
          stream,
          ...(reasoning ? { reasoning } : {}),
        })
        snapshots[key] = req
      }
    }

    const sorted = Object.fromEntries(Object.entries(snapshots).sort(([a], [b]) => a.localeCompare(b)))

    expect(sorted).toMatchInlineSnapshot(`
      {
        "stream=false;reasoning=disabled": {
          "messages": [
            {
              "content": "hi",
              "role": "user",
            },
          ],
          "model": "openrouter/auto",
          "reasoning": {
            "effort": "none",
          },
          "stream": false,
        },
        "stream=false;reasoning=effort_high": {
          "messages": [
            {
              "content": "hi",
              "role": "user",
            },
          ],
          "model": "openrouter/auto",
          "reasoning": {
            "effort": "high",
          },
          "stream": false,
        },
        "stream=false;reasoning=effort_high_exclude": {
          "messages": [
            {
              "content": "hi",
              "role": "user",
            },
          ],
          "model": "openrouter/auto",
          "reasoning": {
            "effort": "high",
            "exclude": true,
          },
          "stream": false,
        },
        "stream=false;reasoning=max_tokens_128": {
          "messages": [
            {
              "content": "hi",
              "role": "user",
            },
          ],
          "model": "openrouter/auto",
          "reasoning": {
            "max_tokens": 128,
          },
          "stream": false,
        },
        "stream=false;reasoning=none": {
          "messages": [
            {
              "content": "hi",
              "role": "user",
            },
          ],
          "model": "openrouter/auto",
          "stream": false,
        },
        "stream=true;reasoning=disabled": {
          "messages": [
            {
              "content": "hi",
              "role": "user",
            },
          ],
          "model": "openrouter/auto",
          "reasoning": {
            "effort": "none",
          },
          "stream": true,
        },
        "stream=true;reasoning=effort_high": {
          "messages": [
            {
              "content": "hi",
              "role": "user",
            },
          ],
          "model": "openrouter/auto",
          "reasoning": {
            "effort": "high",
          },
          "stream": true,
        },
        "stream=true;reasoning=effort_high_exclude": {
          "messages": [
            {
              "content": "hi",
              "role": "user",
            },
          ],
          "model": "openrouter/auto",
          "reasoning": {
            "effort": "high",
            "exclude": true,
          },
          "stream": true,
        },
        "stream=true;reasoning=max_tokens_128": {
          "messages": [
            {
              "content": "hi",
              "role": "user",
            },
          ],
          "model": "openrouter/auto",
          "reasoning": {
            "max_tokens": 128,
          },
          "stream": true,
        },
        "stream=true;reasoning=none": {
          "messages": [
            {
              "content": "hi",
              "role": "user",
            },
          ],
          "model": "openrouter/auto",
          "stream": true,
        },
      }
    `)
  })

  it('enforces a minimal allowlist of top-level keys (prevents internal-field leakage)', () => {
    const req = buildOpenRouterChatCompletionsRequest({
      ...base,
      stream: true,
      reasoning: { effort: 'high', exclude: true },
      tools: [],
      providerRequireParameters: true,
    })

    const allowedTopLevel = new Set([
      'model',
      'messages',
      'stream',
      'reasoning',
      'tools',
      'provider',
      'modalities',
      'image_config',
      'debug',
      'plugins',
      'web_search_options',
      'temperature',
      'top_p',
      'top_k',
      'min_p',
      'top_a',
      'frequency_penalty',
      'presence_penalty',
      'repetition_penalty',
      'seed',
      'max_tokens',
    ])
    for (const key of Object.keys(req)) {
      expect(allowedTopLevel.has(key)).toBe(true)
    }

    expect(req).not.toHaveProperty('include_reasoning')
    expect(req).not.toHaveProperty('streamOptions')
    expect(req).not.toHaveProperty('legacyReasoning')
    expect(req).not.toHaveProperty('legacyParameters')
  })

  it('supports multimodal message content blocks (text before image)', () => {
    const multimodalMessages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'describe this image' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
        ],
      },
    ]

    const req = buildOpenRouterChatCompletionsRequest({
      model: 'openrouter/auto',
      messages: multimodalMessages,
      stream: true,
      reasoning: { effort: 'high', exclude: true },
    })

    expect(req.messages).toEqual(multimodalMessages)
  })

  it('supports image generation request fields: modalities + image_config (+ passthrough)', () => {
    const req = buildOpenRouterChatCompletionsRequest({
      ...base,
      stream: true,
      modalities: ['image', 'text'],
      imageConfig: {
        aspect_ratio: '16:9',
        image_size: '1024x1024',
        quality: 'high',
      },
    })

    expect(req.modalities).toEqual(['image', 'text'])
    expect(req.image_config).toEqual({
      aspect_ratio: '16:9',
      image_size: '1024x1024',
      quality: 'high',
    })
  })

  it('normalizes and deduplicates modalities', () => {
    const req = buildOpenRouterChatCompletionsRequest({
      ...base,
      stream: true,
      modalities: ['image', 'text', 'image'],
    })
    expect(req.modalities).toEqual(['image', 'text'])
  })

  it('rejects invalid modalities and invalid image_config shape', () => {
    expect(() =>
      buildOpenRouterChatCompletionsRequest({
        ...base,
        stream: true,
        modalities: ['audio' as any],
      })
    ).toThrow(/modalities supports only text\/image/)

    expect(() =>
      buildOpenRouterChatCompletionsRequest({
        ...base,
        stream: true,
        imageConfig: [] as any,
      })
    ).toThrow(/imageConfig must be an object/)

    expect(() =>
      buildOpenRouterChatCompletionsRequest({
        ...base,
        stream: true,
        imageConfig: { aspect_ratio: '   ' },
      })
    ).toThrow(/imageConfig\.aspect_ratio must be a non-empty string/)
  })

  it('injects web plugin enable payload and omits engine when auto/default', () => {
    const req = buildOpenRouterChatCompletionsRequest({
      ...base,
      stream: true,
      webSearchPatch: {
        plugins: [{ id: 'web', enabled: true, max_results: 5 }],
        web_search_options: { search_context_size: 'medium' },
      },
    })
    expect(req.plugins).toEqual([{ id: 'web', enabled: true, max_results: 5 }])
    expect(req).not.toHaveProperty('web_search_options')
  })

  it('injects native engine + context size when policy allows native_only', () => {
    const req = buildOpenRouterChatCompletionsRequest({
      ...base,
      stream: true,
      webSearchPatch: {
        plugins: [{ id: 'web', enabled: true, engine: 'native', max_results: 8 }],
        web_search_options: { search_context_size: 'high' },
      },
    })
    expect(req.plugins).toEqual([{ id: 'web', enabled: true, engine: 'native', max_results: 8 }])
    expect(req.web_search_options).toEqual({ search_context_size: 'high' })
  })

  it('supports explicit disable payload for reliable override', () => {
    const req = buildOpenRouterChatCompletionsRequest({
      ...base,
      stream: true,
      webSearchPatch: {
        plugins: [{ id: 'web', enabled: false }],
      },
    })
    expect(req.plugins).toEqual([{ id: 'web', enabled: false }])
    expect(req).not.toHaveProperty('web_search_options')
  })

  it('can force context_size injection on non-native engines via always policy', () => {
    const req = buildOpenRouterChatCompletionsRequest({
      ...base,
      stream: true,
      webSearchPatch: {
        plugins: [{ id: 'web', enabled: true, engine: 'exa', max_results: 5 }],
        web_search_options: { search_context_size: 'medium' },
      },
      webSearchContextPolicy: 'always',
    })
    expect(req.web_search_options).toEqual({ search_context_size: 'medium' })
  })

  it('rejects invalid web plugin engine', () => {
    expect(() =>
      buildOpenRouterChatCompletionsRequest({
        ...base,
        stream: true,
        webSearchPatch: {
          plugins: [{ id: 'web', enabled: true, engine: 'bad' as any }],
        },
      })
    ).toThrow(/plugins\[\]\.engine is invalid/)
  })

  it('supports debug.echo_upstream_body in stream mode only', () => {
    const streamReq = buildOpenRouterChatCompletionsRequest({
      ...base,
      stream: true,
      debug: { echoUpstreamBody: true },
    })
    expect(streamReq.debug).toEqual({ echo_upstream_body: true })

    const nonStreamReq = buildOpenRouterChatCompletionsRequest({
      ...base,
      stream: false,
      debug: { echoUpstreamBody: true },
    })
    expect('debug' in nonStreamReq).toBe(false)
  })

  it('validates debug.echoUpstreamBody type', () => {
    expect(() =>
      buildOpenRouterChatCompletionsRequest({
        ...base,
        stream: true,
        debug: {
          // @ts-expect-error test invalid type
          echoUpstreamBody: 'yes',
        },
      })
    ).toThrow(/debug\.echoUpstreamBody must be boolean/)
  })
})
