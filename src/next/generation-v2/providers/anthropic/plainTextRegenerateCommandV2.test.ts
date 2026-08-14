import { describe, expect, it } from 'vitest'
import { decodeAnthropicPlainTextRegenerateCommandV2 } from './plainTextRegenerateCommandV2'

function command(overrides: Record<string, unknown> = {}) {
  return {
    operationId: 'operation:anthropic:regenerate',
    clientActionId: 'operation:anthropic:regenerate',
    sourceBranchId: 'branch:1',
    questionId: 'question:1',
    sourceAnswerId: 'answer:chosen',
    expectedHeadMessageId: 'answer:chosen',
    modelId: 'claude-sonnet-4-5',
    commandAttachments: [],
    ...overrides,
  }
}

describe('Anthropic plain-text regenerate command V2', () => {
  it('derives Anthropic identity and fingerprints the question, head, and current model', () => {
    const first = decodeAnthropicPlainTextRegenerateCommandV2(command())
    expect(decodeAnthropicPlainTextRegenerateCommandV2(command()).requestFingerprint)
      .toBe(first.requestFingerprint)
    expect(decodeAnthropicPlainTextRegenerateCommandV2(command({ modelId: 'claude-opus-4-1' })).requestFingerprint)
      .not.toBe(first.requestFingerprint)
    expect(first).toMatchObject({
      kind: 'anthropic_plain_text_regenerate_question',
      providerId: { value: 'anthropic' },
      endpointProfileId: { value: 'anthropic-developer-api-2023-06-01' },
      questionId: { value: 'question:1' },
      modelId: { value: 'claude-sonnet-4-5' },
      commandAttachments: [],
    })
  })

  it('rejects attachments and renderer-supplied provider, profile, or wire/config fields', () => {
    for (const hostile of [
      { commandAttachments: [{}] },
      { providerId: 'anthropic' },
      { endpointProfileId: 'hostile' },
      { temperature: 0.5 },
      { 'anthropic-version': 'hostile' },
    ]) {
      expect(() => decodeAnthropicPlainTextRegenerateCommandV2(command(hostile)))
        .toThrow('GENERATION_V2_ANTHROPIC_REGENERATE_COMMAND_INVALID')
    }
  })
})
