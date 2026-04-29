import { describe, expect, it } from 'vitest'
import { buildOpenRouterChatCompletionsRequest } from './buildRequest'
import { DEFAULT_OPENROUTER_TEST_MODEL } from './openRouterTestModels'

const baseInput = {
  model: DEFAULT_OPENROUTER_TEST_MODEL,
  messages: [{ role: 'user', content: 'hi' }],
  stream: true,
} as const

describe('buildOpenRouterChatCompletionsRequest reasoning', () => {
  it('normalizes reasoning none by dropping exclude at the final request body', () => {
    expect(
      buildOpenRouterChatCompletionsRequest({
        ...baseInput,
        reasoning: {
          effort: 'none',
          exclude: true,
        },
      })
    ).toMatchObject({
      reasoning: {
        effort: 'none',
      },
    })
  })
})

describe('buildOpenRouterChatCompletionsRequest image generation', () => {
  it('rejects image_config when image modality is missing', () => {
    expect(() =>
      buildOpenRouterChatCompletionsRequest({
        ...baseInput,
        modalities: ['text'],
        imageConfig: {
          aspect_ratio: '1:1',
        },
      })
    ).toThrow('modalities must include image when image generation is requested')

    expect(() =>
      buildOpenRouterChatCompletionsRequest({
        ...baseInput,
        imageConfig: {
          aspect_ratio: '1:1',
        },
      })
    ).toThrow('imageConfig requires image modalities')
  })
})

describe('buildOpenRouterChatCompletionsRequest debug', () => {
  it('includes debug echo only for stream requests and only when enabled', () => {
    expect(
      buildOpenRouterChatCompletionsRequest({
        ...baseInput,
        debug: {
          echoUpstreamBody: true,
        },
      })
    ).toMatchObject({
      debug: {
        echo_upstream_body: true,
      },
    })

    expect(
      buildOpenRouterChatCompletionsRequest({
        ...baseInput,
        stream: false,
        debug: {
          echoUpstreamBody: true,
        },
      })
    ).not.toHaveProperty('debug')

    expect(
      buildOpenRouterChatCompletionsRequest({
        ...baseInput,
        debug: {
          echoUpstreamBody: false,
        },
      })
    ).not.toHaveProperty('debug')
  })
})

describe('buildOpenRouterChatCompletionsRequest normal path', () => {
  it('keeps a valid image generation payload intact on the normal path', () => {
    expect(
      buildOpenRouterChatCompletionsRequest({
        ...baseInput,
        modalities: ['image', 'text'],
        imageConfig: {
          aspect_ratio: '16:9',
          quality: 'high',
        },
      })
    ).toMatchObject({
      modalities: ['image', 'text'],
      image_config: {
        aspect_ratio: '16:9',
        quality: 'high',
      },
    })
  })

  it('appends file-parser plugins without overriding web plugins', () => {
    expect(
      buildOpenRouterChatCompletionsRequest({
        ...baseInput,
        webSearchPatch: {
          plugins: [{ id: 'web', enabled: true, engine: 'native' }],
        },
        additionalPlugins: [{ id: 'file-parser', pdf: { engine: 'native' } }],
      })
    ).toMatchObject({
      plugins: [
        { id: 'web', enabled: true, engine: 'native' },
        { id: 'file-parser', pdf: { engine: 'native' } },
      ],
    })
  })

  it('rejects invalid file-parser engine values', () => {
    expect(() =>
      buildOpenRouterChatCompletionsRequest({
        ...baseInput,
        additionalPlugins: [{ id: 'file-parser', pdf: { engine: 'invalid-engine' as any } }],
      })
    ).toThrow('additionalPlugins[].pdf.engine is invalid')
  })
})
