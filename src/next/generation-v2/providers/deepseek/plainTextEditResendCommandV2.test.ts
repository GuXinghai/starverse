import { describe, expect, it } from 'vitest'
import { decodeDeepSeekPlainTextEditResendCommandV2 } from './plainTextEditResendCommandV2'

function command(overrides: Record<string, unknown> = {}) {
  return {
    operationId: 'operation:edit', clientActionId: 'operation:edit', sourceBranchId: 'branch:1',
    sourceQuestionId: 'question:1', sourceAnswerRootId: 'answer:1',
    expectedHeadMessageId: 'answer:1', userBody: 'edited', modelId: 'deepseek-chat',
    commandAttachments: [], ...overrides,
  }
}

describe('DeepSeek plain-text edit-resend command V2', () => {
  it('fingerprints the edit mode, source graph, body and current model', () => {
    const first = decodeDeepSeekPlainTextEditResendCommandV2(command())
    expect(decodeDeepSeekPlainTextEditResendCommandV2(command()).requestFingerprint)
      .toBe(first.requestFingerprint)
    for (const override of [
      { sourceQuestionId: 'question:2' },
      { sourceAnswerRootId: 'answer:2' }, { expectedHeadMessageId: 'answer:2' },
      { userBody: 'changed' }, { modelId: 'deepseek-v4-pro' },
    ]) {
      expect(decodeDeepSeekPlainTextEditResendCommandV2(command(override)).requestFingerprint)
        .not.toBe(first.requestFingerprint)
    }
  })

  it('rejects attachments, unknown modes and extra fields', () => {
    expect(() => decodeDeepSeekPlainTextEditResendCommandV2(command({ commandAttachments: [{}] })))
      .toThrow('GENERATION_V2_DEEPSEEK_EDIT_RESEND_COMMAND_INVALID')
    expect(() => decodeDeepSeekPlainTextEditResendCommandV2(command({ mode: 'overwrite' })))
      .toThrow('GENERATION_V2_DEEPSEEK_EDIT_RESEND_COMMAND_INVALID')
    expect(() => decodeDeepSeekPlainTextEditResendCommandV2(command({ userBody: '   ' })))
      .toThrow('GENERATION_V2_DEEPSEEK_EDIT_RESEND_COMMAND_INVALID')
    expect(() => decodeDeepSeekPlainTextEditResendCommandV2({ ...command(), extra: true }))
      .toThrow('GENERATION_V2_DEEPSEEK_EDIT_RESEND_COMMAND_INVALID')
  })
})
