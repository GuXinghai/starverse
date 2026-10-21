import { sha256PreparedBytesV2 } from '../../../../core/generation-v2/compiler/stableSerialize'
import { describe, expect, it } from 'vitest'
import { decodeDeepSeekPlainTextInitialSendCommandV2 } from '../../../../core/generation-v2/providers/deepseek/plainTextInitialSendCommandV2'

function command(overrides: Record<string, unknown> = {}) {
  return {
    operationId: 'operation:1', branchId: 'branch:1', expectedHeadMessageId: null,
    userBody: 'hello', modelId: 'deepseek-v4-pro', commandAttachments: [], ...overrides,
  }
}

describe('DeepSeek plain-text initial-send command V2', () => {
  it('creates one stable whole-command request fingerprint', () => {
    const first = decodeDeepSeekPlainTextInitialSendCommandV2(command())
    const second = decodeDeepSeekPlainTextInitialSendCommandV2(command())
    expect(first.canonicalJson).toBe(second.canonicalJson)
    expect(first.requestFingerprint).toBe(second.requestFingerprint)
    expect(first).toMatchObject({
      kind: 'deepseek_plain_text_initial_send',
      providerId: { value: 'deepseek' },
      endpointProfileId: { value: 'deepseek-stable-api-v1' },
      modelId: { value: 'deepseek-v4-pro' },
    })
  })

  it.each([
    ['operationId', { operationId: 'operation:2' }],
    ['branchId', { branchId: 'branch:2' }],
    ['expectedHeadMessageId', { expectedHeadMessageId: 'answer:old' }],
    ['userBody', { userBody: 'changed' }],
    ['modelId', { modelId: 'deepseek-chat' }],
  ])('changes the fingerprint for %s', (_name, override) => {
    expect(decodeDeepSeekPlainTextInitialSendCommandV2(command(override)).requestFingerprint)
      .not.toBe(decodeDeepSeekPlainTextInitialSendCommandV2(command()).requestFingerprint)
  })

  it('rejects malformed attachments and hostile or open input shapes', () => {
    expect(() => decodeDeepSeekPlainTextInitialSendCommandV2(command({ commandAttachments: [{}] })))
      .toThrow('GENERATION_V2_DEEPSEEK_INITIAL_SEND_COMMAND_INVALID')
    expect(() => decodeDeepSeekPlainTextInitialSendCommandV2({ ...command(), extra: true }))
      .toThrow('GENERATION_V2_DEEPSEEK_INITIAL_SEND_COMMAND_INVALID')
    const hostile = command()
    Object.defineProperty(hostile, 'userBody', { enumerable: true, get: () => 'hello' })
    expect(() => decodeDeepSeekPlainTextInitialSendCommandV2(hostile))
      .toThrow('GENERATION_V2_DEEPSEEK_INITIAL_SEND_COMMAND_INVALID')
  })
  it('preserves strict attachment facts and includes them in the command fingerprint', () => {
    const refs = [
      { kind: 'managed_file', assetId: 'asset:1', assetRevisionId: 'revision:1', assetSha256: 'a'.repeat(64), include: true, sendAs: 'provider_file', conversion: 'none' },
      { kind: 'url_reference', referenceId: 'url:1', referenceRevision: 'revision:url:1', originalUrl: 'https://example.test/image.png', urlDigest: sha256PreparedBytesV2(new TextEncoder().encode('https://example.test/image.png')), mediaKind: 'image', capturedAtMs: 1, provenance: 'user_supplied', include: true, sendAs: 'url_reference', conversion: 'none' },
    ]
    const original = decodeDeepSeekPlainTextInitialSendCommandV2(command())
    const attached = decodeDeepSeekPlainTextInitialSendCommandV2(command({ commandAttachments: refs }))
    expect(attached.commandAttachments).toHaveLength(refs.length)
    expect(JSON.parse(attached.canonicalJson).commandAttachments).toEqual(refs)
    expect(attached.requestFingerprint).not.toBe(original.requestFingerprint)
    expect(decodeDeepSeekPlainTextInitialSendCommandV2(command({ commandAttachments: refs })).requestFingerprint).toBe(attached.requestFingerprint)
    expect(JSON.parse(original.canonicalJson).commandAttachments).toEqual([])
    expect(() => decodeDeepSeekPlainTextInitialSendCommandV2(command({ commandAttachments: [{ ...refs[0], extra: true }] }))).toThrow()
  })

})
