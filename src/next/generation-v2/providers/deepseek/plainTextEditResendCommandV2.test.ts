import { sha256PreparedBytesV2 } from '../../../../core/generation-v2/compiler/stableSerialize'
import { describe, expect, it } from 'vitest'
import { decodeDeepSeekPlainTextEditResendCommandV2 } from '../../../../core/generation-v2/providers/deepseek/plainTextEditResendCommandV2'

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

  it('rejects malformed attachments, unknown modes and extra fields', () => {
    expect(() => decodeDeepSeekPlainTextEditResendCommandV2(command({ commandAttachments: [{}] })))
      .toThrow('GENERATION_V2_DEEPSEEK_EDIT_RESEND_COMMAND_INVALID')
    expect(() => decodeDeepSeekPlainTextEditResendCommandV2(command({ mode: 'overwrite' })))
      .toThrow('GENERATION_V2_DEEPSEEK_EDIT_RESEND_COMMAND_INVALID')
    expect(() => decodeDeepSeekPlainTextEditResendCommandV2(command({ userBody: '   ' })))
      .toThrow('GENERATION_V2_DEEPSEEK_EDIT_RESEND_COMMAND_INVALID')
    expect(() => decodeDeepSeekPlainTextEditResendCommandV2({ ...command(), extra: true }))
      .toThrow('GENERATION_V2_DEEPSEEK_EDIT_RESEND_COMMAND_INVALID')
  })
  it('preserves strict attachment facts and includes them in the command fingerprint', () => {
    const refs = [
      { kind: 'managed_file', assetId: 'asset:1', assetRevisionId: 'revision:1', assetSha256: 'a'.repeat(64), include: true, sendAs: 'provider_file', conversion: 'none' },
      { kind: 'url_reference', referenceId: 'url:1', referenceRevision: 'revision:url:1', originalUrl: 'https://example.test/image.png', urlDigest: sha256PreparedBytesV2(new TextEncoder().encode('https://example.test/image.png')), mediaKind: 'image', capturedAtMs: 1, provenance: 'user_supplied', include: true, sendAs: 'url_reference', conversion: 'none' },
    ]
    const original = decodeDeepSeekPlainTextEditResendCommandV2(command())
    const attached = decodeDeepSeekPlainTextEditResendCommandV2(command({ commandAttachments: refs }))
    expect(attached.commandAttachments).toHaveLength(refs.length)
    expect(JSON.parse(attached.canonicalJson).commandAttachments).toEqual(refs)
    expect(attached.requestFingerprint).not.toBe(original.requestFingerprint)
    expect(decodeDeepSeekPlainTextEditResendCommandV2(command({ commandAttachments: refs })).requestFingerprint).toBe(attached.requestFingerprint)
    expect(JSON.parse(original.canonicalJson).commandAttachments).toEqual([])
    expect(() => decodeDeepSeekPlainTextEditResendCommandV2(command({ commandAttachments: [{ ...refs[0], extra: true }] }))).toThrow()
  })

})
