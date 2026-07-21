import { describe, expect, it } from 'vitest'
import {
  decodeAnthropicPlainTextInitialSendCommandJsonV2,
  decodeAnthropicPlainTextInitialSendCommandV2,
  isAnthropicPlainTextInitialSendCommandV2,
} from './plainTextInitialSendCommandV2'

function command(overrides: Record<string, unknown> = {}) {
  return {
    operationId: 'operation:anthropic:1',
    branchId: 'branch:1',
    expectedHeadMessageId: null,
    userBody: 'hello',
    modelId: 'claude-sonnet-4-5',
    commandAttachments: [],
    ...overrides,
  }
}

describe('Anthropic plain-text initial-send command V2', () => {
  it('derives provider and endpoint-profile identity and creates a stable whole-command fingerprint', () => {
    const first = decodeAnthropicPlainTextInitialSendCommandV2(command())
    const second = decodeAnthropicPlainTextInitialSendCommandV2(command())
    expect(first).toMatchObject({
      kind: 'anthropic_plain_text_initial_send',
      providerId: { value: 'anthropic' },
      endpointProfileId: { value: 'anthropic-developer-api-2023-06-01' },
      modelId: { value: 'claude-sonnet-4-5' },
    })
    expect(first.canonicalJson).toBe(second.canonicalJson)
    expect(first.requestFingerprint).toBe(second.requestFingerprint)
    expect(isAnthropicPlainTextInitialSendCommandV2(first)).toBe(true)
    expect(isAnthropicPlainTextInitialSendCommandV2({ ...first })).toBe(false)
    expect(decodeAnthropicPlainTextInitialSendCommandJsonV2(first.canonicalJson).canonicalJson)
      .toBe(first.canonicalJson)
  })

  it.each([
    ['operationId', { operationId: 'operation:anthropic:2' }],
    ['branchId', { branchId: 'branch:2' }],
    ['expectedHeadMessageId', { expectedHeadMessageId: 'answer:old' }],
    ['userBody', { userBody: 'changed' }],
    ['modelId', { modelId: 'claude-opus-4-1' }],
  ])('changes the fingerprint for %s', (_name, override) => {
    expect(decodeAnthropicPlainTextInitialSendCommandV2(command(override)).requestFingerprint)
      .not.toBe(decodeAnthropicPlainTextInitialSendCommandV2(command()).requestFingerprint)
  })

  it.each(['providerId', 'endpointProfileId', 'temperature', 'thinking', 'stream', 'anthropic-version'])
  ('rejects renderer-supplied provider wire/config field %s', (field) => {
    expect(() => decodeAnthropicPlainTextInitialSendCommandV2(command({ [field]: 'hostile' })))
      .toThrow('GENERATION_V2_ANTHROPIC_INITIAL_SEND_COMMAND_INVALID')
  })

  it('rejects attachments, accessors, and non-canonical JSON', () => {
    expect(() => decodeAnthropicPlainTextInitialSendCommandV2(command({ commandAttachments: [{}] })))
      .toThrow('GENERATION_V2_ANTHROPIC_INITIAL_SEND_COMMAND_INVALID')
    const hostile = command()
    Object.defineProperty(hostile, 'userBody', { enumerable: true, get: () => 'hello' })
    expect(() => decodeAnthropicPlainTextInitialSendCommandV2(hostile))
      .toThrow('GENERATION_V2_ANTHROPIC_INITIAL_SEND_COMMAND_INVALID')
    const canonical = decodeAnthropicPlainTextInitialSendCommandV2(command()).canonicalJson
    expect(() => decodeAnthropicPlainTextInitialSendCommandJsonV2(` ${canonical}`))
      .toThrow('GENERATION_V2_ANTHROPIC_INITIAL_SEND_COMMAND_INVALID')
  })
})
