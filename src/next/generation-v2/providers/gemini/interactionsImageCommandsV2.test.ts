import { describe, expect, it } from 'vitest'
import { decodeGeminiInteractionsImageInitialCommandV2, decodeGeminiInteractionsImageRetryCommandV2 } from '../../../../core/generation-v2/providers/gemini/interactionsImageCommandsV2'

describe('Gemini Interactions image commands V2', () => {
  const base = { operationId: 'operation:1', branchId: 'branch:1', expectedHeadMessageId: null, prompt: 'draw', commandAttachments: [] }
  // Structural validation only: model availability, image capability and preview policy belong to Model Facts / the compiler.
  it.each(['gemini-2.5-flash-image', 'models/gemini-3.1-flash-image', 'gemini-3.1-flash-image-preview', 'gemini-9-future-image', 'not-a-gemini-model'])
  ('preserves the structurally valid model id %s without judging it', (modelId) => {
    const command = decodeGeminiInteractionsImageInitialCommandV2({ ...base, modelId })
    expect(command.modelId.value).toBe(modelId)
    expect(JSON.parse(command.canonicalJson).modelId).toBe(modelId)
  })
  it.each([
    ['empty model id', { modelId: '' }],
    ['non-string model id', { modelId: 7 }],
    ['model id with surrounding whitespace', { modelId: ' gemini-3.1-flash-image' }],
    ['missing model id', {}],
    ['unknown extra field', { modelId: 'gemini-3.1-flash-image', extra: true }],
    ['empty prompt', { modelId: 'gemini-3.1-flash-image', prompt: '' }],
  ])('rejects malformed structure: %s', (_name, patch) => {
    const rest: Record<string, unknown> = { ...base }
    const input = { ...rest, ...(patch as Record<string, unknown>) }
    expect(() => decodeGeminiInteractionsImageInitialCommandV2(input)).toThrow('GENERATION_V2_GEMINI_INTERACTIONS_IMAGE_INITIAL_COMMAND_INVALID')
  })
  it('requires retry to name the current head answer exactly', () => {
    expect(() => decodeGeminiInteractionsImageRetryCommandV2({ actionKind: 'retry_as_new', operationId: 'operation:2',
      branchId: 'branch:1', questionId: 'question:1', sourceAnswerId: 'answer:1',
      expectedHeadMessageId: 'answer:2' })).toThrow()
  })
})
