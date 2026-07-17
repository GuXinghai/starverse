import { describe, expect, it } from 'vitest'
import { decodeDeepSeekPlainTextInitialSendCommandV2 } from './plainTextInitialSendCommandV2'

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

  it('rejects attachments and hostile or open input shapes', () => {
    expect(() => decodeDeepSeekPlainTextInitialSendCommandV2(command({ commandAttachments: [{}] })))
      .toThrow('GENERATION_V2_DEEPSEEK_INITIAL_SEND_COMMAND_INVALID')
    expect(() => decodeDeepSeekPlainTextInitialSendCommandV2({ ...command(), extra: true }))
      .toThrow('GENERATION_V2_DEEPSEEK_INITIAL_SEND_COMMAND_INVALID')
    const hostile = command()
    Object.defineProperty(hostile, 'userBody', { enumerable: true, get: () => 'hello' })
    expect(() => decodeDeepSeekPlainTextInitialSendCommandV2(hostile))
      .toThrow('GENERATION_V2_DEEPSEEK_INITIAL_SEND_COMMAND_INVALID')
  })
})
