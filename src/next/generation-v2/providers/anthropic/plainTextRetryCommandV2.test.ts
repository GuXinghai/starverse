import { describe, expect, it } from 'vitest'
import {
  decodeAnthropicPlainTextRetryCommandV2,
  isAnthropicPlainTextRetryCommandV2,
} from './plainTextRetryCommandV2'

function command(overrides: Record<string, unknown> = {}) {
  return {
    actionKind: 'retry_as_new',
    operationId: 'operation:anthropic:retry',
    branchId: 'branch:1',
    questionId: 'question:1',
    targetAnswerRootId: 'answer:chosen',
    expectedHeadMessageId: 'answer:chosen',
    ...overrides,
  }
}

describe('Anthropic plain-text retry command V2', () => {
  it('fingerprints the exact chosen-answer action and authenticates decoded commands', () => {
    const first = decodeAnthropicPlainTextRetryCommandV2(command())
    expect(decodeAnthropicPlainTextRetryCommandV2(command()).requestFingerprint)
      .toBe(first.requestFingerprint)
    expect(decodeAnthropicPlainTextRetryCommandV2(command({ actionKind: 'retry_replace' })).requestFingerprint)
      .not.toBe(first.requestFingerprint)
    expect(first).toMatchObject({
      kind: 'anthropic_plain_text_retry',
      targetAnswerRootId: { value: 'answer:chosen' },
      expectedHeadMessageId: { value: 'answer:chosen' },
    })
    expect(isAnthropicPlainTextRetryCommandV2(first)).toBe(true)
    expect(isAnthropicPlainTextRetryCommandV2({ ...first })).toBe(false)
  })

  it('rejects a non-chosen head, unsupported action, and renderer provider/config input', () => {
    for (const hostile of [
      { expectedHeadMessageId: 'answer:other' },
      { actionKind: 'regenerate_question' },
      { providerId: 'anthropic' },
      { commandAttachments: [] },
    ]) {
      expect(() => decodeAnthropicPlainTextRetryCommandV2(command(hostile)))
        .toThrow('GENERATION_V2_ANTHROPIC_RETRY_COMMAND_INVALID')
    }
  })
})
