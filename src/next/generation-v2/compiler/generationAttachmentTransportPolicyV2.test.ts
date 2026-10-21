import { describe, expect, it } from 'vitest'
import { supportsGenerationAttachmentTransportV2 } from '../../../core/generation-v2/compiler/generationAttachmentTransportPolicyV2'

describe('generation attachment transport policy', () => {
  it('allows OpenRouter Images URL image references only for image generation', () => {
    expect(supportsGenerationAttachmentTransportV2({ protocolContractId: 'openrouter-images-v1', operation: 'image_generate',
      attachmentKind: 'url_reference', mediaKind: 'image' })).toBe(true)
    expect(supportsGenerationAttachmentTransportV2({ protocolContractId: 'openrouter-images-v1', operation: 'image_generate',
      attachmentKind: 'managed_file' })).toBe(false)
    expect(supportsGenerationAttachmentTransportV2({ protocolContractId: 'openrouter-images-v1', operation: 'text',
      attachmentKind: 'url_reference', mediaKind: 'image' })).toBe(false)
    expect(supportsGenerationAttachmentTransportV2({ protocolContractId: 'openrouter-images-v1', operation: 'image_generate',
      attachmentKind: 'url_reference', mediaKind: 'document' })).toBe(false)
  })

  it('keeps attachment transport scoped to each implemented protocol codec', () => {
    expect(supportsGenerationAttachmentTransportV2({ protocolContractId: 'openai-responses-v1', operation: 'text',
      attachmentKind: 'url_reference', mediaKind: 'image' })).toBe(true)
    expect(supportsGenerationAttachmentTransportV2({ protocolContractId: 'openai-responses-v1', operation: 'text',
      attachmentKind: 'url_reference', mediaKind: 'document' })).toBe(false)
    expect(supportsGenerationAttachmentTransportV2({ protocolContractId: 'anthropic-messages-2023-06-01', operation: 'text',
      attachmentKind: 'url_reference', mediaKind: 'document' })).toBe(true)
    expect(supportsGenerationAttachmentTransportV2({ protocolContractId: 'deepseek-stable-chat-v1', operation: 'text',
      attachmentKind: 'managed_file' })).toBe(false)
  })
})
