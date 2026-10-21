export type GenerationAttachmentTransportKindV2 = 'managed_file' | 'url_reference'

export type GenerationAttachmentTransportRequestV2 = Readonly<{
  protocolContractId: string
  operation: string
  attachmentKind: GenerationAttachmentTransportKindV2
  mediaKind?: string
}>

/** Reports only attachment forms implemented by the target request codec. */
export function supportsGenerationAttachmentTransportV2(request: GenerationAttachmentTransportRequestV2): boolean {
  const { protocolContractId, operation, attachmentKind, mediaKind } = request

  if (protocolContractId === 'openrouter-images-v1') {
    return operation === 'image_generate' && attachmentKind === 'url_reference' && mediaKind === 'image'
  }
  if (protocolContractId === 'openai-responses-v1' && ['text', 'tool_continue'].includes(operation)) {
    return attachmentKind === 'managed_file' || attachmentKind === 'url_reference' && mediaKind === 'image'
  }
  if (protocolContractId === 'anthropic-messages-2023-06-01' && ['text', 'tool_continue'].includes(operation)) {
    return attachmentKind === 'managed_file' || attachmentKind === 'url_reference' && ['image', 'document'].includes(mediaKind ?? '')
  }
  if (['openrouter-chat-completions-v1', 'gemini-generate-content-v1beta'].includes(protocolContractId) &&
    ['text', 'tool_continue'].includes(operation)) {
    return attachmentKind === 'managed_file'
  }
  return false
}
