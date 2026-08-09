import { describe, expect, it } from 'vitest'
import { decodeAnthropicPlainTextEditResendCommandV2 } from './plainTextEditResendCommandV2'

function command(overrides: Record<string, unknown> = {}) {
  return {
    operationId: 'operation:anthropic:edit',
    mode: 'fork',
    branchId: 'branch:1',
    sourceQuestionId: 'question:source',
    sourceAnswerRootId: 'answer:chosen',
    expectedHeadMessageId: 'answer:chosen',
    userBody: 'edited body',
    modelId: 'claude-sonnet-4-5',
    commandAttachments: [],
    ...overrides,
  }
}

describe('Anthropic plain-text edit-resend command V2', () => {
  it('derives Anthropic identity and fingerprints mode, source graph, head, body, and current model', () => {
    const first = decodeAnthropicPlainTextEditResendCommandV2(command())
    for (const override of [
      { mode: 'replace' },
      { sourceQuestionId: 'question:other' },
      { sourceAnswerRootId: 'answer:other' },
      { expectedHeadMessageId: 'answer:other' },
      { userBody: 'changed' },
      { modelId: 'claude-opus-4-1' },
    ]) {
      expect(decodeAnthropicPlainTextEditResendCommandV2(command(override)).requestFingerprint)
        .not.toBe(first.requestFingerprint)
    }
    expect(first).toMatchObject({
      kind: 'anthropic_plain_text_edit_resend',
      providerId: { value: 'anthropic' },
      endpointProfileId: { value: 'anthropic-developer-api-2023-06-01' },
      commandAttachments: [],
    })
  })

  it('rejects attachments, invalid mode/body, and renderer provider/config fields', () => {
    for (const hostile of [
      { commandAttachments: [{}] },
      { mode: 'overwrite' },
      { userBody: '   ' },
      { providerId: 'anthropic' },
      { stream: true },
    ]) {
      expect(() => decodeAnthropicPlainTextEditResendCommandV2(command(hostile)))
        .toThrow('GENERATION_V2_ANTHROPIC_EDIT_RESEND_COMMAND_INVALID')
    }
  })
})
