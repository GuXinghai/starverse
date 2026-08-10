import { describe, expect, it } from 'vitest'
import { decodeDeepSeekPlainTextRegenerateCommandV2 } from './plainTextRegenerateCommandV2'

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

  it('rejects attachments, missing head and unknown fields', () => {
    expect(() => decodeDeepSeekPlainTextRegenerateCommandV2(command({ commandAttachments: [{}] })))
      .toThrow('GENERATION_V2_DEEPSEEK_REGENERATE_COMMAND_INVALID')
    expect(() => decodeDeepSeekPlainTextRegenerateCommandV2(command({ expectedHeadMessageId: null })))
      .toThrow('GENERATION_V2_DEEPSEEK_REGENERATE_COMMAND_INVALID')
    expect(() => decodeDeepSeekPlainTextRegenerateCommandV2({ ...command(), extra: true }))
      .toThrow('GENERATION_V2_DEEPSEEK_REGENERATE_COMMAND_INVALID')
  })
})
