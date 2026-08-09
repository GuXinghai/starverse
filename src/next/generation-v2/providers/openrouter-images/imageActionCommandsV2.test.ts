import { describe, expect, it } from 'vitest'
import { sha256PreparedBytesV2 } from '../../compiler/stableSerialize'
import {
  decodeOpenRouterImageRegenerateCommandV2,
  isOpenRouterImageRegenerateCommandV2,
} from './imageActionCommandsV2'

const regenerate = () => ({
  operationId: 'operation:1', branchId: 'branch:1', questionId: 'question:1',
  expectedHeadMessageId: 'answer:1', modelId: 'google/gemini-3.1-flash-image', requestedProviderTag: null,
  commandAttachments: [],
})

describe('OpenRouter Images action commands V2', () => {
  it('carries the current Composer attachment projection for regenerate', () => {
    const command = decodeOpenRouterImageRegenerateCommandV2(regenerate())
    expect(isOpenRouterImageRegenerateCommandV2(command)).toBe(true)
    expect(command.commandAttachments).toEqual([])
    expect(command.canonicalJson).toContain('commandAttachments')
  })

  it('does not silently discard renderer-supplied regenerate attachment facts', () => {
    const url = 'https://example.com/image.png'
    const command = decodeOpenRouterImageRegenerateCommandV2({
      ...regenerate(), commandAttachments: [{ kind: 'url_reference', referenceId: 'url:1', referenceRevision: 'revision:1',
        originalUrl: url, urlDigest: sha256PreparedBytesV2(new TextEncoder().encode(url)), mediaKind: 'image',
        capturedAtMs: 1, provenance: 'user_supplied', include: true, sendAs: 'url_reference', conversion: 'none' }],
    })
    expect(command.commandAttachments).toHaveLength(1)
  })
})
