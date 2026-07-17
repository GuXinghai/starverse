import { describe, expect, it } from 'vitest'
import { decodeDeepSeekToolContinuationCommandV2 } from './toolContinuationCommandV2'

describe('DeepSeekToolContinuationCommandV2', () => {
  it('fingerprints exact ordered outputs and confirmation decisions', () => {
    const input = {
      operationId: 'operation:1', branchId: 'branch:1', answerRootId: 'answer:1',
      expectedHeadMessageId: 'answer:1', priorRequestSequence: 1,
      toolOutputs: [{ toolCallId: 'call:1', content: '{}', userConfirmedExternalSideEffect: false }],
    }
    expect(decodeDeepSeekToolContinuationCommandV2(input).requestFingerprint)
      .toBe(decodeDeepSeekToolContinuationCommandV2(input).requestFingerprint)
    expect(decodeDeepSeekToolContinuationCommandV2({
      ...input,
      toolOutputs: [{ ...input.toolOutputs[0], userConfirmedExternalSideEffect: true }],
    }).requestFingerprint).not.toBe(decodeDeepSeekToolContinuationCommandV2(input).requestFingerprint)
  })

  it('rejects unknown fields, duplicate calls and empty outputs', () => {
    const base = {
      operationId: 'operation:1', branchId: 'branch:1', answerRootId: 'answer:1',
      expectedHeadMessageId: 'answer:1', priorRequestSequence: 1,
    }
    expect(() => decodeDeepSeekToolContinuationCommandV2({ ...base, toolOutputs: [], extra: true }))
      .toThrow('GENERATION_V2_DEEPSEEK_TOOL_CONTINUATION_COMMAND_INVALID')
    const output = { toolCallId: 'call:1', content: '{}', userConfirmedExternalSideEffect: false }
    expect(() => decodeDeepSeekToolContinuationCommandV2({ ...base, toolOutputs: [output, output] }))
      .toThrow('GENERATION_V2_DEEPSEEK_TOOL_CONTINUATION_COMMAND_INVALID')
  })
})
