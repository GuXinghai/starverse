import { describe, expect, it } from 'vitest'
import { decodeGeminiInteractionsImageInitialCommandV2, decodeGeminiInteractionsImageRetryCommandV2 } from './interactionsImageCommandsV2'

describe('Gemini Interactions image commands V2', () => {
  it('brands the exact fixed-model initial command and rejects aliases', () => {
    const command = decodeGeminiInteractionsImageInitialCommandV2({ operationId: 'operation:1', branchId: 'branch:1',
      expectedHeadMessageId: null, prompt: 'draw', modelId: 'gemini-3.1-flash-image', commandAttachments: [] })
    expect(command.modelId.value).toBe('gemini-3.1-flash-image')
    expect(() => decodeGeminiInteractionsImageInitialCommandV2({ operationId: 'operation:2', branchId: 'branch:1',
      expectedHeadMessageId: null, prompt: 'draw', modelId: 'models/gemini-3.1-flash-image', commandAttachments: [] })).toThrow()
  })
  it('requires retry to name the current head answer exactly', () => {
    expect(() => decodeGeminiInteractionsImageRetryCommandV2({ actionKind: 'retry_as_new', operationId: 'operation:2',
      branchId: 'branch:1', questionId: 'question:1', targetAnswerRootId: 'answer:1',
      expectedHeadMessageId: 'answer:2' })).toThrow()
  })
})
