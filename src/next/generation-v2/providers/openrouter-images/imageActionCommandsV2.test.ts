import { describe, expect, it } from 'vitest'
import {
  decodeOpenRouterImageRegenerateCommandV2,
  isOpenRouterImageRegenerateCommandV2,
} from './imageActionCommandsV2'

const regenerate = () => ({
  operationId: 'operation:1', branchId: 'branch:1', questionId: 'question:1',
  expectedHeadMessageId: 'answer:1', modelId: 'google/gemini-3.1-flash-image', requestedProviderTag: null,
})

describe('OpenRouter Images action commands V2', () => {
  it('keeps regenerate attachment-free because its exact references are loaded from the chosen answer snapshot', () => {
    const command = decodeOpenRouterImageRegenerateCommandV2(regenerate())
    expect(isOpenRouterImageRegenerateCommandV2(command)).toBe(true)
    expect(command.canonicalJson).not.toContain('commandAttachments')
  })

  it('rejects renderer-supplied regenerate attachments rather than silently ignoring them', () => {
    expect(() => decodeOpenRouterImageRegenerateCommandV2({ ...regenerate(), commandAttachments: [] })).toThrow(
      'GENERATION_V2_OPENROUTER_IMAGE_REGENERATE_COMMAND_INVALID',
    )
  })
})
