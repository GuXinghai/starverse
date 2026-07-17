import { describe, expect, it } from 'vitest'
import { decodeDeepSeekPlainTextRetryCommandV2 } from './plainTextRetryCommandV2'

function command(overrides: Record<string, unknown> = {}) {
  return {
    actionKind: 'retry_as_new', operationId: 'operation:retry', branchId: 'branch:1',
    questionId: 'question:1', targetAnswerRootId: 'answer:1', expectedHeadMessageId: 'answer:1',
    ...overrides,
  }
}

describe('DeepSeek plain-text retry command V2', () => {
  it('creates a stable fingerprint for each exact answer-scoped action', () => {
    const first = decodeDeepSeekPlainTextRetryCommandV2(command())
    const replay = decodeDeepSeekPlainTextRetryCommandV2(command())
    const replace = decodeDeepSeekPlainTextRetryCommandV2(command({ actionKind: 'retry_replace' }))
    expect(replay.requestFingerprint).toBe(first.requestFingerprint)
    expect(replace.requestFingerprint).not.toBe(first.requestFingerprint)
    expect(first).toMatchObject({
      operationId: { value: 'operation:retry' }, questionId: { value: 'question:1' },
      targetAnswerRootId: { value: 'answer:1' }, expectedHeadMessageId: { value: 'answer:1' },
    })
  })

  it('rejects non-chosen target shapes, unknown actions and extra fields', () => {
    expect(() => decodeDeepSeekPlainTextRetryCommandV2(command({ expectedHeadMessageId: 'answer:2' })))
      .toThrow('GENERATION_V2_DEEPSEEK_RETRY_COMMAND_INVALID')
    expect(() => decodeDeepSeekPlainTextRetryCommandV2(command({ actionKind: 'regenerate_question' })))
      .toThrow('GENERATION_V2_DEEPSEEK_RETRY_COMMAND_INVALID')
    expect(() => decodeDeepSeekPlainTextRetryCommandV2({ ...command(), extra: true }))
      .toThrow('GENERATION_V2_DEEPSEEK_RETRY_COMMAND_INVALID')
  })
})
