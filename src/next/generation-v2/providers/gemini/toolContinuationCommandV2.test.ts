import { describe, expect, it } from 'vitest'
import {
  decodeGeminiToolContinuationCommandV2,
  geminiFunctionCallAssociationKeyV2,
} from './toolContinuationCommandV2'

describe('Gemini tool continuation command V2', () => {
  const command = () => ({
    operationId: 'operation:1', branchId: 'branch:1', answerRootId: 'answer:1',
    expectedHeadMessageId: 'answer:1', priorRequestSequence: 2,
    toolOutputs: [{ partOrdinal: 3, functionName: 'weather', response: { temperature: 25 },
      userConfirmedExternalSideEffect: false }],
  })

  it('binds a function response to request sequence, native part ordinal, and function name', () => {
    const decoded = decodeGeminiToolContinuationCommandV2(command())
    expect(decoded.requestFingerprint).toMatch(/^[a-f0-9]{64}$/u)
    expect(geminiFunctionCallAssociationKeyV2(2, 3, 'weather')).toBe('gemini:2:3:weather')
  })

  it('rejects duplicate native associations and unknown fields', () => {
    const value = command()
    expect(() => decodeGeminiToolContinuationCommandV2({ ...value,
      toolOutputs: [...value.toolOutputs, value.toolOutputs[0]] })).toThrow()
    expect(() => decodeGeminiToolContinuationCommandV2({ ...value, callId: 'invented' })).toThrow()
  })
})
