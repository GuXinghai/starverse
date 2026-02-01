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

    const allowedTopLevel = new Set(['model', 'messages', 'stream', 'reasoning', 'tools', 'provider'])
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
})
