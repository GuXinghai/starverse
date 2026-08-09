import { describe, expect, it } from 'vitest'
import {
  decodeOpenRouterImageInitialSendCommandV2,
  isOpenRouterImageInitialSendCommandV2,
} from './imageInitialSendCommandV2'

const input = () => ({
  operationId: 'operation:1', branchId: 'branch:1', expectedHeadMessageId: null,
  prompt: 'a red apple', modelId: 'google/gemini-3.1-flash-image', requestedProviderTag: null,
  commandAttachments: [],
})

describe('OpenRouter Images initial-send command V2', () => {
  it('binds an exact command fingerprint without silently dropping attachments', () => {
    const command = decodeOpenRouterImageInitialSendCommandV2({
      ...input(),
      commandAttachments: [{
        kind: 'managed_file',
        assetId: 'asset:1', assetRevisionId: 'asset-revision:1', assetSha256: 'a'.repeat(64),
        include: true, sendAs: 'image_reference', conversion: 'none',
      }],
    })
    expect(isOpenRouterImageInitialSendCommandV2(command)).toBe(true)
    expect(command.commandAttachments).toMatchObject([{
      kind: 'managed_file',
      assetId: { value: 'asset:1' }, assetRevisionId: { value: 'asset-revision:1' },
      assetSha256: { value: 'a'.repeat(64) }, include: true,
      sendAs: 'image_reference', conversion: 'none',
    }])
    expect(command.canonicalJson).toContain('"commandAttachments"')
  })

  it('rejects an omitted or malformed attachment fact instead of treating it as empty', () => {
    const { commandAttachments: _ignored, ...missing } = input()
    expect(() => decodeOpenRouterImageInitialSendCommandV2(missing)).toThrow()
    expect(() => decodeOpenRouterImageInitialSendCommandV2({ ...input(), commandAttachments: [{}] })).toThrow()
  })
})
