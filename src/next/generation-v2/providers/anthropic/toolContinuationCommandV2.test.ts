import { describe, expect, it } from 'vitest'
import { decodeAnthropicToolContinuationCommandV2 } from './toolContinuationCommandV2'

describe('AnthropicToolContinuationCommandV2', () => {
  const input = {
    operationId: 'operation:1', branchId: 'branch:1', answerRootId: 'answer:1',
    expectedHeadMessageId: 'answer:1', priorRequestSequence: 1,
    toolOutputs: [{ toolUseId: 'toolu:1', content: '{"city":"Shanghai"}', isError: false, userConfirmedExternalSideEffect: false }],
  }

  it('fingerprints the exact ordered native tool-result inputs', () => {
    const first = decodeAnthropicToolContinuationCommandV2(input)
    expect(first.requestFingerprint).toBe(decodeAnthropicToolContinuationCommandV2(input).requestFingerprint)
    expect(decodeAnthropicToolContinuationCommandV2({
      ...input, toolOutputs: [{ ...input.toolOutputs[0], isError: true }],
    }).requestFingerprint).not.toBe(first.requestFingerprint)
    expect(Object.isFrozen(first.toolOutputs)).toBe(true)
    expect(Object.isFrozen(first.toolOutputs[0])).toBe(true)
  })

  it('rejects unknown fields, duplicate ids, malformed outputs and empty output lists', () => {
    expect(() => decodeAnthropicToolContinuationCommandV2({ ...input, extra: true }))
      .toThrow('GENERATION_V2_ANTHROPIC_TOOL_CONTINUATION_COMMAND_INVALID')
    expect(() => decodeAnthropicToolContinuationCommandV2({ ...input, toolOutputs: [] }))
      .toThrow('GENERATION_V2_ANTHROPIC_TOOL_CONTINUATION_COMMAND_INVALID')
    expect(() => decodeAnthropicToolContinuationCommandV2({
      ...input, toolOutputs: [input.toolOutputs[0], input.toolOutputs[0]],
    })).toThrow('GENERATION_V2_ANTHROPIC_TOOL_CONTINUATION_COMMAND_INVALID')
    expect(() => decodeAnthropicToolContinuationCommandV2({
      ...input, toolOutputs: [{ ...input.toolOutputs[0], isError: 'false' }],
    })).toThrow('GENERATION_V2_ANTHROPIC_TOOL_CONTINUATION_COMMAND_INVALID')
  })
})
