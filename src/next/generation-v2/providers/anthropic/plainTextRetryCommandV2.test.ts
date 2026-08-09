import { describe, expect, it } from 'vitest'
import {
  decodeAnthropicPlainTextRetryCommandV2,
  isAnthropicPlainTextRetryCommandV2,
} from './plainTextRetryCommandV2'

function command(overrides: Record<string, unknown> = {}) {
  return {
    actionKind: 'retry_as_new',
    operationId: 'operation:anthropic:retry',
    clientActionId: 'operation:anthropic:retry',
    sourceBranchId: 'branch:1',
    questionId: 'question:1',
    sourceAnswerId: 'answer:chosen',
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
      sourceAnswerId: { value: 'answer:chosen' },
      expectedHeadMessageId: { value: 'answer:chosen' },
    })
    expect(isAnthropicPlainTextRetryCommandV2(first)).toBe(true)
    expect(isAnthropicPlainTextRetryCommandV2({ ...first })).toBe(false)
  })

  it('rejects an inconsistent idempotency key, unsupported action, and renderer provider/config input', () => {
    for (const hostile of [
      { clientActionId: 'operation:other' },
      { actionKind: 'regenerate_question' },
      { providerId: 'anthropic' },
      { commandAttachments: [] },
    ]) {
      expect(() => decodeAnthropicPlainTextRetryCommandV2(command(hostile)))
        .toThrow('GENERATION_V2_ANTHROPIC_RETRY_COMMAND_INVALID')
    }
  })
})
