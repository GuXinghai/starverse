import { describe, expect, it } from 'vitest'
import {
  decodeOpenAIResponsesPlainTextInitialSendCommandJsonV2,
  decodeOpenAIResponsesPlainTextInitialSendCommandV2,
  isOpenAIResponsesPlainTextInitialSendCommandV2,
} from './plainTextInitialSendCommandV2'

const input = () => ({
  operationId: 'operation:1', branchId: 'branch:1', expectedHeadMessageId: null,
  userBody: 'hello', modelId: 'gpt-5.6-sol', commandAttachments: [],
})

describe('OpenAI Responses initial-send command V2', () => {
  it('binds exact provider/profile/model and reopens only canonical bytes', () => {
    const command = decodeOpenAIResponsesPlainTextInitialSendCommandV2(input())
    expect(command).toMatchObject({
      kind: 'openai_responses_plain_text_initial_send', providerId: { value: 'openai_responses' },
      endpointProfileId: { value: 'openai-api-v1' }, modelId: { value: 'gpt-5.6-sol' },
    })
    expect(isOpenAIResponsesPlainTextInitialSendCommandV2(command)).toBe(true)
    expect(decodeOpenAIResponsesPlainTextInitialSendCommandJsonV2(command.canonicalJson).requestFingerprint)
      .toBe(command.requestFingerprint)
  })

  it('canonically preserves a supported provider-file attachment and rejects malformed input', () => {
    expect(() => decodeOpenAIResponsesPlainTextInitialSendCommandV2({ ...input(), extra: true })).toThrow()
    expect(() => decodeOpenAIResponsesPlainTextInitialSendCommandV2({ ...input(), commandAttachments: [{}] })).toThrow()
    const command = decodeOpenAIResponsesPlainTextInitialSendCommandV2({
      ...input(), commandAttachments: [{
        kind: 'managed_file',
        assetId: 'asset:1', assetRevisionId: 'asset-revision:1', assetSha256: 'a'.repeat(64),
        include: true, sendAs: 'provider_file', conversion: 'none',
      }],
    })
    expect(command.commandAttachments).toMatchObject([{
      kind: 'managed_file',
      assetId: { value: 'asset:1' }, assetRevisionId: { value: 'asset-revision:1' },
      assetSha256: { value: 'a'.repeat(64) }, include: true, sendAs: 'provider_file', conversion: 'none',
    }])
    expect(decodeOpenAIResponsesPlainTextInitialSendCommandJsonV2(command.canonicalJson).requestFingerprint)
      .toBe(command.requestFingerprint)
    expect(() => decodeOpenAIResponsesPlainTextInitialSendCommandJsonV2(`${command.canonicalJson} `)).toThrow()
  })
})
