import { describe, expect, it } from 'vitest'
import { projectGeminiInteractionsImageIntentV1 } from './interactionsImageIntentV1'

function intent(generation: Readonly<Record<string, unknown>> = {}) {
  return {
    schemaVersion: 2,
    generation,
    reasoning: { mode: 'disabled' },
    web: { mode: 'disabled' },
    image: { mode: 'generate', aspectRatio: '1:1', resolution: '1K' },
    tools: { mode: 'disabled' },
    attachments: [],
    providerExtension: { kind: 'none' },
  }
}

describe('Gemini Interactions image intent', () => {
  it('lets Google AI Studio choose the single candidate when candidateCount is omitted', () => {
    expect(projectGeminiInteractionsImageIntentV1(intent(), 'gemini-3.1-flash-image').issues).toEqual([])
  })

  it('rejects an explicit candidateCount because Google AI Studio owns that choice', () => {
    expect(projectGeminiInteractionsImageIntentV1(intent({ candidateCount: 1 }), 'gemini-3.1-flash-image').issues)
      .toEqual(['generation.candidateCount'])
  })

  it('projects protocol-supported semantics independently of model policy', () => {
    const value = {
      ...intent({ maxOutputTokens: 1_000_000, stop: ['done'] }),
      reasoning: { mode: 'enabled', effort: 'max', summary: 'auto' },
      web: { mode: 'provider_search', types: ['image'] },
      image: { mode: 'generate', aspectRatio: '16:9', resolution: '4K' },
    }
    const legacy = projectGeminiInteractionsImageIntentV1(value, 'gemini-2.5-flash-image')
    const future = projectGeminiInteractionsImageIntentV1(value, 'gemini-next-image')
    expect(legacy.issues).toEqual([])
    expect(future).toEqual(legacy)
  })
})
