import { describe, expect, it } from 'vitest'
import { deriveModelTags } from './modelTagger'

describe('deriveModelTags', () => {
  it('derives hard capability tags + cheap_bucket deterministically', () => {
    const input = {
      modelKey: 'openrouter::openai/gpt-4' as const,
      inputModalities: ['text', 'image'] as const,
      supportedParameters: ['tools', 'response_format', 'reasoning'] as const,
      contextLength: 200_000,
      pricing: {
        prompt: '0.00003',
        completion: '0.00006',
      },
      updatedAtMs: 123,
    }

    const tags1 = deriveModelTags(input)
    const tags2 = deriveModelTags(input)
    expect(tags1).toEqual(tags2)
    expect(tags1.map((tag) => tag.key)).toEqual([
      'capability:long_context',
      'capability:reasoning',
      'capability:structured_outputs',
      'capability:tools',
      'capability:vision',
      'category:cheap_bucket:expensive',
    ])
  })

  it('emits unknown cheap_bucket when pricing is absent', () => {
    const tags = deriveModelTags({
      modelKey: 'openrouter::openai/minimal',
      inputModalities: ['text'],
      supportedParameters: [],
      contextLength: 4096,
      pricing: null,
      updatedAtMs: 1,
    })

    expect(tags.map((tag) => tag.key)).toEqual([
      'category:cheap_bucket:unknown',
    ])
  })

  it('classifies cheap bucket from prompt/completion strings', () => {
    const cheap = deriveModelTags({
      modelKey: 'openrouter::a/cheap',
      inputModalities: ['text'],
      supportedParameters: [],
      contextLength: 4096,
      pricing: { prompt: '0.000001', completion: '0.000002' },
      updatedAtMs: 1,
    })
    const standard = deriveModelTags({
      modelKey: 'openrouter::a/std',
      inputModalities: ['text'],
      supportedParameters: [],
      contextLength: 4096,
      pricing: { prompt: '0.000006', completion: '0.00001' },
      updatedAtMs: 1,
    })

    expect(cheap.some((tag) => tag.key === 'category:cheap_bucket:cheap')).toBe(true)
    expect(standard.some((tag) => tag.key === 'category:cheap_bucket:standard')).toBe(true)
  })
})

