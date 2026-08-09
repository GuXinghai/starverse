import { describe, expect, it } from 'vitest'
import { decodeResolvedGenerationIntentV2 } from '../../domain/resolvedGenerationIntentV2'
import { projectOpenAIChatCompatibleIntentV2 } from './intentProjectionV2'

const intent = () => decodeResolvedGenerationIntentV2({ schemaVersion: 2,
  generation: { temperature: 0.2, topP: 0.8, maxOutputTokens: 512, stop: ['END'], seed: 3 },
  reasoning: { mode: 'enabled', effort: 'medium' }, web: { mode: 'disabled' }, image: { mode: 'disabled' },
  tools: { mode: 'disabled' }, attachments: [], providerExtension: { kind: 'none' },
}).value

describe('OpenAI-compatible V2 semantic projection', () => {
  it('maps only owned standard and restricted reasoning inputs', () => {
    const projected = projectOpenAIChatCompatibleIntentV2(intent())
    expect(projected.fields).toMatchObject({ temperature: { state: 'explicit', value: 0.2 }, top_p: { value: 0.8 }, max_tokens: { value: 512 } })
    expect(projected.reasoningControls).toMatchObject({ reasoning_enabled: { value: true }, reasoning_effort: { value: 'medium' } })
    expect(projected.ledgerEntries.map((entry) => entry.path)).toContain('reasoning.effort')
  })

  it('rejects a configured semantic without a compatible native contract', () => {
    const value = intent()
    expect(() => projectOpenAIChatCompatibleIntentV2({ ...value, web: { mode: 'provider_search', types: ['web'] } }))
      .toThrow('GENERATION_V2_OPENAI_COMPATIBLE_EXPLICIT_FIELD_UNSUPPORTED')
  })

  it('encodes disabled reasoning only when an explicit enabled-state mapping owns the wire field', () => {
    const disabled = { ...intent(), reasoning: { mode: 'disabled' as const } }
    expect(projectOpenAIChatCompatibleIntentV2(disabled).reasoningControls).toEqual({})
    expect(projectOpenAIChatCompatibleIntentV2(disabled, ['reasoning_enabled']).reasoningControls)
      .toEqual({ reasoning_enabled: { state: 'explicit', value: false } })
  })
})
