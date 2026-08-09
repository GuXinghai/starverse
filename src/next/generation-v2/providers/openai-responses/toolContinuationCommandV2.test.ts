import { describe, expect, it } from 'vitest'
import { decodeOpenAIResponsesToolContinuationCommandV2 } from './toolContinuationCommandV2'

describe('OpenAIResponsesToolContinuationCommandV2', () => {
  const input = {
    operationId: 'operation:1', branchId: 'branch:1', answerRootId: 'answer:1',
    expectedHeadMessageId: 'answer:1', priorRequestSequence: 1,
    toolOutputs: [{ toolCallId: 'call:1', content: '{"temperature":20}', userConfirmedExternalSideEffect: false }],
  }

  it('fingerprints the exact ordered call outputs and confirmation decisions', () => {
    expect(decodeOpenAIResponsesToolContinuationCommandV2(input).requestFingerprint)
      .toBe(decodeOpenAIResponsesToolContinuationCommandV2(input).requestFingerprint)
    expect(decodeOpenAIResponsesToolContinuationCommandV2({
      ...input, toolOutputs: [{ ...input.toolOutputs[0], userConfirmedExternalSideEffect: true }],
    }).requestFingerprint).not.toBe(decodeOpenAIResponsesToolContinuationCommandV2(input).requestFingerprint)
  })

  it('rejects unknown fields, duplicate call ids and missing output', () => {
    expect(() => decodeOpenAIResponsesToolContinuationCommandV2({ ...input, extra: true }))
      .toThrow('GENERATION_V2_OPENAI_TOOL_CONTINUATION_COMMAND_INVALID')
    expect(() => decodeOpenAIResponsesToolContinuationCommandV2({ ...input, toolOutputs: [] }))
      .toThrow('GENERATION_V2_OPENAI_TOOL_CONTINUATION_COMMAND_INVALID')
    expect(() => decodeOpenAIResponsesToolContinuationCommandV2({
      ...input, toolOutputs: [input.toolOutputs[0], input.toolOutputs[0]],
    })).toThrow('GENERATION_V2_OPENAI_TOOL_CONTINUATION_COMMAND_INVALID')
  })
})
