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

  it('defaults usage.include to true', () => {
    const req = buildOpenRouterChatCompletionsRequest({
      ...base,
      stream: true,
    })
    expect(req.usage).toEqual({ include: true })
  })

  it('allows usage.include to be disabled explicitly', () => {
    const req = buildOpenRouterChatCompletionsRequest({
      ...base,
      stream: false,
      usage: { include: false },
    })
    expect(req.stream).toBe(false)
    expect(req.usage).toEqual({ include: false })
  })

  it('omits reasoning when not provided', () => {
    const req = buildOpenRouterChatCompletionsRequest({
      ...base,
      stream: true,
    })
    expect('reasoning' in req).toBe(false)
  })

  it('supports reasoning enabled', () => {
    const req = buildOpenRouterChatCompletionsRequest({
      ...base,
      stream: true,
      reasoning: { enabled: true },
    })
    expect(req.reasoning).toEqual({ enabled: true })
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

    expect(() =>
      buildOpenRouterChatCompletionsRequest({
        ...base,
        stream: true,
        // @ts-expect-error intentional invalid combination
        reasoning: { effort: 'none', max_tokens: 10 },
      })
    ).toThrow(/exactly one of enabled\/effort\/max_tokens/)
  })

  it('supports reasoning max_tokens', () => {
    const req = buildOpenRouterChatCompletionsRequest({
      ...base,
      stream: true,
      reasoning: { max_tokens: 128 },
    })
    expect(req.reasoning).toEqual({ max_tokens: 128 })
  })

  it('enforces reasoning control mode mutual exclusivity', () => {
    expect(() =>
      buildOpenRouterChatCompletionsRequest({
        ...base,
        stream: true,
        // @ts-expect-error invalid: effort + max_tokens
        reasoning: { effort: 'high', max_tokens: 100 },
      })
    ).toThrow(/exactly one of enabled\/effort\/max_tokens/)
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
        // @ts-expect-error invalid value
        reasoning: { max_tokens: 0 },
      })
    ).toThrow(/reasoning\.max_tokens must be a positive integer/)
  })

  it('snapshot matrix: stream/usage/reasoning (offline, reproducible)', () => {
    const reasoningCases: Array<[string, any | undefined]> = [
      ['none', undefined],
      ['disabled', { effort: 'none' }],
      ['enabled', { enabled: true }],
      ['effort_high', { effort: 'high' }],
      ['effort_high_exclude', { effort: 'high', exclude: true }],
      ['max_tokens_128', { max_tokens: 128 }],
    ]

    const snapshots: Record<string, unknown> = {}
    for (const stream of [true, false]) {
      for (const usageInclude of [true, false]) {
        for (const [label, reasoning] of reasoningCases) {
          const key = `stream=${stream};usage=${usageInclude};reasoning=${label}`
          const req = buildOpenRouterChatCompletionsRequest({
            ...base,
            stream,
            usage: { include: usageInclude },
            ...(reasoning ? { reasoning } : {}),
          })
          snapshots[key] = req
        }
      }
    }

    const sorted = Object.fromEntries(Object.entries(snapshots).sort(([a], [b]) => a.localeCompare(b)))

    expect(sorted).toMatchInlineSnapshot(`
      {
        "stream=false;usage=false;reasoning=disabled": {
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
          "usage": {
            "include": false,
          },
        },
        "stream=false;usage=false;reasoning=effort_high": {
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
          "usage": {
            "include": false,
          },
        },
        "stream=false;usage=false;reasoning=effort_high_exclude": {
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
          "usage": {
            "include": false,
          },
        },
        "stream=false;usage=false;reasoning=enabled": {
          "messages": [
            {
              "content": "hi",
              "role": "user",
            },
          ],
          "model": "openrouter/auto",
          "reasoning": {
            "enabled": true,
          },
          "stream": false,
          "usage": {
            "include": false,
          },
        },
        "stream=false;usage=false;reasoning=max_tokens_128": {
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
          "usage": {
            "include": false,
          },
        },
        "stream=false;usage=false;reasoning=none": {
          "messages": [
            {
              "content": "hi",
              "role": "user",
            },
          ],
          "model": "openrouter/auto",
          "stream": false,
          "usage": {
            "include": false,
          },
        },
        "stream=false;usage=true;reasoning=disabled": {
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
          "usage": {
            "include": true,
          },
        },
        "stream=false;usage=true;reasoning=effort_high": {
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
          "usage": {
            "include": true,
          },
        },
        "stream=false;usage=true;reasoning=effort_high_exclude": {
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
          "usage": {
            "include": true,
          },
        },
        "stream=false;usage=true;reasoning=enabled": {
          "messages": [
            {
              "content": "hi",
              "role": "user",
            },
          ],
          "model": "openrouter/auto",
          "reasoning": {
            "enabled": true,
          },
          "stream": false,
          "usage": {
            "include": true,
          },
        },
        "stream=false;usage=true;reasoning=max_tokens_128": {
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
          "usage": {
            "include": true,
          },
        },
        "stream=false;usage=true;reasoning=none": {
          "messages": [
            {
              "content": "hi",
              "role": "user",
            },
          ],
          "model": "openrouter/auto",
          "stream": false,
          "usage": {
            "include": true,
          },
        },
        "stream=true;usage=false;reasoning=disabled": {
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
          "usage": {
            "include": false,
          },
        },
        "stream=true;usage=false;reasoning=effort_high": {
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
          "usage": {
            "include": false,
          },
        },
        "stream=true;usage=false;reasoning=effort_high_exclude": {
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
          "usage": {
            "include": false,
          },
        },
        "stream=true;usage=false;reasoning=enabled": {
          "messages": [
            {
              "content": "hi",
              "role": "user",
            },
          ],
          "model": "openrouter/auto",
          "reasoning": {
            "enabled": true,
          },
          "stream": true,
          "usage": {
            "include": false,
          },
        },
        "stream=true;usage=false;reasoning=max_tokens_128": {
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
          "usage": {
            "include": false,
          },
        },
        "stream=true;usage=false;reasoning=none": {
          "messages": [
            {
              "content": "hi",
              "role": "user",
            },
          ],
          "model": "openrouter/auto",
          "stream": true,
          "usage": {
            "include": false,
          },
        },
        "stream=true;usage=true;reasoning=disabled": {
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
          "usage": {
            "include": true,
          },
        },
        "stream=true;usage=true;reasoning=effort_high": {
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
          "usage": {
            "include": true,
          },
        },
        "stream=true;usage=true;reasoning=effort_high_exclude": {
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
          "usage": {
            "include": true,
          },
        },
        "stream=true;usage=true;reasoning=enabled": {
          "messages": [
            {
              "content": "hi",
              "role": "user",
            },
          ],
          "model": "openrouter/auto",
          "reasoning": {
            "enabled": true,
          },
          "stream": true,
          "usage": {
            "include": true,
          },
        },
        "stream=true;usage=true;reasoning=max_tokens_128": {
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
          "usage": {
            "include": true,
          },
        },
        "stream=true;usage=true;reasoning=none": {
          "messages": [
            {
              "content": "hi",
              "role": "user",
            },
          ],
          "model": "openrouter/auto",
          "stream": true,
          "usage": {
            "include": true,
          },
        },
      }
    `)
  })

  it('enforces a minimal allowlist of top-level keys (prevents internal-field leakage)', () => {
    const req = buildOpenRouterChatCompletionsRequest({
      ...base,
      stream: true,
      usage: { include: true },
      reasoning: { effort: 'high', exclude: true },
    })

    const allowedTopLevel = new Set(['model', 'messages', 'stream', 'usage', 'reasoning'])
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
      usage: { include: true },
      reasoning: { effort: 'high', exclude: true },
    })

    expect(req.messages).toEqual(multimodalMessages)
  })
})
