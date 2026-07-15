import { describe, expect, it } from 'vitest'
import {
  decodeResolvedGenerationIntentV2,
  isDecodedResolvedGenerationIntentV2,
} from './resolvedGenerationIntentV2'

const complete = {
  schemaVersion: 2,
  generation: {},
  reasoning: { mode: 'disabled' },
  web: { mode: 'disabled' },
  image: { mode: 'disabled' },
  tools: { mode: 'disabled' },
  attachments: [],
  providerExtension: { kind: 'none' },
}

describe('resolved Generation V2 intent structural codec', () => {
  it('requires every resolved semantic section and remains decoded-unverified', () => {
    const decoded = decodeResolvedGenerationIntentV2(complete)
    expect(decoded.trust).toBe('decoded_unverified')
    expect(isDecodedResolvedGenerationIntentV2(decoded)).toBe(true)
    expect(isDecodedResolvedGenerationIntentV2({ ...decoded })).toBe(false)
    expect(decoded.value).toEqual(complete)
    expect(Object.isFrozen(decoded)).toBe(true)
    expect(Object.isFrozen(decoded.value)).toBe(true)
    for (const key of ['generation', 'reasoning', 'web', 'image', 'tools', 'attachments', 'providerExtension']) {
      const incomplete = { ...complete }
      delete incomplete[key as keyof typeof incomplete]
      expect(() => decodeResolvedGenerationIntentV2(incomplete), key)
        .toThrow('GENERATION_V2_RESOLVED_INTENT_INCOMPLETE')
    }
  })

  it('delegates closed-value validation to the semantic intent codec', () => {
    expect(() => decodeResolvedGenerationIntentV2({ ...complete, apiKey: 'secret' }))
      .toThrow('GENERATION_V2_INTENT_UNKNOWN_FIELD')
    expect(() => decodeResolvedGenerationIntentV2({ ...complete, generation: { temperature: Number.NaN } }))
      .toThrow('GENERATION_V2_INTENT_INVALID_VALUE')
  })
})
