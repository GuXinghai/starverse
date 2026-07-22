import { describe, expect, it } from 'vitest'
import { decodeGeminiInteractionsImageInitialCommandV2, decodeGeminiInteractionsImageRetryCommandV2 } from './interactionsImageCommandsV2'

describe('Gemini Interactions image commands V2', () => {
  it.each(['gemini-2.5-flash-image', 'gemini-3.1-flash-lite-image', 'gemini-3.1-flash-image', 'gemini-3-pro-image'])
  ('brands the reviewed %s image model and rejects aliases', (modelId) => {
    const command = decodeGeminiInteractionsImageInitialCommandV2({ operationId: `operation:${modelId}`, branchId: 'branch:1',
      expectedHeadMessageId: null, prompt: 'draw', modelId, commandAttachments: [] })
    expect(command.modelId.value).toBe(modelId)
    expect(() => decodeGeminiInteractionsImageInitialCommandV2({ operationId: 'operation:2', branchId: 'branch:1',
      expectedHeadMessageId: null, prompt: 'draw', modelId: 'models/gemini-3.1-flash-image', commandAttachments: [] })).toThrow()
  })
  it('rejects preview aliases that have not passed the Interactions operation contract', () => {
    expect(() => decodeGeminiInteractionsImageInitialCommandV2({ operationId: 'operation:preview', branchId: 'branch:1',
      expectedHeadMessageId: null, prompt: 'draw', modelId: 'gemini-3.1-flash-image-preview', commandAttachments: [] }))
      .toThrow()
  })
  it('requires retry to name the current head answer exactly', () => {
    expect(() => decodeGeminiInteractionsImageRetryCommandV2({ actionKind: 'retry_as_new', operationId: 'operation:2',
      branchId: 'branch:1', questionId: 'question:1', targetAnswerRootId: 'answer:1',
      expectedHeadMessageId: 'answer:2' })).toThrow()
  })
})
