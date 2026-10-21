import { sha256PreparedBytesV2 } from '../../../../core/generation-v2/compiler/stableSerialize'
import { describe, expect, it } from 'vitest'
import { decodeDeepSeekPlainTextRegenerateCommandV2 } from '../../../../core/generation-v2/providers/deepseek/plainTextRegenerateCommandV2'

function command(overrides: Record<string, unknown> = {}) {
  return {
    operationId: 'operation:regenerate', clientActionId: 'operation:regenerate', sourceBranchId: 'branch:1', questionId: 'question:1',
    sourceAnswerId: 'answer:1', expectedHeadMessageId: 'answer:1', modelId: 'deepseek-chat', commandAttachments: [], ...overrides,
  }
}

describe('DeepSeek plain-text regenerate command V2', () => {
  it('fingerprints the current model and explicit question/head facts', () => {
    const first = decodeDeepSeekPlainTextRegenerateCommandV2(command())
    expect(decodeDeepSeekPlainTextRegenerateCommandV2(command()).requestFingerprint)
      .toBe(first.requestFingerprint)
    expect(decodeDeepSeekPlainTextRegenerateCommandV2(command({ modelId: 'deepseek-reasoner' })).requestFingerprint)
      .not.toBe(first.requestFingerprint)
    expect(first).toMatchObject({
      providerId: { value: 'deepseek' }, endpointProfileId: { value: 'deepseek-stable-api-v1' },
      modelId: { value: 'deepseek-chat' }, questionId: { value: 'question:1' },
    })
  })

  it('rejects malformed attachments, missing head and unknown fields', () => {
    expect(() => decodeDeepSeekPlainTextRegenerateCommandV2(command({ commandAttachments: [{}] })))
      .toThrow('GENERATION_V2_DEEPSEEK_REGENERATE_COMMAND_INVALID')
    expect(() => decodeDeepSeekPlainTextRegenerateCommandV2(command({ expectedHeadMessageId: null })))
      .toThrow('GENERATION_V2_DEEPSEEK_REGENERATE_COMMAND_INVALID')
    expect(() => decodeDeepSeekPlainTextRegenerateCommandV2({ ...command(), extra: true }))
      .toThrow('GENERATION_V2_DEEPSEEK_REGENERATE_COMMAND_INVALID')
  })
  it('preserves strict attachment facts and includes them in the command fingerprint', () => {
    const refs = [
      { kind: 'managed_file', assetId: 'asset:1', assetRevisionId: 'revision:1', assetSha256: 'a'.repeat(64), include: true, sendAs: 'provider_file', conversion: 'none' },
      { kind: 'url_reference', referenceId: 'url:1', referenceRevision: 'revision:url:1', originalUrl: 'https://example.test/image.png', urlDigest: sha256PreparedBytesV2(new TextEncoder().encode('https://example.test/image.png')), mediaKind: 'image', capturedAtMs: 1, provenance: 'user_supplied', include: true, sendAs: 'url_reference', conversion: 'none' },
    ]
    const original = decodeDeepSeekPlainTextRegenerateCommandV2(command())
    const attached = decodeDeepSeekPlainTextRegenerateCommandV2(command({ commandAttachments: refs }))
    expect(attached.commandAttachments).toHaveLength(refs.length)
    expect(JSON.parse(attached.canonicalJson).commandAttachments).toEqual(refs)
    expect(attached.requestFingerprint).not.toBe(original.requestFingerprint)
    expect(decodeDeepSeekPlainTextRegenerateCommandV2(command({ commandAttachments: refs })).requestFingerprint).toBe(attached.requestFingerprint)
    expect(JSON.parse(original.canonicalJson).commandAttachments).toEqual([])
    expect(() => decodeDeepSeekPlainTextRegenerateCommandV2(command({ commandAttachments: [{ ...refs[0], extra: true }] }))).toThrow()
  })

})
